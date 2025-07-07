from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_session
from app.domains.drone_tracking.services.drone_tracking_service import DroneTrackingService
from app.domains.drone_tracking.models.drone_tracking_model import (
    DroneTrackingMatrix,
    DroneTrackingExport,
    DroneTrackingStats,
)

router = APIRouter(prefix="/drone-tracking", tags=["Drone Tracking"])


class RecordPositionRequest(BaseModel):
    """Request model for recording drone position."""
    scene_name: str
    scene_x: float
    scene_y: float
    scene_z: float


class RecordPositionResponse(BaseModel):
    """Response model for recording drone position."""
    success: bool
    message: str


class ClearMatrixResponse(BaseModel):
    """Response model for clearing tracking matrix."""
    success: bool
    message: str


@router.post("/record-position", response_model=RecordPositionResponse)
async def record_drone_position(
    request: RecordPositionRequest,
    db: AsyncSession = Depends(get_session)
):
    """Record a drone position in the tracking matrix."""
    service = DroneTrackingService(db)
    
    success = await service.record_position(
        scene_name=request.scene_name,
        scene_x=request.scene_x,
        scene_y=request.scene_y,
        scene_z=request.scene_z
    )
    
    if success:
        return RecordPositionResponse(
            success=True,
            message=f"Position recorded for scene {request.scene_name}"
        )
    else:
        return RecordPositionResponse(
            success=False,
            message=f"Failed to record position for scene {request.scene_name}"
        )


@router.get("/matrix/{scene_name}", response_model=Optional[DroneTrackingMatrix])
async def get_tracking_matrix(
    scene_name: str,
    db: AsyncSession = Depends(get_session)
):
    """Get the current tracking matrix for a scene."""
    service = DroneTrackingService(db)
    
    matrix = await service.get_tracking_matrix(scene_name)
    if matrix is None:
        raise HTTPException(status_code=404, detail=f"No tracking data found for scene {scene_name}")
    
    return matrix


@router.delete("/matrix/{scene_name}", response_model=ClearMatrixResponse)
async def clear_tracking_matrix(
    scene_name: str,
    db: AsyncSession = Depends(get_session)
):
    """Clear the tracking matrix for a scene."""
    service = DroneTrackingService(db)
    
    success = await service.clear_tracking_matrix(scene_name)
    
    if success:
        return ClearMatrixResponse(
            success=True,
            message=f"Tracking matrix cleared for scene {scene_name}"
        )
    else:
        return ClearMatrixResponse(
            success=False,
            message=f"Failed to clear tracking matrix for scene {scene_name}"
        )


@router.get("/export/{scene_name}", response_model=Optional[DroneTrackingExport])
async def export_tracking_data(
    scene_name: str,
    export_format: str = Query(default="json", description="Export format: json, csv, numpy"),
    db: AsyncSession = Depends(get_session)
):
    """Export tracking data for a scene."""
    service = DroneTrackingService(db)
    
    export_data = await service.export_tracking_data(scene_name, export_format)
    if export_data is None:
        raise HTTPException(status_code=404, detail=f"No tracking data found for scene {scene_name}")
    
    return export_data


@router.get("/stats/{scene_name}", response_model=Optional[DroneTrackingStats])
async def get_tracking_stats(
    scene_name: str,
    db: AsyncSession = Depends(get_session)
):
    """Get tracking statistics for a scene."""
    service = DroneTrackingService(db)
    
    stats = await service.get_tracking_stats(scene_name)
    if stats is None:
        raise HTTPException(status_code=404, detail=f"No tracking data found for scene {scene_name}")
    
    return stats


@router.get("/scenes", response_model=list[str])
async def get_available_scenes():
    """Get list of available scenes for tracking."""
    return ["nycu", "lotus", "ntpu", "nanliao"]
