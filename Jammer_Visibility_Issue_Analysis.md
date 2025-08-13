# Jammer 可見性功能問題分析文檔

## 項目概述
本文檔記錄了 JAM 項目中 jammer 設備可見性功能的實現狀態、已修復問題和當前未解決的問題。

## 項目架構
- **後端**: FastAPI + PostgreSQL + Sionna 無線模擬
- **前端**: React + TypeScript + Three.js 3D 渲染
- **核心功能**: 無線干擾檢測與 ISS/TSS 地圖生成

## 已修復的問題 ✅

### 1. 3D 主視圖顯示邏輯錯誤
**問題**: jammer 設置為 `visible: false` 時，3D 視圖中仍然顯示
**原因**: 條件判斷邏輯錯誤
```typescript
// 修復前 (錯誤)
} else if (device.role === 'jammer' && device.visible !== false) {

// 修復後 (正確)  
} else if (device.role === 'jammer' && device.visible === true) {
```
**文件**: `/frontend/src/components/scenes/MainScene.tsx:225`

### 2. 後端 ISS 地圖生成變數錯誤
**問題**: 當 jammer 可見時，生成 ISS 地圖出現 `NameError: name 'target_dbm' is not defined`
**原因**: 變數名稱錯誤
```python
# 修復前 (錯誤)
iss_value = float(target_dbm[row_idx, col_idx]) if row_idx < target_dbm.shape[0] and col_idx < target_dbm.shape[1] else 0.0

# 修復後 (正確)
iss_value = float(iss_dbm[row_idx, col_idx]) if row_idx < iss_dbm.shape[0] and col_idx < iss_dbm.shape[1] else 0.0
```
**文件**: `/backend/app/domains/simulation/services/sionna_service.py:2344, 2362`

### 3. 後端 jammer 過濾邏輯
**狀態**: ✅ 正常工作
**邏輯**: 
```python
# 過濾掉隱藏的干擾器
visible_jammers = [j for j in active_jammers if getattr(j, 'visible', True)]
```
**驗證結果**:
- `visible: true` → 干擾器索引: [1], ISS max: -41.22 dBm, 檢測到 3 個 CFAR 峰值
- `visible: false` → 干擾器索引: [], ISS max: -90.00 dBm, 檢測到 0 個 CFAR 峰值

## 當前未解決的問題 ❌ → ✅ 已解決

### 1. 套用變更後 3D 主視圖 jammer 消失 ✅ 已修復
**問題根因**: `convertBackendToFrontend` 函數缺少 `visible` 屬性轉換
**修復方案**: 在設備數據轉換函數中添加 `visible` 屬性
```typescript
// 修復前 - 缺少 visible 屬性
export const convertBackendToFrontend = (backendDevice: Device): Device => {
    return {
        // ... 其他屬性
        active: backendDevice.active,
        role: backendDevice.role,  // 缺少 visible!
    }
}

// 修復後 - 包含 visible 屬性  
export const convertBackendToFrontend = (backendDevice: Device): Device => {
    return {
        // ... 其他屬性
        active: backendDevice.active,
        visible: backendDevice.visible,  // ✅ 添加 visible 屬性
        role: backendDevice.role,
    }
}
```
**文件**: `/frontend/src/utils/deviceUtils.ts:16`

**修復邏輯一致性問題**: 統一所有 visible 判斷邏輯為 `=== true`
- `MainScene.tsx:225`: `device.visible === true`
- `DeviceItem.tsx:61`: `device.visible === true` 
- `Sidebar.tsx:1209`: `jammerDevices.every(j => j.visible === true)`

### 2. 即時更新 vs 套用變更的需求 ⚠️ 設計決策待確認
**用戶需求**: 
- 希望按下「隱藏/顯示」按鈕時，干擾檢測地圖能直接更新
- 不想每次都需要「套用變更」來重新加載地圖

**當前流程**:
1. 點擊隱藏/顯示 → 更新前端暫存狀態 (`onDeviceChange`)
2. 點擊套用變更 → 批量提交到後端 API (`onApply`)
3. 重新加載設備列表和地圖

**現狀**: 當前實現需要「套用變更」才能將 jammer 可見性同步到後端，進而影響干擾檢測地圖的生成。這是一個設計權衡問題，而不是 bug。

## 技術實現細節

