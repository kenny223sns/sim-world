# SimWorld - 5G NTN 衛星通信模擬系統

SimWorld 是一個專為 5G 非地面網路 (NTN) 設計的衛星通信模擬與干擾分析系統，整合了設備管理、衛星軌道計算、干擾模擬和 AI 抗干擾等功能。

## 🚀 快速開始

### 啟動系統
```bash
# 構建並啟動所有服務
make up

# 或者使用 Docker Compose
docker compose up -d
```

### 訪問地址
- **前端 UI**: http://localhost:5173
- **後端 API**: http://localhost:8888
- **API 文檔**: http://localhost:8888/docs

## 🏗 系統架構

### 技術棧
- **後端**: Python 3.11 + FastAPI + PostgreSQL + PostGIS
- **前端**: React 19 + TypeScript + Vite + Three.js
- **模擬引擎**: Sionna/Sionna-RT (GPU 加速)
- **軌道計算**: Skyfield
- **容器化**: Docker + Docker Compose

## 📁 專案結構

```
sim-world/
├── backend/                    # 後端 FastAPI 應用
├── frontend/                   # 前端 React 應用
├── docker-compose.yml         # Docker 服務編排
├── Makefile                   # 構建與部署指令
└── README.md                  # 專案說明文件
```

---

## 🔧 後端架構 (FastAPI)

### 📂 檔案結構
```
backend/
├── app/
│   ├── main.py                 # 應用入口點
│   ├── core/
│   │   └── config.py          # 全域配置管理
│   ├── db/                    # 資料庫層
│   │   ├── database.py        # 資料庫連接
│   │   ├── session.py         # Session 管理
│   │   └── lifespan.py        # 應用生命週期
│   ├── api/
│   │   └── v1/
│   │       ├── router.py      # API 路由聚合
│   │       └── api.py         # API 端點管理
│   ├── domains/               # 領域驅動設計
│   │   ├── device/           # 設備管理領域
│   │   ├── satellite/        # 衛星管理領域
│   │   ├── simulation/       # 模擬領域
│   │   ├── interference/     # 干擾領域
│   │   ├── wireless/         # 無線通道領域
│   │   └── coordinates/      # 座標轉換領域
│   ├── models/               # 共用資料模型
│   ├── services/             # 共用服務
│   └── static/               # 靜態資源
│       ├── images/           # 生成的圖片
│       ├── models/           # 3D 模型
│       └── scenes/           # 場景資料
├── requirements.txt          # Python 依賴
├── Dockerfile               # Docker 配置
└── gp.php                   # PHP 腳本 (遺留)
```

### 🌐 API 端點總覽

#### 設備管理 (`/api/v1/devices/`)
- `GET /` - 獲取設備列表 (支援角色過濾)
- `POST /` - 創建新設備
- `GET /{id}` - 獲取設備詳情
- `PUT /{id}` - 更新設備資訊
- `DELETE /{id}` - 刪除設備

#### 衛星管理 (`/api/v1/satellites/`)
- `GET /` - 獲取衛星列表
- `POST /{id}/update-tle` - 更新 TLE 數據
- `POST /{id}/orbit` - 計算軌道傳播
- `POST /{id}/passes` - 計算衛星過境
- `POST /{id}/position` - 獲取當前位置
- `POST /{id}/visibility` - 計算可見性

#### 模擬管理 (`/api/v1/simulations/`)
- `GET /scene-image` - 生成場景圖像
- `GET /cfr-plot` - 生成通道頻率響應圖
- `GET /sinr-map` - 生成 SINR 地圖
- `GET /doppler-plots` - 生成延遲多普勒圖
- `GET /channel-response` - 生成通道響應圖

#### 干擾模擬 (`/api/v1/interference/`)
- `POST /simulate` - 執行干擾模擬
- `POST /ai-ran/control` - AI-RAN 抗干擾控制
- `POST /scenario/create` - 創建干擾場景
- `GET /jammers/active` - 獲取活躍干擾源

