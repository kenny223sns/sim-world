import { useState, useEffect, useCallback, useRef } from 'react'
import { ViewerProps } from '../../types/viewer'
import { ApiRoutes } from '../../config/apiRoutes'
import { useDevices } from '../../hooks/useDevices'
import { useMapSettings } from '../../store/useMapSettings'
import { useSparseUAVScan } from '../../hooks/useSparseUAVScan'
import { useUAVScanContext } from '../../contexts/UAVScanContext'
import SparseISSCanvas from '../scenes/SparseISSCanvas'
import RadioMapViewer from './RadioMapViewer'
import { CFARPeakGPS } from '../../services/sparseScanApi'

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
    
    // CFAR峰值GPS顯示狀態
    const [cfarPeaksGPS, setCfarPeaksGPS] = useState<CFARPeakGPS[]>([])

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

    // 已棄用：CFAR峰值現在直接從ISS地圖API的JSON回應中獲取
    const loadCFARPeaksGPS = useCallback(async (forceRefresh: boolean = false) => {
        console.log('loadCFARPeaksGPS 已棄用，CFAR峰值現在直接從ISS地圖API獲取')
        return
    }, [currentMapType, currentScene])


    const tssImageUrlRef = useRef<string | null>(null)
    const uavSparseImageUrlRef = useRef<string | null>(null)
    
    useEffect(() => {
        imageUrlRef.current = imageUrl
    }, [imageUrl])
    
    useEffect(() => {
        tssImageUrlRef.current = tssImageUrl
    }, [tssImageUrl])

    useEffect(() => {
        uavSparseImageUrlRef.current = uavSparseImageUrl
    }, [uavSparseImageUrl])

    const loadMaps = useCallback(() => {
        setIsLoading(true)
        setError(null)
        // 清空舊的CFAR峰值數據，確保每次重新載入都是從空狀態開始
        setCfarPeaksGPS([])

        // 從設備中獲取 TX 和所有 Jammer 位置
        const txDevice = tempDevices.find(device => 
            device.role === 'desired' && device.active
        )
        const jammerDevices = tempDevices.filter(device => 
            device.role === 'jammer' && device.active && device.visible === true
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

        // 添加 UAV 掃描點數據（如果有的話）
        if (hasScanData() && scanData && scanData.scanPoints && scanData.scanPoints.length > 0) {
            const uavPointsStr = scanData.scanPoints.map(point => `${point.x},${point.y}`).join(';')
            params.append('uav_points', uavPointsStr)
            console.log(`地圖載入: 使用 ${scanData.scanPoints.length} 個 UAV 掃描點`)
        }

        // 先發起 ISS 地圖請求（會同時生成 ISS、TSS 和 UAV Sparse 地圖）
        // 啟用return_json參數獲取CFAR峰值數據
        params.append('return_json', 'true')
        
        const issUrl = `${ApiRoutes.simulations.getISSMap}?${params.toString()}`
        
        console.log('ISS Map API URL:', issUrl)

        fetch(issUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error(`ISS 地圖 API 請求失敗: ${response.status} ${response.statusText}`)
            }
            // 檢查Content-Type來決定如何解析回應
            const contentType = response.headers.get('content-type')
            if (contentType && contentType.includes('application/json')) {
                return response.json()
            } else {
                return response.blob()
            }
        })
        .then(result => {
            // 處理JSON回應（包含CFAR峰值）
            if (result && typeof result === 'object' && 'success' in result) {
                if (!result.success) {
                    throw new Error('ISS 地圖生成失敗')
                }

                // 設置ISS地圖圖片URL
                const newIssUrl = `${result.image_url}?t=${Date.now()}`
                setImageUrl(newIssUrl)
                
                // 直接設置CFAR峰值GPS數據 - 無論有無數據都要更新
                const peaks = Array.isArray(result.cfar_peaks_gps) ? result.cfar_peaks_gps : []
                const validPeaks = peaks.filter(peak => 
                    peak && 
                    peak.gps_coords && 
                    typeof peak.gps_coords.latitude === 'number' && 
                    typeof peak.gps_coords.longitude === 'number'
                )
                
                setCfarPeaksGPS(validPeaks)
                console.log(`從ISS地圖直接獲取到 ${validPeaks.length} 個有效CFAR峰值GPS位置`)
                
                if (validPeaks.length === 0) {
                    console.log('本次ISS地圖檢測沒有找到CFAR峰值')
                }
            } 
            // 處理Blob回應（傳統圖片）
            else if (result instanceof Blob) {
                // 檢查是否收到了有效的圖片數據
                if (result.size === 0) {
                    throw new Error('接收到空的 ISS 圖像數據')
                }

                // 清理舊的 ISS URL
                if (imageUrlRef.current) {
                    URL.revokeObjectURL(imageUrlRef.current)
                }
                
                // 創建新的 ISS URL
                const newIssUrl = URL.createObjectURL(result)
                setImageUrl(newIssUrl)
                
                // Blob回應已棄用，現在ISS地圖API直接返回JSON包含CFAR峰值
                setCfarPeaksGPS([])
                console.log('使用傳統Blob回應，無CFAR峰值數據')
            }
            
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
            
            // TSS 地圖載入成功後，檢查是否有 UAV 點資料來載入 UAV Sparse 地圖
            if (hasScanData() && scanData && scanData.scanPoints && scanData.scanPoints.length > 0) {
                console.log('檢測到 UAV 掃描資料，開始載入 UAV Sparse 地圖')
                const uavSparseUrl = `${ApiRoutes.simulations.getUAVSparseMap}?t=${Date.now()}`
                console.log('UAV Sparse Map API URL:', uavSparseUrl)
                
                fetch(uavSparseUrl)
                    .then(uavSparseResponse => {
                        if (!uavSparseResponse.ok) {
                            throw new Error(`UAV Sparse 地圖 API 請求失敗: ${uavSparseResponse.status} ${uavSparseResponse.statusText}`)
                        }
                        return uavSparseResponse.blob()
                    })
                    .then(uavSparseBlob => {
                        // 檢查是否收到了有效的 UAV Sparse 圖片數據
                        if (uavSparseBlob.size === 0) {
                            throw new Error('接收到空的 UAV Sparse 圖像數據')
                        }

                        // 清理舊的 UAV Sparse URL
                        if (uavSparseImageUrlRef.current) {
                            URL.revokeObjectURL(uavSparseImageUrlRef.current)
                        }
                        
                        // 創建新的 UAV Sparse URL
                        const newUavSparseUrl = URL.createObjectURL(uavSparseBlob)
                        setUavSparseImageUrl(newUavSparseUrl)
                        console.log('UAV Sparse 地圖載入成功')
                        
                        // 自動切換到 UAV Sparse 地圖顯示
                        setCurrentMapType('uav-sparse')
                        console.log('自動切換到 UAV Sparse 地圖顯示')
                    })
                    .catch(uavSparseErr => {
                        console.warn('UAV Sparse 地圖載入失敗:', uavSparseErr)
                        // UAV sparse 地圖載入失敗不影響主要功能
                    })
            } else {
                console.log('沒有 UAV 掃描資料，跳過 UAV Sparse 地圖載入')
            }
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

    // CFAR峰值現在直接從ISS地圖API的JSON回應中獲取，不需要額外的useEffect

    useEffect(() => {
        loadMaps()
        return () => {
            if (imageUrlRef.current) {
                URL.revokeObjectURL(imageUrlRef.current)
            }
            if (tssImageUrlRef.current) {
                URL.revokeObjectURL(tssImageUrlRef.current)
            }
            if (uavSparseImageUrlRef.current) {
                URL.revokeObjectURL(uavSparseImageUrlRef.current)
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
                        <button
                            onClick={() => setCurrentMapType('uav-sparse')}
                            style={{
                                padding: '8px 15px',
                                background: currentMapType === 'uav-sparse' ? '#228b22' : 'rgba(255, 255, 255, 0.2)',
                                color: 'white',
                                border: currentMapType === 'uav-sparse' ? '2px solid #32cd32' : '2px solid transparent',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: currentMapType === 'uav-sparse' ? 'bold' : 'normal',
                                opacity: uavSparseImageUrl ? 1 : 0.5
                            }}
                            disabled={!uavSparseImageUrl}
                        >
                            UAV Sparse 地圖
                        </button>
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
                <div>
                    <img
                        src={imageUrl}
                        alt="ISS Map - Interference Signal Strength with 2D-CFAR Detection"
                        className="iss-view-image"
                    />
                    
                    {/* CFAR峰值GPS位置顯示 */}
                    <div style={{
                        marginTop: '15px',
                        padding: '15px',
                        backgroundColor: cfarPeaksGPS.length > 0 ? 'rgba(0, 123, 255, 0.1)' : 'rgba(128, 128, 128, 0.1)',
                        borderLeft: cfarPeaksGPS.length > 0 ? '4px solid #007bff' : '4px solid #aaa',
                        borderRadius: '4px',
                        fontSize: '14px',
                        color: '#ffffff'
                    }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
                            <span>🎯 CFAR 峰值 GPS 位置</span>
                            {cfarPeaksGPS.length > 1 && (
                                <span style={{ marginLeft: '10px', fontSize: '12px', color: '#aaa' }}>
                                    (顯示 1/{cfarPeaksGPS.length})
                                </span>
                            )}
                        </div>
                        
                        {cfarPeaksGPS.length > 0 ? (
                            /* 顯示第一個峰值 */
                            <div style={{
                                padding: '12px',
                                backgroundColor: 'rgba(255,255,255,0.05)',
                                borderRadius: '4px',
                                fontSize: '13px'
                            }}>
                                <div style={{ fontWeight: 'bold', color: '#4fc3f7', marginBottom: '8px' }}>
                                    峰值 #{cfarPeaksGPS[0].peak_id}
                                </div>
                                <div style={{ marginBottom: '8px' }}>
                                    <span style={{ color: '#81c784', fontWeight: 'bold' }}>干擾源座標:</span> {cfarPeaksGPS[0].gps_coords.latitude.toFixed(6)}°N, {cfarPeaksGPS[0].gps_coords.longitude.toFixed(6)}°E
                                </div>
                                <div>
                                    <a 
                                        href={`https://www.google.com/maps?q=${cfarPeaksGPS[0].gps_coords.latitude},${cfarPeaksGPS[0].gps_coords.longitude}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ 
                                            color: '#64b5f6', 
                                            textDecoration: 'none',
                                            fontSize: '12px',
                                            fontWeight: 'bold'
                                        }}
                                        onMouseOver={(e) => e.target.style.textDecoration = 'underline'}
                                        onMouseOut={(e) => e.target.style.textDecoration = 'none'}
                                    >
                                        📍 在 Google Maps 中查看位置
                                    </a>
                                </div>
                            </div>
                        ) : (
                            /* 沒有偵測到峰值時顯示 */
                            <div style={{
                                padding: '12px',
                                backgroundColor: 'rgba(255,255,255,0.05)',
                                borderRadius: '4px',
                                fontSize: '13px',
                                textAlign: 'center',
                                color: '#aaa'
                            }}>
                                <div style={{ fontSize: '16px', marginBottom: '8px' }}>❌</div>
                                <div style={{ fontWeight: 'bold' }}>找不到jammer</div>
                                <div style={{ fontSize: '12px', marginTop: '4px', color: '#999' }}>
                                    沒有偵測到CFAR峰值，可能干擾源較弱或不在檢測範圍內
                                </div>
                            </div>
                        )}
                        
                        <div style={{ fontSize: '11px', color: '#aaa', marginTop: '8px' }}>
                            💡 {cfarPeaksGPS.length > 0 ? '顯示最強信號峰值位置。點擊連結在 Google Maps 中查看確切地理位置。' : 'CFAR檢測可識別干擾信號的峰值位置。'}
                        </div>
                    </div>
                </div>
            )}
            {currentMapType === 'tss' && tssImageUrl && (
                <img
                    src={tssImageUrl}
                    alt="TSS Map - Total Signal Strength"
                    className="iss-view-image"
                />
            )}
            {currentMapType === 'uav-sparse' && uavSparseImageUrl && (
                <img
                    src={uavSparseImageUrl}
                    alt="UAV Sparse Map - UAV Trajectory TSS Sampling"
                    className="iss-view-image"
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