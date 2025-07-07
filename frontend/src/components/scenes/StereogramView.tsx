import { Suspense, useRef, useCallback, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import Starfield from '../ui/Starfield'
import MainScene from './MainScene'
import { Device } from '../../types/device'
import { VisibleSatelliteInfo } from '../../types/satellite'
import { UseDroneTrackingReturn } from '../../hooks/useDroneTracking'

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
    
    // Use passed droneTracking or create fallback
    const { isTracking, recordPosition } = droneTracking || { isTracking: false, recordPosition: async () => false }
    const lastRecordedDevicePositions = useRef<Map<number, { x: number; y: number; time: number }>>(new Map())

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
                    />
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
styleSheet.type = 'text/css'
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
`
document.head.appendChild(styleSheet)
