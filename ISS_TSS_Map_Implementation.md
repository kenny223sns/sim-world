# ISS & TSS Map Implementation Documentation

## Project Overview
This is a wireless signal simulation system with interference detection capabilities. The user requested implementation of dual map generation: ISS (Interference Signal Strength) maps with 2D-CFAR detection and TSS (Total Signal Strength) maps without CFAR detection.

## User Requirements
1. **Generate 3 maps when pressing interference detection button**: 
   - `iss_map_sparse` (complex, deferred)
   - `iss_map` (with 2D-CFAR detection) ✅ 
   - `TSS_map` (total signal strength without CFAR) ⚠️ ISSUE

2. **User interface**: Provide buttons to let users choose which map to display
3. **Priority**: Focus on ISS and TSS maps first, defer iss_map_sparse

## Current Implementation

### Backend Changes ✅
**File**: `/home/kenny/jam/backend/app/core/config.py`
- Added `TSS_MAP_IMAGE_PATH = OUTPUT_DIR / "tss_map.png"`

**File**: `/home/kenny/jam/backend/app/domains/simulation/services/sionna_service.py`
- Modified `generate_iss_map()` function to simultaneously generate both ISS and TSS maps
- Key changes:
  ```python
  # 同時生成 ISS 和 TSS 兩張地圖
  logger.info("同時生成 ISS 和 TSS 地圖可視化")
  
  # 準備 ISS 地圖數據和 CFAR 檢測
  iss_smooth = gaussian_filter(iss_dbm, sigma=gaussian_sigma)
  logger.info(f"生成 ISS 地圖 - 執行 2D-CFAR 檢測")
  
  # 準備 TSS 地圖數據 (不需要 CFAR 檢測)
  tss_smooth = gaussian_filter(TSS_dbm, sigma=gaussian_sigma)
  logger.info(f"生成 TSS 地圖 - 不執行 CFAR 檢測")
  ```

**File**: `/home/kenny/jam/backend/app/domains/simulation/api/simulation_api.py`
- Added new `/tss-map` endpoint:
  ```python
  @router.get("/tss-map")
  async def get_tss_map():
      """返回 TSS (Total Signal Strength) 地圖"""
      logger.info("--- API Request: /tss-map ---")
      try:
          return create_image_response(str(TSS_MAP_IMAGE_PATH), "tss_map.png")
      except Exception as e:
          logger.error(f"返回 TSS 地圖時出錯: {e}", exc_info=True)
          raise HTTPException(status_code=500, detail=f"返回 TSS 地圖時出錯: {str(e)}")
  ```

### Frontend Changes ✅
**File**: `/home/kenny/jam/frontend/src/config/apiRoutes.ts`
- Added: `getTSSMap: \`${API_BASE_URL}/simulations/tss-map\``

**File**: `/home/kenny/jam/frontend/src/components/viewers/ISSViewer.tsx`
- Added state management for dual maps:
  ```typescript
  const [tssImageUrl, setTssImageUrl] = useState<string | null>(null)
  const [currentMapType, setCurrentMapType] = useState<'iss' | 'tss'>('iss')
  ```
- Added map selection UI with buttons
- Implemented sequential loading: ISS first (generates both), then TSS
- Added proper resource cleanup for both image URLs

## Current Issue ❌
**Problem**: TSS map loading fails with timeout/404 errors

**Error Messages**:
```
TSS 地圖 API 請求失敗: 404 Not Found
API 請求錯誤: 沒有收到響應
timeout of 30000ms exceeded
```

**Root Cause Analysis**:
1. The ISS map generation (`generate_iss_map()`) is supposed to create both `iss_map.png` AND `tss_map.png`
2. The frontend sequentially calls:
   - `/api/v1/simulations/iss-map` (should generate both files)
   - `/api/v1/simulations/tss-map` (should just return the generated TSS file)
3. The TSS endpoint returns 404, suggesting the `tss_map.png` file is not being created

**Potential Issues**:
1. The `sionna_service.py` modification might not be correctly saving the TSS map file
2. The file path configuration might be incorrect
3. There might be an exception in the TSS map generation that's not being logged
4. The TSS map generation code might not be reached due to early return/exception

## Technical Architecture

### File Structure
```
backend/
├── app/
│   ├── core/config.py (TSS_MAP_IMAGE_PATH)
│   ├── domains/simulation/
│   │   ├── api/simulation_api.py (TSS endpoint)
│   │   └── services/sionna_service.py (dual map generation)
│   └── static/images/ (output directory)
│       ├── iss_map.png
│       └── tss_map.png (MISSING!)
frontend/
└── src/components/viewers/ISSViewer.tsx (UI + loading logic)
```

### API Flow
```
User clicks → ISS Viewer → loadMaps() →
1. POST /api/v1/simulations/iss-map (generates both ISS & TSS files)
2. GET /api/v1/simulations/tss-map (returns TSS file)
```

## Code References

### Key Functions
- `backend/app/domains/simulation/services/sionna_service.py:generate_iss_map()` - Should create both maps
- `backend/app/domains/simulation/api/simulation_api.py:get_iss_map()` - ISS endpoint (lines 209-329)
- `backend/app/domains/simulation/api/simulation_api.py:get_tss_map()` - TSS endpoint (lines 331-340)
- `frontend/src/components/viewers/ISSViewer.tsx:loadMaps()` - Frontend loading logic (lines 82-195)

### Map Generation Logic Location
The dual map generation should happen in `sionna_service.py` around the visualization section where matplotlib plots are created and saved.

## Possible Solutions to Investigate

1. **Debug TSS File Creation**: Check if `tss_map.png` is actually being created by adding logging
2. **Verify File Paths**: Ensure `TSS_MAP_IMAGE_PATH` points to correct location and has write permissions
3. **Exception Handling**: Check if TSS map generation code is throwing unhandled exceptions
4. **Alternative Architecture**: Instead of sequential loading, make ISS endpoint return both images or create a combined endpoint
5. **File Timing Issues**: The TSS request might be too fast after ISS generation; add delay or polling
6. **Async Issue**: The TSS file creation might not be completed when the endpoint is called

## Development Commands
```bash
make up                 # Start all services
make log-b              # Backend logs  
make log-f              # Frontend logs
cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
cd frontend && npm run dev
```

## Current Status
- ✅ ISS map generation and display working
- ✅ Map selection UI implemented and functional
- ❌ TSS map file creation/retrieval failing
- ⏸️ iss_map_sparse implementation deferred per user request

The main issue is that while the architecture is correct, the TSS map file is not being successfully created or retrieved, resulting in 404/timeout errors when the frontend tries to load it.