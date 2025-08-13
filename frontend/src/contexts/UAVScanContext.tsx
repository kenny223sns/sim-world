/**
 * UAV 掃描數據共享 Context
 * 
 * 在組件間共享 UAV 稀疏掃描的數據，讓 ISS 地圖可以使用實際的 UAV 軌跡點
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface UAVScanData {
  scanPoints: Array<{x: number, y: number}>; // 掃描點位置
  scanCount: number; // 掃描點數量
  isScanning: boolean; // 是否正在掃描
  progress: number; // 掃描進度 0-100
  sceneName: string; // 場景名稱
}

interface UAVScanContextType {
  scanData: UAVScanData | null;
  updateScanData: (data: UAVScanData) => void;
  clearScanData: () => void;
  hasScanData: () => boolean;
}

const UAVScanContext = createContext<UAVScanContextType | undefined>(undefined);

interface UAVScanProviderProps {
  children: ReactNode;
}

export const UAVScanProvider: React.FC<UAVScanProviderProps> = ({ children }) => {
  const [scanData, setScanData] = useState<UAVScanData | null>(null);

  const updateScanData = useCallback((data: UAVScanData) => {
    setScanData(data);
    console.log('UAV 掃描數據已更新:', {
      點數: data.scanCount,
      進度: data.progress,
      場景: data.sceneName
    });
  }, []);

  const clearScanData = useCallback(() => {
    setScanData(null);
    console.log('UAV 掃描數據已清除');
  }, []);

  const hasScanData = useCallback((): boolean => {
    return scanData !== null && scanData.scanPoints.length > 0;
  }, [scanData]);

  return (
    <UAVScanContext.Provider value={{
      scanData,
      updateScanData,
      clearScanData,
      hasScanData
    }}>
      {children}
    </UAVScanContext.Provider>
  );
};

export const useUAVScanContext = (): UAVScanContextType => {
  const context = useContext(UAVScanContext);
  if (context === undefined) {
    throw new Error('useUAVScanContext must be used within a UAVScanProvider');
  }
  return context;
};

export default UAVScanContext;