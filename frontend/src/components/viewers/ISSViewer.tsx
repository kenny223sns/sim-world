import { useState, useEffect, useCallback, useRef } from 'react'
import { ViewerProps } from '../../types/viewer'
import { ApiRoutes } from '../../config/apiRoutes'
import { useDevices } from '../../hooks/useDevices'
import { useMapSettings } from '../../store/useMapSettings'
import { useSparseUAVScan } from '../../hooks/useSparseUAVScan'
import { useUAVScanContext } from '../../contexts/UAVScanContext'
import SparseISSCanvas from '../scenes/SparseISSCanvas'
import RadioMapViewer from './RadioMapViewer'

// 干擾信號檢測地圖顯示組件
const ISSViewer: React.FC<ViewerProps> = ({
    onReportLastUpdateToNavbar,
    reportRefreshHandlerToNavbar,
    reportIsLoadingToNavbar,
    currentScene,
}) => {
    const [isLoading, setIsLoading] = useState(true)
    const [imageUrl, setImageUrl] = useState<string | null>(null)
    const [tssImageUrl, setTssImageUrl] = useState<string | null>(null)
    const [uavSparseImageUrl, setUavSparseImageUrl] = useState<string | null>(null)
    const [currentMapType, setCurrentMapType] = useState<'iss' | 'tss' | 'uav-sparse'>('iss')
    const [error, setError] = useState<string | null>(null)
    const [retryCount, setRetryCount] = useState(0)
    const maxRetries = 3

    // Use shared map settings instead of local state
    const { cellSize, width: mapWidth, height: mapHeight, applyToken } = useMapSettings()

    const imageUrlRef = useRef<string | null>(null)
    const API_PATH = ApiRoutes.simulations.getISSMap
    
    // 使用 useDevices hook 來獲取當前設備位置
    const { tempDevices, hasTempDevices } = useDevices()

    // 稀疏掃描相關狀態
    const [selectedReceiverIds, setSelectedReceiverIds] = useState<number[]>([])
    const [showSparseSection, setShowSparseSection] = useState(false)
    const [showRadioMapViewer, setShowRadioMapViewer] = useState(false)
    const [showSparseVisualization, setShowSparseVisualization] = useState(false)

    // 使用稀疏掃描hook
    const sparseScan = useSparseUAVScan({
        scene: currentScene,
        devices: tempDevices,
        autoStart: false
    })

    // 使用UAV掃描Context
    const { scanData, hasScanData } = useUAVScanContext()

    const updateTimestamp = useCallback(() => {
        const now = new Date()
        const timeString = now.toLocaleTimeString()
        onReportLastUpdateToNavbar?.(timeString)
    }, [onReportLastUpdateToNavbar])

    // 處理接收器選擇
    const handleReceiverSelect = (deviceId: number, selected: boolean) => {
        if (selected) {
            setSelectedReceiverIds(prev => [...prev, deviceId])
        } else {
            setSelectedReceiverIds(prev => prev.filter(id => id !== deviceId))
        }
    }

    // 獲取接收器設備列表
    const receiverDevices = tempDevices.filter(device => 
        device.role === 'receiver' && device.active
    )


    const tssImageUrlRef = useRef<string | null>(null)
    
    useEffect(() => {
        imageUrlRef.current = imageUrl
    }, [imageUrl])
    
    useEffect(() => {
        tssImageUrlRef.current = tssImageUrl
    }, [tssImageUrl])

    const loadMaps = useCallback(() => {
        setIsLoading(true)
        setError(null)

        // 從設備中獲取 TX 和所有 Jammer 位置
        const txDevice = tempDevices.find(device => 
            device.role === 'desired' && device.active
        )
        const jammerDevices = tempDevices.filter(device => 
            device.role === 'jammer' && device.active
        )

        // 構建 API 參數
        const params = new URLSearchParams({
            scene: currentScene,
            t: new Date().getTime().toString(),
            force_refresh: 'true' // 強制刷新以獲取最新位置的地圖
        })

        // 添加地圖參數
        params.append('cell_size', cellSize.toString())
        params.append('map_width', mapWidth.toString())
        params.append('map_height', mapHeight.toString())
        console.log(`地圖載入: 使用解析度 ${cellSize} 米/像素, 地圖大小 ${mapWidth}x${mapHeight}`)

        // 添加 TX 位置參數（如果存在）
        if (txDevice) {
            params.append('tx_x', txDevice.position_x.toString())
            params.append('tx_y', txDevice.position_y.toString())
            params.append('tx_z', txDevice.position_z.toString())
            console.log(`地圖載入: 使用 TX 位置 (${txDevice.position_x}, ${txDevice.position_y}, ${txDevice.position_z})`)
        }

        // 添加所有 Jammer 位置參數
        jammerDevices.forEach((jammer, index) => {
            const positionStr = `${jammer.position_x},${jammer.position_y},${jammer.position_z}`
            params.append('jammer', positionStr)
            console.log(`地圖載入: 使用 Jammer ${index + 1} 位置 (${jammer.position_x}, ${jammer.position_y}, ${jammer.position_z})`)
        })

        // 先發起 ISS 地圖請求（會同時生成 ISS 和 TSS 地圖）
        const issUrl = `${ApiRoutes.simulations.getISSMap}?${params.toString()}`
        
        console.log('ISS Map API URL:', issUrl)

        fetch(issUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error(`ISS 地圖 API 請求失敗: ${response.status} ${response.statusText}`)
            }
            return response.blob()
        })
        .then(issBlob => {
            // 檢查是否收到了有效的圖片數據
            if (issBlob.size === 0) {
                throw new Error('接收到空的 ISS 圖像數據')
            }

            // 清理舊的 ISS URL
            if (imageUrlRef.current) {
                URL.revokeObjectURL(imageUrlRef.current)
            }
            
            // 創建新的 ISS URL
            const newIssUrl = URL.createObjectURL(issBlob)
            setImageUrl(newIssUrl)
            
            // ISS 地圖載入成功後，再請求 TSS 地圖（此時應該已經生成）
            const tssUrl = `${ApiRoutes.simulations.getTSSMap}?t=${Date.now()}`
            console.log('TSS Map API URL:', tssUrl)
            
            return fetch(tssUrl)
        })
        .then(tssResponse => {
            if (!tssResponse.ok) {
                throw new Error(`TSS 地圖 API 請求失敗: ${tssResponse.status} ${tssResponse.statusText}`)
            }
            return tssResponse.blob()
        })
        .then(tssBlob => {
            // 檢查是否收到了有效的 TSS 圖片數據
            if (tssBlob.size === 0) {
                throw new Error('接收到空的 TSS 圖像數據')
            }

            // 清理舊的 TSS URL
            if (tssImageUrlRef.current) {
                URL.revokeObjectURL(tssImageUrlRef.current)
            }
            
            // 創建新的 TSS URL
            const newTssUrl = URL.createObjectURL(tssBlob)
            setTssImageUrl(newTssUrl)
            
            setIsLoading(false)
            
            updateTimestamp()
        })
            .catch((err) => {
                console.error('載入干擾信號檢測地圖失敗:', err)

                // 處理可能的FileNotFoundError情況
                if (err.message && err.message.includes('404')) {
                    setError('圖像文件未找到: 後端可能正在生成圖像，請稍後重試')
                } else {
                    setError('無法載入干擾信號檢測地圖: ' + err.message)
                }

                setIsLoading(false)

                // 取消自動重試機制
                
            })
    }, [updateTimestamp, retryCount, currentScene, tempDevices, cellSize, mapWidth, mapHeight])

    useEffect(() => {
        reportRefreshHandlerToNavbar(loadMaps)
    }, [loadMaps, reportRefreshHandlerToNavbar])

    useEffect(() => {
        reportIsLoadingToNavbar(isLoading)
    }, [isLoading, reportIsLoadingToNavbar])

    useEffect(() => {
        loadMaps()
        return () => {
            if (imageUrlRef.current) {
                URL.revokeObjectURL(imageUrlRef.current)
            }
            if (tssImageUrlRef.current) {
                URL.revokeObjectURL(tssImageUrlRef.current)
            }
        }
    }, [loadMaps])

    // Trigger reload when map settings are applied
    useEffect(() => {
        if (applyToken) {
            loadMaps()
        }
    }, [applyToken, loadMaps])

    const handleRetryClick = () => {
        setRetryCount(0)
        loadMaps()
    }

    return (
        <div className="image-viewer iss-image-container">
            {/* 地圖設定提示 */}
            <div style={{
                padding: '10px',
                marginBottom: '10px',
                backgroundColor: 'rgba(0, 123, 255, 0.1)',
                borderLeft: '4px solid #007bff',
                borderRadius: '4px',
                fontSize: '14px',
                color: '#ffffff'
            }}>
                <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
                    🗺️ 地圖設定
                </div>
                <div style={{ fontSize: '12px', color: '#ccc' }}>
                    目前使用: {cellSize}米/像素, {mapWidth}×{mapHeight} 像素 ({(cellSize * mapWidth).toFixed(1)}×{(cellSize * mapHeight).toFixed(1)}米)
                </div>
                <div style={{ fontSize: '12px', color: '#aaa', marginTop: '3px' }}>
                    💡 在右側面板的「地圖設定」中調整解析度和大小，同時影響 UAV 掃描與干擾檢測地圖
                </div>
            </div>

            {/* 稀疏UAV掃描控制區域 */}
            <div style={{
                padding: '10px',
                marginBottom: '10px',
                backgroundColor: 'rgba(255, 165, 0, 0.1)',
                borderLeft: '4px solid #ffa500',
                borderRadius: '4px',
                fontSize: '14px',
                color: '#ffffff'
            }}>
                <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    marginBottom: '10px' 
                }}>
                    <div style={{ fontWeight: 'bold' }}>
                        🛸 稀疏UAV掃描
                    </div>
                    <button
                        onClick={() => setShowSparseSection(!showSparseSection)}
                        style={{
                            padding: '5px 10px',
                            background: 'rgba(255, 255, 255, 0.2)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px'
                        }}
                    >
                        {showSparseSection ? '隱藏' : '顯示'}
                    </button>
                </div>
                
                {showSparseSection && (
                    <div>
                        {/* 掃描控制按鈕 */}
                        <div style={{ marginBottom: '10px' }}>
                            <button
                                onClick={sparseScan.play}
                                disabled={sparseScan.isLoading || sparseScan.isPlaying}
                                style={{
                                    marginRight: '10px',
                                    padding: '8px 15px',
                                    background: sparseScan.isPlaying ? '#6c757d' : '#28a745',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: sparseScan.isLoading || sparseScan.isPlaying ? 'not-allowed' : 'pointer',
                                    fontSize: '14px'
                                }}
                            >
                                {sparseScan.isLoading ? '載入中...' : sparseScan.isPlaying ? '掃描中...' : '開始掃描'}
                            </button>
                            
                            <button
                                onClick={sparseScan.pause}
                                disabled={!sparseScan.isPlaying}
                                style={{
                                    marginRight: '10px',
                                    padding: '8px 15px',
                                    background: !sparseScan.isPlaying ? '#6c757d' : '#dc3545',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: !sparseScan.isPlaying ? 'not-allowed' : 'pointer',
                                    fontSize: '14px'
                                }}
                            >
                                暫停
                            </button>
                            
                            <button
                                onClick={sparseScan.reset}
                                style={{
                                    marginRight: '10px',
                                    padding: '8px 15px',
                                    background: '#6f42c1',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '14px'
                                }}
                            >
                                重置
                            </button>
                            
                            <button
                                onClick={sparseScan.exportCSV}
                                disabled={!sparseScan.data}
                                style={{
                                    padding: '8px 15px',
                                    background: !sparseScan.data ? '#6c757d' : '#17a2b8',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: !sparseScan.data ? 'not-allowed' : 'pointer',
                                    fontSize: '14px'
                                }}
                            >
                                匯出CSV
                            </button>
                        </div>

                        {/* 掃描狀態資訊 */}
                        <div style={{ 
                            fontSize: '12px', 
                            color: '#ccc',
                            marginBottom: '10px' 
                        }}>
                            {sparseScan.data && (
                                <div>
                                    進度: {sparseScan.progress}% ({sparseScan.currentIdx}/{sparseScan.data.points.length})
                                    {sparseScan.getScanPointsCount() > 0 && (
                                        <span> | 已掃描: {sparseScan.getScanPointsCount()} 點</span>
                                    )}
                                </div>
                            )}
                            {sparseScan.error && (
                                <div style={{ color: '#ff6b6b' }}>
                                    錯誤: {sparseScan.error}
                                </div>
                            )}
                        </div>

                        {/* 接收器選擇 */}
                        {receiverDevices.length > 0 && (
                            <div style={{ marginBottom: '10px' }}>
                                <div style={{ fontWeight: 'bold', marginBottom: '5px', fontSize: '13px' }}>
                                    📡 接收器選擇:
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {receiverDevices.map(device => (
                                        <label
                                            key={device.id}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                fontSize: '12px',
                                                cursor: 'pointer',
                                                padding: '4px 8px',
                                                backgroundColor: selectedReceiverIds.includes(device.id) 
                                                    ? 'rgba(40, 167, 69, 0.3)' 
                                                    : 'rgba(255, 255, 255, 0.1)',
                                                borderRadius: '4px'
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedReceiverIds.includes(device.id)}
                                                onChange={(e) => handleReceiverSelect(device.id, e.target.checked)}
                                                style={{ marginRight: '5px' }}
                                            />
                                            {device.name} ({device.position_x.toFixed(0)}, {device.position_y.toFixed(0)})
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 視覺化切換按鈕 */}
                        <div style={{ 
                            display: 'flex', 
                            gap: '10px',
                            marginTop: '10px' 
                        }}>
                            <button
                                onClick={() => setShowSparseVisualization(!showSparseVisualization)}
                                style={{
                                    padding: '6px 12px',
                                    background: showSparseVisualization ? '#28a745' : 'rgba(255, 255, 255, 0.2)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '12px'
                                }}
                            >
                                {showSparseVisualization ? '隱藏' : '顯示'} 稀疏可視化
                            </button>
                            
                            <button
                                onClick={() => setShowRadioMapViewer(!showRadioMapViewer)}
                                disabled={!hasScanData()}
                                style={{
                                    padding: '6px 12px',
                                    background: !hasScanData() 
                                        ? '#6c757d' 
                                        : showRadioMapViewer 
                                            ? '#28a745' 
                                            : 'rgba(255, 255, 255, 0.2)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: !hasScanData() ? 'not-allowed' : 'pointer',
                                    fontSize: '12px'
                                }}
                            >
                                {showRadioMapViewer ? '隱藏' : '顯示'} 無線電地圖
                            </button>
                        </div>
                    </div>
                )}
            </div>
            
            {hasTempDevices && (
                <div style={{
                    padding: '10px',
                    marginBottom: '10px',
                    backgroundColor: '#ffa500',
                    color: 'white',
                    borderRadius: '4px',
                    fontSize: '14px',
                    fontWeight: 'bold'
                }}>
                    ⚠️ 偵測到設備位置修改，請點擊 Sidebar 底部的「套用」按鈕以查看更新後的無線電地圖！
                </div>
            )}
            
            {/* 地圖類型選擇控制區域 */}
            {(imageUrl || tssImageUrl) && (
                <div style={{
                    padding: '10px',
                    marginBottom: '10px',
                    backgroundColor: 'rgba(34, 139, 34, 0.1)',
                    borderLeft: '4px solid #228b22',
                    borderRadius: '4px',
                    fontSize: '14px',
                    color: '#ffffff'
                }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>
                        🗺️ 地圖類型選擇
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                            onClick={() => setCurrentMapType('iss')}
                            style={{
                                padding: '8px 15px',
                                background: currentMapType === 'iss' ? '#228b22' : 'rgba(255, 255, 255, 0.2)',
                                color: 'white',
                                border: currentMapType === 'iss' ? '2px solid #32cd32' : '2px solid transparent',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: currentMapType === 'iss' ? 'bold' : 'normal'
                            }}
                        >
                            ISS 地圖 (干擾檢測)
                        </button>
                        <button
                            onClick={() => setCurrentMapType('tss')}
                            style={{
                                padding: '8px 15px',
                                background: currentMapType === 'tss' ? '#228b22' : 'rgba(255, 255, 255, 0.2)',
                                color: 'white',
                                border: currentMapType === 'tss' ? '2px solid #32cd32' : '2px solid transparent',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: currentMapType === 'tss' ? 'bold' : 'normal'
                            }}
                        >
                            TSS 地圖 (總信號強度)
                        </button>
                    </div>
                    <div style={{ fontSize: '12px', color: '#aaa', marginTop: '8px' }}>
                        💡 ISS 地圖包含 2D-CFAR 檢測峰值，TSS 地圖顯示總信號強度分佈
                    </div>
                </div>
            )}
            {isLoading && (
                <div className="loading">正在計算干擾信號檢測地圖並執行 2D-CFAR 檢測...</div>
            )}
            {error && (
                <div className="error">
                    {error}
                    <button
                        onClick={handleRetryClick}
                        style={{
                            marginLeft: '10px',
                            padding: '5px 10px',
                            background: '#4285f4',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                        }}
                    >
                        重試
                    </button>
                </div>
            )}
            {/* 根據選擇的地圖類型顯示對應的圖片 */}
            {currentMapType === 'iss' && imageUrl && (
                <img
                    src={imageUrl}
                    alt="ISS Map - Interference Signal Strength with 2D-CFAR Detection"
                    className="view-image iss-view-image"
                />
            )}
            {currentMapType === 'tss' && tssImageUrl && (
                <img
                    src={tssImageUrl}
                    alt="TSS Map - Total Signal Strength"
                    className="view-image iss-view-image"
                />
            )}

            {/* 稀疏掃描可視化 */}
            {showSparseVisualization && sparseScan.data && (
                <div style={{
                    marginTop: '20px',
                    padding: '10px',
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.2)'
                }}>
                    <div style={{
                        fontSize: '16px',
                        fontWeight: 'bold',
                        marginBottom: '10px',
                        color: '#ffffff'
                    }}>
                        🎯 稀疏ISS掃描可視化
                    </div>
                    
                    <SparseISSCanvas
                        width={sparseScan.data.width}
                        height={sparseScan.data.height}
                        samples={sparseScan.samples}
                        xAxis={sparseScan.data.x_axis}
                        yAxis={sparseScan.data.y_axis}
                        colormap="viridis"
                        canvasWidth={500}
                        canvasHeight={500}
                    />
                    
                    <div style={{
                        marginTop: '10px',
                        fontSize: '12px',
                        color: '#aaa'
                    }}>
                        網格大小: {sparseScan.data.width} × {sparseScan.data.height} | 
                        已採樣: {sparseScan.currentIdx}/{sparseScan.data.points.length} 點
                    </div>
                </div>
            )}

            {/* 無線電地圖檢視器 */}
            {showRadioMapViewer && hasScanData() && (
                <div style={{
                    marginTop: '20px',
                    padding: '10px',
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.2)'
                }}>
                    <div style={{
                        fontSize: '16px',
                        fontWeight: 'bold',
                        marginBottom: '10px',
                        color: '#ffffff'
                    }}>
                        📡 無線電強度熱力圖
                    </div>
                    
                    <RadioMapViewer
                        mapData={sparseScan.samples}
                        width={sparseScan.data?.width || 0}
                        height={sparseScan.data?.height || 0}
                        xAxis={sparseScan.data?.x_axis || []}
                        yAxis={sparseScan.data?.y_axis || []}
                        scene={currentScene}
                        onReportLastUpdateToNavbar={onReportLastUpdateToNavbar}
                        reportRefreshHandlerToNavbar={reportRefreshHandlerToNavbar}
                        reportIsLoadingToNavbar={reportIsLoadingToNavbar}
                    />
                </div>
            )}
        </div>
    )
}

export default ISSViewer