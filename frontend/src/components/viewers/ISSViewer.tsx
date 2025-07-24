import { useState, useEffect, useCallback, useRef } from 'react'
import { ViewerProps } from '../../types/viewer'
import { ApiRoutes } from '../../config/apiRoutes'
import { useDevices } from '../../hooks/useDevices'

// 干擾信號檢測地圖顯示組件
const ISSViewer: React.FC<ViewerProps> = ({
    onReportLastUpdateToNavbar,
    reportRefreshHandlerToNavbar,
    reportIsLoadingToNavbar,
    currentScene,
}) => {
    const [isLoading, setIsLoading] = useState(true)
    const [imageUrl, setImageUrl] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [retryCount, setRetryCount] = useState(0)
    const maxRetries = 3
    
    // 新增：地圖參數設定
    const [cellSize, setCellSize] = useState<number>(1.0) // 實際使用的參數
    const [mapWidth, setMapWidth] = useState<number>(512)
    const [mapHeight, setMapHeight] = useState<number>(512)
    
    // 暫時參數（用戶正在編輯的值，不會立即觸發API）
    const [tempCellSize, setTempCellSize] = useState<number>(1.0)
    const [tempMapWidth, setTempMapWidth] = useState<number>(512)
    const [tempMapHeight, setTempMapHeight] = useState<number>(512)
    
    const [showSettings, setShowSettings] = useState<boolean>(false)

    const imageUrlRef = useRef<string | null>(null)
    const API_PATH = ApiRoutes.simulations.getISSMap
    
    // 使用 useDevices hook 來獲取當前設備位置
    const { tempDevices, hasTempDevices } = useDevices()

    const updateTimestamp = useCallback(() => {
        const now = new Date()
        const timeString = now.toLocaleTimeString()
        onReportLastUpdateToNavbar?.(timeString)
    }, [onReportLastUpdateToNavbar])

    // 套用地圖設定
    const applySettings = useCallback(() => {
        setCellSize(tempCellSize)
        setMapWidth(tempMapWidth)
        setMapHeight(tempMapHeight)
    }, [tempCellSize, tempMapWidth, tempMapHeight])

    // 重設為預設值
    const resetToDefaults = useCallback(() => {
        setTempCellSize(1.0)
        setTempMapWidth(512)
        setTempMapHeight(512)
        setCellSize(1.0)
        setMapWidth(512)
        setMapHeight(512)
    }, [])

    useEffect(() => {
        imageUrlRef.current = imageUrl
    }, [imageUrl])

    const loadISSMapImage = useCallback(() => {
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
        console.log(`ISS Map: 使用解析度 ${cellSize} 米/像素, 地圖大小 ${mapWidth}x${mapHeight}`)

        // 添加 TX 位置參數（如果存在）
        if (txDevice) {
            params.append('tx_x', txDevice.position_x.toString())
            params.append('tx_y', txDevice.position_y.toString())
            params.append('tx_z', txDevice.position_z.toString())
            console.log(`ISS Map: 使用 TX 位置 (${txDevice.position_x}, ${txDevice.position_y}, ${txDevice.position_z})`)
        }

        // 添加所有 Jammer 位置參數
        jammerDevices.forEach((jammer, index) => {
            const positionStr = `${jammer.position_x},${jammer.position_y},${jammer.position_z}`
            params.append('jammer', positionStr)
            console.log(`ISS Map: 使用 Jammer ${index + 1} 位置 (${jammer.position_x}, ${jammer.position_y}, ${jammer.position_z})`)
        })

        const apiUrl = `${API_PATH}?${params.toString()}`
        console.log('ISS Map API URL:', apiUrl)

        fetch(apiUrl)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(
                        `API 請求失敗: ${response.status} ${response.statusText}`
                    )
                }
                return response.blob()
            })
            .then((blob) => {
                // 檢查是否收到了有效的圖片數據
                if (blob.size === 0) {
                    throw new Error('接收到空的圖像數據')
                }

                if (imageUrlRef.current) {
                    URL.revokeObjectURL(imageUrlRef.current)
                }
                const url = URL.createObjectURL(blob)
                setImageUrl(url)
                setIsLoading(false)
                setRetryCount(0) // 重置重試次數
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

                // 實現自動重試機制
                const newRetryCount = retryCount + 1
                setRetryCount(newRetryCount)

                if (newRetryCount < maxRetries) {
                    setTimeout(() => {
                        loadISSMapImage()
                    }, 2000) // 2秒後重試
                }
            })
    }, [updateTimestamp, retryCount, currentScene, tempDevices, cellSize, mapWidth, mapHeight])

    useEffect(() => {
        reportRefreshHandlerToNavbar(loadISSMapImage)
    }, [loadISSMapImage, reportRefreshHandlerToNavbar])

    useEffect(() => {
        reportIsLoadingToNavbar(isLoading)
    }, [isLoading, reportIsLoadingToNavbar])

    useEffect(() => {
        loadISSMapImage()
        return () => {
            if (imageUrlRef.current) {
                URL.revokeObjectURL(imageUrlRef.current)
            }
        }
    }, [loadISSMapImage])

    const handleRetryClick = () => {
        setRetryCount(0)
        loadISSMapImage()
    }

    return (
        <div className="image-viewer iss-image-container">
            {/* 地圖設定控制區域 */}
            <div style={{ marginBottom: '10px' }}>
                <button
                    onClick={() => setShowSettings(!showSettings)}
                    style={{
                        padding: '8px 12px',
                        backgroundColor: '#4285f4',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        marginBottom: '10px'
                    }}
                >
                    {showSettings ? '隱藏' : '顯示'} 地圖設定
                </button>
                
                {showSettings && (
                    <div style={{
                        padding: '15px',
                        backgroundColor: 'rgba(0, 0, 0, 0.1)',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.2)'
                    }}>
                        <div style={{ 
                            display: 'grid', 
                            gridTemplateColumns: '1fr 1fr 1fr',
                            gap: '15px',
                            fontSize: '14px'
                        }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', color: '#ffffff' }}>
                                    解析度 (米/像素):
                                </label>
                                <input
                                    type="number"
                                    step="0.1"
                                    min="0.1"
                                    max="20.0"
                                    value={tempCellSize}
                                    onChange={(e) => setTempCellSize(parseFloat(e.target.value) || 1.0)}
                                    style={{
                                        width: '100%',
                                        padding: '6px',
                                        borderRadius: '4px',
                                        border: '1px solid #ccc',
                                        backgroundColor: 'rgba(255, 255, 255, 0.9)'
                                    }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', color: '#ffffff' }}>
                                    寬度 (像素):
                                </label>
                                <input
                                    type="number"
                                    min="64"
                                    max="8192"
                                    value={tempMapWidth}
                                    onChange={(e) => setTempMapWidth(parseInt(e.target.value) || 512)}
                                    style={{
                                        width: '100%',
                                        padding: '6px',
                                        borderRadius: '4px',
                                        border: '1px solid #ccc',
                                        backgroundColor: 'rgba(255, 255, 255, 0.9)'
                                    }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', color: '#ffffff' }}>
                                    高度 (像素):
                                </label>
                                <input
                                    type="number"
                                    min="64"
                                    max="8192"
                                    value={tempMapHeight}
                                    onChange={(e) => setTempMapHeight(parseInt(e.target.value) || 512)}
                                    style={{
                                        width: '100%',
                                        padding: '6px',
                                        borderRadius: '4px',
                                        border: '1px solid #ccc',
                                        backgroundColor: 'rgba(255, 255, 255, 0.9)'
                                    }}
                                />
                            </div>
                        </div>
                        
                        {/* 預覽資訊 */}
                        <div style={{ 
                            marginTop: '10px', 
                            fontSize: '12px', 
                            color: '#ccc',
                            textAlign: 'center'
                        }}>
                            📊 預覽覆蓋範圍: {(tempCellSize * tempMapWidth).toFixed(1)} x {(tempCellSize * tempMapHeight).toFixed(1)} 米
                            {tempMapWidth * tempMapHeight > 1000000 && (
                                <div style={{ color: '#ff6b6b', marginTop: '3px' }}>
                                    ⚠️ 大尺寸地圖需要較長計算時間
                                </div>
                            )}
                        </div>
                        
                        {/* 預設值快捷按鈕 */}
                        <div style={{ 
                            marginTop: '15px',
                            marginBottom: '10px'
                        }}>
                            <div style={{ fontSize: '12px', color: '#ccc', marginBottom: '8px', textAlign: 'center' }}>
                                常用預設:
                            </div>
                            <div style={{
                                display: 'flex',
                                gap: '5px',
                                justifyContent: 'center',
                                flexWrap: 'wrap'
                            }}>
                                {[
                                    { name: '256²', size: 256, cell: 2.0 },
                                    { name: '512²', size: 512, cell: 1.0 },
                                    { name: '1024²', size: 1024, cell: 0.5 },
                                    { name: '2048²', size: 2048, cell: 0.25 }
                                ].map(preset => (
                                    <button
                                        key={preset.name}
                                        onClick={() => {
                                            setTempCellSize(preset.cell)
                                            setTempMapWidth(preset.size)
                                            setTempMapHeight(preset.size)
                                        }}
                                        style={{
                                            padding: '4px 8px',
                                            fontSize: '11px',
                                            backgroundColor: '#17a2b8',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '3px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {preset.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 操作按鈕 */}
                        <div style={{ 
                            marginTop: '10px',
                            display: 'flex',
                            gap: '10px',
                            justifyContent: 'center'
                        }}>
                            <button
                                onClick={applySettings}
                                style={{
                                    padding: '8px 16px',
                                    backgroundColor: '#28a745',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 'bold'
                                }}
                            >
                                套用設定
                            </button>
                            <button
                                onClick={resetToDefaults}
                                style={{
                                    padding: '8px 16px',
                                    backgroundColor: '#6c757d',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '14px'
                                }}
                            >
                                重設預設
                            </button>
                        </div>
                        
                        {/* 當前使用值顯示 */}
                        <div style={{ 
                            marginTop: '10px', 
                            fontSize: '11px', 
                            color: '#999',
                            textAlign: 'center',
                            borderTop: '1px solid rgba(255,255,255,0.1)',
                            paddingTop: '10px'
                        }}>
                            目前使用: {cellSize}米/像素, {mapWidth}×{mapHeight} ({(cellSize * mapWidth).toFixed(1)}×{(cellSize * mapHeight).toFixed(1)}米)
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
            {imageUrl && (
                <img
                    src={imageUrl}
                    alt="Interference Signal Detection Map"
                    className="view-image iss-view-image"
                />
            )}
        </div>
    )
}

export default ISSViewer