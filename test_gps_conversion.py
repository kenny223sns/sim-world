#!/usr/bin/env python3
"""
Test GPS coordinate conversion for different scenes
"""

# Add the backend directory to the Python path
import sys
import os
sys.path.append('/home/kenny/jam/backend')

# Import the GPS conversion constants and function logic
from app.domains.coordinates.services.coordinate_service import (
    ORIGIN_LATITUDE_POTOU, ORIGIN_LONGITUDE_POTOU,
    ORIGIN_FRONTEND_X_POTOU, ORIGIN_FRONTEND_Y_POTOU,
    LATITUDE_SCALE_PER_METER_Y, LONGITUDE_SCALE_PER_METER_X,
    ORIGIN_LATITUDE_POTO, ORIGIN_LONGITUDE_POTO,
    ORIGIN_FRONTEND_X_POTO, ORIGIN_FRONTEND_Y_POTO,
    LATITUDE_SCALE_PER_METER_Y_POTO, LONGITUDE_SCALE_PER_METER_X_POTO
)

from app.domains.coordinates.models.coordinate_model import GeoCoordinate

def test_frontend_coords_to_gps(x_m: float, y_m: float, z_m: float = 0.0, scene: str = "potou") -> GeoCoordinate:
    """
    Test version of frontend_coords_to_gps function
    """
    # 根據場景選擇對應的參數
    if scene.lower() == "poto":
        origin_lat = ORIGIN_LATITUDE_POTO
        origin_lon = ORIGIN_LONGITUDE_POTO
        origin_x = ORIGIN_FRONTEND_X_POTO
        origin_y = ORIGIN_FRONTEND_Y_POTO
        lat_scale = LATITUDE_SCALE_PER_METER_Y_POTO
        lon_scale = LONGITUDE_SCALE_PER_METER_X_POTO
    else:  # 默認使用potou參數
        origin_lat = ORIGIN_LATITUDE_POTOU
        origin_lon = ORIGIN_LONGITUDE_POTOU
        origin_x = ORIGIN_FRONTEND_X_POTOU
        origin_y = ORIGIN_FRONTEND_Y_POTOU
        lat_scale = LATITUDE_SCALE_PER_METER_Y
        lon_scale = LONGITUDE_SCALE_PER_METER_X
    
    # 計算相對於基準點的偏移（前端座標米為單位）
    delta_x = x_m - origin_x  # 相對於基準點的X偏移
    delta_y = y_m - origin_y  # 相對於基準點的Y偏移
    
    # 轉換為GPS座標
    latitude = origin_lat + (delta_y * lat_scale)
    longitude = origin_lon + (delta_x * lon_scale)
    
    return GeoCoordinate(
        latitude=latitude,
        longitude=longitude,
        altitude=z_m if z_m > 0.1 else None
    )

def main():
    print("=== GPS座標轉換測試 ===\n")
    
    # Test the poto scene reference point
    # Expected: frontend(-970,-450) = GPS(24.926404, 120.971535)
    print("測試坡頭漁港場景參考點:")
    result = test_frontend_coords_to_gps(-970, -450, 0.0, 'poto')
    print(f"前端座標: (-970, -450)")
    print(f"期望GPS: (24.926404, 120.971535)")
    print(f"實際GPS: ({result.latitude:.6f}, {result.longitude:.6f})")
    print(f"緯度差異: {abs(result.latitude - 24.926404):.8f}")
    print(f"經度差異: {abs(result.longitude - 120.971535):.8f}")
    
    # Test potou scene for comparison
    print("\n測試破斗山場景參考點:")
    result_potou = test_frontend_coords_to_gps(-1800, -3500, 0.0, 'potou')
    print(f"前端座標: (-1800, -3500)")
    print(f"期望GPS: (24.9255373543708, 120.97170270744304)")
    print(f"實際GPS: ({result_potou.latitude:.6f}, {result_potou.longitude:.6f})")
    print(f"緯度差異: {abs(result_potou.latitude - 24.9255373543708):.8f}")
    print(f"經度差異: {abs(result_potou.longitude - 120.97170270744304):.8f}")
    
    # Additional test points for poto scene to verify the conversion is working
    print("\n測試坡頭漁港場景其他點:")
    test_points = [
        (0, 0),      # Origin point
        (100, 100),  # Positive offset
        (-100, -100), # Negative offset
    ]
    
    for x, y in test_points:
        result = test_frontend_coords_to_gps(x, y, 0.0, 'poto')
        print(f"前端座標: ({x}, {y}) -> GPS: ({result.latitude:.6f}, {result.longitude:.6f})")

if __name__ == "__main__":
    main()