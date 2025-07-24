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
  
  // Trigger for re-applying settings
  applyToken: number  // Timestamp to trigger API re-calls
  
  // Actions
  setCellSize: (size: number) => void
  setWidth: (width: number) => void
  setHeight: (height: number) => void
  setMapSize: (width: number, height: number) => void
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
  height: 512
}

export const useMapSettings = create<MapSettings>((set, get) => ({
  // Initial state
  cellSize: DEFAULT_SETTINGS.cellSize,
  width: DEFAULT_SETTINGS.width,
  height: DEFAULT_SETTINGS.height,
  applyToken: Date.now(),

  // Actions
  setCellSize: (cellSize: number) => set({ cellSize }),
  
  setWidth: (width: number) => set({ width }),
  
  setHeight: (height: number) => set({ height }),
  
  setMapSize: (width: number, height: number) => set({ width, height }),
  
  applySettings: () => set({ applyToken: Date.now() }),
  
  resetToDefaults: () => set({
    cellSize: DEFAULT_SETTINGS.cellSize,
    width: DEFAULT_SETTINGS.width,
    height: DEFAULT_SETTINGS.height,
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