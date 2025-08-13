import { useState, useEffect, useRef } from 'react'
import { SparseScanResponse } from '../../services/sparseScanApi'

interface RadioMapViewerProps {
    scanData: SparseScanResponse | null
    samples: Float32Array
    currentIdx: number
    scene: string
}

// RadioMap 顯示組件 - 顯示稀疏掃描的ISS地圖
const RadioMapViewer: React.FC<RadioMapViewerProps> = ({
    scanData,
    samples,
    currentIdx,
    scene,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [colorScale, setColorScale] = useState<'jet' | 'viridis' | 'plasma'>('jet')
    const [minDbm, setMinDbm] = useState<number>(-120)
    const [maxDbm, setMaxDbm] = useState<number>(-60)

    // 生成熱力圖顏色
    const getHeatmapColor = (value: number, scale: string = 'jet'): [number, number, number, number] => {
        if (isNaN(value)) {
            return [128, 128, 128, 100] // 灰色，半透明 for NaN values
        }

        // 正規化到 0-1 範圍
        const normalizedValue = Math.max(0, Math.min(1, (value - minDbm) / (maxDbm - minDbm)))

        let r: number, g: number, b: number

        switch (scale) {
            case 'viridis':
                // Viridis colormap approximation
                r = Math.round(255 * (0.267 + 0.1 * normalizedValue))
                g = Math.round(255 * (0.004 + 0.4 * normalizedValue))
                b = Math.round(255 * (0.329 + 0.6 * normalizedValue))
                break
            case 'plasma':
                // Plasma colormap approximation
                if (normalizedValue < 0.5) {
                    const t = normalizedValue * 2
                    r = Math.round(255 * (0.5 + 0.5 * t))
                    g = Math.round(255 * (0.1 * t))
                    b = Math.round(255 * (0.8 + 0.2 * t))
                } else {
                    const t = (normalizedValue - 0.5) * 2
                    r = 255
                    g = Math.round(255 * (0.1 + 0.9 * t))
                    b = Math.round(255 * (0.8 - 0.8 * t))
                }
                break
            default: // 'jet'
                // Jet colormap
                if (normalizedValue < 0.25) {
                    r = 0
                    g = 0
                    b = Math.round(255 * (0.5 + 2 * normalizedValue))
                } else if (normalizedValue < 0.5) {
                    r = 0
                    g = Math.round(255 * (4 * normalizedValue - 1))
                    b = 255
                } else if (normalizedValue < 0.75) {
                    r = Math.round(255 * (4 * normalizedValue - 2))
                    g = 255
                    b = Math.round(255 * (3 - 4 * normalizedValue))
                } else {
                    r = 255
                    g = Math.round(255 * (4 - 4 * normalizedValue))
                    b = 0
                }
                break
        }

        return [r, g, b, 255] // 不透明
    }

    // 渲染熱力圖
    const renderHeatmap = () => {
        if (!canvasRef.current || !scanData || samples.length === 0) return

        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const { width, height } = scanData
        
        // 設置 canvas 尺寸
        canvas.width = width
        canvas.height = height
        
        // 創建圖像數據
        const imageData = ctx.createImageData(width, height)
        const data = imageData.data

        // 填充像素數據
        for (let i = 0; i < height; i++) {
            for (let j = 0; j < width; j++) {
                const arrayIdx = i * width + j
                const pixelIdx = (i * width + j) * 4
                
                const value = samples[arrayIdx]
                const [r, g, b, a] = getHeatmapColor(value, colorScale)
                
                data[pixelIdx] = r     // Red
                data[pixelIdx + 1] = g // Green
                data[pixelIdx + 2] = b // Blue
                data[pixelIdx + 3] = a // Alpha
            }
        }

        // 繪製到 canvas
        ctx.putImageData(imageData, 0, 0)
    }

    // 當數據或設置改變時重新渲染
    useEffect(() => {
        renderHeatmap()
    }, [scanData, samples, currentIdx, colorScale, minDbm, maxDbm])

    // 計算統計信息
    const getStats = () => {
        if (!samples || samples.length === 0) return null

        const validSamples = Array.from(samples).filter(val => !isNaN(val))
        if (validSamples.length === 0) return null

        const min = Math.min(...validSamples)
        const max = Math.max(...validSamples)
        const avg = validSamples.reduce((a, b) => a + b, 0) / validSamples.length

        return {
            min: min.toFixed(1),
            max: max.toFixed(1),
            avg: avg.toFixed(1),
            count: validSamples.length,
            total: samples.length
        }
    }

    const stats = getStats()

    if (!scanData) {
        return (
            <div className="radio-map-viewer">
                <div className="no-data">沒有掃描數據</div>
            </div>
        )
    }

    return (
        <div className="radio-map-viewer">
            <div className="map-controls" style={{ marginBottom: '10px', padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'center', fontSize: '12px' }}>
                    <div>
                        <label>色彩: </label>
                        <select 
                            value={colorScale} 
                            onChange={(e) => setColorScale(e.target.value as any)}
                            style={{ fontSize: '11px' }}
                        >
                            <option value="jet">Jet</option>
                            <option value="viridis">Viridis</option>
                            <option value="plasma">Plasma</option>
                        </select>
                    </div>
                    <div>
                        <label>最小 (dBm): </label>
                        <input
                            type="number"
                            value={minDbm}
                            onChange={(e) => setMinDbm(Number(e.target.value))}
                            style={{ width: '60px', fontSize: '11px' }}
                        />
                    </div>
                    <div>
                        <label>最大 (dBm): </label>
                        <input
                            type="number"
                            value={maxDbm}
                            onChange={(e) => setMaxDbm(Number(e.target.value))}
                            style={{ width: '60px', fontSize: '11px' }}
                        />
                    </div>
                </div>
                
                {stats && (
                    <div style={{ marginTop: '8px', fontSize: '11px', color: '#666' }}>
                        統計: 最小 {stats.min} dBm, 最大 {stats.max} dBm, 平均 {stats.avg} dBm 
                        ({stats.count}/{stats.total} 個點已採樣)
                    </div>
                )}
            </div>

            <div className="canvas-container" style={{ border: '1px solid #ddd', maxWidth: '100%', overflow: 'auto' }}>
                <canvas 
                    ref={canvasRef}
                    style={{ 
                        maxWidth: '100%',
                        height: 'auto',
                        imageRendering: 'pixelated' // 保持像素化效果
                    }}
                />
            </div>
            
            <div style={{ marginTop: '8px', fontSize: '11px', color: '#666' }}>
                地圖尺寸: {scanData.width} × {scanData.height}, 場景: {scene}
            </div>
        </div>
    )
}

export default RadioMapViewer