#### 無線通道 (`/api/v1/wireless/`)
- `POST /simulate` - Sionna 通道模擬
- `POST /channel-to-ran` - 通道響應轉 RAN 參數
- `POST /satellite-ntn-simulation` - 衛星 NTN 模擬

#### 座標轉換 (`/api/v1/coordinates/`)
- `POST /geo-to-cartesian` - 地理座標轉笛卡爾座標
- `POST /cartesian-to-geo` - 笛卡爾座標轉地理座標
- `POST /bearing-distance` - 計算方位角和距離

### 🎯 核心服務

#### DeviceService - 設備業務邏輯
- 設備 CRUD 操作
- 角色管理 (發射器/接收器/干擾源)
- 系統完整性檢查
- 名稱唯一性驗證

#### OrbitService - 軌道計算
- TLE 數據解析和軌道傳播
- 衛星位置計算 (基於 Skyfield)
- 可見性分析
- 過境預測

#### SionnaService - 物理層模擬
- GPU 加速無線通道模擬
- 3D 射線追蹤計算
- CFR/SINR/多普勒圖生成
- 場景渲染和可視化

#### InterferenceSimulationService - 干擾模擬
- 多類型干擾源模擬 (寬帶噪聲、掃頻、智能干擾)
- 干擾場景管理
- 性能指標收集

#### AIRANService - AI 抗干擾
- 深度強化學習 (DQN) 決策
- 毫秒級頻率跳變
- 自適應波束成形
- 動態功率控制

#### CQRSSatelliteService - CQRS 衛星服務
- 讀寫分離架構
- 事件源模式
- 多層快取優化
- 異步處理

---

## 🎨 前端架構 (React)

### 📂 檔案結構
```
frontend/
├── src/
│   ├── main.tsx              # React 應用入口
│   ├── App.tsx               # 主應用組件
│   ├── components/           # 組件庫
│   │   ├── layout/          # 佈局組件
│   │   │   ├── Layout.tsx   # 主佈局容器
│   │   │   ├── Navbar.tsx   # 頂部導航欄
│   │   │   └── Sidebar.tsx  # 側邊欄
│   │   ├── scenes/          # 場景組件
│   │   │   ├── MainScene.tsx        # 主場景容器
│   │   │   ├── StereogramView.tsx   # 3D 立體視圖
│   │   │   ├── FloorView.tsx        # 2D 平面視圖
│   │   │   ├── UAVFlight.tsx        # UAV 飛行控制
│   │   │   └── satellite/           # 衛星相關組件
│   │   ├── devices/         # 設備組件
│   │   │   ├── DeviceItem.tsx       # 設備項目
│   │   │   ├── DevicePopover.tsx    # 設備懸浮窗
│   │   │   └── OrientationInput.tsx # 方向輸入
│   │   ├── dashboard/       # 儀表盤組件
│   │   │   ├── DataVisualizationDashboard.tsx
│   │   │   ├── NTNStackDashboard.tsx
│   │   │   └── charts/      # 圖表組件
│   │   ├── viewers/         # 查看器組件
│   │   │   ├── CFRViewer.tsx         # 通道頻率響應
│   │   │   ├── SINRViewer.tsx        # 信噪比查看器
│   │   │   └── DelayDopplerViewer.tsx # 延遲多普勒
│   │   └── ui/              # UI 組件
│   │       ├── ErrorBoundary.tsx     # 錯誤邊界
│   │       ├── Starfield.tsx         # 星場效果
│   │       └── CoordinateDisplay.tsx # 座標顯示
│   ├── services/            # API 服務層
│   │   ├── api.ts          # Axios 配置
│   │   ├── deviceApi.ts    # 設備 API
│   │   ├── simulationApi.ts # 模擬 API
│   │   ├── satelliteApi.ts # 衛星 API
│   │   └── index.ts        # 服務統一導出
│   ├── hooks/              # 自定義 Hook
│   │   ├── useDevices.ts   # 設備狀態管理
│   │   ├── useWebSocket.ts # WebSocket 連接
│   │   ├── useReceiverSelection.ts # 接收器選擇
│   │   └── useManualControl.ts # 手動控制
│   ├── types/              # TypeScript 類型
│   │   ├── device.ts       # 設備類型
│   │   ├── satellite.ts    # 衛星類型
│   │   ├── charts.ts       # 圖表類型
│   │   └── viewer.ts       # 查看器類型
│   ├── utils/              # 工具函數
│   │   ├── deviceUtils.ts  # 設備工具
│   │   ├── coordinate.ts   # 座標轉換
│   │   └── satellite/      # 衛星工具
│   ├── styles/             # SCSS 樣式
│   │   ├── index.scss      # 全域樣式
│   │   ├── App.scss        # 應用樣式
│   │   ├── Layout.scss     # 佈局樣式
│   │   └── Dashboard.scss  # 儀表盤樣式
│   └── config/             # 配置文件
│       └── apiRoutes.ts    # API 路由配置
├── package.json           # 依賴管理
├── vite.config.ts        # Vite 配置
├── tsconfig.json         # TypeScript 配置
└── Dockerfile            # Docker 配置
```

