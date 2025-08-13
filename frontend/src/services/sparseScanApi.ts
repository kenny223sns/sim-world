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

export interface JammerLocationGPS {
  device_id: number;
  device_name: string;
  device_role: string;
  frontend_coords: {
    x: number;
    y: number;
    z: number;
  };
  gps_coords: {
    latitude: number;
    longitude: number;
    altitude: number | null;
  };
}

export interface CFARPeakGPS {
  peak_id: number;
  grid_coords: {
    row: number;
    col: number;
  };
  sionna_coords: {
    x: number;
    y: number;
  };
  frontend_coords: {
    x: number;
    y: number;
  };
  gps_coords: {
    latitude: number;
    longitude: number;
    altitude: number | null;
  };
  iss_strength_dbm: number;
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
  jammer_locations_gps: JammerLocationGPS[];  // 設備干擾源GPS位置
  cfar_peaks_gps: CFARPeakGPS[];  // 新增：CFAR檢測峰值GPS位置
}

export interface SparseScanParams {
  scene: string;
  step_y?: number;
  step_x?: number;
  cell_size?: number;
  map_width?: number;
  map_height?: number;
  center_on_devices?: boolean;
  scan_radius?: number;
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
    
    if (params.cell_size !== undefined) {
      queryParams.append('cell_size', params.cell_size.toString());
    }
    
    if (params.map_width !== undefined) {
      queryParams.append('map_width', params.map_width.toString());
    }
    
    if (params.map_height !== undefined) {
      queryParams.append('map_height', params.map_height.toString());
    }
    
    if (params.center_on_devices !== undefined) {
      queryParams.append('center_on_devices', params.center_on_devices.toString());
    }
    
    if (params.scan_radius !== undefined) {
      queryParams.append('scan_radius', params.scan_radius.toString());
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