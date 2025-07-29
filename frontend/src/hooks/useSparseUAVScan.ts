/**
 * React hook for managing sparse UAV ISS scanning
 * 
 * Handles:
 * - Loading sparse scan data from API
 * - Managing UAV animation along the sparse sampling path
 * - Maintaining sample data buffer
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchSparseScan, SparseScanResponse, SparseScanPoint, SparseScanParams } from '../services/sparseScanApi';
import { useMapSettings } from '../store/useMapSettings';

export interface UseSparseUAVScanResult {
  data: SparseScanResponse | null;
  samples: Float32Array;
  currentIdx: number;
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  progress: number; // 0-100
  traversedPath: Array<{x: number, y: number, z: number, timestamp: number, color: string}>;
  play: () => void;
  pause: () => void;
  reset: () => void;
  exportCSV: () => void;
}

export interface UseSparseUAVScanOptions {
  scene: string;
  step_y?: number;
  step_x?: number;
  speed?: number; // points per second
  autoStart?: boolean;
}

/**
 * Hook for managing sparse UAV ISS scan visualization
 */
export const useSparseUAVScan = (options: UseSparseUAVScanOptions): UseSparseUAVScanResult => {
  const {
    scene,
    step_y = 4,
    step_x = 4,
    speed = 2, // points per second
    autoStart = false
  } = options;

  // Get shared map settings
  const { cellSize, width, height, applyToken } = useMapSettings();

  // State management
  const [data, setData] = useState<SparseScanResponse | null>(null);
  const [samples, setSamples] = useState<Float32Array>(new Float32Array(0));
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [traversedPath, setTraversedPath] = useState<Array<{x: number, y: number, z: number, timestamp: number, color: string}>>([]);

  // Animation refs
  const animationRef = useRef<number>();
  const lastUpdateRef = useRef<number>(0);

  // Calculate progress percentage
  const progress = data && data.points.length > 0 
    ? Math.round((currentIdx / data.points.length) * 100) 
    : 0;

  // Helper function to generate color based on signal strength and time
  const generatePathColor = useCallback((iss_dbm: number, timestamp: number, index: number): string => {
    // Color based on signal strength (ISS dBm value)
    const minDbm = -120; // Typical minimum ISS value
    const maxDbm = -60;   // Typical maximum ISS value
    const normalizedSignal = Math.max(0, Math.min(1, (iss_dbm - minDbm) / (maxDbm - minDbm)));
    
    // Create color gradient: Red (weak) -> Yellow (medium) -> Green (strong)
    let r, g, b;
    if (normalizedSignal < 0.5) {
      // Red to Yellow
      const t = normalizedSignal * 2;
      r = 255;
      g = Math.round(255 * t);
      b = 0;
    } else {
      // Yellow to Green
      const t = (normalizedSignal - 0.5) * 2;
      r = Math.round(255 * (1 - t));
      g = 255;
      b = 0;
    }
    
    // Add slight transparency based on recency (newer points more opaque)
    const alpha = Math.max(0.6, 1 - (index * 0.001)); // Fade older points slightly
    
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }, []);

  // Load sparse scan data
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params: SparseScanParams = { 
        scene, 
        step_y, 
        step_x,
        cell_size: cellSize,
        map_width: width,
        map_height: height
      };
      const response = await fetchSparseScan(params);
      
      setData(response);
      
      // Initialize samples array with NaN values
      const gridSize = response.height * response.width;
      const newSamples = new Float32Array(gridSize);
      newSamples.fill(NaN);
      setSamples(newSamples);
      
      // Reset position and path
      setCurrentIdx(0);
      setTraversedPath([]);
      
      if (autoStart && response.points.length > 0) {
        setIsPlaying(true);
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sparse scan data');
    } finally {
      setIsLoading(false);
    }
  }, [scene, step_y, step_x, cellSize, width, height, autoStart]);

  // Animation loop
  const animate = useCallback((timestamp: number) => {
    if (!data || !isPlaying) return;

    const deltaTime = timestamp - lastUpdateRef.current;
    const timePerPoint = 1000 / speed; // milliseconds per point

    if (deltaTime >= timePerPoint) {
      setCurrentIdx(prevIdx => {
        const newIdx = prevIdx + 1;
        
        if (newIdx < data.points.length) {
          // Update samples with current point
          const point = data.points[newIdx];
          setSamples(prevSamples => {
            const newSamples = prevSamples.slice(); // 創建新陣列確保React檢測到變化
            const arrayIdx = point.i * data.width + point.j;
            if (arrayIdx >= 0 && arrayIdx < newSamples.length) {
              newSamples[arrayIdx] = point.iss_dbm;
              console.log(`samples updated at idx ${arrayIdx}: ${point.iss_dbm} dBm`);
              console.log('samples[0..20] after step =', newSamples.slice(0, 20));
            }
            return newSamples;
          });
          
          // Add point to traversed path with color
          const pathColor = generatePathColor(point.iss_dbm, timestamp, newIdx);
          setTraversedPath(prevPath => [
            ...prevPath,
            {
              x: point.x_m,
              y: point.y_m,
              z: 0, // UAV altitude could be added here if available
              timestamp,
              color: pathColor
            }
          ]);
          
          console.log(`idx=${newIdx} / ${data.points.length}`);
          return newIdx;
        } else {
          // Animation finished
          setIsPlaying(false);
          return prevIdx;
        }
      });

      lastUpdateRef.current = timestamp;
    }

    if (isPlaying) {
      animationRef.current = requestAnimationFrame(animate);
    }
  }, [data, isPlaying, speed]);

  // Control functions
  const play = useCallback(() => {
    if (data && data.points.length > 0) {
      // Reset and initialize first point
      setCurrentIdx(0);
      setSamples(prev => {
        const newSamples = new Float32Array(prev.length).fill(NaN);
        const firstPoint = data.points[0];
        const arrayIdx = firstPoint.i * data.width + firstPoint.j;
        if (arrayIdx >= 0 && arrayIdx < newSamples.length) {
          newSamples[arrayIdx] = firstPoint.iss_dbm;
          console.log(`Initialized with first point: ${firstPoint.iss_dbm} dBm at idx ${arrayIdx}`);
        }
        return newSamples;
      });
      
      // Initialize path with first point
      const firstPoint = data.points[0];
      const firstColor = generatePathColor(firstPoint.iss_dbm, performance.now(), 0);
      setTraversedPath([{
        x: firstPoint.x_m,
        y: firstPoint.y_m,
        z: 0,
        timestamp: performance.now(),
        color: firstColor
      }]);
      
      setIsPlaying(true);
      console.log('Starting sparse scan animation');
    }
  }, [data, generatePathColor]);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const reset = useCallback(() => {
    setIsPlaying(false);
    setCurrentIdx(0);
    setTraversedPath([]);
    
    if (data) {
      // Reset samples to all NaN
      const gridSize = data.height * data.width;
      const newSamples = new Float32Array(gridSize);
      newSamples.fill(NaN);
      setSamples(newSamples);
    }
  }, [data]);

  const exportCSV = useCallback(() => {
    if (!data) return;

    // Create CSV content
    const headers = ['i', 'j', 'x_m', 'y_m', 'iss_dbm', 'sampled'];
    const csvRows = [headers.join(',')];
    
    // Add all points with sampled status
    data.points.forEach((point, idx) => {
      const sampled = idx <= currentIdx ? 'true' : 'false';
      const row = [
        point.i.toString(),
        point.j.toString(),
        point.x_m.toString(),
        point.y_m.toString(),
        point.iss_dbm.toString(),
        sampled
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');
    
    // Download CSV file
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sparse_iss_scan_${scene}_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }, [data, currentIdx, scene]);

  // Start animation when isPlaying becomes true
  useEffect(() => {
    if (isPlaying && data) {
      lastUpdateRef.current = performance.now();
      animationRef.current = requestAnimationFrame(animate);
    } else if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, animate, data]);

  // Load data on mount or when parameters change
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Trigger reload when applyToken changes
  useEffect(() => {
    if (applyToken) {
      loadData();
    }
  }, [applyToken, loadData]);

  return {
    data,
    samples,
    currentIdx,
    isPlaying,
    isLoading,
    error,
    progress,
    traversedPath,
    play,
    pause,
    reset,
    exportCSV
  };
};