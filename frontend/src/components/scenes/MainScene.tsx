import { useLayoutEffect, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { TextureLoader, RepeatWrapping, SRGBColorSpace } from 'three'
import UAVFlight, { UAVManualDirection } from './UAVFlight'
import StaticModel from './StaticModel'
import { VisibleSatelliteInfo } from '../../types/satellite'
import SatelliteManager from './satellite/SatelliteManager'
import { ApiRoutes } from '../../config/apiRoutes'
import {
    getBackendSceneName,
    getSceneTextureName,
} from '../../utils/sceneUtils'
import { worldToThreeJS } from '../../utils/coordUtils'

export interface MainSceneProps {
    devices: any[]
    auto: boolean
    manualControl?: (direction: UAVManualDirection) => void
    manualDirection?: UAVManualDirection
    onUAVPositionUpdate?: (
        position: [number, number, number],
        deviceId?: number
    ) => void
    uavAnimation: boolean
    selectedReceiverIds?: number[]
    satellites?: VisibleSatelliteInfo[]
    sceneName: string
    sparseScanData?: any
    sparseScanCurrentIdx?: number
    sparseScanActive?: boolean
}

const UAV_SCALE = 20

const MainScene: React.FC<MainSceneProps> = ({
    devices = [],
    auto,
    manualDirection,
    manualControl,
    onUAVPositionUpdate,
    uavAnimation,
    selectedReceiverIds = [],
    satellites = [],
    sceneName,
    sparseScanData,
    sparseScanCurrentIdx = 0,
    sparseScanActive = false,
}) => {
    // 根據場景名稱動態生成 URL
    const backendSceneName = getBackendSceneName(sceneName)
    const SCENE_URL = ApiRoutes.scenes.getSceneModel(backendSceneName)
    const BS_MODEL_URL = ApiRoutes.simulations.getModel('tower')
    const UAV_MODEL_URL = ApiRoutes.simulations.getModel('uav')
    const JAMMER_MODEL_URL = ApiRoutes.simulations.getModel('jam')
    const SATELLITE_TEXTURE_URL = ApiRoutes.scenes.getSceneTexture(
        backendSceneName,
        getSceneTextureName(sceneName)
    )

    // 動態預加載模型以提高性能
    useMemo(() => {
        useGLTF.preload(SCENE_URL)
        useGLTF.preload(BS_MODEL_URL)
        useGLTF.preload(UAV_MODEL_URL)
        useGLTF.preload(JAMMER_MODEL_URL)
    }, [SCENE_URL, BS_MODEL_URL, UAV_MODEL_URL, JAMMER_MODEL_URL])

    // 加載主場景模型，使用 useMemo 避免重複加載
    const { scene: mainScene } = useGLTF(SCENE_URL) as any
    const { controls } = useThree()

    useLayoutEffect(() => {
        ;(controls as OrbitControlsImpl)?.target?.set(0, 0, 0)
    }, [controls])

    const prepared = useMemo(() => {
        const root = mainScene.clone(true)
        let maxArea = 0
        let groundMesh: THREE.Mesh | null = null
        const loader = new TextureLoader()
        const satelliteTexture = loader.load(SATELLITE_TEXTURE_URL)
        satelliteTexture.wrapS = RepeatWrapping
        satelliteTexture.wrapT = RepeatWrapping
        satelliteTexture.colorSpace = SRGBColorSpace
        satelliteTexture.repeat.set(1, 1)
        satelliteTexture.anisotropy = 16
        satelliteTexture.flipY = false

        // 處理場景中的所有網格
        root.traverse((o: THREE.Object3D) => {
            if ((o as THREE.Mesh).isMesh) {
                const m = o as THREE.Mesh
                m.castShadow = true
                m.receiveShadow = true

                // 處理可能的材質問題
                if (m.material) {
                    // 確保材質能正確接收光照
                    if (Array.isArray(m.material)) {
                        m.material.forEach((mat) => {
                            if (mat instanceof THREE.MeshBasicMaterial) {
                                const newMat = new THREE.MeshStandardMaterial({
                                    color: (mat as any).color,
                                    map: (mat as any).map,
                                })
                                mat = newMat
                            }
                        })
                    } else if (m.material instanceof THREE.MeshBasicMaterial) {
                        const basicMat = m.material
                        const newMat = new THREE.MeshStandardMaterial({
                            color: basicMat.color,
                            map: basicMat.map,
                        })
                        m.material = newMat
                    }
                }

                if (m.geometry) {
                    m.geometry.computeBoundingBox()
                    const bb = m.geometry.boundingBox
                    if (bb) {
                        const size = new THREE.Vector3()
                        bb.getSize(size)
                        const area = size.x * size.z
                        if (area > maxArea) {
                            if (groundMesh) groundMesh.castShadow = true
                            maxArea = area
                            groundMesh = m
                            groundMesh.material =
                                new THREE.MeshStandardMaterial({
                                    map: satelliteTexture,
                                    color: 0xffffff,
                                    roughness: 0.8,
                                    metalness: 0.1,
                                    emissive: 0x555555,
                                    emissiveIntensity: 0.4,
                                    vertexColors: false,
                                    normalScale: new THREE.Vector2(0.5, 0.5),
                                })
                            groundMesh.receiveShadow = true
                            groundMesh.castShadow = false
                        }
                    }
                }
            }
        })
        return root
    }, [mainScene, SATELLITE_TEXTURE_URL])

    const deviceMeshes = useMemo(() => {
        return devices.map((device: any) => {
            const isSelected =
                device.role === 'receiver' &&
                device.id !== null &&
                selectedReceiverIds.includes(device.id)

            if (device.role === 'receiver') {
                // Calculate UAV position based on sparse scan if active
                let position: [number, number, number] = [
                    device.position_x,
                    device.position_z,
                    device.position_y,
                ]

                // Override position with sparse scan data if active - 使用統一座標轉換
                if (sparseScanActive && sparseScanData && sparseScanData.points && sparseScanCurrentIdx < sparseScanData.points.length) {
                    const currentPoint = sparseScanData.points[sparseScanCurrentIdx]
                    if (currentPoint) {
                        const [threeX, threeY, threeZ] = worldToThreeJS(
                            currentPoint.x_m,
                            currentPoint.y_m,
                            device.position_z || 40
                        );
                        position = [threeX, threeY, threeZ]
                        console.log(`3D UAV統一座標轉換: world(${currentPoint.x_m}, ${currentPoint.y_m}) → three.js(${threeX}, ${threeY}, ${threeZ})`)
                    }
                }

                const shouldControl = isSelected || sparseScanActive

                return (
                    <UAVFlight
                        key={
                            device.id ||
                            `temp-${device.position_x}-${device.position_y}-${device.position_z}`
                        }
                        position={position}
                        scale={[UAV_SCALE, UAV_SCALE, UAV_SCALE]}
                        auto={shouldControl ? (sparseScanActive ? false : auto) : false}
                        manualDirection={shouldControl ? manualDirection : null}
                        onManualMoveDone={() => {
                            if (manualControl) {
                                manualControl(null)
                            }
                        }}
                        onPositionUpdate={(pos) => {
                            if (onUAVPositionUpdate && shouldControl) {
                                onUAVPositionUpdate(
                                    pos,
                                    device.id !== null ? device.id : undefined
                                )
                            }
                        }}
                        uavAnimation={shouldControl ? uavAnimation : false}
                    />
                )
            } else if (device.role === 'desired') {
                return (
                    <StaticModel
                        key={device.id}
                        url={UAV_MODEL_URL}
                        position={[
                            device.position_x,
                            device.position_z + 5,
                            device.position_y,
                        ]}
                        scale={[20, 20, 20]}
                        pivotOffset={[0, 0, 0]}
                    />
                )
            } else if (device.role === 'jammer' && device.visible === true) {
                return (
                    <StaticModel
                        key={device.id}
                        url={JAMMER_MODEL_URL}
                        position={[
                            device.position_x,
                            device.position_z + 5,
                            device.position_y,
                        ]}
                        scale={[0.02, 0.02, 0.02]}
                        pivotOffset={[0, -8970, 0]}
                    />
                )
            } else {
                return null
            }
        })
    }, [
        devices,
        auto,
        manualDirection,
        onUAVPositionUpdate,
        manualControl,
        uavAnimation,
        selectedReceiverIds,
        BS_MODEL_URL,
        UAV_MODEL_URL,
        JAMMER_MODEL_URL,
        sparseScanData,
        sparseScanCurrentIdx,
        sparseScanActive,
    ])

    return (
        <>
            <primitive object={prepared} castShadow receiveShadow />
            {deviceMeshes}
            <SatelliteManager satellites={satellites} />
        </>
    )
}

export default MainScene
