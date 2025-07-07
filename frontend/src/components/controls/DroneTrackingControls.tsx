import React, { useState, useEffect } from 'react'
import { UseDroneTrackingReturn } from '../../hooks/useDroneTracking'

interface DroneTrackingControlsProps {
  sceneName: string
  className?: string
  droneTracking?: UseDroneTrackingReturn
}

export const DroneTrackingControls: React.FC<DroneTrackingControlsProps> = ({
  sceneName,
  className = '',
  droneTracking
}) => {
  // Use passed droneTracking or fallback to hook (for backward compatibility)
  const {
    isTracking,
    trackingStats,
    isLoading,
    error,
    startTracking,
    stopTracking,
    clearTracking,
    exportTrackingData,
    getTrackingStats,
    getTrackingMatrix,
    setRecordingThrottle,
    setMinimumDistance,
    recordingThrottle,
    minimumDistance
  } = droneTracking || {}

  const [exportFormat, setExportFormat] = useState<string>('json')
  const [showStats, setShowStats] = useState<boolean>(false)
  const [showSettings, setShowSettings] = useState<boolean>(false)
  const [showMatrix, setShowMatrix] = useState<boolean>(false)
  const [matrixData, setMatrixData] = useState<number[][] | null>(null)

  // Load stats when component mounts or scene changes
  useEffect(() => {
    if (sceneName) {
      getTrackingStats(sceneName)
    }
  }, [sceneName, getTrackingStats])

  // Auto-refresh stats when tracking is active
  useEffect(() => {
    if (isTracking && sceneName) {
      const interval = setInterval(() => {
        getTrackingStats(sceneName)
      }, 2000) // Refresh every 2 seconds

      return () => clearInterval(interval)
    }
  }, [isTracking, sceneName, getTrackingStats])

  const handleStartTracking = () => {
    startTracking(sceneName)
  }

  const handleStopTracking = () => {
    stopTracking()
  }

  const handleClearTracking = async () => {
    if (window.confirm('確定要清除所有追蹤資料嗎？此操作無法撤銷。')) {
      const success = await clearTracking(sceneName)
      if (success) {
        alert('追蹤資料已清除')
      }
    }
  }

  const handleExportData = async () => {
    const exportData = await exportTrackingData(sceneName, exportFormat)
    if (exportData) {
      let dataStr: string
      let mimeType: string
      let fileExtension: string
      
      switch (exportFormat) {
        case 'csv':
          // Convert matrix to CSV format
          const csvHeader = Array.from({length: 128}, (_, i) => `col_${i}`).join(',')
          const csvRows = exportData.matrix.map(row => row.join(','))
          dataStr = [csvHeader, ...csvRows].join('\n')
          mimeType = 'text/csv'
          fileExtension = 'csv'
          break
        case 'numpy':
          // Convert matrix to Python numpy format
          dataStr = `import numpy as np\n\n# Drone tracking matrix for scene: ${sceneName}\n# Matrix size: ${exportData.matrix_size}x${exportData.matrix_size}\n# Resolution: ${exportData.resolution}m per cell\n\nmatrix = np.array([\n`
          dataStr += exportData.matrix.map(row => `    [${row.join(', ')}]`).join(',\n')
          dataStr += '\n])\n'
          mimeType = 'text/python'
          fileExtension = 'py'
          break
        default: // json
          dataStr = JSON.stringify(exportData, null, 2)
          mimeType = 'application/json'
          fileExtension = 'json'
      }
      
      const dataBlob = new Blob([dataStr], { type: mimeType })
      const url = URL.createObjectURL(dataBlob)
      
      const link = document.createElement('a')
      link.href = url
      link.download = `drone_tracking_${sceneName}_${new Date().toISOString().split('T')[0]}.${fileExtension}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      URL.revokeObjectURL(url)
      alert(`追蹤資料已匯出為 ${exportFormat.toUpperCase()} 格式`)
    } else {
      alert('匯出失敗：無追蹤資料')
    }
  }

  const handleShowMatrix = async () => {
    if (!showMatrix) {
      // Load matrix data when showing
      const matrix = await getTrackingMatrix(sceneName)
      if (matrix) {
        setMatrixData(matrix.matrix)
        setShowMatrix(true)
      } else {
        alert('無矩陣資料可顯示')
      }
    } else {
      setShowMatrix(false)
    }
  }

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`
  }

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    
    if (hours > 0) {
      return `${hours}小時 ${minutes}分鐘`
    } else if (minutes > 0) {
      return `${minutes}分鐘 ${secs}秒`
    } else {
      return `${secs}秒`
    }
  }

  return (
    <div className={`bg-white p-4 rounded-lg shadow-md space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800">RX 設備位置追蹤</h3>
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${
            isTracking ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
          }`} />
          <span className="text-sm text-gray-600">
            {isTracking ? '追蹤中' : '未追蹤'}
          </span>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          錯誤: {error}
        </div>
      )}

      {/* Control buttons */}
      <div className="flex flex-wrap gap-2">
        {!isTracking ? (
          <button
            onClick={handleStartTracking}
            disabled={isLoading}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            開始追蹤
          </button>
        ) : (
          <button
            onClick={handleStopTracking}
            disabled={isLoading}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
          >
            停止追蹤
          </button>
        )}
        
        <button
          onClick={() => setShowStats(!showStats)}
          disabled={isLoading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {showStats ? '隱藏' : '顯示'}統計資料
        </button>
        
        <button
          onClick={() => setShowSettings(!showSettings)}
          disabled={isLoading}
          className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
        >
          {showSettings ? '隱藏' : '顯示'}頻率設定
        </button>
        
        <button
          onClick={handleClearTracking}
          disabled={isLoading || isTracking}
          className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50"
        >
          清除資料
        </button>
      </div>

      {/* Export controls */}
      <div className="flex items-center space-x-2">
        <label className="text-sm text-gray-600">匯出格式:</label>
        <select
          value={exportFormat}
          onChange={(e) => setExportFormat(e.target.value)}
          className="px-2 py-1 border border-gray-300 rounded text-sm"
        >
          <option value="json">JSON</option>
          <option value="csv">CSV</option>
          <option value="numpy">NumPy</option>
        </select>
        <button
          onClick={handleExportData}
          disabled={isLoading || !trackingStats}
          className="px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 text-sm"
        >
          匯出矩陣
        </button>
        <button
          onClick={handleShowMatrix}
          disabled={isLoading}
          className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm"
        >
          {showMatrix ? '隱藏' : '顯示'}矩陣
        </button>
      </div>

      {/* Statistics panel */}
      {showStats && trackingStats && (
        <div className="bg-gray-50 p-3 rounded border space-y-2">
          <h4 className="font-medium text-gray-800">追蹤統計</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">記錄位置:</span>
              <span className="ml-2 font-medium">{trackingStats.total_positions}</span>
            </div>
            <div>
              <span className="text-gray-600">覆蓋率:</span>
              <span className="ml-2 font-medium">{formatPercentage(trackingStats.coverage_percentage)}</span>
            </div>
            <div>
              <span className="text-gray-600">訪問格數:</span>
              <span className="ml-2 font-medium">{trackingStats.visited_cells}</span>
            </div>
            <div>
              <span className="text-gray-600">路徑長度:</span>
              <span className="ml-2 font-medium">{trackingStats.path_length.toFixed(1)}m</span>
            </div>
            <div className="col-span-2">
              <span className="text-gray-600">追蹤時間:</span>
              <span className="ml-2 font-medium">{formatDuration(trackingStats.session_duration)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Frequency settings panel */}
      {showSettings && (
        <div className="bg-gray-50 p-3 rounded border space-y-3">
          <h4 className="font-medium text-gray-800">記錄頻率設定</h4>
          
          <div className="space-y-2">
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                記錄間隔 (毫秒): {recordingThrottle}ms ({(1000/recordingThrottle).toFixed(1)} Hz)
              </label>
              <input
                type="range"
                min="16"
                max="500"
                step="1"
                value={recordingThrottle}
                onChange={(e) => setRecordingThrottle(Number(e.target.value))}
                className="w-full"
                disabled={isTracking}
              />
              <div className="text-xs text-gray-500 flex justify-between">
                <span>16ms (60Hz)</span>
                <span>500ms (2Hz)</span>
              </div>
            </div>
            
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                最小移動距離: {minimumDistance.toFixed(1)}米
              </label>
              <input
                type="range"
                min="0.1"
                max="2.0"
                step="0.1"
                value={minimumDistance}
                onChange={(e) => setMinimumDistance(Number(e.target.value))}
                className="w-full"
                disabled={isTracking}
              />
              <div className="text-xs text-gray-500 flex justify-between">
                <span>0.1m (精細)</span>
                <span>2.0m (粗略)</span>
              </div>
            </div>
            
            <div className="text-xs text-gray-500 border-t pt-2">
              <p>• 監控 RX 設備位置變化，自動記錄到追蹤矩陣</p>
              <p>• 最小移動距離避免在同一位置重複記錄</p>
              <p>• 追蹤進行中無法修改設定</p>
            </div>
          </div>
        </div>
      )}

      {/* Matrix visualization panel */}
      {showMatrix && matrixData && (
        <div className="bg-gray-50 p-3 rounded border space-y-2">
          <h4 className="font-medium text-gray-800">矩陣可視化</h4>
          <div className="matrix-visualization" style={{ 
            display: 'grid', 
            gridTemplateColumns: `repeat(${matrixData.length}, 2px)`, 
            gap: '0px',
            width: 'fit-content',
            maxWidth: '100%',
            overflow: 'auto'
          }}>
            {matrixData.map((row, rowIndex) =>
              row.map((cell, colIndex) => (
                <div
                  key={`${rowIndex}-${colIndex}`}
                  style={{
                    width: '2px',
                    height: '2px',
                    backgroundColor: cell === 1 ? '#22c55e' : '#e5e7eb',
                    border: 'none'
                  }}
                  title={`位置 (${colIndex}, ${rowIndex}): ${cell === 1 ? '已訪問' : '未訪問'}`}
                />
              ))
            )}
          </div>
          <div className="text-xs text-gray-500">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1">
                <div className="w-3 h-3 bg-green-500 rounded"></div>
                <span>已訪問</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-3 h-3 bg-gray-300 rounded"></div>
                <span>未訪問</span>
              </div>
            </div>
            <p className="mt-1">矩陣大小: {matrixData.length}×{matrixData[0]?.length || 0}</p>
          </div>
        </div>
      )}

      {/* Scene info */}
      <div className="text-xs text-gray-500 border-t pt-2">
        場景: {sceneName} | 解析度: 1米/格 | 矩陣大小: 128×128<br/>
        追蹤來源: Sidebar 中 RX 設備的 X、Y 位置值
      </div>
    </div>
  )
}

export default DroneTrackingControls
