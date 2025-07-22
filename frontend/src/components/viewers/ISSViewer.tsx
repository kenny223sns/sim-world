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

    const imageUrlRef = useRef<string | null>(null)
    const API_PATH = ApiRoutes.simulations.getISSMap
    
    // 使用 useDevices hook 來獲取當前設備位置
    const { tempDevices, hasTempDevices } = useDevices()

    const updateTimestamp = useCallback(() => {
        const now = new Date()
        const timeString = now.toLocaleTimeString()
        onReportLastUpdateToNavbar?.(timeString)
    }, [onReportLastUpdateToNavbar])

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
    }, [updateTimestamp, retryCount, currentScene, tempDevices])

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