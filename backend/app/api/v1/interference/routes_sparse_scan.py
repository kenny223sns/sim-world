"""
UAV sparse ISS sampling API

Provides endpoints for UAV sparse sampling of interference signal strength (ISS) maps
"""

import logging
import numpy as np
import os
from typing import Dict, List, Any, Optional
from fastapi import APIRouter, HTTPException, Query, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_async_session
from app.domains.simulation.services.sionna_service import generate_iss_map
from app.core.config import ISS_MAP_IMAGE_PATH

logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/interference", tags=["Sparse ISS Sampling"])


def snake_indices(h: int, w: int, step_y: int = 4, step_x: int = 4):
    """Generate snake-path indices for sparse sampling"""
    for y in range(0, h, step_y):
        rng = range(0, w, step_x) if (y // step_y) % 2 == 0 else range(w - 1, -1, -step_x)
        for x in rng:
            yield y, x


@router.get("/sparse-scan")
async def get_sparse_scan(
    scene: str = Query(description="Scene name (e.g., 'Nanliao')"),
    step_y: int = Query(default=4, description="Y-axis sampling step size"),
    step_x: int = Query(default=4, description="X-axis sampling step size"),
    cell_size: Optional[float] = Query(None, gt=0.1, lt=20.0, description="Map resolution (meters/pixel)"),
    map_width: Optional[int] = Query(None, gt=64, lt=8192, description="Map width (pixels)"),
    map_height: Optional[int] = Query(None, gt=64, lt=8192, description="Map height (pixels)"),
    use_real_iss: bool = Query(default=False, description="Use real ISS map from database devices"),
    session: AsyncSession = Depends(get_async_session)
):
    """
    Get sparse UAV sampling data for ISS visualization
    
    Loads the full ISS map and coordinate axes from .npy files and generates
    snake-path sampling indices based on the specified step sizes.
    
    Returns JSON with sampling points including coordinates and ISS values.
    """
    try:
        logger.info(f"Sparse scan request: scene={scene}, step_y={step_y}, step_x={step_x}, cell_size={cell_size}, map_size={map_width}x{map_height}")
        
        # Construct data file paths
        data_dir = f"/data/{scene}"
        iss_path = os.path.join(data_dir, "iss_map.npy")
        x_axis_path = os.path.join(data_dir, "x_axis.npy")
        y_axis_path = os.path.join(data_dir, "y_axis.npy")
        
        # Check if files exist
        if not all(os.path.exists(path) for path in [iss_path, x_axis_path, y_axis_path]):
            # For development - create sample data if files don't exist
            logger.warning(f"Data files not found for scene {scene}, creating sample data")
            return create_sample_sparse_scan_data(
                step_y, step_x, 
                cell_size_override=cell_size,
                map_size_override=(map_width, map_height) if map_width and map_height else None
            )
        
        # Load data
        iss_map = np.load(iss_path)
        x_axis = np.load(x_axis_path)
        y_axis = np.load(y_axis_path)
        
        # Apply custom map parameters if provided
        if cell_size is not None or (map_width is not None and map_height is not None):
            original_height, original_width = iss_map.shape
            original_cell_size = float(x_axis[1] - x_axis[0]) if len(x_axis) > 1 else 1.0
            
            # Use override values or keep original
            new_cell_size = cell_size if cell_size is not None else original_cell_size
            new_width = map_width if map_width is not None else original_width
            new_height = map_height if map_height is not None else original_height
            
            logger.info(f"Resampling map from {original_width}x{original_height} (cell:{original_cell_size:.2f}) to {new_width}x{new_height} (cell:{new_cell_size:.2f})")
            
            # Calculate physical coverage area
            original_x_range = x_axis[-1] - x_axis[0]
            original_y_range = y_axis[-1] - y_axis[0]
            
            # Create new coordinate axes with requested resolution
            x_start = x_axis[0]
            y_start = y_axis[0]
            x_end = x_start + new_width * new_cell_size
            y_end = y_start + new_height * new_cell_size
            
            x_axis = np.linspace(x_start, x_end, new_width)
            y_axis = np.linspace(y_start, y_end, new_height)
            
            # Resample ISS map using nearest neighbor interpolation
            from scipy.interpolate import RegularGridInterpolator
            
            # Create interpolator from original data
            orig_x = np.load(x_axis_path)
            orig_y = np.load(y_axis_path)
            interpolator = RegularGridInterpolator(
                (orig_y, orig_x), iss_map, 
                method='nearest', bounds_error=False, fill_value=0
            )
            
            # Create new grid points
            new_y_grid, new_x_grid = np.meshgrid(y_axis, x_axis, indexing='ij')
            grid_points = np.stack([new_y_grid.ravel(), new_x_grid.ravel()], axis=-1)
            
            # Interpolate ISS values
            iss_map = interpolator(grid_points).reshape(new_height, new_width)
        
        height, width = iss_map.shape
        
        # Generate snake-path sampling points
        points = []
        for i, j in snake_indices(height, width, step_y, step_x):
            if i < height and j < width:  # Bounds check
                x_m = float(x_axis[j])
                y_m = float(y_axis[i])
                iss_dbm = float(iss_map[i, j])
                
                points.append({
                    "i": i,
                    "j": j,
                    "x_m": x_m,
                    "y_m": y_m,
                    "iss_dbm": iss_dbm
                })
        
        # Add debug info for coordinate system verification
        debug_info = {
            "grid_shape": (height, width),
            "x_range": (float(x_axis[0]), float(x_axis[-1])),
            "y_range": (float(y_axis[0]), float(y_axis[-1])),
            "cell_size_inferred": float(x_axis[1] - x_axis[0]) if len(x_axis) > 1 else "unknown"
        }
        
        logger.info(f"DEBUG sparse-scan:")
        logger.info(f"  grid: {debug_info['grid_shape']}")
        logger.info(f"  x_range: {debug_info['x_range']}")  
        logger.info(f"  y_range: {debug_info['y_range']}")
        logger.info(f"  cell_size: {debug_info['cell_size_inferred']}")
        logger.info(f"  first 3 points: {[(p['x_m'], p['y_m']) for p in points[:3]]}")

        return {
            "success": True,
            "height": height,
            "width": width,
            "x_axis": x_axis.tolist(),
            "y_axis": y_axis.tolist(),
            "points": points,
            "total_points": len(points),
            "step_x": step_x,
            "step_y": step_y,
            "scene": scene,
            "debug_info": debug_info
        }
        
    except Exception as e:
        logger.error(f"Sparse scan API failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Sparse scan failed: {str(e)}")


def create_sample_sparse_scan_data(
    step_y: int = 4, 
    step_x: int = 4,
    cell_size_override: Optional[float] = None,
    map_size_override: Optional[tuple[int, int]] = None
) -> Dict[str, Any]:
    """Create sample data for development/testing - matching backend ISS map parameters"""
    # Use override parameters if provided, otherwise use defaults
    height, width = map_size_override if map_size_override else (512, 512)
    cell_size = cell_size_override if cell_size_override else 1.0  # Changed default to match ISS map
    
    # Create coordinate axes matching backend RadioMapSolver
    # Total size = 512 * 4 = 2048m, centered at [0,0]
    x_start = -width * cell_size / 2   # -1024m 
    x_end = width * cell_size / 2      # +1024m
    y_start = -height * cell_size / 2  # -1024m  
    y_end = height * cell_size / 2     # +1024m
    
    x_axis = np.linspace(x_start, x_end, width)
    y_axis = np.linspace(y_start, y_end, height)
    
    # Create sample ISS map with some interesting patterns
    X, Y = np.meshgrid(x_axis, y_axis)
    
    # Create interference pattern with multiple sources
    iss_map = np.zeros((height, width))
    
    # Add interference sources at different locations (matching typical TX positions)
    # Convert real-world positions to grid indices
    # Example: jammer at (-50, 60) meters -> find corresponding grid indices  
    def world_to_grid(x_m, y_m):
        j = int((x_m - x_start) / cell_size)
        i = int((y_m - y_start) / cell_size) 
        return max(0, min(height-1, i)), max(0, min(width-1, j))
    
    # Real device positions matching database (from lifespan.py)
    device_positions_world = [
        # Jammers (干擾器)
        (100, 60, 40),   # jam1: [100, 60, 40] - 右上角
        (-30, 53, 40),   # jam2: [-30, 53, 67] - 左上角 (使用40高度統一)
        (-105, -31, 40), # jam3: [-105, -31, 64] - 左下角
        # TX stations (發射器) - 較低功率
        (-110, -110, 30), # tx0: [-110, -110, 40] - 左下角遠處
        (-106, 56, 30),   # tx1: [-106, 56, 61] - 左上角
        (100, -30, 30),   # tx2: [100, -30, 40] - 右下角
    ]
    
    sources = []
    for x_m, y_m, power in device_positions_world:
        i, j = world_to_grid(x_m, y_m)
        sources.append((i, j, power))
    
    for src_i, src_j, power in sources:
        # Gaussian-like interference pattern
        dist_sq = (np.arange(height)[:, None] - src_i)**2 + (np.arange(width)[None, :] - src_j)**2
        iss_map += power * np.exp(-dist_sq / 200)
    
    # Add some noise
    iss_map += np.random.normal(0, 2, (height, width))
    
    # Generate snake-path sampling points
    points = []
    for i, j in snake_indices(height, width, step_y, step_x):
        if i < height and j < width:
            x_m = float(x_axis[j])
            y_m = float(y_axis[i])
            iss_dbm = float(iss_map[i, j])
            
            points.append({
                "i": i,
                "j": j,
                "x_m": x_m,
                "y_m": y_m,
                "iss_dbm": iss_dbm
            })
    
    # Add debug info for coordinate system verification  
    debug_info = {
        "grid_shape": (height, width),
        "x_range": (float(x_axis[0]), float(x_axis[-1])),
        "y_range": (float(y_axis[0]), float(y_axis[-1])),
        "cell_size_inferred": float(x_axis[1] - x_axis[0]) if len(x_axis) > 1 else "unknown",
        "sample_device_positions": device_positions_world
    }
    
    logger.info(f"DEBUG sample sparse-scan:")
    logger.info(f"  grid: {debug_info['grid_shape']}")
    logger.info(f"  x_range: {debug_info['x_range']}")  
    logger.info(f"  y_range: {debug_info['y_range']}")
    logger.info(f"  cell_size: {debug_info['cell_size_inferred']}")
    logger.info(f"  device positions: {device_positions_world}")
    logger.info(f"  first 3 points: {[(p['x_m'], p['y_m']) for p in points[:3]]}")
    
    return {
        "success": True,
        "height": height,
        "width": width,
        "x_axis": x_axis.tolist(),
        "y_axis": y_axis.tolist(),
        "points": points,
        "total_points": len(points),
        "step_x": step_x,
        "step_y": step_y,
        "scene": "sample_data",
        "note": "Using sample data matching backend ISS map parameters",
        "debug_info": debug_info
    }


# Export router
__all__ = ["router"]