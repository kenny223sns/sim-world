# UAV Sparse Map Implementation Progress

## 項目概述
本文檔記錄了JAM項目中UAV Sparse地圖功能的完整實現過程，包括問題診斷、功能開發和用戶界面優化。

## 實現的功能

### 1. UAV Sparse地圖生成 ✅
- **目標**: 實現第三張地圖UAV_sparse，從TSS地圖提取UAV軌跡稀疏採樣點
- **實現位置**: `backend/app/domains/simulation/services/sionna_service.py:2522-2568`
- **功能特點**:
  - 從TSS地圖在UAV軌跡點位置進行稀疏採樣
  - 使用與TSS相同的顏色範圍確保數據一致性
  - 包含UAV軌跡線可視化
  - 正確處理座標轉換 `(x,y) → (x,-y)`

### 2. 後端API端點 ✅
- **新增端點**: `/api/v1/simulations/uav-sparse-map`
- **配置文件**: `backend/app/core/config.py:97-98`
- **圖片路徑**: `UAV_SPARSE_MAP_IMAGE_PATH = OUTPUT_DIR / "uav_sparse_map.png"`

### 3. 前端UI整合 ✅
- **API路由**: `frontend/src/config/apiRoutes.ts:52`
- **新增按鈕**: UAV Sparse地圖選擇按鈕
- **智能載入**: 只有在檢測到UAV掃描資料時才載入和啟用
- **自動切換**: UAV sparse地圖載入成功後自動切換顯示

### 4. 3D視覺優化 ✅
- **隱藏ISS視覺化**: 移除干擾的SparseISSCanvas顯示
- **保留UAV軌跡**: UAVPathVisualization組件正常運作
- **用戶控制**: "顯示/隱藏路徑"按鈕可控制軌跡線

## 解決的關鍵問題

### 問題1: UAV稀疏掃描座標未傳遞 ❌→✅
**問題描述**: UAV稀疏掃描後點擊干擾檢測地圖，但後端顯示"未提供 UAV 點資料"

**根本原因**:
1. 前端數據結構錯誤: `scanData.coordinates` → `scanData.scanPoints`
2. 函數調用錯誤: `hasScanData` → `hasScanData()`
3. **關鍵問題**: 前端未將UAV掃描點傳遞給ISS地圖API

**解決方案**:
```typescript
// frontend/src/components/viewers/ISSViewer.tsx:128-133
if (hasScanData() && scanData && scanData.scanPoints && scanData.scanPoints.length > 0) {
    const uavPointsStr = scanData.scanPoints.map(point => `${point.x},${point.y}`).join(';')
    params.append('uav_points', uavPointsStr)
    console.log(`地圖載入: 使用 ${scanData.scanPoints.length} 個 UAV 掃描點`)
}
```

### 問題2: 前端語法錯誤 ❌→✅
**問題描述**: 註釋語法錯誤導致前端無法編譯

**錯誤**: 
```javascript
{ ISS Canvas - Hidden per user request  // 缺少 /*
*/}  // 錯誤的閉合語法
```

**解決方案**: 完全移除破損的ISS Canvas區塊，替換為簡潔註釋

## 技術實現細節

### 後端架構
```python
# sionna_service.py 中的 UAV sparse 地圖生成
if uav_points and len(uav_points) > 0:
    # 從 TSS 地圖在 UAV 點位置取樣
    sparse_x_sionna, sparse_y_sionna, sparse_vals_dbm = sample_iss_at_points(
        x_unique, y_unique, TSS_dbm, uav_points, noise_std_db=sparse_noise_std_db
    )
    
    # 創建 UAV Sparse 地圖可視化
    sc = plt.scatter(sparse_x_sionna, sparse_y_sionna, c=sparse_vals_dbm, ...)
    plt.colorbar(sc, label="UAV Sparse TSS (dBm)")
    plt.savefig(str(UAV_SPARSE_MAP_IMAGE_PATH), dpi=300, bbox_inches="tight")
```

