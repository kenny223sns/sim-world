"""
稀疏ISS地圖生成API路由

基於UAV實際軌跡生成稀疏干擾信號強度地圖
"""

import logging
import time
import os
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_async_session
from app.domains.simulation.services.sionna_service import generate_iss_map
from app.core.config import ISS_MAP_IMAGE_PATH, STATIC_IMAGES_DIR

logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/simulations", tags=["Sparse ISS Map Generation"])

class UAVTrackPoint(BaseModel):
    """UAV軌跡點位"""
    x: float  # 前端座標系統 x
    y: float  # 前端座標系統 y
    timestamp: Optional[float] = None

class SparseISSMapRequest(BaseModel):
    """稀疏ISS地圖生成請求"""
    scene: str
    uav_points: List[UAVTrackPoint]  # UAV軌跡點位
    cell_size: Optional[float] = 1.0
    map_width: Optional[int] = 512
    map_height: Optional[int] = 512
    altitude: Optional[float] = 40.0
    sparse_noise_std_db: Optional[float] = 0.5
    map_type: Optional[str] = "iss"  # "iss" or "tss"

class SparseISSMapResponse(BaseModel):
    """稀疏ISS地圖生成回應"""
    success: bool
    sparse_map_url: Optional[str] = None  # 稀疏ISS地圖圖像URL
    full_map_url: Optional[str] = None    # 完整ISS地圖圖像URL（用於對比）
    uav_points_count: int
    processing_time: Optional[float] = None
    error: Optional[str] = None

@router.post("/iss-map-sparse", response_model=SparseISSMapResponse)
async def generate_sparse_iss_map(
    request: SparseISSMapRequest,
    session: AsyncSession = Depends(get_async_session)
):
    """
    基於UAV軌跡生成稀疏干擾信號強度地圖
    
    接收UAV實際飛行軌跡點位，調用sionna_service生成稀疏ISS地圖
    """
    start_time = time.time()
    
    try:
        logger.info(f"開始生成稀疏ISS地圖: scene={request.scene}, uav_points={len(request.uav_points)}")
        
        if len(request.uav_points) == 0:
            raise HTTPException(
                status_code=400, 
                detail="UAV軌跡點位不能為空"
            )
        
        # 轉換UAV軌跡點位格式 
        uav_points_tuples = [(point.x, point.y) for point in request.uav_points]
        
        logger.info(f"轉換後的UAV軌跡點位: {len(uav_points_tuples)} 點")
        logger.info(f"前3個點位範例: {uav_points_tuples[:3]}")
        
        # 生成稀疏ISS地圖和完整ISS地圖
        sparse_output_path = os.path.join(STATIC_IMAGES_DIR, "iss_map_sparse.png")
        full_output_path = os.path.join(STATIC_IMAGES_DIR, "iss_map.png")
        
        # 調用sionna_service生成地圖
        success = await generate_iss_map(
            session=session,
            output_path=str(full_output_path),
            scene_name=request.scene,
            scene_size=float(max(request.map_width or 512, request.map_height or 512)),
            altitude=request.altitude or 40.0,
            cell_size=request.cell_size or 1.0,
            map_width=request.map_width or 512,
            map_height=request.map_height or 512,
            center_on="receiver",
            # 新增稀疏掃描參數
            uav_points=uav_points_tuples,
            num_random_samples=0,  # 不使用隨機取樣
            sparse_noise_std_db=request.sparse_noise_std_db or 0.5,
            sparse_first_then_full=True,
            sparse_output_path=str(sparse_output_path),
            map_type=request.map_type or "iss"
        )
        
        processing_time = time.time() - start_time
        
        if not success:
            raise HTTPException(
                status_code=500,
                detail="ISS地圖生成失敗"
            )
        
        # 檢查生成的檔案
        sparse_map_exists = os.path.exists(sparse_output_path)
        full_map_exists = os.path.exists(full_output_path)
        
        logger.info(f"檔案生成狀況: sparse={sparse_map_exists}, full={full_map_exists}")
        
        # 構建回應URL（相對於靜態檔案路徑）
        sparse_map_url = "/rendered_images/iss_map_sparse.png" if sparse_map_exists else None
        full_map_url = "/rendered_images/iss_map.png" if full_map_exists else None
        
        # 添加時間戳避免瀏覽器快取
        timestamp = int(time.time())
        if sparse_map_url:
            sparse_map_url += f"?t={timestamp}"
        if full_map_url:
            full_map_url += f"?t={timestamp}"
        
        logger.info(f"稀疏ISS地圖生成完成: 處理時間={processing_time:.2f}秒")
        logger.info(f"地圖URLs: sparse={sparse_map_url}, full={full_map_url}")
        
        return SparseISSMapResponse(
            success=True,
            sparse_map_url=sparse_map_url,
            full_map_url=full_map_url,
            uav_points_count=len(request.uav_points),
            processing_time=processing_time
        )
        
    except HTTPException:
        raise
    except Exception as e:
        processing_time = time.time() - start_time
        error_message = f"稀疏ISS地圖生成失敗: {str(e)}"
        logger.error(error_message, exc_info=True)
        
        return SparseISSMapResponse(
            success=False,
            uav_points_count=len(request.uav_points) if request.uav_points else 0,
            processing_time=processing_time,
            error=error_message
        )

# Export router
__all__ = ["router"]