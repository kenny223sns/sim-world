/**
 * Sparse UAV ISS Scan API Service
 * 
 * Provides API calls for sparse ISS sampling data for UAV visualization
 */

import api from './api';

export interface SparseScanPoint {
  i: number;
  j: number;
  x_m: number;
  y_m: number;
  iss_dbm: number;
}

export interface SparseScanResponse {
  success: boolean;
  height: number;
  width: number;
  x_axis: number[];
  y_axis: number[];
  points: SparseScanPoint[];
  total_points: number;
  step_x: number;
  step_y: number;
  scene: string;
  note?: string;
}

export interface SparseScanParams {
  scene: string;
  step_y?: number;
  step_x?: number;
}

/**
 * Fetch sparse UAV ISS sampling data
 * @param params - Sparse scan parameters
 * @returns Promise with sparse scan data
 */
export const fetchSparseScan = async (params: SparseScanParams): Promise<SparseScanResponse> => {
  try {
    const queryParams = new URLSearchParams();
    queryParams.append('scene', params.scene);
    
    if (params.step_y !== undefined) {
      queryParams.append('step_y', params.step_y.toString());
    }
    
    if (params.step_x !== undefined) {
      queryParams.append('step_x', params.step_x.toString());
    }

    const response = await api.get(`/api/v1/interference/sparse-scan?${queryParams.toString()}`);
    
    if (response.data.success === false) {
      throw new Error(response.data.message || 'Sparse scan request failed');
    }
    
    return response.data;
  } catch (error) {
    console.error('Error fetching sparse scan data:', error);
    throw error;
  }
};

export default {
  fetchSparseScan
};