### 前端資料流
1. **UAV掃描** → UAVScanContext儲存 `scanPoints`
2. **點擊干擾檢測地圖** → loadMaps()傳遞UAV點給後端
3. **後端生成三張地圖** → ISS, TSS, UAV Sparse
4. **前端自動載入** → 依序載入並自動切換到UAV Sparse顯示

### 座標轉換處理
- **前端座標系**: (x, y)
- **Sionna座標系**: (x, -y) 
- **轉換位置**: 在sionna_service.py的`to_sionna_xy_from_frontend`函數中統一處理

## 用戶使用流程

### 完整工作流程
1. **進行UAV稀疏掃描** → 3D主視圖顯示軌跡線（無ISS干擾）
2. **點擊干擾檢測地圖** → 後端生成三張地圖
3. **自動顯示UAV Sparse地圖** → 用戶立即看到稀疏採樣結果
4. **可切換其他地圖** → ISS地圖（干擾檢測）、TSS地圖（總信號強度）

### UI控制選項
- **地圖選擇**: 三個按鈕（ISS、TSS、UAV Sparse）
- **按鈕狀態**: UAV Sparse按鈕在無資料時禁用（opacity: 0.5）
- **提示信息**: "UAV Sparse 地圖需要先進行 UAV 稀疏掃描才能顯示"
- **軌跡控制**: 3D場景中的"顯示/隱藏路徑"按鈕

## 文件修改記錄

### 後端文件
1. `backend/app/core/config.py` - 添加UAV_SPARSE_MAP_IMAGE_PATH配置
2. `backend/app/domains/simulation/services/sionna_service.py` - UAV sparse地圖生成邏輯
3. `backend/app/domains/simulation/api/simulation_api.py` - 新增/uav-sparse-map端點

### 前端文件
1. `frontend/src/config/apiRoutes.ts` - 添加getUAVSparseMap路由
2. `frontend/src/components/viewers/ISSViewer.tsx` - 整合UAV sparse地圖UI和邏輯
3. `frontend/src/components/scenes/StereogramView.tsx` - 隱藏ISS視覺化，保留UAV軌跡

## 測試驗證

### 成功指標
- ✅ 後端日誌顯示: "生成 UAV Sparse 地圖 - 使用 X 個 UAV 掃描點"
- ✅ 三張地圖文件正確生成: iss_map.png, tss_map.png, uav_sparse_map.png
- ✅ 前端自動切換到UAV Sparse地圖顯示
- ✅ 3D場景顯示清晰的UAV軌跡線，無ISS視覺化干擾

### 錯誤排查
如果遇到"未提供 UAV 點資料"錯誤：
1. 檢查UAVScanContext是否有scanPoints資料
2. 確認loadMaps函數正確傳遞uav_points參數
3. 驗證後端API接收到uav_points參數

## 技術特色

### 智能化功能
- **條件載入**: 只有在有UAV掃描資料時才生成UAV sparse地圖
- **自動切換**: 載入成功後自動切換到最相關的地圖顯示
- **用戶友好**: 提供清晰的狀態提示和控制選項

### 性能優化
- **增量載入**: ISS/TSS地圖先載入，UAV sparse地圖異步載入
- **錯誤隔離**: UAV sparse地圖載入失敗不影響主要功能
- **資源管理**: 正確清理舊的圖片URL，避免記憶體洩漏

## 恢復文檔參考
本實現基於並擴展了以下恢復文檔的功能：
- `ISS_TSS_Map_Implementation.md` - ISS和TSS地圖的雙地圖架構
- `Jammer_Visibility_Issue_Analysis.md` - Jammer可見性和座標轉換

## 未來改進建議
1. **批量操作**: 支援多個UAV同時掃描的sparse地圖合併
2. **即時更新**: UAV掃描過程中即時更新sparse地圖
3. **導出功能**: 支援UAV sparse地圖資料的CSV導出
4. **歷史記錄**: 保存和比較不同時間的UAV掃描結果

---
*文檔生成時間: 2025-08-14*  
*實現狀態: ✅ 完全實現並測試通過*  
*主要貢獻: UAV Sparse地圖功能、3D視覺優化、座標轉換修復*