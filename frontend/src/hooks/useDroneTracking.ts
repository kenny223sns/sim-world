import { useState, useCallback, useRef } from 'react'
import { ApiRoutes } from '../config/apiRoutes'

interface DronePosition {
  scene_x: number
  scene_y: number
  scene_z: number
  scene_name: string
}

interface DroneTrackingMatrix {
  scene_name: string
  matrix_size: number
  resolution: number
  matrix: number[][]
  bounds: {
    min_x: number
    max_x: number
    min_y: number
    max_y: number
  }
  created_at: string
  updated_at: string
}

interface DroneTrackingStats {
  scene_name: string
  total_positions: number
  visited_cells: number
  coverage_percentage: number
  path_length: number
  session_duration: number
  bounds: {
    min_x: number
    max_x: number
    min_y: number
    max_y: number
  }
}

interface DroneTrackingExport {
  scene_name: string
  matrix_size: number
  resolution: number
  matrix: number[][]
  bounds: {
    min_x: number
    max_x: number
    min_y: number
    max_y: number
  }
  position_count: number
  export_timestamp: string
  export_format: string
}

interface UseDroneTrackingReturn {
  // State
  isTracking: boolean
  trackingStats: DroneTrackingStats | null
  isLoading: boolean
  error: string | null
  
  // Actions
  startTracking: (sceneName: string) => void
  stopTracking: () => void
  recordPosition: (position: DronePosition) => Promise<boolean>
  getTrackingMatrix: (sceneName: string) => Promise<DroneTrackingMatrix | null>
  clearTracking: (sceneName: string) => Promise<boolean>
  exportTrackingData: (sceneName: string, format?: string) => Promise<DroneTrackingExport | null>
  getTrackingStats: (sceneName: string) => Promise<DroneTrackingStats | null>
  
  // Configuration
  setRecordingThrottle: (throttle: number) => void
  setMinimumDistance: (distance: number) => void
  recordingThrottle: number
  minimumDistance: number
}

export const useDroneTracking = (): UseDroneTrackingReturn => {
  const [isTracking, setIsTracking] = useState(false)
  const [trackingStats, setTrackingStats] = useState<DroneTrackingStats | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const currentScene = useRef<string | null>(null)
  const lastRecordedPosition = useRef<{ x: number; y: number; time: number } | null>(null)
  const [recordingThrottle, setRecordingThrottle] = useState<number>(50) // 50ms throttle (20 Hz)
  const [minimumDistance, setMinimumDistance] = useState<number>(0.2) // 0.2 meter minimum movement

  const startTracking = useCallback((sceneName: string) => {
    setIsTracking(true)
    setError(null)
    currentScene.current = sceneName
    console.log(`Started drone tracking for scene: ${sceneName}`)
  }, [])

  const stopTracking = useCallback(() => {
    setIsTracking(false)
    currentScene.current = null
    lastRecordedPosition.current = null
    console.log('Stopped drone tracking')
  }, [])

  const recordPosition = useCallback(async (position: DronePosition): Promise<boolean> => {
    if (!isTracking || !currentScene.current) {
      return false
    }

    // For device position tracking, we reduce throttling since updates are less frequent
    const now = Date.now()
    const lastPos = lastRecordedPosition.current
    if (lastPos && now - lastPos.time < 100) { // Reduced to 100ms for device position updates
      // Check if position changed significantly
      const distance = Math.sqrt(
        Math.pow(position.scene_x - lastPos.x, 2) + 
        Math.pow(position.scene_y - lastPos.y, 2)
      )
      if (distance < 0.1) { // Reduced minimum distance for device positions
        return false
      }
    }

    try {
      const response = await fetch(ApiRoutes.droneTracking.recordPosition, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(position),
      })

      if (!response.ok) {
        throw new Error(`Failed to record position: ${response.statusText}`)
      }

      const result = await response.json()
      
      // Update last recorded position
      lastRecordedPosition.current = {
        x: position.scene_x,
        y: position.scene_y,
        time: now
      }

      return result.success
    } catch (err) {
      console.error('Error recording drone position:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
      return false
    }
  }, [isTracking])

  const getTrackingMatrix = useCallback(async (sceneName: string): Promise<DroneTrackingMatrix | null> => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(ApiRoutes.droneTracking.getMatrix(sceneName))
      
      if (!response.ok) {
        if (response.status === 404) {
          return null // No tracking data found
        }
        throw new Error(`Failed to get tracking matrix: ${response.statusText}`)
      }

      const matrix = await response.json()
      return matrix
    } catch (err) {
      console.error('Error getting tracking matrix:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  const clearTracking = useCallback(async (sceneName: string): Promise<boolean> => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(ApiRoutes.droneTracking.clearMatrix(sceneName), {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error(`Failed to clear tracking: ${response.statusText}`)
      }

      const result = await response.json()
      
      // Reset tracking stats if we cleared the current scene
      if (currentScene.current === sceneName) {
        setTrackingStats(null)
      }

      return result.success
    } catch (err) {
      console.error('Error clearing tracking:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
      return false
    } finally {
      setIsLoading(false)
    }
  }, [])

  const exportTrackingData = useCallback(async (sceneName: string, format: string = 'json'): Promise<DroneTrackingExport | null> => {
    setIsLoading(true)
    setError(null)

    try {
      const url = `${ApiRoutes.droneTracking.exportData(sceneName)}?export_format=${format}`
      console.log('Exporting tracking data:', { sceneName, format, url })
      
      const response = await fetch(url)
      
      if (!response.ok) {
        if (response.status === 404) {
          console.log('No tracking data found for scene:', sceneName)
          return null // No tracking data found
        }
        throw new Error(`Failed to export tracking data: ${response.statusText}`)
      }

      const exportData = await response.json()
      console.log('Export data received:', exportData)
      return exportData
    } catch (err) {
      console.error('Error exporting tracking data:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  const getTrackingStats = useCallback(async (sceneName: string): Promise<DroneTrackingStats | null> => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(ApiRoutes.droneTracking.getStats(sceneName))
      
      if (!response.ok) {
        if (response.status === 404) {
          return null // No tracking data found
        }
        throw new Error(`Failed to get tracking stats: ${response.statusText}`)
      }

      const stats = await response.json()
      setTrackingStats(stats)
      return stats
    } catch (err) {
      console.error('Error getting tracking stats:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  return {
    // State
    isTracking,
    trackingStats,
    isLoading,
    error,
    
    // Actions
    startTracking,
    stopTracking,
    recordPosition,
    getTrackingMatrix,
    clearTracking,
    exportTrackingData,
    getTrackingStats,
    
    // Configuration
    setRecordingThrottle,
    setMinimumDistance,
    recordingThrottle,
    minimumDistance,
  }
}

export type { UseDroneTrackingReturn }
