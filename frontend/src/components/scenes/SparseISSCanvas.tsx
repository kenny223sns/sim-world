/**
 * Sparse ISS Canvas Component
 * 
 * Renders a low-resolution pixel image of sparse ISS samples using Canvas 2D
 * NaN values are rendered as transparent pixels
 */

import React, { useRef, useEffect, useCallback } from 'react';

export interface SparseISSCanvasProps {
  width: number;        // Canvas width in CSS pixels
  height: number;       // Canvas height in CSS pixels
  gridW: number;        // Grid width (number of columns)
  gridH: number;        // Grid height (number of rows)
  samples: Float32Array; // Flattened array of ISS samples
  vmin: number;         // Minimum value for color scaling
  vmax: number;         // Maximum value for color scaling
  colormap?: 'viridis' | 'plasma' | 'hot'; // Colormap to use
}

/**
 * Convert a normalized value (0-1) to RGB using a colormap
 */
const applyColormap = (normalized: number, colormap: 'viridis' | 'plasma' | 'hot' = 'viridis'): [number, number, number] => {
  const t = Math.max(0, Math.min(1, normalized));
  
  switch (colormap) {
    case 'viridis':
      // Simplified viridis colormap
      if (t < 0.25) {
        const s = t * 4;
        return [Math.round(68 + s * (59 - 68)), Math.round(1 + s * (82 - 1)), Math.round(84 + s * (139 - 84))];
      } else if (t < 0.5) {
        const s = (t - 0.25) * 4;
        return [Math.round(59 + s * (33 - 59)), Math.round(82 + s * (144 - 82)), Math.round(139 + s * (140 - 139))];
      } else if (t < 0.75) {
        const s = (t - 0.5) * 4;
        return [Math.round(33 + s * (94 - 33)), Math.round(144 + s * (201 - 144)), Math.round(140 + s * (98 - 140))];
      } else {
        const s = (t - 0.75) * 4;
        return [Math.round(94 + s * (253 - 94)), Math.round(201 + s * (231 - 201)), Math.round(98 + s * (37 - 98))];
      }
      
    case 'plasma':
      // Simplified plasma colormap
      if (t < 0.33) {
        const s = t * 3;
        return [Math.round(13 + s * (126 - 13)), Math.round(8 + s * (3 - 8)), Math.round(135 + s * (167 - 135))];
      } else if (t < 0.67) {
        const s = (t - 0.33) * 3;
        return [Math.round(126 + s * (224 - 126)), Math.round(3 + s * (93 - 3)), Math.round(167 + s * (133 - 167))];
      } else {
        const s = (t - 0.67) * 3;
        return [Math.round(224 + s * (240 - 224)), Math.round(93 + s * (249 - 93)), Math.round(133 + s * (33 - 133))];
      }
      
    case 'hot':
      // Hot colormap (black -> red -> yellow -> white)
      if (t < 0.33) {
        const s = t * 3;
        return [Math.round(s * 255), 0, 0];
      } else if (t < 0.67) {
        const s = (t - 0.33) * 3;
        return [255, Math.round(s * 255), 0];
      } else {
        const s = (t - 0.67) * 3;
        return [255, 255, Math.round(s * 255)];
      }
      
    default:
      return [Math.round(t * 255), Math.round(t * 255), Math.round(t * 255)];
  }
};

const SparseISSCanvas: React.FC<SparseISSCanvasProps> = ({
  width,
  height,
  gridW,
  gridH,
  samples,
  vmin,
  vmax,
  colormap = 'viridis'
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    console.log('Canvas draw', Math.random(), 'samples length:', samples.length);
    console.log('samples[0..20] =', samples.slice(0, 20));

    // Set canvas resolution to match grid dimensions
    canvas.width = gridW;
    canvas.height = gridH;
    
    // Create image data
    const imageData = ctx.createImageData(gridW, gridH);
    const data = imageData.data;
    
    let nonNanCount = 0;
    
    // Fill pixel data
    for (let i = 0; i < gridH; i++) {
      for (let j = 0; j < gridW; j++) {
        const sampleIdx = i * gridW + j;
        const pixelIdx = (i * gridW + j) * 4;
        
        const sample = samples[sampleIdx];
        
        if (isNaN(sample)) {
          // Black background for NaN values (so we can see colored samples)
          data[pixelIdx] = 20;     // R (very dark)
          data[pixelIdx + 1] = 20; // G (very dark)
          data[pixelIdx + 2] = 30; // B (very dark)
          data[pixelIdx + 3] = 255; // A (opaque)
        } else {
          nonNanCount++;
          // Normalize sample to 0-1 range
          const normalized = Math.max(0, Math.min(1, (sample - vmin) / (vmax - vmin)));
          const [r, g, b] = applyColormap(normalized, colormap);
          
          data[pixelIdx] = r;     // R
          data[pixelIdx + 1] = g; // G
          data[pixelIdx + 2] = b; // B
          data[pixelIdx + 3] = 255; // A (opaque)
        }
      }
    }
    
    console.log(`Canvas: ${nonNanCount} non-NaN values out of ${samples.length}`);
    
    // Draw image data to canvas
    ctx.putImageData(imageData, 0, 0);
    
    // Clear any previous scaling and redraw properly
    ctx.imageSmoothingEnabled = false;
    
    // Scale canvas to desired display size using CSS
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.style.imageRendering = 'pixelated'; // Keep sharp pixels when scaling
    
  }, [gridW, gridH, samples, vmin, vmax, width, height, colormap]);

  // Redraw when dependencies change
  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  return (
    <div className="sparse-iss-canvas-container">
      <canvas
        ref={canvasRef}
        style={{
          border: '1px solid #ccc',
          imageRendering: 'pixelated'
        }}
      />
      <div className="canvas-info" style={{
        fontSize: '0.8em',
        color: '#666',
        marginTop: '5px'
      }}>
        Grid: {gridW}×{gridH}, Range: [{vmin.toFixed(1)}, {vmax.toFixed(1)}] dBm
      </div>
    </div>
  );
};

export default SparseISSCanvas;