### 🎯 核心組件功能

#### App.tsx - 主應用組件
- 統一狀態管理中心
- 支援兩種視圖模式：3DRT (立體圖) 和 2DRT (平面圖)
- 設備、衛星、UAV 控制協調
- 錯誤邊界保護

#### Layout 組件
- **Layout.tsx**: 主佈局容器，管理側邊欄收縮/展開
- **Navbar.tsx**: 頂部導航，提供組件切換功能
- **Sidebar.tsx**: 側邊欄，設備管理、UAV 控制、衛星設定

#### Scenes 組件
- **StereogramView.tsx**: 3D 立體視圖，使用 Three.js 渲染
- **FloorView.tsx**: 2D 平面視圖，SVG 渲染
- **UAVFlight.tsx**: UAV 飛行控制和動畫
- **SatelliteManager.tsx**: 衛星管理和顯示

#### 儀表盤組件
- **DataVisualizationDashboard.tsx**: 數據可視化主儀表盤
- **SystemStatusChart.tsx**: 系統狀態圖表
- **UAVMetricsChart.tsx**: UAV 指標圖表
- **NetworkTopologyChart.tsx**: 網路拓撲圖表

### 🔗 API 服務整合

#### API 配置 (services/api.ts)
```typescript
const api = axios.create({
  baseURL: '', // 使用相對路徑
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
});
```

#### API 路由管理 (config/apiRoutes.ts)
```typescript
export const ApiRoutes = {
  devices: {
    getAll: '/api/v1/devices/',
    create: '/api/v1/devices/',
    update: (id) => `/api/v1/devices/${id}`
  },
  simulations: {
    getCFRMap: '/api/v1/simulations/cfr-plot',
    getSINRMap: '/api/v1/simulations/sinr-map'
  }
};
```

#### 狀態管理 (hooks/useDevices.ts)
```typescript
export const useDevices = () => {
  const [tempDevices, setTempDevices] = useState<Device[]>([]);
  const [originalDevices, setOriginalDevices] = useState<Device[]>([]);
  // 設備 CRUD 操作
  // 樂觀更新機制
  // 錯誤處理和回滾
};
```

---

## 🔄 前後端通信機制

### HTTP API 通信流程
```
前端組件 → useDevices Hook → deviceApi.ts → api.ts → 後端 API
```

### 狀態同步策略
```
原始數據 (originalDevices) ↔ 臨時數據 (tempDevices) ↔ UI 組件
                            ↓
                    API 同步 (applyChanges)
```

### 錯誤處理層級
1. **API 層**: Axios 攔截器統一錯誤處理
2. **Hook 層**: try-catch + 狀態標記
3. **組件層**: ErrorBoundary 保護
4. **用戶層**: 友好錯誤提示

