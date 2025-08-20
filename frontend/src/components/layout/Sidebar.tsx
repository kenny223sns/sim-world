import { useState, useEffect, useRef } from 'react'
import '../../styles/Sidebar.scss'
import { UAVManualDirection } from '../scenes/UAVFlight' // Assuming UAVFlight exports this
import { Device } from '../../types/device'
import SidebarStarfield from '../ui/SidebarStarfield' // Import the new component
import DeviceItem from '../devices/DeviceItem' // Import DeviceItem
import { VisibleSatelliteInfo } from '../../types/satellite' // Import the new satellite type
import { ApiRoutes } from '../../config/apiRoutes' // 引入API路由配置
import { generateDeviceName as utilGenerateDeviceName } from '../../utils/deviceName' // 修正路徑
import { useMapSettingsComputed, MAP_PRESETS } from '../../store/useMapSettings'
import { useSparseUAVScan } from '../../hooks/useSparseUAVScan'
import RadioMapViewer from '../viewers/RadioMapViewer'

interface SidebarProps {
    devices: Device[]
    loading: boolean
    apiStatus: 'disconnected' | 'connected' | 'error'
    onDeviceChange: (id: number, field: keyof Device, value: any) => void
    onDeleteDevice: (id: number) => void
    onDeleteDevicesByRole: (role: string) => void // 新增批量刪除回調
    onAddDevice: (role?: string) => void // 修改為支持指定設備類型
    onApply: () => void
    onCancel: () => void
    hasTempDevices: boolean
    auto: boolean
    onAutoChange: (auto: boolean) => void // Parent will use selected IDs
    onManualControl: (direction: UAVManualDirection) => void // Parent will use selected IDs
    activeComponent: string
    currentScene?: string // Add current scene prop
    uavAnimation: boolean
    onUavAnimationChange: (val: boolean) => void // Parent will use selected IDs
    onSatelliteDataUpdate?: (satellites: VisibleSatelliteInfo[]) => void // 衛星資料更新回調
    onSatelliteCountChange?: (count: number) => void // 衛星顯示數量變更回調
    satelliteDisplayCount?: number // 衛星顯示數量
    satelliteEnabled?: boolean // 衛星開關狀態
    onSatelliteEnabledChange?: (enabled: boolean) => void // 衛星開關回調
    onSelectedReceiversChange?: (ids: number[]) => void // 選中接收器回調
    droneTracking?: any // 無人機追蹤狀態
}

// Helper function to fetch visible satellites
async function fetchVisibleSatellites(
    count: number,
    minElevation: number = 0
): Promise<VisibleSatelliteInfo[]> {
    // 使用ApiRoutes定義的路徑
    const apiUrl = `${ApiRoutes.satelliteOps.getVisibleSatellites}?count=${count}&min_elevation_deg=${minElevation}`
    try {
        const response = await fetch(apiUrl)
        if (!response.ok) {
            console.error(
                `Error fetching satellites: ${response.status} ${response.statusText}`
            )
            const errorBody = await response.text()
            console.error('Error body:', errorBody)
            return []
        }
        const data = await response.json()
        return data.satellites || [] // Assuming the API returns { satellites: [...] }
    } catch (error) {
        console.error(
            'Network error or JSON parsing error fetching satellites:',
            error
        )
        return []
    }
}

