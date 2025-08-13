/**
 * 稀疏ISS地圖API服務
 * 
 * 負責將UAV掃描軌跡傳送到後端，生成基於實際軌跡的稀疏ISS地圖
 */

import { ApiRoutes } from '../config/apiRoutes'

export interface UAVTrackPoint {
  x: number  // 前端座標系統 x
  y: number  // 前端座標系統 y
  timestamp?: number
}

export interface SparseISSMapParams {
  scene: string
  uav_points: UAVTrackPoint[]  // UAV軌跡點位
  cell_size?: number
  map_width?: number
  map_height?: number
  altitude?: number
  sparse_noise_std_db?: number
  map_type?: 'iss' | 'tss'
}

export interface SparseISSMapResponse {
  success: boolean
  sparse_map_url?: string  // 稀疏ISS地圖圖像URL
  full_map_url?: string    // 完整ISS地圖圖像URL（用於對比）
  uav_points_count: number
  processing_time?: number
  error?: string
}

/**
 * 生成基於UAV軌跡的稀疏ISS地圖
 */
export const generateSparseISSMap = async (
  params: SparseISSMapParams
): Promise<SparseISSMapResponse> => {
  console.log('正在生成稀疏ISS地圖:', {
    scene: params.scene,
    uav_points_count: params.uav_points.length,
    map_type: params.map_type || 'iss'
  })

  try {
    const response = await fetch(ApiRoutes.simulations.getSparseISSMap, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      throw new Error(`稀疏ISS地圖生成失敗: ${response.status} ${response.statusText}`)
    }

    const result: SparseISSMapResponse = await response.json()
    
    console.log('稀疏ISS地圖生成完成:', {
      success: result.success,
      uav_points_count: result.uav_points_count,
      processing_time: result.processing_time
    })
    
    return result
  } catch (error) {
    console.error('稀疏ISS地圖生成錯誤:', error)
    throw error
  }
}

/**
 * 從drone tracking數據獲取UAV軌跡點
 */
export const getDroneTrackingPoints = async (
  sceneName: string
): Promise<UAVTrackPoint[]> => {
  try {
    const response = await fetch(`/api/v1/drone-tracking/export/${sceneName}?export_format=json`)
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log('沒有找到無人機軌跡數據')
        return []
      }
      throw new Error(`獲取軌跡數據失敗: ${response.statusText}`)
    }

    const exportData = await response.json()
    
    // 從matrix數據中提取實際軌跡點
    const points: UAVTrackPoint[] = []
    if (exportData.matrix && exportData.bounds) {
      const { matrix, bounds, matrix_size, resolution } = exportData
      
      // 遍歷matrix找到有訪問記錄的格子
      for (let i = 0; i < matrix_size; i++) {
        for (let j = 0; j < matrix_size; j++) {
          if (matrix[i][j] > 0) { // 有訪問記錄
            // 轉換grid索引回實際座標
            const x = bounds.min_x + (j * resolution) + (resolution / 2)
            const y = bounds.min_y + (i * resolution) + (resolution / 2)
            points.push({ x, y })
          }
        }
      }
    }
    
    console.log(`從軌跡數據獲取到 ${points.length} 個UAV軌跡點`)
    return points
  } catch (error) {
    console.error('獲取無人機軌跡點失敗:', error)
    return []
  }
}

export default {
  generateSparseISSMap,
  getDroneTrackingPoints,
}