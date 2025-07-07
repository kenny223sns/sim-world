from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from sqlmodel import SQLModel, Field as SQLField
from datetime import datetime
import numpy as np
import json


class DronePosition(BaseModel):
    """Drone position model for tracking movement."""
    
    scene_x: float = Field(..., description="Scene X coordinate")
    scene_y: float = Field(..., description="Scene Y coordinate")
    scene_z: float = Field(..., description="Scene Z coordinate (altitude)")
    timestamp: datetime = Field(..., description="Timestamp of position")
    scene_name: str = Field(..., description="Scene name (e.g., 'nycu', 'lotus')")


class DroneTrackingMatrix(BaseModel):
    """Drone tracking matrix model for storing visited positions."""
    
    scene_name: str = Field(..., description="Scene name")
    matrix_size: int = Field(..., description="Matrix size (e.g., 128 for 128x128)")
    resolution: float = Field(..., description="Resolution in meters per cell")
    matrix: List[List[int]] = Field(..., description="2D matrix with 1 for visited, 0 for not visited")
    bounds: Dict[str, float] = Field(..., description="Matrix bounds: min_x, max_x, min_y, max_y")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")


class DroneTrackingSession(SQLModel, table=True):
    """Database model for drone tracking sessions."""
    
    __tablename__ = "drone_tracking_sessions"
    
    id: int = SQLField(primary_key=True, default=None)
    scene_name: str = SQLField(index=True)
    matrix_size: int = SQLField(default=128)
    resolution: float = SQLField(default=1.0)
    matrix_data: str = SQLField(description="JSON serialized matrix data")
    bounds_data: str = SQLField(description="JSON serialized bounds data")
    position_count: int = SQLField(default=0)
    created_at: datetime = SQLField(default_factory=datetime.utcnow)
    updated_at: datetime = SQLField(default_factory=datetime.utcnow)
    
    def get_matrix(self) -> List[List[int]]:
        """Get matrix data from JSON string."""
        return json.loads(self.matrix_data)
    
    def set_matrix(self, matrix: List[List[int]]) -> None:
        """Set matrix data as JSON string."""
        self.matrix_data = json.dumps(matrix)
    
    def get_bounds(self) -> Dict[str, float]:
        """Get bounds data from JSON string."""
        return json.loads(self.bounds_data)
    
    def set_bounds(self, bounds: Dict[str, float]) -> None:
        """Set bounds data as JSON string."""
        self.bounds_data = json.dumps(bounds)


class DroneTrackingExport(BaseModel):
    """Model for exporting drone tracking data."""
    
    scene_name: str = Field(..., description="Scene name")
    matrix_size: int = Field(..., description="Matrix size")
    resolution: float = Field(..., description="Resolution in meters")
    matrix: List[List[int]] = Field(..., description="Tracking matrix")
    bounds: Dict[str, float] = Field(..., description="Matrix bounds")
    position_count: int = Field(..., description="Number of positions recorded")
    export_timestamp: datetime = Field(..., description="Export timestamp")
    export_format: str = Field(..., description="Export format (json, csv, numpy)")


class DroneTrackingStats(BaseModel):
    """Statistics for drone tracking session."""
    
    scene_name: str = Field(..., description="Scene name")
    total_positions: int = Field(..., description="Total positions recorded")
    visited_cells: int = Field(..., description="Number of visited cells")
    coverage_percentage: float = Field(..., description="Coverage percentage")
    path_length: float = Field(..., description="Total path length in meters")
    session_duration: float = Field(..., description="Session duration in seconds")
    bounds: Dict[str, float] = Field(..., description="Matrix bounds")
