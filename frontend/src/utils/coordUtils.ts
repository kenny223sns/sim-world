/**
 * 統一座標映射工具 - 解決世界座標與影像格點轉換不一致問題
 * 
 * 處理4種座標系：
 * - ISS map array: i=row, j=col, 左上原點, index (px)
 * - 後端世界: x (東), y (北), 場景中心或0,0, 公尺 (m)
 * - Canvas 2D: CSS left/top, 左上原點, % of div
 * - three.js: x (東), z (北), y↑, 中心 (0,0,0), 公尺 (m)
 */

/** 後端回傳資料結構 */
export interface SparseScanResponse {
  width: number;
  height: number;
  x_axis: number[];  // len = width, 單調遞增 (m)
  y_axis: number[];  // len = height, 單調遞增 (m)
  points: Array<{
    i: number;
    j: number;
    x_m: number;
    y_m: number;
    iss_dbm: number;
  }>;
  total_points: number;
  step_x: number;
  step_y: number;
  scene: string;
}

/**
 * 將世界座標 (m) 轉成 (row,col) index
 * @param x 世界座標X (東向, 公尺)
 * @param y 世界座標Y (北向, 公尺)
 * @param xs x_axis數組 (公尺)
 * @param ys y_axis數組 (公尺)
 * @returns [row_index, col_index]
 */
export function worldToIdx(
  x: number, 
  y: number,
  xs: number[], 
  ys: number[]
): [number, number] {
  // 使用二分搜尋找最近的index
  const findClosestIndex = (arr: number[], val: number): number => {
    let left = 0, right = arr.length - 1;
    let closest = 0;
    let minDiff = Math.abs(arr[0] - val);
    
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const diff = Math.abs(arr[mid] - val);
      
      if (diff < minDiff) {
        minDiff = diff;
        closest = mid;
      }
      
      if (arr[mid] < val) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    
    return closest;
  };

  const j = findClosestIndex(xs, x);
  const i = findClosestIndex(ys, y);
  
  // 確保index在有效範圍內
  const clampedI = Math.max(0, Math.min(ys.length - 1, i));
  const clampedJ = Math.max(0, Math.min(xs.length - 1, j));
  
  return [clampedI, clampedJ];
}

/**
 * 將 (row,col) 轉公尺世界座標 ⇢ 用於 three.js UAV
 * @param i row index
 * @param j col index
 * @param xs x_axis數組 (公尺)
 * @param ys y_axis數組 (公尺)
 * @returns [world_x, world_y] 世界座標 (公尺)
 */
export function idxToWorld(
  i: number, 
  j: number,
  xs: number[], 
  ys: number[]
): [number, number] {
  const clampedI = Math.max(0, Math.min(ys.length - 1, i));
  const clampedJ = Math.max(0, Math.min(xs.length - 1, j));
  
  return [xs[clampedJ], ys[clampedI]];
}

/**
 * 將 (row,col) 轉 Canvas 百分比 (左上為 0,0)
 * @param i row index  
 * @param j col index
 * @param H grid height
 * @param W grid width
 * @returns [left_percent, top_percent] Canvas百分比位置
 */
export function idxToCanvasPct(
  i: number, 
  j: number,
  H: number, 
  W: number
): [number, number] {
  // 使用格子中心點，加0.5避免邊界問題
  const leftPct = (j + 0.5) / W * 100;
  const topPct = (i + 0.5) / H * 100;
  
  return [leftPct, topPct];
}

/**
 * 將世界座標直接轉為Canvas百分比 (組合函數)
 * @param x 世界座標X (公尺)
 * @param y 世界座標Y (公尺)
 * @param scanData sparse scan回應數據
 * @returns [left_percent, top_percent] Canvas百分比位置
 */
export function worldToCanvasPct(
  x: number,
  y: number, 
  scanData: SparseScanResponse
): [number, number] {
  const [i, j] = worldToIdx(x, y, scanData.x_axis, scanData.y_axis);
  return idxToCanvasPct(i, j, scanData.height, scanData.width);
}

/**
 * 將世界座標轉為three.js座標
 * @param x 世界座標X (東向, 公尺)
 * @param y 世界座標Y (北向, 公尺) 
 * @param z 世界座標Z (高度, 公尺)
 * @param scale 縮放係數 (默認1.0)
 * @returns [three_x, three_y, three_z] three.js座標
 */
export function worldToThreeJS(
  x: number,
  y: number,
  z: number = 40,
  scale: number = 1.0
): [number, number, number] {
  // three.js座標系: x(東), y(高度), z(北)
  return [x * scale, z * scale, y * scale];
}

/**
 * Debug工具：檢查座標轉換是否正確
 * @param worldPos 世界座標 [x, y]
 * @param scanData sparse scan數據
 * @returns 轉換結果和debug資訊
 */
export function debugCoordTransform(
  worldPos: [number, number],
  scanData: SparseScanResponse
) {
  const [x, y] = worldPos;
  const [i, j] = worldToIdx(x, y, scanData.x_axis, scanData.y_axis);
  const [backX, backY] = idxToWorld(i, j, scanData.x_axis, scanData.y_axis);
  const [leftPct, topPct] = idxToCanvasPct(i, j, scanData.height, scanData.width);
  const [threeX, threeY, threeZ] = worldToThreeJS(x, y, 40);
  
  return {
    input: { x, y },
    gridIndex: { i, j },
    reconstructed: { x: backX, y: backY },
    canvasPercent: { left: leftPct, top: topPct },
    threeJS: { x: threeX, y: threeY, z: threeZ },
    error: Math.sqrt((x - backX) ** 2 + (y - backY) ** 2),
    bounds: {
      xRange: [scanData.x_axis[0], scanData.x_axis[scanData.x_axis.length - 1]],
      yRange: [scanData.y_axis[0], scanData.y_axis[scanData.y_axis.length - 1]],
      inBounds: x >= scanData.x_axis[0] && x <= scanData.x_axis[scanData.x_axis.length - 1] &&
                y >= scanData.y_axis[0] && y <= scanData.y_axis[scanData.y_axis.length - 1]
    }
  };
}

/**
 * 獲取座標軸方向信息
 * @param scanData sparse scan數據
 * @returns 座標軸方向資訊
 */
export function getAxisInfo(scanData: SparseScanResponse) {
  const xIncreasing = scanData.x_axis[scanData.x_axis.length - 1] > scanData.x_axis[0];
  const yIncreasing = scanData.y_axis[scanData.y_axis.length - 1] > scanData.y_axis[0];
  
  return {
    xIncreasing,
    yIncreasing,
    xRange: [scanData.x_axis[0], scanData.x_axis[scanData.x_axis.length - 1]],
    yRange: [scanData.y_axis[0], scanData.y_axis[scanData.y_axis.length - 1]],
    cellSizeX: scanData.x_axis.length > 1 ? scanData.x_axis[1] - scanData.x_axis[0] : 0,
    cellSizeY: scanData.y_axis.length > 1 ? scanData.y_axis[1] - scanData.y_axis[0] : 0,
  };
}