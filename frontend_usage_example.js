// 前端使用 UAV 稀疏取樣 ISS 地圖的範例

// 1. 使用隨機取樣點
const generateRandomSparseMap = async () => {
  try {
    const response = await fetch('/api/v1/simulations/iss-map?' + new URLSearchParams({
      scene: 'nycu',
      num_random_samples: 8,
      sparse_first_then_full: true,
      sparse_noise_std_db: 2.0,  // 添加 2dB 雜訊
      force_refresh: true
    }));
    
    const blob = await response.blob();
    const imageUrl = URL.createObjectURL(blob);
    
    // 顯示完整 ISS 地圖
    document.getElementById('iss-map').src = imageUrl;
    
    // 同時可以取得稀疏地圖
    const sparseResponse = await fetch('/api/v1/simulations/iss-map?' + new URLSearchParams({
      scene: 'nycu',
      sparse_first_then_full: false  // 只要稀疏地圖
    }));
    
  } catch (error) {
    console.error('生成隨機稀疏地圖失敗:', error);
  }
};

// 2. 使用特定 UAV 軌跡點
const generateUAVTrajectoryMap = async (uavTrajectory) => {
  // uavTrajectory: [{ x: 10, y: 15 }, { x: -5, y: 20 }, ...]
  
  const uavPointsStr = uavTrajectory
    .map(point => `${point.x},${point.y}`)
    .join(';');
  
  try {
    const response = await fetch('/api/v1/simulations/iss-map?' + new URLSearchParams({
      scene: 'nycu',
      uav_points: uavPointsStr,  // "10,15;-5,20;25,-10;0,0"
      sparse_first_then_full: true,
      sparse_noise_std_db: 1.5,
      force_refresh: true
    }));
    
    if (response.ok) {
      const blob = await response.blob();
      const imageUrl = URL.createObjectURL(blob);
      document.getElementById('iss-map').src = imageUrl;
    }
    
  } catch (error) {
    console.error('生成 UAV 軌跡地圖失敗:', error);
  }
};

// 3. 結合 React Hook 使用
const useSparseISSMap = () => {
  const [mapUrl, setMapUrl] = useState(null);
  const [sparseMapUrl, setSparseMapUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const generateSparseMap = async (uavPoints = null, randomSamples = 0) => {
    setLoading(true);
    
    const params = new URLSearchParams({
      scene: 'nycu',
      sparse_first_then_full: true,
      force_refresh: true
    });
    
    if (uavPoints) {
      const pointsStr = uavPoints.map(p => `${p.x},${p.y}`).join(';');
      params.append('uav_points', pointsStr);
    } else {
      params.append('num_random_samples', randomSamples);
    }
    
    try {
      // 取得完整地圖
      const response = await fetch(`/api/v1/simulations/iss-map?${params}`);
      if (response.ok) {
        const blob = await response.blob();
        setMapUrl(URL.createObjectURL(blob));
      }
      
      // 稀疏地圖會自動產生為 iss_map_sparse.png
      // 可以直接透過靜態路徑存取
      setSparseMapUrl('/static/images/iss_map_sparse.png');
      
    } catch (error) {
      console.error('生成稀疏地圖失敗:', error);
    } finally {
      setLoading(false);
    }
  };
  
  return { mapUrl, sparseMapUrl, generateSparseMap, loading };
};

// 4. 使用範例
const ISSMapComponent = () => {
  const { mapUrl, sparseMapUrl, generateSparseMap, loading } = useSparseISSMap();
  
  const handleRandomSample = () => {
    generateSparseMap(null, 10);  // 10 個隨機點
  };
  
  const handleUAVTrajectory = () => {
    const trajectory = [
      { x: 10, y: 15 },
      { x: -5, y: 20 },
      { x: 25, y: -10 },
      { x: 0, y: 0 }
    ];
    generateSparseMap(trajectory);
  };
  
  return (
    <div>
      <button onClick={handleRandomSample} disabled={loading}>
        隨機稀疏取樣
      </button>
      <button onClick={handleUAVTrajectory} disabled={loading}>
        UAV 軌跡取樣
      </button>
      
      {loading && <p>生成中...</p>}
      
      <div style={{ display: 'flex', gap: '20px' }}>
        {sparseMapUrl && (
          <div>
            <h3>稀疏 ISS 地圖 (UAV 量測點)</h3>
            <img src={sparseMapUrl} alt="Sparse ISS Map" style={{ maxWidth: '400px' }} />
          </div>
        )}
        
        {mapUrl && (
          <div>
            <h3>完整 ISS 地圖</h3>
            <img src={mapUrl} alt="Full ISS Map" style={{ maxWidth: '400px' }} />
          </div>
        )}
      </div>
    </div>
  );
};

export default ISSMapComponent;