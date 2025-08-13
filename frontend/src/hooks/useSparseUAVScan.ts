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
import { ApiRoutes } from '../config/apiRoutes';

export interface UseSparseUAVScanResult {
  data: SparseScanResponse | null;
  samples: Float32Array;
  currentIdx: number;
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  progress: number; // 0-100
  traversedPath: Array<{x: number, y: number, z: number, timestamp: number, color: string}>;
  currentISSMap: string | null; // Current ISS map image URL (deprecated)
  isGeneratingISS: boolean; // Whether currently generating ISS value
  realTimeISSValue: number | null; // Current real-time ISS value
  play: () => void;
  pause: () => void;
  reset: () => void;
  exportCSV: () => void;
  exportScanPointsForISSMap: () => Array<{x: number, y: number}>; // 導出掃描點供 ISS 地圖使用
  getScanPointsCount: () => number; // 獲取已掃描點數量
}

export interface UseSparseUAVScanOptions {
  scene: string;
  step_y?: number;
  step_x?: number;
  speed?: number; // points per second
  autoStart?: boolean;
  devices?: any[]; // 添加設備列表用於監聽設備變化
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
    autoStart = false,
    devices = []
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
  const [currentISSMap, setCurrentISSMap] = useState<string | null>(null);
  const [isGeneratingISS, setIsGeneratingISS] = useState(false);
  const [realTimeISSValue, setRealTimeISSValue] = useState<number | null>(null);

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
        map_height: height,
        center_on_devices: true,
        scan_radius: 200.0
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
  }, [scene, step_y, step_x, cellSize, width, height, autoStart, devices]);

  // Process next point (simplified - only record position)
  const processNextPoint = useCallback(() => {
    if (!data || !isPlaying) return;

    setCurrentIdx(prevIdx => {
      const newIdx = prevIdx + 1;
      
      if (newIdx < data.points.length) {
        const point = data.points[newIdx];
        
        // Update samples with current point (use original ISS value)
        setSamples(prevSamples => {
          const newSamples = prevSamples.slice(); // 創建新陣列確保React檢測到變化
          const arrayIdx = point.i * data.width + point.j;
          if (arrayIdx >= 0 && arrayIdx < newSamples.length) {
            newSamples[arrayIdx] = point.iss_dbm;
            console.log(`samples updated at idx ${arrayIdx}: ${point.iss_dbm} dBm`);
          }
          return newSamples;
        });
        
        // Add point to traversed path with color
        const pathColor = generatePathColor(point.iss_dbm, performance.now(), newIdx);
        setTraversedPath(prevPath => [
          ...prevPath,
          {
            x: point.x_m,
            y: point.y_m,
            z: 30, // UAV altitude
            timestamp: performance.now(),
            color: pathColor
          }
        ]);
        
        console.log(`UAV位置: (${point.x_m}, ${point.y_m}) - 進度: ${newIdx}/${data.points.length}`);
        
        return newIdx;
      } else {
        // Animation finished
        setIsPlaying(false);
        console.log('UAV稀疏掃描完成');
        return prevIdx;
      }
    });
  }, [data, isPlaying, generatePathColor]);

  // Animation loop using setInterval for predictable timing
  useEffect(() => {
    if (isPlaying && data) {
      const interval = setInterval(() => {
        processNextPoint();
      }, 1000 / speed); // Convert speed to milliseconds
      
      return () => clearInterval(interval);
    }
  }, [isPlaying, data, speed, processNextPoint]);

  // Control functions
  const play = useCallback(() => {
    if (data && data.points.length > 0) {
      // Reset and initialize
      setCurrentIdx(0);
      setRealTimeISSValue(null);
      setSamples(prev => {
        const newSamples = new Float32Array(prev.length).fill(NaN);
        return newSamples;
      });
      setTraversedPath([]);
      
      setIsPlaying(true);
      console.log('開始UAV稀疏掃描 - 只記錄位置');
    }
  }, [data]);

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

  // 導出掃描點供 ISS 地圖使用
  const exportScanPointsForISSMap = useCallback((): Array<{x: number, y: number}> => {
    // 從 traversedPath 提取 x, y 座標
    const scanPoints = traversedPath.map(point => ({
      x: point.x,
      y: point.y
    }));
    
    console.log('導出掃描點給 ISS 地圖:', {
      traversedPathLength: traversedPath.length,
      scanPointsLength: scanPoints.length,
      samplePoints: scanPoints.slice(0, 3)
    });
    
    return scanPoints;
  }, [traversedPath]);

  // 獲取已掃描點數量
  const getScanPointsCount = useCallback((): number => {
    return traversedPath.length;
  }, [traversedPath]);


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

  // Cleanup ISS map URL on unmount
  useEffect(() => {
    return () => {
      if (currentISSMap) {
        URL.revokeObjectURL(currentISSMap);
      }
    };
  }, [currentISSMap]);

  return {
    data,
    samples,
    currentIdx,
    isPlaying,
    isLoading,
    error,
    progress,
    traversedPath,
    currentISSMap,
    isGeneratingISS,
    realTimeISSValue,
    play,
    pause,
    reset,
    exportCSV,
    exportScanPointsForISSMap,
    getScanPointsCount
  };
};