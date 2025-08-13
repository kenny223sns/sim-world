import { Suspense, useRef, useCallback, useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import Starfield from '../ui/Starfield'
import MainScene from './MainScene'
import SparseISSCanvas from './SparseISSCanvas'
import UAVPathVisualization from './UAVPathVisualization'
import { Device } from '../../types/device'
import { VisibleSatelliteInfo } from '../../types/satellite'
import { UseDroneTrackingReturn } from '../../hooks/useDroneTracking'
import { useSparseUAVScan } from '../../hooks/useSparseUAVScan'
import { useUAVScanContext } from '../../contexts/UAVScanContext'
import { worldToCanvasPct, debugCoordTransform, getAxisInfo } from '../../utils/coordUtils'
import { generateSparseISSMap, getDroneTrackingPoints } from '../../services/sparseISSMapApi'

// 添加圖例组件
const SatelliteLegend = () => {
    return (
        <div className="satellite-legend">
            <h4>衛星圖例</h4>
            <div className="legend-item">
                <div className="color-sample high-elevation"></div>
                <span>高仰角衛星 - 通訊優質</span>
            </div>
            <div className="legend-note">
                • 接近頭頂，信號路徑短 • 連接穩定，抗干擾能力強
            </div>
            <div className="legend-item">
                <div className="color-sample low-elevation"></div>
                <span>低仰角衛星 - 信號較弱</span>
            </div>
            <div className="legend-note">
                • 接近地平線，易受地形障礙影響 • 信號衰減大，連接易中斷
            </div>
        </div>
    )
}

interface SceneViewProps {
    devices: Device[]
    auto: boolean
    manualDirection?: any
    onManualControl?: (direction: any) => void
    onUAVPositionUpdate?: (
        position: [number, number, number],
        deviceId?: number
    ) => void
    uavAnimation: boolean
    selectedReceiverIds?: number[]
    satellites?: VisibleSatelliteInfo[]
    sceneName: string // 新增場景名稱參數
    droneTracking?: UseDroneTrackingReturn // Drone tracking state and actions
}

export default function SceneView({
    devices = [],
    auto,
    manualDirection,
    onManualControl,
    onUAVPositionUpdate,
    uavAnimation,
    selectedReceiverIds = [],
    satellites = [],
    sceneName,
    droneTracking,
}: SceneViewProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    
    // Sparse scan state
    const [showSparseScan, setShowSparseScan] = useState(false)
    const [showPathVisualization, setShowPathVisualization] = useState(true)
    const [scanParams, setScanParams] = useState({
        step_x: 4,
        step_y: 4,
        speed: 2
    })
    
    // Sparse ISS map generation state
    const [sparseMapGenerating, setSparseMapGenerating] = useState(false)
    const [sparseMapUrl, setSparseMapUrl] = useState<string | null>(null)
    const [sparseMapError, setSparseMapError] = useState<string | null>(null)
    
    // Use sparse UAV scan hook
    const sparseScan = useSparseUAVScan({
        scene: sceneName || 'Nanliao',
        step_x: scanParams.step_x,
        step_y: scanParams.step_y,
        speed: scanParams.speed,
        autoStart: false,
        devices: devices  // 傳遞設備列表以監聽設備變化
    })
    
    // Use UAV scan context to share scan data with other components
    const { updateScanData } = useUAVScanContext()
    
    // Use passed droneTracking or create fallback
    const { isTracking, recordPosition } = droneTracking || { isTracking: false, recordPosition: async () => false }
    const lastRecordedDevicePositions = useRef<Map<number, { x: number; y: number; time: number }>>(new Map())
    
    // Calculate current UAV position from sparse scan data
    const currentUAVPosition: [number, number, number] | undefined = 
        sparseScan.data && sparseScan.currentIdx < sparseScan.data.points.length
            ? [
                sparseScan.data.points[sparseScan.currentIdx].x_m,
                sparseScan.data.points[sparseScan.currentIdx].y_m,
                50 // Default UAV altitude
              ]
            : undefined;

    // Enhanced position update handler that includes drone tracking
    const handleUAVPositionUpdate = useCallback(async (
        position: [number, number, number],
        deviceId?: number
    ) => {
        // Call the original position update handler if provided
        if (onUAVPositionUpdate) {
            onUAVPositionUpdate(position, deviceId)
        }
    }, [onUAVPositionUpdate])

    // Generate sparse ISS map from UAV tracking data
    const handleGenerateSparseISSMap = useCallback(async () => {
        if (!sceneName || !droneTracking) {
            console.warn('場景名稱或無人機軌跡服務不可用')
            return
        }

        setSparseMapGenerating(true)
        setSparseMapError(null)
        setSparseMapUrl(null)

        try {
            console.log('開始生成稀疏ISS地圖...')
            
            // 獲取UAV軌跡點
            const trackingPoints = await getDroneTrackingPoints(sceneName)
            
            if (trackingPoints.length === 0) {
                throw new Error('沒有UAV軌跡數據，請先進行UAV掃描或手動控制')
            }

            console.log(`找到 ${trackingPoints.length} 個UAV軌跡點，正在生成稀疏ISS地圖...`)

            // 調用後端API生成稀疏ISS地圖
            const result = await generateSparseISSMap({
                scene: sceneName,
                uav_points: trackingPoints,
                cell_size: 1.0,
                map_width: 512,
                map_height: 512,
                altitude: 40.0,
                sparse_noise_std_db: 0.5,
                map_type: 'iss'
            })

            if (result.success && result.sparse_map_url) {
                setSparseMapUrl(result.sparse_map_url)
                console.log('稀疏ISS地圖生成成功:', result.sparse_map_url)
            } else {
                throw new Error(result.error || '稀疏ISS地圖生成失敗')
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '未知錯誤'
            setSparseMapError(errorMessage)
            console.error('稀疏ISS地圖生成失敗:', error)
        } finally {
            setSparseMapGenerating(false)
        }
    }, [sceneName, droneTracking])

    // Update UAV scan context when scan data changes
    useEffect(() => {
        if (sparseScan.data && sceneName) {
            const scanPoints = sparseScan.exportScanPointsForISSMap()
            const scanCount = sparseScan.getScanPointsCount()
            
            console.log('更新 UAV 掃描 Context 數據:', {
                scanPointsCount: scanPoints.length,
                totalScanCount: scanCount,
                isScanning: sparseScan.isPlaying,
                progress: sparseScan.progress,
                sceneName
            })
            
            updateScanData({
                scanPoints,
                scanCount,
                isScanning: sparseScan.isPlaying,
                progress: sparseScan.progress,
                sceneName
            })
        }
    }, [
        sparseScan.data,
        sparseScan.progress,
        sparseScan.isPlaying,
        sparseScan.traversedPath, // 添加這個依賴以確保路徑更新時觸發
        sceneName,
        updateScanData
    ])

    // Monitor RX device position changes for tracking with polling
    useEffect(() => {
        console.log('Position tracking useEffect triggered:', { isTracking, sceneName, devicesCount: devices.length })
        
        if (!isTracking || !sceneName) {
            console.log('Tracking not active:', { isTracking, sceneName })
            return
        }

        const checkPositions = async () => {
            const receiverDevices = devices.filter(device => 
                device.role === 'receiver' && device.id !== null && device.id >= 0
            )

            console.log('Checking positions for receiver devices:', receiverDevices.map(d => ({ 
                id: d.id, 
                name: d.name, 
                position: { x: d.position_x, y: d.position_y, z: d.position_z },
                role: d.role 
            })))

            // Process each receiver device
            for (const device of receiverDevices) {
                const deviceId = device.id as number
                const currentPos = { x: device.position_x, y: device.position_y }
                const lastPos = lastRecordedDevicePositions.current.get(deviceId)
                const now = Date.now()

                // Check if position changed significantly or enough time has passed
                const shouldRecord = !lastPos || 
                    Math.abs(currentPos.x - lastPos.x) >= 0.1 || // 0.1 meter threshold (reduced)
                    Math.abs(currentPos.y - lastPos.y) >= 0.1 ||
                    (now - lastPos.time) >= 500 // 500ms minimum interval (reduced)

                console.log(`Device ${device.name}:`, {
                    currentPos,
                    lastPos,
                    shouldRecord,
                    positionDiff: lastPos ? {
                        dx: Math.abs(currentPos.x - lastPos.x),
                        dy: Math.abs(currentPos.y - lastPos.y)
                    } : 'no last pos',
                    timeDiff: lastPos ? (now - lastPos.time) : 'no last time'
                })

                if (shouldRecord) {
                    console.log(`Recording position for ${device.name}:`, currentPos)
                    
                    try {
                        const success = await recordPosition({
                            scene_x: device.position_x,
                            scene_y: device.position_y, 
                            scene_z: device.position_z,
                            scene_name: sceneName
                        })

                        console.log(`Recording result for ${device.name}:`, success)

                        if (success) {
                            lastRecordedDevicePositions.current.set(deviceId, {
                                x: currentPos.x,
                                y: currentPos.y,
                                time: now
                            })
                            console.log(`Updated last recorded position for ${device.name}:`, {
                                x: currentPos.x,
                                y: currentPos.y,
                                time: now
                            })
                        }
                    } catch (error) {
                        console.error(`Error recording position for ${device.name}:`, error)
                    }
                }
            }
        }

        // Initial check
        checkPositions()

        // Set up polling interval to check positions every 250ms for more responsive tracking
        const interval = setInterval(checkPositions, 250)

        return () => {
            clearInterval(interval)
        }
    }, [devices, isTracking, sceneName, recordPosition])

    // WebGL 上下文恢復處理
    const handleWebGLContextLost = useCallback((event: Event) => {
        console.warn('WebGL 上下文丟失，嘗試恢復...')
        event.preventDefault()
    }, [])

    const handleWebGLContextRestored = useCallback(() => {
        console.log('WebGL 上下文已恢復')
    }, [])

    // 添加 WebGL 上下文事件監聽器
    useEffect(() => {
        const canvas = canvasRef.current
        if (canvas) {
            canvas.addEventListener('webglcontextlost', handleWebGLContextLost)
            canvas.addEventListener(
                'webglcontextrestored',
                handleWebGLContextRestored
            )

            return () => {
                canvas.removeEventListener(
                    'webglcontextlost',
                    handleWebGLContextLost
                )
                canvas.removeEventListener(
                    'webglcontextrestored',
                    handleWebGLContextRestored
                )
            }
        }
    }, [handleWebGLContextLost, handleWebGLContextRestored])

    return (
        <div
            className="scene-container"
            style={{
                width: '100%',
                height: '100%',
                position: 'relative',
                background:
                    'radial-gradient(ellipse at bottom, #1b2735 0%, #090a0f 100%)',
                overflow: 'hidden',
            }}
        >
            {/* 星空星點層（在最底層，不影響互動） */}
            <Starfield starCount={180} />

            {/* 添加衛星圖例 - 只有在有衛星資料時才顯示 */}
            {satellites && satellites.length > 0 && <SatelliteLegend />}

            {/* Sparse UAV Scan Controls */}
            <div className="sparse-scan-controls">
                <button 
                    onClick={() => setShowSparseScan(!showSparseScan)}
                    className="toggle-sparse-scan"
                >
                    {showSparseScan ? '隱藏' : '顯示'} UAV稀疏掃描
                </button>
                
                {showSparseScan && (
                    <div className="sparse-scan-panel">
                        <h4>UAV稀疏ISS掃描</h4>
                        
                        {/* Parameter Controls */}
                        <div className="scan-params">
                            <div className="param-group">
                                <label>X步距:</label>
                                <input 
                                    type="number" 
                                    min="1" 
                                    max="10" 
                                    value={scanParams.step_x || 4}
                                    onChange={(e) => setScanParams(prev => ({
                                        ...prev,
                                        step_x: parseInt(e.target.value) || 4
                                    }))}
                                />
                            </div>
                            <div className="param-group">
                                <label>Y步距:</label>
                                <input 
                                    type="number" 
                                    min="1" 
                                    max="10" 
                                    value={scanParams.step_y || 4}
                                    onChange={(e) => setScanParams(prev => ({
                                        ...prev,
                                        step_y: parseInt(e.target.value) || 4
                                    }))}
                                />
                            </div>
                            <div className="param-group">
                                <label>速度(點/秒):</label>
                                <input 
                                    type="number" 
                                    min="0.5" 
                                    max="10" 
                                    step="0.5"
                                    value={scanParams.speed}
                                    onChange={(e) => setScanParams(prev => ({
                                        ...prev,
                                        speed: parseFloat(e.target.value)
                                    }))}
                                />
                            </div>
                        </div>
                        
                        {/* Control Buttons */}
                        <div className="scan-controls">
                            <button 
                                onClick={sparseScan.play}
                                disabled={sparseScan.isPlaying || sparseScan.isLoading}
                                className="control-btn play-btn"
                            >
                                開始
                            </button>
                            <button 
                                onClick={sparseScan.pause}
                                disabled={!sparseScan.isPlaying}
                                className="control-btn pause-btn"
                            >
                                暫停
                            </button>
                            <button 
                                onClick={sparseScan.reset}
                                disabled={sparseScan.isPlaying}
                                className="control-btn reset-btn"
                            >
                                重置
                            </button>
                            <button 
                                onClick={sparseScan.exportCSV}
                                disabled={sparseScan.isLoading}
                                className="control-btn export-btn"
                            >
                                匯出CSV
                            </button>
                            <button 
                                onClick={() => setShowPathVisualization(!showPathVisualization)}
                                className="control-btn path-btn"
                                style={{ backgroundColor: showPathVisualization ? '#4CAF50' : '#666' }}
                            >
                                {showPathVisualization ? '隱藏' : '顯示'}路徑
                            </button>
                            <button 
                                onClick={() => {
                                    if (!sparseScan.data) return;
                                    
                                    // 創建debug canvas
                                    const canvas = document.createElement('canvas');
                                    canvas.width = sparseScan.data.width;
                                    canvas.height = sparseScan.data.height;
                                    canvas.style.border = '1px solid #fff';
                                    canvas.style.marginTop = '10px';
                                    
                                    const ctx = canvas.getContext('2d')!;
                                    ctx.fillStyle = '#000';
                                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                                    
                                    // 繪製格線
                                    ctx.strokeStyle = '#333';
                                    ctx.lineWidth = 0.5;
                                    for (let i = 0; i < canvas.width; i += 20) {
                                        ctx.beginPath();
                                        ctx.moveTo(i, 0);
                                        ctx.lineTo(i, canvas.height);
                                        ctx.stroke();
                                    }
                                    for (let i = 0; i < canvas.height; i += 20) {
                                        ctx.beginPath();
                                        ctx.moveTo(0, i);
                                        ctx.lineTo(canvas.width, i);
                                        ctx.stroke();
                                    }
                                    
                                    // 繪製設備位置
                                    devices.forEach(device => {
                                        if (!device.position_x || !device.position_y) return;
                                        
                                        const debugInfo = debugCoordTransform(
                                            [device.position_x, device.position_y],
                                            sparseScan.data!
                                        );
                                        
                                        const { i, j } = debugInfo.gridIndex;
                                        
                                        switch(device.role) {
                                            case 'desired':
                                                ctx.fillStyle = 'cyan';
                                                break;
                                            case 'jammer':
                                                ctx.fillStyle = 'red';
                                                break;
                                            default:
                                                ctx.fillStyle = 'white';
                                        }
                                        
                                        ctx.fillRect(j - 2, i - 2, 4, 4);
                                        
                                        // 標記設備名稱
                                        ctx.fillStyle = 'white';
                                        ctx.font = '10px monospace';
                                        ctx.fillText(device.name || 'unknown', j + 5, i - 5);
                                        
                                        console.log(`${device.name}: world(${device.position_x}, ${device.position_y}) → grid(${i}, ${j})`, debugInfo);
                                    });
                                    
                                    // 添加到DOM
                                    const debugDiv = document.getElementById('debug-canvas') || document.createElement('div');
                                    debugDiv.id = 'debug-canvas';
                                    debugDiv.innerHTML = '<h4>Debug Grid View</h4>';
                                    debugDiv.appendChild(canvas);
                                    
                                    if (!document.getElementById('debug-canvas')) {
                                        document.body.appendChild(debugDiv);
                                    }
                                    
                                    // 輸出座標軸資訊
                                    const axisInfo = getAxisInfo(sparseScan.data);
                                    console.log('座標軸資訊:', axisInfo);
                                }}
                                className="control-btn debug-btn"
                                style={{ backgroundColor: '#666' }}
                            >
                                Debug網格
                            </button>
                            
                            {/* 生成稀疏ISS地圖按鈕 */}
                            <button
                                onClick={handleGenerateSparseISSMap}
                                disabled={sparseMapGenerating || !droneTracking?.isTracking}
                                className="control-btn sparse-map-btn"
                                style={{ 
                                    backgroundColor: sparseMapGenerating ? '#666' : '#ff6b35',
                                    opacity: !droneTracking?.isTracking ? 0.6 : 1
                                }}
                                title={!droneTracking?.isTracking ? '請先啟用UAV軌跡追蹤' : '根據UAV軌跡生成稀疏ISS地圖'}
                            >
                                {sparseMapGenerating ? '生成中...' : '🗺️ 生成稀疏ISS地圖'}
                            </button>
                        </div>
                        
                        {/* Progress */}
                        <div className="scan-progress">
                            <div className="progress-bar">
                                <div 
                                    className="progress-fill"
                                    style={{ width: `${sparseScan.progress}%` }}
                                ></div>
                            </div>
                            <span className="progress-text">{sparseScan.progress}%</span>
                        </div>
                        
                        {/* Status */}
                        <div className="scan-status">
                            {sparseScan.isLoading && <span>載入中...</span>}
                            {sparseScan.error && <span className="error">錯誤: {sparseScan.error}</span>}
                            {sparseScan.data && (
                                <span>
                                    總點數: {sparseScan.data.total_points} | 
                                    當前: {sparseScan.currentIdx + 1}
                                </span>
                            )}
                        </div>
                        
                        {/* ISS Canvas */}
                        {sparseScan.data && (
                            <div className="iss-canvas-container">
                                <h5>ISS視覺化 (當前位置: {sparseScan.currentIdx + 1}/{sparseScan.data.total_points})</h5>
                                <div style={{ position: 'relative', display: 'inline-block' }}>
                                    <SparseISSCanvas
                                        width={300}
                                        height={300}
                                        gridW={sparseScan.data.width}
                                        gridH={sparseScan.data.height}
                                        samples={sparseScan.samples}
                                        vmin={-2}
                                        vmax={5}
                                        colormap="viridis"
                                    />
                                    {/* UAV位置標記 - 使用統一座標映射 */}
                                    {sparseScan.data.points[sparseScan.currentIdx] && (
                                        (() => {
                                            const currentPoint = sparseScan.data.points[sparseScan.currentIdx];
                                            const [leftPct, topPct] = worldToCanvasPct(
                                                currentPoint.x_m, 
                                                currentPoint.y_m, 
                                                sparseScan.data
                                            );
                                            
                                            // Debug輸出
                                            if (sparseScan.currentIdx % 20 === 0) {
                                                const debugInfo = debugCoordTransform(
                                                    [currentPoint.x_m, currentPoint.y_m], 
                                                    sparseScan.data
                                                );
                                                console.log('UAV座標轉換debug:', debugInfo);
                                            }
                                            
                                            return (
                                                <div 
                                                    className="uav-marker"
                                                    style={{
                                                        position: 'absolute',
                                                        left: `${leftPct}%`,
                                                        top: `${topPct}%`,
                                                        transform: 'translate(-50%, -50%)',
                                                        pointerEvents: 'none'
                                                    }}
                                                >
                                                    🚁
                                                </div>
                                            );
                                        })()
                                    )}
                                    
                                    {/* 設備位置標記 - TX和Jammer */}
                                    {devices.map((device, index) => {
                                        if (!device.position_x || !device.position_y || !sparseScan.data) return null;
                                        
                                        const [leftPct, topPct] = worldToCanvasPct(
                                            device.position_x,
                                            device.position_y,
                                            sparseScan.data
                                        );
                                        
                                        let marker = '';
                                        let className = 'device-marker';
                                        
                                        switch(device.role) {
                                            case 'desired':
                                                marker = '🚁';
                                                className += ' tx-marker';
                                                break;
                                            case 'jammer':
                                                marker = '⚡';
                                                className += ' jammer-marker';
                                                break;
                                            case 'receiver':
                                                // 接收器已經有UAV標記了，跳過
                                                return null;
                                            default:
                                                return null;
                                        }
                                        
                                        return (
                                            <div 
                                                key={device.id || index}
                                                className={className}
                                                style={{
                                                    position: 'absolute',
                                                    left: `${leftPct}%`,
                                                    top: `${topPct}%`,
                                                    transform: 'translate(-50%, -50%)',
                                                    pointerEvents: 'none',
                                                    fontSize: '14px',
                                                    zIndex: 5
                                                }}
                                                title={`${device.name}: (${device.position_x}, ${device.position_y})`}
                                            >
                                                {marker}
                                            </div>
                                        );
                                    })}
                                </div>
                                {/* 顯示當前掃描位置資訊 */}
                                {sparseScan.data.points[sparseScan.currentIdx] && (
                                    <div className="current-position-info">
                                        <small>
                                            位置: ({sparseScan.data.points[sparseScan.currentIdx].x_m.toFixed(1)}, {sparseScan.data.points[sparseScan.currentIdx].y_m.toFixed(1)})m<br/>
                                            ISS: {sparseScan.data.points[sparseScan.currentIdx].iss_dbm.toFixed(2)} dBm
                                        </small>
                                    </div>
                                )}
                            </div>
                        )}
                        
                        {/* Real-time UAV Position and ISS Value Display */}
                        <div className="realtime-uav-info">
                            <h5>實時UAV資訊 {sparseScan.isGeneratingISS && <span className="generating">(計算中...)</span>}</h5>
                            <div className="uav-data-container">
                                {sparseScan.data && sparseScan.data.points[sparseScan.currentIdx] && (
                                    <div className="uav-position">
                                        <div className="data-label">UAV位置:</div>
                                        <div className="data-value">
                                            ({sparseScan.data.points[sparseScan.currentIdx].x_m.toFixed(1)}, {sparseScan.data.points[sparseScan.currentIdx].y_m.toFixed(1)}, 30.0) 米
                                        </div>
                                    </div>
                                )}
                                <div className="iss-value">
                                    <div className="data-label">實時ISS數值:</div>
                                    <div className="data-value iss-number">
                                        {sparseScan.isGeneratingISS ? (
                                            <span className="calculating">計算中...</span>
                                        ) : sparseScan.realTimeISSValue !== null ? (
                                            `${sparseScan.realTimeISSValue.toFixed(2)} dBm`
                                        ) : (
                                            '等待計算'
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="realtime-info">
                                <small>
                                    🚁 UAV在每個位置停留，等待完整ISS計算完成<br/>
                                    📊 顯示該位置作為接收器的實時干擾信號強度
                                </small>
                            </div>
                        </div>
                        
                        {/* 稀疏ISS地圖結果顯示 */}
                        <div className="sparse-iss-map-result">
                            {sparseMapError && (
                                <div className="error-message" style={{ 
                                    color: '#ff6b6b', 
                                    background: 'rgba(255, 107, 107, 0.1)', 
                                    padding: '10px', 
                                    borderRadius: '4px',
                                    marginTop: '10px' 
                                }}>
                                    ❌ {sparseMapError}
                                </div>
                            )}
                            
                            {sparseMapUrl && (
                                <div className="sparse-map-display" style={{ marginTop: '15px' }}>
                                    <h5>🗺️ 基於UAV軌跡的稀疏ISS地圖</h5>
                                    <div style={{ 
                                        border: '2px solid #ff6b35', 
                                        borderRadius: '8px', 
                                        overflow: 'hidden',
                                        background: '#000'
                                    }}>
                                        <img 
                                            src={sparseMapUrl} 
                                            alt="Sparse ISS Map" 
                                            style={{ 
                                                width: '100%', 
                                                maxWidth: '400px', 
                                                height: 'auto',
                                                display: 'block'
                                            }}
                                            onLoad={() => console.log('稀疏ISS地圖載入完成')}
                                            onError={() => setSparseMapError('地圖圖像載入失敗')}
                                        />
                                    </div>
                                    <div style={{ 
                                        fontSize: '12px', 
                                        color: '#ccc', 
                                        marginTop: '5px',
                                        textAlign: 'center' 
                                    }}>
                                        基於實際UAV飛行軌跡的稀疏干擾信號強度地圖
                                    </div>
                                </div>
                            )}
                            
                            {!droneTracking?.isTracking && !sparseMapGenerating && (
                                <div className="tracking-hint" style={{ 
                                    background: 'rgba(255, 193, 7, 0.1)', 
                                    border: '1px solid #ffc107',
                                    color: '#ffc107', 
                                    padding: '10px', 
                                    borderRadius: '4px',
                                    marginTop: '10px',
                                    fontSize: '13px'
                                }}>
                                    💡 提示：啟用UAV軌跡追蹤並進行飛行操作，然後點擊"生成稀疏ISS地圖"按鈕來創建基於實際軌跡的干擾地圖
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* 3D Canvas內容照舊，會蓋在星空上 */}
            <Canvas
                ref={canvasRef}
                shadows
                camera={{ position: [0, 400, 500], near: 0.1, far: 1e4 }}
                gl={{
                    toneMapping: THREE.ACESFilmicToneMapping,
                    toneMappingExposure: 1.2,
                    alpha: true,
                    preserveDrawingBuffer: false,
                    powerPreference: 'high-performance',
                    antialias: true,
                    failIfMajorPerformanceCaveat: false,
                }}
                onCreated={({ gl }) => {
                    // 配置渲染器的上下文恢復選項
                    gl.debug.checkShaderErrors = true
                    console.log('WebGL 渲染器已創建')
                }}
            >
                <hemisphereLight args={[0xffffff, 0x444444, 1.0]} />
                <ambientLight intensity={0.2} />
                <directionalLight
                    castShadow
                    position={[15, 30, 10]}
                    intensity={1.5}
                    shadow-mapSize-width={4096}
                    shadow-mapSize-height={4096}
                    shadow-camera-near={1}
                    shadow-camera-far={1000}
                    shadow-camera-top={500}
                    shadow-camera-bottom={-500}
                    shadow-camera-left={500}
                    shadow-camera-right={-500}
                    shadow-bias={-0.0004}
                    shadow-radius={8}
                />
                <Suspense fallback={null}>
                    <MainScene
                        devices={devices}
                        auto={auto}
                        manualDirection={manualDirection}
                        manualControl={onManualControl}
                        onUAVPositionUpdate={handleUAVPositionUpdate}
                        uavAnimation={uavAnimation}
                        selectedReceiverIds={selectedReceiverIds}
                        satellites={satellites}
                        sceneName={sceneName}
                        sparseScanData={sparseScan.data}
                        sparseScanCurrentIdx={sparseScan.currentIdx}
                        sparseScanActive={sparseScan.isPlaying}
                    />
                    
                    {/* UAV Path Visualization */}
                    {showPathVisualization && sparseScan.traversedPath.length > 0 && (
                        <UAVPathVisualization
                            pathPoints={sparseScan.traversedPath}
                            currentPosition={currentUAVPosition}
                            lineWidth={3}
                            showCurrentPosition={true}
                            maxPathLength={500}
                        />
                    )}
                    
                    <ContactShadows
                        position={[0, 0.1, 0]}
                        opacity={0.4}
                        scale={400}
                        blur={1.5}
                        far={50}
                    />
                </Suspense>
                <OrbitControls makeDefault />
            </Canvas>
        </div>
    )
}

// 添加CSS樣式
const styleSheet = document.createElement('style')
styleSheet.innerHTML = `
.satellite-legend {
    position: absolute;
    top: 20px;
    right: 20px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 10px;
    border-radius: 5px;
    font-size: 12px;
    z-index: 1000;
}

.satellite-legend h4 {
    margin-top: 0;
    margin-bottom: 8px;
    font-size: 14px;
}

.legend-item {
    display: flex;
    align-items: center;
    margin-bottom: 5px;
}

.color-sample {
    width: 15px;
    height: 15px;
    border-radius: 50%;
    margin-right: 8px;
}

.high-elevation {
    background-color: #ff3300;
    box-shadow: 0 0 8px #ff3300;
}

.low-elevation {
    background-color: #0088ff;
    box-shadow: 0 0 8px #0088ff;
}

.legend-note {
    font-size: 10px;
    margin-top: 5px;
    opacity: 0.8;
}

/* Sparse Scan Controls */
.sparse-scan-controls {
    position: absolute;
    top: 20px;
    left: 20px;
    z-index: 1000;
}

.toggle-sparse-scan {
    background: rgba(0, 0, 0, 0.7);
    color: white;
    border: 1px solid #555;
    padding: 8px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
}

.toggle-sparse-scan:hover {
    background: rgba(0, 0, 0, 0.9);
}

.sparse-scan-panel {
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 15px;
    border-radius: 6px;
    margin-top: 5px;
    min-width: 250px;
    max-width: 300px;
}

.sparse-scan-panel h4 {
    margin-top: 0;
    margin-bottom: 12px;
    font-size: 14px;
    border-bottom: 1px solid #555;
    padding-bottom: 5px;
}

.sparse-scan-panel h5 {
    margin: 12px 0 8px 0;
    font-size: 12px;
    color: #ccc;
}

.scan-params {
    margin-bottom: 12px;
}

.param-group {
    display: flex;
    align-items: center;
    margin-bottom: 6px;
    font-size: 11px;
}

.param-group label {
    width: 80px;
    margin-right: 8px;
}

.param-group input {
    width: 50px;
    padding: 2px 4px;
    border: 1px solid #555;
    background: rgba(255, 255, 255, 0.1);
    color: white;
    border-radius: 3px;
    font-size: 11px;
}

.scan-controls {
    display: flex;
    gap: 6px;
    margin-bottom: 12px;
    flex-wrap: wrap;
}

.control-btn {
    padding: 4px 8px;
    border: 1px solid #555;
    background: rgba(255, 255, 255, 0.1);
    color: white;
    border-radius: 3px;
    cursor: pointer;
    font-size: 10px;
    flex: 1;
    min-width: 50px;
}

.control-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.2);
}

.control-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.play-btn { border-color: #4CAF50; }
.pause-btn { border-color: #ff9800; }
.reset-btn { border-color: #f44336; }
.export-btn { border-color: #2196F3; }
.path-btn { border-color: #9C27B0; }

.scan-progress {
    margin-bottom: 8px;
}

.progress-bar {
    width: 100%;
    height: 6px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    overflow: hidden;
}

.progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #4CAF50, #8BC34A);
    transition: width 0.1s ease;
}

.progress-text {
    font-size: 10px;
    margin-left: 5px;
    color: #ccc;
}

.scan-status {
    font-size: 10px;
    color: #ccc;
    margin-bottom: 8px;
}

.scan-status .error {
    color: #f44336;
}

.iss-canvas-container {
    border-top: 1px solid #555;
    padding-top: 8px;
}

.realtime-uav-info {
    border-top: 1px solid #555;
    padding-top: 8px;
    margin-top: 10px;
}

.realtime-uav-info h5 {
    margin: 0 0 8px 0;
    font-size: 12px;
    color: #0088ff;
}

.uav-data-container {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
    padding: 8px;
    margin-bottom: 6px;
}

.uav-position, .iss-value {
    margin-bottom: 6px;
}

.uav-position:last-child, .iss-value:last-child {
    margin-bottom: 0;
}

.data-label {
    font-size: 10px;
    color: #aaa;
    margin-bottom: 2px;
}

.data-value {
    font-size: 11px;
    color: #fff;
    font-weight: bold;
}

.iss-number {
    color: #0088ff;
    font-size: 13px;
}

.calculating {
    color: #ffa500;
    animation: pulse 1.5s infinite ease-in-out;
}

.generating {
    color: #ffa500;
    animation: pulse 1s infinite ease-in-out;
}

@keyframes pulse {
    0%, 100% { opacity: 0.7; }
    50% { opacity: 1.0; }
}

.realtime-info {
    margin-top: 5px;
    padding: 4px 6px;
    background: rgba(0, 136, 255, 0.1);
    border-radius: 3px;
    font-size: 10px;
    color: #ccc;
    text-align: center;
}

.current-position-info {
    margin-top: 5px;
    padding: 4px 6px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    font-size: 10px;
    color: #ccc;
    text-align: center;
}

.uav-marker {
    font-size: 16px;
    z-index: 10;
    filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.8));
    animation: uav-pulse 2s infinite ease-in-out;
}

@keyframes uav-pulse {
    0%, 100% { opacity: 0.8; }
    50% { opacity: 1.0; }
}

.device-marker {
    font-size: 14px;
    z-index: 5;
    filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.8));
    user-select: none;
}

.tx-marker {
    filter: drop-shadow(0 0 3px rgba(0, 150, 255, 0.8));
}

.jammer-marker {
    filter: drop-shadow(0 0 3px rgba(255, 50, 50, 0.8));
    animation: jammer-flash 1.5s infinite ease-in-out;
}

@keyframes jammer-flash {
    0%, 100% { opacity: 0.7; }
    50% { opacity: 1.0; }
}
`
document.head.appendChild(styleSheet)
