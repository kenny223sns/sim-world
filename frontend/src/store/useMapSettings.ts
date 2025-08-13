/**
 * Shared map settings store for UAV sparse scanning and ISS interference detection
 * 
 * This store provides synchronized map parameters (cell_size, width, height) that
 * are used by both:
 * - UAV sparse scanning (/interference/sparse-scan)
 * - ISS interference detection map (/simulations/iss-map)
 * 
 * This ensures perfect alignment between sparse sampling and final reconstruction.
 */

import { create } from 'zustand'

export interface MapSettings {
  // Map parameters
  cellSize: number    // meters per pixel (resolution)
  width: number       // map width in pixels
  height: number      // map height in pixels
  
  // ISS Map specific parameters
  cfar_threshold_percentile: number  // 2D-CFAR 檢測門檻百分位數
  gaussian_sigma: number             // 高斯平滑參數
  min_distance: number               // 峰值檢測最小距離
  samples_per_tx: number             // 每個發射器採樣數量
  center_on: 'receiver' | 'transmitter'  // 地圖中心選擇
  
  // SINR Map specific parameters
  sinr_vmin: number   // SINR 最小值 (dB)
  sinr_vmax: number   // SINR 最大值 (dB)
  
  // Trigger for re-applying settings
  applyToken: number  // Timestamp to trigger API re-calls
  
  // Actions
  setCellSize: (size: number) => void
  setWidth: (width: number) => void
  setHeight: (height: number) => void
  setMapSize: (width: number, height: number) => void
  setCfarThresholdPercentile: (value: number) => void
  setGaussianSigma: (value: number) => void
  setMinDistance: (value: number) => void
  setSamplesPerTx: (value: number) => void
  setCenterOn: (value: 'receiver' | 'transmitter') => void
  setSinrVmin: (value: number) => void
  setSinrVmax: (value: number) => void
  applySettings: () => void
  resetToDefaults: () => void
  setPreset: (preset: MapPreset) => void
}

export interface MapPreset {
  name: string
  cellSize: number
  width: number
  height: number
}

// Predefined map presets
export const MAP_PRESETS: MapPreset[] = [
  { name: '256² (高速)', cellSize: 2.0, width: 256, height: 256 },
  { name: '512² (標準)', cellSize: 1.0, width: 512, height: 512 },
  { name: '1024² (高精度)', cellSize: 0.5, width: 1024, height: 1024 },
  { name: '2048² (超高精度)', cellSize: 0.25, width: 2048, height: 2048 }
]

// Default settings
const DEFAULT_SETTINGS = {
  cellSize: 1.0,
  width: 512,
  height: 512,
  cfar_threshold_percentile: 99.5,
  gaussian_sigma: 1.0,
  min_distance: 3,
  samples_per_tx: 10000000,  // 10^7
  center_on: 'receiver' as 'receiver' | 'transmitter',
  sinr_vmin: -40.0,
  sinr_vmax: 0.0
}

export const useMapSettings = create<MapSettings>((set, get) => ({
  // Initial state
  cellSize: DEFAULT_SETTINGS.cellSize,
  width: DEFAULT_SETTINGS.width,
  height: DEFAULT_SETTINGS.height,
  cfar_threshold_percentile: DEFAULT_SETTINGS.cfar_threshold_percentile,
  gaussian_sigma: DEFAULT_SETTINGS.gaussian_sigma,
  min_distance: DEFAULT_SETTINGS.min_distance,
  samples_per_tx: DEFAULT_SETTINGS.samples_per_tx,
  center_on: DEFAULT_SETTINGS.center_on,
  sinr_vmin: DEFAULT_SETTINGS.sinr_vmin,
  sinr_vmax: DEFAULT_SETTINGS.sinr_vmax,
  applyToken: Date.now(),

  // Actions
  setCellSize: (cellSize: number) => set({ cellSize }),
  
  setWidth: (width: number) => set({ width }),
  
  setHeight: (height: number) => set({ height }),
  
  setMapSize: (width: number, height: number) => set({ width, height }),
  
  setCfarThresholdPercentile: (cfar_threshold_percentile: number) => set({ cfar_threshold_percentile }),
  
  setGaussianSigma: (gaussian_sigma: number) => set({ gaussian_sigma }),
  
  setMinDistance: (min_distance: number) => set({ min_distance }),
  
  setSamplesPerTx: (samples_per_tx: number) => set({ samples_per_tx }),
  
  setCenterOn: (center_on: 'receiver' | 'transmitter') => set({ center_on }),
  
  setSinrVmin: (sinr_vmin: number) => set({ sinr_vmin }),
  
  setSinrVmax: (sinr_vmax: number) => set({ sinr_vmax }),
  
  applySettings: () => set({ applyToken: Date.now() }),
  
  resetToDefaults: () => set({
    cellSize: DEFAULT_SETTINGS.cellSize,
    width: DEFAULT_SETTINGS.width,
    height: DEFAULT_SETTINGS.height,
    cfar_threshold_percentile: DEFAULT_SETTINGS.cfar_threshold_percentile,
    gaussian_sigma: DEFAULT_SETTINGS.gaussian_sigma,
    min_distance: DEFAULT_SETTINGS.min_distance,
    samples_per_tx: DEFAULT_SETTINGS.samples_per_tx,
    center_on: DEFAULT_SETTINGS.center_on,
    sinr_vmin: DEFAULT_SETTINGS.sinr_vmin,
    sinr_vmax: DEFAULT_SETTINGS.sinr_vmax,
    applyToken: Date.now()
  }),
  
  setPreset: (preset: MapPreset) => set({
    cellSize: preset.cellSize,
    width: preset.width,
    height: preset.height,
    applyToken: Date.now()
  })
}))

// Computed values helper
export const useMapSettingsComputed = () => {
  const settings = useMapSettings()
  
  return {
    ...settings,
    // Physical coverage area in meters
    coverageWidth: settings.width * settings.cellSize,
    coverageHeight: settings.height * settings.cellSize,
    totalPixels: settings.width * settings.height,
    // Helper text for UI
    coverageText: `${(settings.width * settings.cellSize).toFixed(1)} × ${(settings.height * settings.cellSize).toFixed(1)} 米`,
    sizeText: `${settings.width} × ${settings.height} 像素`,
    isLargeMap: settings.width * settings.height > 1000000
  }
}