const Sidebar: React.FC<SidebarProps> = ({
    devices,
    loading,
    apiStatus,
    onDeviceChange,
    onDeleteDevice,
    onDeleteDevicesByRole,
    onAddDevice,
    onApply,
    onCancel,
    hasTempDevices,
    auto,
    onAutoChange,
    onManualControl,
    activeComponent,
    currentScene = 'nycu', // Default to nycu if not provided
    uavAnimation,
    onUavAnimationChange,
    onSatelliteDataUpdate, // 新增衛星資料更新回調
    onSatelliteCountChange, // 新增衛星顯示數量變更回調
    satelliteDisplayCount: propSatelliteDisplayCount = 10, // 使用props或默認值
    satelliteEnabled, // 衛星開關狀態
    onSatelliteEnabledChange, // 衛星開關回調
    onSelectedReceiversChange, // 選中接收器回調
    droneTracking, // 無人機追蹤狀態
}) => {
    // 為每個設備的方向值創建本地狀態
    const [orientationInputs, setOrientationInputs] = useState<{
        [key: string]: { x: string; y: string; z: string }
    }>({})

    // 新增：持續發送控制指令的 interval id
    const manualIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // 新增：控制各個設備列表的展開狀態
    const [showTempDevices, setShowTempDevices] = useState(true)
    const [showDesiredDevices, setShowDesiredDevices] = useState(false)
    const [showReceiverDevices, setShowReceiverDevices] = useState(false)
    const [showJammerDevices, setShowJammerDevices] = useState(false)
    
    // 地圖設定展開狀態
    const [showMapSettings, setShowMapSettings] = useState(false)
    
    // 使用共享地圖設定
    const mapSettings = useMapSettingsComputed()

    // 新增：Skyfield 衛星資料相關狀態
    const [satelliteDisplayCount, setSatelliteDisplayCount] = useState<number>(
        propSatelliteDisplayCount
    )
    const [skyfieldSatellites, setSkyfieldSatellites] = useState<
        VisibleSatelliteInfo[]
    >([])
    const [showSkyfieldSection, setShowSkyfieldSection] =
        useState<boolean>(false)
    const [loadingSatellites, setLoadingSatellites] = useState<boolean>(false)
    const [minElevation, setMinElevation] = useState<number>(0) // 新增：最低仰角過濾

    // 新增：衛星數據自動刷新定時器
    const satelliteRefreshIntervalRef = useRef<ReturnType<
        typeof setInterval
    > | null>(null)

    // 稀疏掃描相關狀態
    const [selectedReceiverIds, setSelectedReceiverIds] = useState<number[]>([])
    const [showSparseSection, setShowSparseSection] = useState(false)
    const [showRadioMapViewer, setShowRadioMapViewer] = useState(false)

    // 使用稀疏掃描hook
    const sparseScan = useSparseUAVScan({
        scene: currentScene,
        devices: devices,
        autoStart: false
    })

    // 監聽 prop 變化，同步更新本地狀態
    useEffect(() => {
        setSatelliteDisplayCount(propSatelliteDisplayCount)
    }, [propSatelliteDisplayCount])

    // Effect to fetch satellites when count changes or on mount
    useEffect(() => {
        const loadSatellites = async () => {
            if (!satelliteEnabled) {
                // 如果衛星開關關閉，清空數據並返回
                setSkyfieldSatellites([])
                if (onSatelliteDataUpdate) {
                    onSatelliteDataUpdate([])
                }
                setLoadingSatellites(false)
                return
            }

            setLoadingSatellites(true)
            const satellites = await fetchVisibleSatellites(
                satelliteDisplayCount,
                minElevation // 使用最低仰角過濾
            )

            // 默認按仰角從高到低排序
            let sortedSatellites = [...satellites]
            sortedSatellites.sort((a, b) => b.elevation_deg - a.elevation_deg)

            setSkyfieldSatellites(sortedSatellites)

            // 通知父元件衛星資料已更新
            if (onSatelliteDataUpdate) {
                onSatelliteDataUpdate(sortedSatellites)
            }

            setLoadingSatellites(false)
        }

        // 清理現有定時器
        if (satelliteRefreshIntervalRef.current) {
            clearInterval(satelliteRefreshIntervalRef.current)
            satelliteRefreshIntervalRef.current = null
        }

        if (satelliteEnabled) {
            // 立即加載衛星數據
            loadSatellites()

            // 設置每分鐘刷新一次衛星數據
            satelliteRefreshIntervalRef.current = setInterval(() => {
                console.log('自動刷新衛星數據...')
                loadSatellites()
            }, 60000) // 每60秒刷新一次
        } else {
            // 如果衛星開關關閉，清空數據
            loadSatellites()
        }

        // 清理定時器
        return () => {
            if (satelliteRefreshIntervalRef.current) {
                clearInterval(satelliteRefreshIntervalRef.current)
                satelliteRefreshIntervalRef.current = null
            }
        }
    }, [
        satelliteDisplayCount,
        minElevation,
        onSatelliteDataUpdate,
        satelliteEnabled,
    ])

    // 處理衛星顯示數量變更
    const handleSatelliteCountChange = (count: number) => {
        setSatelliteDisplayCount(count)
        if (onSatelliteCountChange) {
            onSatelliteCountChange(count)
        }
    }

    // 當 devices 更新時，初始化或更新本地輸入狀態
    useEffect(() => {
        const newInputs: {
            [key: string]: { x: string; y: string; z: string }
        } = {}
        devices.forEach((device) => {
            // 檢查 orientationInputs[device.id] 是否存在，如果不存在或其值與 device object 中的值不同，則進行初始化
            const existingInput = orientationInputs[device.id]
            const backendX = device.orientation_x?.toString() || '0'
            const backendY = device.orientation_y?.toString() || '0'
            const backendZ = device.orientation_z?.toString() || '0'

            if (existingInput) {
                // 如果存在本地狀態，比較後決定是否使用後端值來覆蓋（例如，如果外部更改了設備數據）
                // 這裡的邏輯是，如果本地輸入與後端解析後的數值不直接對應（例如本地是 "1/2", 後端是 1.57...），
                // 且後端的值不是初始的 '0'，則可能意味著後端的值已被更新，我們可能需要一種策略來決定是否刷新本地輸入框。
                // 目前的策略是：如果 device object 中的 orientation 值不再是 0 (或 undefined)，
                // 且 orientationInputs 中對應的值是 '0'，則用 device object 的值更新 input。
                // 這有助於在外部修改了方向後，輸入框能反映這些更改，除非用戶已經開始編輯。
                // 更複雜的同步邏輯可能需要考慮編輯狀態。
                // 為了簡化，如果本地已有值，我們傾向於保留本地輸入，除非是從 '0' 開始。
                newInputs[device.id] = {
                    x:
                        existingInput.x !== '0' && existingInput.x !== backendX
                            ? existingInput.x
                            : backendX,
                    y:
                        existingInput.y !== '0' && existingInput.y !== backendY
                            ? existingInput.y
                            : backendY,
                    z:
                        existingInput.z !== '0' && existingInput.z !== backendZ
                            ? existingInput.z
                            : backendZ,
                }
            } else {
                newInputs[device.id] = {
                    x: backendX,
                    y: backendY,
                    z: backendZ,
                }
            }
        })
        setOrientationInputs(newInputs)
    }, [devices]) // 依賴 devices prop

    // 處理方向輸入的變化 (重命名並調整)
    const handleDeviceOrientationInputChange = (
        deviceId: number,
        axis: 'x' | 'y' | 'z',
        value: string
    ) => {
        // 更新本地狀態以反映輸入框中的原始文本
        setOrientationInputs((prev) => ({
            ...prev,
            [deviceId]: {
                ...prev[deviceId],
                [axis]: value,
            },
        }))

        // 解析輸入值並更新實際的設備數據
        if (value.includes('/')) {
            const parts = value.split('/')
            if (parts.length === 2) {
                const numerator = parseFloat(parts[0])
                const denominator = parseFloat(parts[1])
                if (
                    !isNaN(numerator) &&
                    !isNaN(denominator) &&
                    denominator !== 0
                ) {
                    const calculatedValue = (numerator / denominator) * Math.PI
                    const orientationKey = `orientation_${axis}` as keyof Device
                    onDeviceChange(deviceId, orientationKey, calculatedValue)
                }
            }
        } else {
            const numValue = parseFloat(value)
            if (!isNaN(numValue)) {
                const orientationKey = `orientation_${axis}` as keyof Device
                onDeviceChange(deviceId, orientationKey, numValue)
            }
        }
    }

    // 處理按鈕按下
    const handleManualDown = (
        direction:
            | 'up'
            | 'down'
            | 'left'
            | 'right'
            | 'ascend'
            | 'descend'
            | 'left-up'
            | 'right-up'
            | 'left-down'
            | 'right-down'
            | 'rotate-left'
            | 'rotate-right'
    ) => {
        onManualControl(direction)
        if (manualIntervalRef.current) clearInterval(manualIntervalRef.current)
        manualIntervalRef.current = setInterval(() => {
            onManualControl(direction)
        }, 60)
    }
    // 處理按鈕放開
    const handleManualUp = () => {
        if (manualIntervalRef.current) {
            clearInterval(manualIntervalRef.current)
            manualIntervalRef.current = null
        }
        onManualControl(null)
    }

    // 分組設備
    const tempDevices = devices.filter(
        (device) => device.id == null || device.id < 0
    )
    const desiredDevices = devices.filter(
        (device) =>
            device.id != null && device.id >= 0 && device.role === 'desired'
    )
    const receiverDevices = devices.filter(
        (device) =>
            device.id != null && device.id >= 0 && device.role === 'receiver'
    )
    const jammerDevices = devices.filter(
        (device) =>
            device.id != null && device.id >= 0 && device.role === 'jammer'
    )

    // 處理設備角色變更的函數
    const handleDeviceRoleChange = (deviceId: number, newRole: string) => {
        // 計算新名稱
        const newName = utilGenerateDeviceName(
            newRole,
            devices.map((d) => ({ name: d.name }))
        )

        // 更新角色
        onDeviceChange(deviceId, 'role', newRole)
        // 更新名稱
        onDeviceChange(deviceId, 'name', newName)
    }

    // 處理接收器選擇
    const handleReceiverSelect = (deviceId: number, selected: boolean) => {
        if (selected) {
            setSelectedReceiverIds(prev => [...prev, deviceId])
        } else {
            setSelectedReceiverIds(prev => prev.filter(id => id !== deviceId))
        }
    }

    // 當選中的接收器變化時，通知父組件
    useEffect(() => {
        if (onSelectedReceiversChange) {
            onSelectedReceiversChange(selectedReceiverIds)
        }
    }, [selectedReceiverIds, onSelectedReceiversChange])

    return (
        <div className="sidebar-container">
            <SidebarStarfield />
            {activeComponent !== '2DRT' && (
                <>
                    <div className="sidebar-auto-row">
                        <div
                            onClick={() => onAutoChange(!auto)}
                            className={`toggle-badge ${auto ? 'active' : ''}`}
                        >
                            自動飛行
                        </div>
                        <div
                            onClick={() => onUavAnimationChange(!uavAnimation)}
                            className={`toggle-badge ${
                                uavAnimation ? 'active' : ''
                            }`}
                        >
                            動畫
                        </div>
                        {/* <div
                            onClick={() =>
                                onSatelliteEnabledChange &&
                                onSatelliteEnabledChange(!satelliteEnabled)
                            }
                            className={`toggle-badge ${
                                satelliteEnabled ? 'active' : ''
                            }`}
                        >
                            衛星
                        </div> */}
                    </div>
                    {!auto && (
                        <div className="manual-control-row">
                            {/* 第一排：↖ ↑ ↗ */}
                            <div className="manual-button-group with-margin-bottom">
                                <button
                                    onMouseDown={() =>
                                        handleManualDown('left-up')
                                    }
                                    onMouseUp={handleManualUp}
                                    onMouseLeave={handleManualUp}
                                >
                                    ↖
                                </button>
                                <button
                                    onMouseDown={() =>
                                        handleManualDown('descend')
                                    }
                                    onMouseUp={handleManualUp}
                                    onMouseLeave={handleManualUp}
                                >
                                    ↑
                                </button>
                                <button
                                    onMouseDown={() =>
                                        handleManualDown('right-up')
                                    }
                                    onMouseUp={handleManualUp}
                                    onMouseLeave={handleManualUp}
                                >
                                    ↗
                                </button>
                            </div>
                            {/* 第二排：← ⟲ ⟳ → */}
                            <div className="manual-button-group with-margin-bottom">
                                <button
                                    onMouseDown={() => handleManualDown('left')}
                                    onMouseUp={handleManualUp}
                                    onMouseLeave={handleManualUp}
                                >
                                    ←
                                </button>
                                <button
                                    onMouseDown={() =>
                                        handleManualDown('rotate-left')
                                    }
                                    onMouseUp={handleManualUp}
                                    onMouseLeave={handleManualUp}
                                >
                                    ⟲
                                </button>
                                <button
                                    onMouseDown={() =>
                                        handleManualDown('rotate-right')
                                    }
                                    onMouseUp={handleManualUp}
                                    onMouseLeave={handleManualUp}
                                >
                                    ⟳
                                </button>
                                <button
                                    onMouseDown={() =>
                                        handleManualDown('right')
                                    }
                                    onMouseUp={handleManualUp}
                                    onMouseLeave={handleManualUp}
                                >
                                    →
                                </button>
                            </div>
                            {/* 第三排：↙ ↓ ↘ */}
                            <div className="manual-button-group with-margin-bottom">
                                <button
                                    onMouseDown={() =>
                                        handleManualDown('left-down')
                                    }
                                    onMouseUp={handleManualUp}
                                    onMouseLeave={handleManualUp}
                                >
                                    ↙
                                </button>
                                <button
                                    onMouseDown={() =>
                                        handleManualDown('ascend')
                                    }
                                    onMouseUp={handleManualUp}
                                    onMouseLeave={handleManualUp}
                                >
                                    ↓
                                </button>
                                <button
                                    onMouseDown={() =>
                                        handleManualDown('right-down')
                                    }
                                    onMouseUp={handleManualUp}
                                    onMouseLeave={handleManualUp}
                                >
                                    ↘
                                </button>
                            </div>
                            {/* 升降排 */}
                            <div className="manual-button-group">
                                <button
                                    onMouseDown={() => handleManualDown('up')}
                                    onMouseUp={handleManualUp}
                                    onMouseLeave={handleManualUp}
                                >
                                    升
                                </button>
                                <button
                                    onMouseDown={() => handleManualDown('down')}
                                    onMouseUp={handleManualUp}
                                    onMouseLeave={handleManualUp}
                                >
                                    降
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* 衛星設置區域 - 獨立於API狀態 */}
            {satelliteEnabled && (
                <div className="satellite-settings-section">
                    <div className="satellite-controls-row">
                        <div className="satellite-count-control">
                            <label htmlFor="satellite-count-input">
                                衛星數:
                            </label>
                            <input
                                id="satellite-count-input"
                                type="number"
                                value={satelliteDisplayCount}
                                onChange={(e) => {
                                    const value = parseInt(e.target.value, 10)
                                    if (
                                        !isNaN(value) &&
                                        value > 0 &&
                                        value <= 100
                                    ) {
                                        handleSatelliteCountChange(value)
                                    } else if (e.target.value === '') {
                                        handleSatelliteCountChange(1)
                                    }
                                }}
                                min="1"
                                max="100"
                                className="satellite-count-input-field"
                            />
                        </div>

                        <div className="satellite-count-control">
                            <label htmlFor="min-elevation-input">
                                最低仰角:
                            </label>
                            <input
                                id="min-elevation-input"
                                type="number"
                                value={minElevation}
                                onChange={(e) => {
                                    const value = parseInt(e.target.value, 10)
                                    if (
                                        !isNaN(value) &&
                                        value >= 0 &&
                                        value <= 90
                                    ) {
                                        setMinElevation(value)
                                    } else if (e.target.value === '') {
                                        setMinElevation(0)
                                    }
                                }}
                                min="0"
                                max="90"
                                className="satellite-count-input-field"
                            />
                        </div>
                    </div>
                </div>
            )}

            <div className="sidebar-actions-combined">
                <button onClick={onAddDevice} className="add-device-btn">
                    添加設備
                </button>
                <div>
                    <button
                        onClick={onApply}
                        disabled={
                            loading ||
                            apiStatus !== 'connected' ||
                            !hasTempDevices ||
                            auto
                        }
                        className="add-device-btn button-apply-action"
                        style={{
                            backgroundColor: hasTempDevices ? '#ff6b35' : undefined,
                            animation: hasTempDevices ? 'pulse 1.5s infinite' : undefined
                        }}
                    >
                        {hasTempDevices ? '💾 套用變更' : '套用'}
                    </button>
                    <button
                        onClick={onCancel}
                        disabled={loading}
                        className="add-device-btn"
                    >
                        取消
                    </button>
                </div>
            </div>

            {/* 地圖設定區塊 */}
            <div className="map-settings-section">
                <h3
                    className={`section-title collapsible-header ${
                        showMapSettings ? 'expanded' : ''
                    }`}
                    onClick={() => setShowMapSettings(!showMapSettings)}
                >
                    🗺️ 地圖設定
                </h3>
                {showMapSettings && (
                    <div className="map-settings-content">
                        <div className="map-settings-info">
                            <div className="current-settings">
                                <div className="setting-item">
                                    <span className="label">解析度:</span>
                                    <span className="value">{mapSettings.cellSize} 米/像素</span>
                                </div>
                                <div className="setting-item">
                                    <span className="label">尺寸:</span>
                                    <span className="value">{mapSettings.sizeText}</span>  
                                </div>
                                <div className="setting-item">
                                    <span className="label">覆蓋:</span>
                                    <span className="value">{mapSettings.coverageText}</span>
                                </div>
                            </div>
                        </div>
                        
                        <div className="map-settings-controls">
                            {/* 基本地圖參數 */}
                            <div className="control-section">
                                <div className="section-header">基本設定</div>
                                <div className="control-group">
                                    <label className="control-label">解析度 (米/像素):</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        min="0.1"
                                        max="20.0"
                                        value={mapSettings.cellSize}
                                        onChange={(e) => mapSettings.setCellSize(parseFloat(e.target.value) || 1.0)}
                                        className="control-input"
                                    />
                                </div>
                                
                                <div className="control-row">
                                    <div className="control-group">
                                        <label className="control-label">寬度 (像素):</label>
                                        <input
                                            type="number"
                                            min="64"
                                            max="8192"
                                            value={mapSettings.width}
                                            onChange={(e) => mapSettings.setWidth(parseInt(e.target.value) || 512)}
                                            className="control-input"
                                        />
                                    </div>
                                    
                                    <div className="control-group">
                                        <label className="control-label">高度 (像素):</label>
                                        <input
                                            type="number"
                                            min="64"
                                            max="8192"
                                            value={mapSettings.height}
                                            onChange={(e) => mapSettings.setHeight(parseInt(e.target.value) || 512)}
                                            className="control-input"
                                        />
                                    </div>
                                </div>
                                
                                <div className="control-group">
                                    <label className="control-label">地圖中心:</label>
                                    <div className="radio-group">
                                        <label className="radio-label">
                                            <input
                                                type="radio"
                                                value="receiver"
                                                checked={mapSettings.center_on === 'receiver'}
                                                onChange={(e) => mapSettings.setCenterOn(e.target.value as 'receiver')}
                                            />
                                            接收機
                                        </label>
                                        <label className="radio-label">
                                            <input
                                                type="radio"
                                                value="transmitter"
                                                checked={mapSettings.center_on === 'transmitter'}
                                                onChange={(e) => mapSettings.setCenterOn(e.target.value as 'transmitter')}
                                            />
                                            發射機
                                        </label>
                                    </div>
                                </div>
                            </div>
                            
                            {/* 干擾檢測參數 */}
                            <div className="control-section">
                                <div className="section-header">干擾檢測設定 (ISS Map)</div>
                                <div className="control-group">
                                    <label className="control-label">CFAR 檢測門檻 (百分位數):</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        min="90.0"
                                        max="99.9"
                                        value={mapSettings.cfar_threshold_percentile}
                                        onChange={(e) => mapSettings.setCfarThresholdPercentile(parseFloat(e.target.value) || 99.5)}
                                        className="control-input"
                                    />
                                </div>
                                
                                <div className="control-row">
                                    <div className="control-group">
                                        <label className="control-label">高斯平滑 σ:</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="0.1"
                                            max="5.0"
                                            value={mapSettings.gaussian_sigma}
                                            onChange={(e) => mapSettings.setGaussianSigma(parseFloat(e.target.value) || 1.0)}
                                            className="control-input"
                                        />
                                    </div>
                                    
                                    <div className="control-group">
                                        <label className="control-label">峰值最小距離:</label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="20"
                                            value={mapSettings.min_distance}
                                            onChange={(e) => mapSettings.setMinDistance(parseInt(e.target.value) || 3)}
                                            className="control-input"
                                        />
                                    </div>
                                </div>
                                
                                <div className="control-group">
                                    <label className="control-label">採樣數量 (每發射器):</label>
                                    <select
                                        value={mapSettings.samples_per_tx}
                                        onChange={(e) => mapSettings.setSamplesPerTx(parseInt(e.target.value))}
                                        className="control-select"
                                    >
                                        <option value={1000000}>10⁶ (快速)</option>
                                        <option value={5000000}>5×10⁶ (標準)</option>
                                        <option value={10000000}>10⁷ (高精度)</option>
                                        <option value={50000000}>5×10⁷ (極高精度)</option>
                                    </select>
                                </div>
                            </div>
                            
                            {/* SINR 地圖參數 */}
                            <div className="control-section">
                                <div className="section-header">SINR 地圖設定</div>
                                <div className="control-row">
                                    <div className="control-group">
                                        <label className="control-label">SINR 最小值 (dB):</label>
                                        <input
                                            type="number"
                                            step="1"
                                            min="-80"
                                            max="20"
                                            value={mapSettings.sinr_vmin}
                                            onChange={(e) => mapSettings.setSinrVmin(parseFloat(e.target.value) || -40.0)}
                                            className="control-input"
                                        />
                                    </div>
                                    
                                    <div className="control-group">
                                        <label className="control-label">SINR 最大值 (dB):</label>
                                        <input
                                            type="number"
                                            step="1"
                                            min="-50"
                                            max="50"
                                            value={mapSettings.sinr_vmax}
                                            onChange={(e) => mapSettings.setSinrVmax(parseFloat(e.target.value) || 0.0)}
                                            className="control-input"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div className="map-presets">
                            <div className="presets-label">快速預設:</div>
                            <div className="presets-buttons">
                                {MAP_PRESETS.map(preset => (
                                    <button
                                        key={preset.name}
                                        onClick={() => mapSettings.setPreset(preset)}
                                        className="preset-button"
                                    >
                                        {preset.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                        
                        {mapSettings.isLargeMap && (
                            <div className="warning-message">
                                ⚠️ 大尺寸地圖需要較長計算時間
                            </div>
                        )}
                        
                        <div className="map-actions">
                            <button
                                onClick={mapSettings.applySettings}
                                className="apply-button"
                            >
                                套用設定
                            </button>
                            <button
                                onClick={mapSettings.resetToDefaults}
                                className="reset-button"
                            >
                                重設預設
                            </button>
                        </div>
                        
                        <div className="map-note">
                            💡 設定同時影響 UAV 稀疏掃描與干擾檢測地圖的對齊
                        </div>
                    </div>
                )}
            </div>

            {/* 稀疏 UAV 掃描控制區域 - 已隱藏 */}
            {false && (
                <div className="control-container">
                    <h3 
                        className={`section-title collapsible-header ${showSparseSection ? 'expanded' : ''}`}
                        onClick={() => setShowSparseSection(!showSparseSection)}
                    >
                        稀疏 UAV 掃描 {sparseScan.isLoading && <span className="loading-indicator">⏳</span>}
                    </h3>
                    {showSparseSection && (
                        <div className="control-section">
                            <div className="control-row">
                                <button 
                                    onClick={sparseScan.play}
                                    disabled={sparseScan.isPlaying || sparseScan.isLoading || selectedReceiverIds.length === 0}
                                    className="scan-button play-button"
                                >
                                    開始掃描
                                </button>
                                <button 
                                    onClick={sparseScan.pause}
                                    disabled={!sparseScan.isPlaying}
                                    className="scan-button pause-button"
                                >
                                    暫停掃描
                                </button>
                                <button 
                                    onClick={sparseScan.reset}
                                    disabled={sparseScan.isPlaying}
                                    className="scan-button reset-button"
                                >
                                    重設掃描
                                </button>
                            </div>
                            
                            <div className="scan-info">
                                <div className="progress-info">
                                    進度: {sparseScan.progress}% ({sparseScan.currentIdx}/{sparseScan.data?.points.length || 0})
                                </div>
                                {sparseScan.error && (
                                    <div className="error-message">錯誤: {sparseScan.error}</div>
                                )}
                            </div>
                            
                            <div className="control-row">
                                <button 
                                    onClick={sparseScan.exportCSV}
                                    disabled={!sparseScan.data || sparseScan.currentIdx === 0}
                                    className="export-button"
                                >
                                    導出 CSV
                                </button>
                                <button 
                                    onClick={() => setShowRadioMapViewer(!showRadioMapViewer)}
                                    className={`map-viewer-button ${showRadioMapViewer ? 'active' : ''}`}
                                >
                                    {showRadioMapViewer ? '隱藏' : '顯示'}電波地圖
                                </button>
                            </div>
                            
                            {selectedReceiverIds.length === 0 && (
                                <div className="warning-message">
                                    ⚠️ 請先選擇至少一個接收器 (receiver) 設備
                                </div>
                            )}
                            
                            {showRadioMapViewer && (
                                <div className="radio-map-container">
                                    <RadioMapViewer
                                        scanData={sparseScan.data}
                                        samples={sparseScan.samples}
                                        currentIdx={sparseScan.currentIdx}
                                        scene={currentScene}
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            <div className="devices-list">
                {/* 新增設備區塊 */}
                {tempDevices.length > 0 && (
                    <>
                        <h3
                            className={`section-title collapsible-header ${
                                showTempDevices ? 'expanded' : ''
                            }`}
                            onClick={() => setShowTempDevices(!showTempDevices)}
                        >
                            新增設備
                        </h3>
                        {showTempDevices &&
                            tempDevices.map((device) => (
                                <DeviceItem
                                    key={device.id}
                                    device={device}
                                    orientationInput={
                                        orientationInputs[device.id] || {
                                            x: '0',
                                            y: '0',
                                            z: '0',
                                        }
                                    }
                                    onDeviceChange={onDeviceChange}
                                    onDeleteDevice={onDeleteDevice}
                                    onOrientationInputChange={
                                        handleDeviceOrientationInputChange
                                    }
                                    onDeviceRoleChange={handleDeviceRoleChange}
                                />
                            ))}
                    </>
                )}

                {/* Skyfield 衛星資料區塊 */}
                {satelliteEnabled && (
                    <>
                        <h3
                            className={`section-title collapsible-header ${
                                showSkyfieldSection ? 'expanded' : ''
                            } ${
                                tempDevices.length > 0 ? 'extra-margin-top' : ''
                            } ${
                                tempDevices.length > 0 ? 'with-border-top' : ''
                            }`}
                            onClick={() =>
                                setShowSkyfieldSection(!showSkyfieldSection)
                            }
                        >
                            衛星 gNB (
                            {loadingSatellites
                                ? '讀取中...'
                                : skyfieldSatellites.length}
                            ){' '}
                            {minElevation > 0
                                ? `[最低仰角: ${minElevation}°]`
                                : ''}
                        </h3>
                        {showSkyfieldSection && (
                            <div className="satellite-list">
                                {loadingSatellites ? (
                                    <p className="loading-text">
                                        正在載入衛星資料...
                                    </p>
                                ) : skyfieldSatellites.length > 0 ? (
                                    skyfieldSatellites.map((sat) => (
                                        <div
                                            key={sat.norad_id}
                                            className="satellite-item"
                                        >
                                            <div className="satellite-name">
                                                {sat.name} (NORAD:{' '}
                                                {sat.norad_id})
                                            </div>
                                            <div className="satellite-details">
                                                仰角:{' '}
                                                <span
                                                    style={{
                                                        color:
                                                            sat.elevation_deg >
                                                            45
                                                                ? '#ff3300'
                                                                : '#0088ff',
                                                    }}
                                                >
                                                    {sat.elevation_deg.toFixed(
                                                        2
                                                    )}
                                                    °
                                                </span>{' '}
                                                | 方位角:{' '}
                                                {sat.azimuth_deg.toFixed(2)}° |
                                                距離:{' '}
                                                {sat.distance_km.toFixed(2)} km
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <p className="no-data-text">
                                        無衛星資料可顯示。請調整最低仰角後重試。
                                    </p>
                                )}
                            </div>
                        )}
                    </>
                )}

                {/* 發射器 (Tx) */}
                <>
                    <div className="section-title-row">
                        <h3
                            className={`section-title extra-margin-top collapsible-header ${
                                showDesiredDevices ? 'expanded' : ''
                            }`}
                            onClick={() =>
                                setShowDesiredDevices(!showDesiredDevices)
                            }
                        >
                            發射器 Tx ({desiredDevices.length})
                        </h3>
                        <div className="section-buttons">
                            <button
                                className="add-specific-btn"
                                onClick={() => onAddDevice('desired')}
                                disabled={loading}
                                title="添加發射器"
                            >
                                ＋
                            </button>
                            {desiredDevices.length > 1 && apiStatus === 'connected' && (
                                <button
                                    className="remove-all-btn"
                                    onClick={() => onDeleteDevicesByRole('desired')}
                                    disabled={loading}
                                    title="保留一個，移除其他發射器"
                                >
                                    全部移除
                                </button>
                            )}
                        </div>
                    </div>
                    {showDesiredDevices &&
                        desiredDevices.map((device) => (
                            <DeviceItem
                                key={device.id}
                                device={device}
                                orientationInput={
                                    orientationInputs[device.id] || {
                                        x: '0',
                                        y: '0',
                                        z: '0',
                                    }
                                }
                                onDeviceChange={onDeviceChange}
                                onDeleteDevice={onDeleteDevice}
                                onOrientationInputChange={
                                    handleDeviceOrientationInputChange
                                }
                                onDeviceRoleChange={handleDeviceRoleChange}
                            />
                        ))}
                    {showDesiredDevices && desiredDevices.length === 0 && (
                        <div className="empty-section-hint">
                            沒有發射器設備，點擊上方 "＋" 按鈕添加
                        </div>
                    )}
                </>

                {/* 接收機 (Rx) */}
                <>
                    <div className="section-title-row">
                        <h3
                            className={`section-title extra-margin-top collapsible-header ${
                                showReceiverDevices ? 'expanded' : ''
                            }`}
                            onClick={() =>
                                setShowReceiverDevices(!showReceiverDevices)
                            }
                        >
                            接收機 Rx ({receiverDevices.length})
                        </h3>
                        <div className="section-buttons">
                            <button
                                className="add-specific-btn"
                                onClick={() => onAddDevice('receiver')}
                                disabled={loading}
                                title="添加接收機"
                            >
                                ＋
                            </button>
                            {receiverDevices.length > 1 && apiStatus === 'connected' && (
                                <button
                                    className="remove-all-btn"
                                    onClick={() => onDeleteDevicesByRole('receiver')}
                                    disabled={loading}
                                    title="保留一個，移除其他接收機"
                                >
                                    全部移除
                                </button>
                            )}
                        </div>
                    </div>
                    {showReceiverDevices &&
                        receiverDevices.map((device) => (
                            <div key={device.id} className="receiver-device-wrapper">
                                <div className="receiver-selection">
                                    <label className="receiver-checkbox">
                                        <input
                                            type="checkbox"
                                            checked={selectedReceiverIds.includes(device.id)}
                                            onChange={(e) => handleReceiverSelect(device.id, e.target.checked)}
                                        />
                                        <span className="checkmark"></span>
                                        <span className="selection-label">
                                            {selectedReceiverIds.includes(device.id) ? '已選中 (UAV受控)' : '點擊選中 (控制UAV)'}
                                        </span>
                                    </label>
                                </div>
                                <DeviceItem
                                    device={device}
                                    orientationInput={
                                        orientationInputs[device.id] || {
                                            x: '0',
                                            y: '0',
                                            z: '0',
                                        }
                                    }
                                    onDeviceChange={onDeviceChange}
                                    onDeleteDevice={onDeleteDevice}
                                    onOrientationInputChange={
                                        handleDeviceOrientationInputChange
                                    }
                                    onDeviceRoleChange={handleDeviceRoleChange}
                                />
                            </div>
                        ))}
                    {showReceiverDevices && receiverDevices.length === 0 && (
                        <div className="empty-section-hint">
                            沒有接收機設備，點擊上方 "＋" 按鈕添加
                        </div>
                    )}
                </>

                {/* 干擾源 (Jam) */}
                <>
                    <div className="section-title-row">
                        <h3
                            className={`section-title extra-margin-top collapsible-header ${
                                showJammerDevices ? 'expanded' : ''
                            }`}
                            onClick={() =>
                                setShowJammerDevices(!showJammerDevices)
                            }
                        >
                            干擾源 Jam ({jammerDevices.length})
                        </h3>
                        <div className="section-buttons">
                            <button
                                className="add-specific-btn"
                                onClick={() => onAddDevice('jammer')}
                                disabled={loading}
                                title="添加干擾源"
                            >
                                ＋
                            </button>
                            {jammerDevices.length > 0 && apiStatus === 'connected' && (
                                <button
                                    className={jammerDevices.every(j => j.visible === true) ? "hide-all-btn" : "show-all-btn"}
                                    onClick={() => {
                                        const allVisible = jammerDevices.every(j => j.visible === true)
                                        jammerDevices.forEach(jammer => {
                                            onDeviceChange(jammer.id, 'visible', !allVisible)
                                        })
                                    }}
                                    disabled={loading}
                                    title={jammerDevices.every(j => j.visible === true) ? "隱藏所有干擾源" : "顯示所有干擾源"}
                                >
                                    {jammerDevices.every(j => j.visible === true) ? "隱藏" : "顯示"}
                                </button>
                            )}
                        </div>
                    </div>
                    {showJammerDevices &&
                        jammerDevices.map((device) => (
                            <DeviceItem
                                key={device.id}
                                device={device}
                                orientationInput={
                                    orientationInputs[device.id] || {
                                        x: '0',
                                        y: '0',
                                        z: '0',
                                    }
                                }
                                onDeviceChange={onDeviceChange}
                                onDeleteDevice={onDeleteDevice}
                                onOrientationInputChange={
                                    handleDeviceOrientationInputChange
                                }
                                onDeviceRoleChange={handleDeviceRoleChange}
                            />
                        ))}
                    {showJammerDevices && jammerDevices.length === 0 && (
                        <div className="empty-section-hint">
                            沒有干擾源設備，點擊上方 "＋" 按鈕添加
                        </div>
                    )}
                </>
            </div>
        </div>
    )
}

// 添加新的CSS樣式
const styleSheet = document.createElement('style')
styleSheet.type = 'text/css'
styleSheet.innerHTML = `
.section-title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 0;
}

.section-title-row h3 {
    margin: 0;
    flex: 1;
}

.remove-all-btn {
    background-color: #dc3545;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 11px;
    cursor: pointer;
    transition: background-color 0.2s;
    margin-left: 8px;
    flex-shrink: 0;
}

.remove-all-btn:hover:not(:disabled) {
    background-color: #c82333;
}

.remove-all-btn:disabled {
    background-color: #6c757d;
    cursor: not-allowed;
}

.hide-all-btn {
    background-color: #ffc107;
    color: black;
    border: none;
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 11px;
    cursor: pointer;
    transition: background-color 0.2s;
    margin-left: 8px;
    flex-shrink: 0;
}

.hide-all-btn:hover:not(:disabled) {
    background-color: #e0a800;
}

.show-all-btn {
    background-color: #28a745;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 11px;
    cursor: pointer;
    transition: background-color 0.2s;
    margin-left: 8px;
    flex-shrink: 0;
}

.show-all-btn:hover:not(:disabled) {
    background-color: #218838;
}

.api-status-section {
    padding: 8px;
    margin-bottom: 10px;
    background-color: rgba(0, 0, 0, 0.3);
    border-radius: 4px;
    text-align: center;
}

.satellite-settings-section {
    padding: 8px;
    margin-bottom: 10px;
    background-color: rgba(0, 0, 0, 0.2);
    border-radius: 4px;
}

.map-settings-section {
    margin-bottom: 15px;
}

.map-settings-content {
    padding: 10px;
    background-color: rgba(0, 123, 255, 0.05);
    border: 1px solid rgba(0, 123, 255, 0.2);
    border-radius: 4px;
    margin-top: 5px;
}

.map-settings-info {
    margin-bottom: 15px;
}

.current-settings {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.setting-item {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
}

.setting-item .label {
    color: #aaa;
}

.setting-item .value {
    color: #fff;
    font-weight: bold;
}

.map-settings-controls {
    margin-bottom: 15px;
}

.control-group {
    margin-bottom: 8px;
}

.control-row {
    display: flex;
    gap: 10px;
}

.control-row .control-group {
    flex: 1;
}

.control-label {
    display: block;
    font-size: 11px;
    color: #ccc;
    margin-bottom: 3px;
}

.control-input {
    width: 100%;
    padding: 4px 6px;
    background-color: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 3px;
    color: #fff;
    font-size: 12px;
}

.control-input:focus {
    outline: none;
    border-color: #007bff;
    background-color: rgba(255, 255, 255, 0.15);
}

.map-presets {
    margin-bottom: 15px;
}

.presets-label {
    font-size: 11px;
    color: #ccc;
    margin-bottom: 6px;
}

.presets-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}

.preset-button {
    padding: 4px 8px;
    font-size: 10px;
    background-color: #17a2b8;
    color: white;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    transition: background-color 0.2s;
}

.preset-button:hover {
    background-color: #138496;
}

.warning-message {
    background-color: rgba(255, 107, 107, 0.1);
    border: 1px solid rgba(255, 107, 107, 0.3);
    color: #ff6b6b;
    padding: 6px;
    border-radius: 3px;
    font-size: 11px;
    margin-bottom: 10px;
    text-align: center;
}

.map-actions {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
}

.apply-button {
    flex: 1;
    padding: 6px 12px;
    background-color: #28a745;
    color: white;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
    font-weight: bold;
    transition: background-color 0.2s;
}

.apply-button:hover {
    background-color: #218838;
}

.reset-button {
    flex: 1;
    padding: 6px 12px;
    background-color: #6c757d;
    color: white;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
    transition: background-color 0.2s;
}

.reset-button:hover {
    background-color: #5a6268;
}

.map-note {
    font-size: 10px;
    color: #aaa;
    text-align: center;
    font-style: italic;
}

.control-section {
    margin-bottom: 15px;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.control-section:last-child {
    border-bottom: none;
}

.section-header {
    font-size: 11px;
    font-weight: bold;
    color: #fff;
    margin-bottom: 8px;
    padding-bottom: 3px;
    border-bottom: 1px solid rgba(0, 123, 255, 0.3);
}

.control-select {
    width: 100%;
    padding: 4px 6px;
    background-color: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 3px;
    color: #fff;
    font-size: 12px;
}

.control-select:focus {
    outline: none;
    border-color: #007bff;
    background-color: rgba(255, 255, 255, 0.15);
}

.radio-group {
    display: flex;
    gap: 12px;
    margin-top: 3px;
}

.radio-label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: #ccc;
    cursor: pointer;
}

.radio-label input[type="radio"] {
    margin: 0;
    accent-color: #007bff;
}

@keyframes pulse {
    0% {
        transform: scale(1);
        box-shadow: 0 0 0 0 rgba(255, 107, 53, 0.7);
    }
    70% {
        transform: scale(1.05);
        box-shadow: 0 0 0 10px rgba(255, 107, 53, 0);
    }
    100% {
        transform: scale(1);
        box-shadow: 0 0 0 0 rgba(255, 107, 53, 0);
    }
}

.new-device {
    position: relative;
}

.new-device::before {
    content: "✨ 新設備 - 請記得套用變更！";
    position: absolute;
    top: -15px;
    left: 0;
    background-color: #ffa500;
    color: white;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: bold;
    z-index: 10;
}

.section-buttons {
    display: flex;
    gap: 6px;
    align-items: center;
}

.add-specific-btn {
    background-color: #28a745;
    color: white;
    border: none;
    border-radius: 50%;
    width: 24px;
    height: 24px;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
}

.add-specific-btn:hover:not(:disabled) {
    background-color: #218838;
    transform: scale(1.1);
}

.add-specific-btn:disabled {
    background-color: #6c757d;
    cursor: not-allowed;
    transform: none;
}

.empty-section-hint {
    padding: 10px;
    text-align: center;
    color: #aaa;
    font-size: 12px;
    font-style: italic;
    background-color: rgba(255, 255, 255, 0.05);
    border: 1px dashed rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    margin: 5px 0;
}

`
document.head.appendChild(styleSheet)

export default Sidebar