---

## 🚀 開發指南

### 新增後端 API 端點

1. **創建領域結構**
```python
# domains/new_domain/
├── api/new_domain_api.py      # API 端點
├── models/new_domain_model.py # 資料模型
├── services/new_domain_service.py # 業務邏輯
└── interfaces/repository.py   # Repository 接口
```

2. **註冊路由**
```python
# api/v1/router.py
from app.domains.new_domain.api.new_domain_api import router as new_domain_router
api_router.include_router(new_domain_router, prefix="/new-domain")
```

### 新增前端功能

1. **更新 API 路由配置**
```typescript
// config/apiRoutes.ts
export const ApiRoutes = {
  newFeature: {
    base: '/api/v1/new-feature',
    getAll: '/api/v1/new-feature/',
    create: '/api/v1/new-feature/'
  }
};
```

2. **創建 API 服務**
```typescript
// services/newFeatureApi.ts
export const getNewFeatureData = async () => {
  return await api.get(ApiRoutes.newFeature.getAll);
};
```

3. **創建自定義 Hook**
```typescript
// hooks/useNewFeature.ts
export const useNewFeature = () => {
  const [data, setData] = useState([]);
  // 狀態管理邏輯
  return { data, loading, error };
};
```

4. **創建組件**
```typescript
// components/new-feature/NewFeature.tsx
export const NewFeature: React.FC = () => {
  const { data, loading } = useNewFeature();
  return <div>新功能內容</div>;
};
```

---

## 🛠 部署與維護

### 本地開發
```bash
# 啟動後端
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 啟動前端
cd frontend
npm install
npm run dev
```

### Docker 部署
```bash
# 構建並啟動
make up

# 停止服務
make down

# 清理資源
make clean
```

### 環境變數配置
```bash
# .env 文件
POSTGRES_USER=user
POSTGRES_PASSWORD=password
POSTGRES_DB=appdb
CUDA_VISIBLE_DEVICES=-1  # CPU 模式
```

---

## 📊 系統功能特色

### 🛰 衛星軌道計算
- 基於 Skyfield 的高精度軌道計算
- 支援 TLE 數據更新和軌道傳播
- 衛星可見性分析和過境預測

### 📡 無線通道模擬
- 基於 Sionna 的 GPU 加速物理層模擬
- 3D 射線追蹤和場景渲染
- CFR、SINR、多普勒圖生成

### 🔀 干擾分析與抗干擾
- 多類型干擾源模擬
- AI-RAN 深度強化學習抗干擾
- 毫秒級頻率跳變決策

### 🎮 3D 可視化
- Three.js 3D 場景渲染
- 支援多個真實場景 (NYCU、NTPU、南寮等)
- UAV 飛行控制和即時軌跡顯示

### 📈 實時監控
- 系統性能指標監控
- 網路拓撲可視化
- 即時數據圖表展示

---

## 🤝 貢獻指南

1. Fork 專案
2. 創建功能分支 (`git checkout -b feature/new-feature`)
3. 提交更改 (`git commit -m 'Add new feature'`)
4. 推送到分支 (`git push origin feature/new-feature`)
5. 創建 Pull Request

## 📄 授權

本專案採用 MIT 授權條款 - 詳見 [LICENSE](LICENSE) 文件

---

## 🆘 常見問題

### 無法啟動服務
- 檢查 Docker 是否正常運行
- 確認埠號 5173 和 8888 未被占用
- 檢查 `.env` 檔案配置

### GPU 加速不工作
- 確認 `CUDA_VISIBLE_DEVICES` 環境變數設定
- 檢查 CUDA 和 cuDNN 版本相容性
- 查看 Docker GPU 支援配置

### API 連接失敗
- 檢查後端服務是否啟動
- 確認 API 路由配置正確
- 查看瀏覽器網路開發者工具

---

**SimWorld** - 打造下一代衛星通信模擬平台 🚀# jam
