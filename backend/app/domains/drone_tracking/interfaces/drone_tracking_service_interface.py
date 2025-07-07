from abc import ABC, abstractmethod
from typing import Optional, Tuple, List
from app.domains.drone_tracking.models.drone_tracking_model import (
    DronePosition,
    DroneTrackingMatrix,
    DroneTrackingExport,
    DroneTrackingStats,
)


class DroneTrackingServiceInterface(ABC):
    """Interface for drone tracking service."""
    
    @abstractmethod
    async def record_position(
        self,
        scene_name: str,
        scene_x: float,
        scene_y: float,
        scene_z: float
    ) -> bool:
        """Record a drone position in the tracking matrix."""
        pass
    
    @abstractmethod
    async def get_tracking_matrix(
        self,
        scene_name: str
    ) -> Optional[DroneTrackingMatrix]:
        """Get the current tracking matrix for a scene."""
        pass
    
    @abstractmethod
    async def clear_tracking_matrix(
        self,
        scene_name: str
    ) -> bool:
        """Clear the tracking matrix for a scene."""
        pass
    
    @abstractmethod
    async def export_tracking_data(
        self,
        scene_name: str,
        export_format: str = "json"
    ) -> Optional[DroneTrackingExport]:
        """Export tracking data in specified format."""
        pass
    
    @abstractmethod
    async def get_tracking_stats(
        self,
        scene_name: str
    ) -> Optional[DroneTrackingStats]:
        """Get tracking statistics for a scene."""
        pass
    
    @abstractmethod
    async def convert_scene_to_matrix_coords(
        self,
        scene_name: str,
        scene_x: float,
        scene_y: float
    ) -> Tuple[int, int]:
        """Convert scene coordinates to matrix indices."""
        pass
    
    @abstractmethod
    async def convert_matrix_to_scene_coords(
        self,
        scene_name: str,
        matrix_x: int,
        matrix_y: int
    ) -> Tuple[float, float]:
        """Convert matrix indices to scene coordinates."""
        pass