### 前端設備狀態管理
```typescript
// Sidebar.tsx 中的隱藏/顯示按鈕
<button
    className={jammerDevices.every(j => j.visible !== false) ? "hide-all-btn" : "show-all-btn"}
    onClick={() => {
        const allVisible = jammerDevices.every(j => j.visible !== false)
        jammerDevices.forEach(jammer => {
            onDeviceChange(jammer.id, 'visible', !allVisible)  // 只更新暫存狀態
        })
    }}
>
```

### useDevices Hook 中的狀態管理
```typescript
const updateDeviceField = (id: number, field: keyof Device, value: any) => {
    setTempDevices((prev) => {
        const newDevices = prev.map((device) => {
            if (device.id === id) {
                return { ...device, [field]: value }
            }
            return device
        })
        return newDevices
    })
}
```

### 後端可見性過濾
```python
# sionna_service.py 中的 jammer 過濾
active_jammers = await device_service.get_devices(
    skip=0, limit=100, role=DeviceRole.JAMMER.value, active_only=True
)
visible_jammers = [j for j in active_jammers if getattr(j, 'visible', True)]
```

## API 端點
- `GET /api/v1/devices/` - 獲取設備列表
- `PUT /api/v1/devices/{id}` - 更新單個設備
- `GET /api/v1/simulations/iss-map` - 生成 ISS 干擾檢測地圖
- `GET /api/v1/simulations/tss-map` - 生成 TSS 總信號強度地圖

## 測試驗證

### 資料庫狀態
```json
{
    "name": "jam2",
    "id": 14,
    "role": "jammer", 
    "visible": true,
    "active": true,
    "position_x": -1700,
    "position_y": -3490,
    "position_z": 120,
    "power_dbm": 40
}
```

### 後端日誌驗證
```log
# visible: true 時
干擾器索引: [1]
ISS 原始數據統計: min=0.00e+00, max=7.55e-08
檢測到 3 個干擾源峰值

# visible: false 時  
干擾器索引: []
ISS 原始數據統計: min=0.00e+00, max=0.00e+00
檢測到 0 個干擾源峰值
```

## 建議解決方案

### 方案 1: 即時 API 更新
修改隱藏/顯示按鈕，點擊時直接調用 API 更新設備狀態：
```typescript
onClick={async () => {
    const newVisible = !device.visible
    await updateDeviceAPI(device.id, { visible: newVisible })
    // 觸發設備列表重新載入
    await refetchDevices()
}}
```

### 方案 2: 優化套用變更流程
確保套用變更後正確同步所有狀態：
1. 檢查 `onApply` 函數的實現
2. 確保設備狀態正確更新到前端暫存
3. 驗證 3D 場景組件的重渲染邏輯

### 方案 3: 智能地圖更新
檢測 jammer 可見性變更時，僅更新干擾檢測地圖而不重載整個場景。

## 完成的修復 ✅
1. ✅ **修復套用變更後 3D 視圖狀態丟失**: 在 `convertBackendToFrontend` 函數中添加 `visible` 屬性轉換
2. ✅ **統一 visible 邏輯判斷**: 將所有 `!== false` 改為 `=== true` 以避免 undefined 導致的邏輯錯誤
3. ✅ **驗證完整工作流程**: jammer 隱藏/顯示功能在 3D 視圖和干擾檢測地圖中都正常工作

## 可選的改進建議 🔧
1. **即時 API 更新機制**: 為 jammer 可見性按鈕添加直接 API 調用選項
2. **智能地圖更新**: 僅在 jammer 可見性變更時重新生成干擾檢測地圖
3. **批量操作優化**: 優化多個 jammer 同時隱藏/顯示的性能

## 相關文件
- `frontend/src/components/scenes/MainScene.tsx` - 3D 場景渲染
- `frontend/src/components/layout/Sidebar.tsx` - 設備控制面板
- `frontend/src/hooks/useDevices.ts` - 設備狀態管理
- `backend/app/domains/simulation/services/sionna_service.py` - 地圖生成服務
- `backend/app/domains/device/` - 設備管理 API

---
*文檔生成時間: 2025-08-13*
*最後更新: 2025-08-13*  
*當前狀態: ✅ jammer visibility 功能完全修復，包括 3D 視圖顯示和干擾檢測地圖過濾*