/**
 * API路由配置
 * 集中管理所有後端API路徑，便於維護和更新
 */

// 使用相對路徑，不要加入前綴
const API_BASE_URL = '/api/v1';

export const ApiRoutes = {
  // 設備領域API - 更新路徑以符合DDD結構
  devices: {
    // 根據307重定向，可能需要調整路徑
    base: `${API_BASE_URL}/devices`,
    getAll: `${API_BASE_URL}/devices/`,  // 注意尾部斜線
    create: `${API_BASE_URL}/devices/`,
    getById: (id: string) => `${API_BASE_URL}/devices/${id}`,
    update: (id: string) => `${API_BASE_URL}/devices/${id}`,
    delete: (id: string) => `${API_BASE_URL}/devices/${id}`,
  },
  
  // 座標領域API
  coordinates: {
    base: `${API_BASE_URL}/coordinates`,
    convert: `${API_BASE_URL}/coordinates/convert`,
    validate: `${API_BASE_URL}/coordinates/validate`,
  },
  
  // 衛星領域API (已從 /satellite-ops 更改為 /satellites)
  satellites: {
    base: `${API_BASE_URL}/satellites`,
    getAll: `${API_BASE_URL}/satellites`,
    getById: (id: string) => `${API_BASE_URL}/satellites/${id}`,
    getTLE: (id: string) => `${API_BASE_URL}/satellites/${id}/tle`,
    getPasses: (id: string) => `${API_BASE_URL}/satellites/${id}/passes`,
    getVisibility: `${API_BASE_URL}/satellites/visibility`,
    getOrbit: (id: string) => `${API_BASE_URL}/satellites/${id}/orbit`,
  },
  
  // 模擬領域API (已從 /sionna 更改為 /simulations)
  simulations: {
    base: `${API_BASE_URL}/simulations`,
    createSimulation: `${API_BASE_URL}/simulations/run`,
    // 更新為實際存在的API路徑
    getCFRMap: `${API_BASE_URL}/simulations/cfr-plot`,
    getSINRMap: `${API_BASE_URL}/simulations/sinr-map`,
    getRadioMap: `${API_BASE_URL}/simulations/radio-map`,
    getDopplerMap: `${API_BASE_URL}/simulations/doppler-plots`,
    getChannelResponsePlots: `${API_BASE_URL}/simulations/channel-response`,
    getSceneImage: `${API_BASE_URL}/simulations/scene-image`,
    getISSMap: `${API_BASE_URL}/simulations/iss-map`,
    getTSSMap: `${API_BASE_URL}/simulations/tss-map`, // TSS 地圖API
    getUAVSparseMap: `${API_BASE_URL}/simulations/uav-sparse-map`, // UAV Sparse 地圖API
    getSparseISSMap: `${API_BASE_URL}/simulations/iss-map-sparse`, // 新增稀疏ISS地圖API
    getResults: (id: string) => `${API_BASE_URL}/simulations/${id}/results`,
    // 模型相關API路徑仍在sionna命名空間下
    getModel: (modelName: string) => `${API_BASE_URL}/sionna/models/${modelName}`,
  },
  
  // 場景相關API
  scenes: {
    base: `${API_BASE_URL}/simulations/scenes`,
    getAll: `${API_BASE_URL}/simulations/scenes`,
    getScene: (sceneName: string) => `${API_BASE_URL}/simulations/scenes/${sceneName}`,
    getSceneModel: (sceneName: string) => `${API_BASE_URL}/simulations/scenes/${sceneName}/model`,
    getSceneTexture: (sceneName: string, textureName: string) => 
      `/static/scenes/${sceneName}/textures/${textureName}`,
  },
  
  // 臨時的衛星可見性路由
  satelliteOps: {
    getVisibleSatellites: `${API_BASE_URL}/satellite-ops/visible_satellites`,
  },
  
  // 無人機追蹤API
  droneTracking: {
    base: `${API_BASE_URL}/drone-tracking`,
    recordPosition: `${API_BASE_URL}/drone-tracking/record-position`,
    getMatrix: (sceneName: string) => `${API_BASE_URL}/drone-tracking/matrix/${sceneName}`,
    clearMatrix: (sceneName: string) => `${API_BASE_URL}/drone-tracking/matrix/${sceneName}`,
    exportData: (sceneName: string) => `${API_BASE_URL}/drone-tracking/export/${sceneName}`,
    getStats: (sceneName: string) => `${API_BASE_URL}/drone-tracking/stats/${sceneName}`,
    getScenes: `${API_BASE_URL}/drone-tracking/scenes`,
  },
  
  // 臨時的 sionna 命名空間相關路由 (已不存在於後端，前端保留向後兼容)
  sionna: {
    getModel: (modelName: string) => `${API_BASE_URL}/sionna/models/${modelName}`,
    // 這些路由已遷移到 simulations 命名空間下
    getSceneImageDevices: `${API_BASE_URL}/simulations/scene-image`,
    getSINRMap: `${API_BASE_URL}/simulations/sinr-map`,
    getCFRPlot: `${API_BASE_URL}/simulations/cfr-plot`,
    getDopplerPlots: `${API_BASE_URL}/simulations/doppler-plots`,
    getChannelResponsePlots: `${API_BASE_URL}/simulations/channel-response`,
  }
};

export default ApiRoutes;