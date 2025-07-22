#!/usr/bin/env python3
"""
座標系統調試輔助工具
用於檢查網站設定與離線版本的座標一致性
"""

import numpy as np
import requests
import json

def check_coordinate_consistency():
    """檢查座標系統一致性"""
    
    print("🔍 座標系統一致性檢查")
    print("=" * 50)
    
    # 1. 檢查後端API座標系統
    try:
        response = requests.get("http://localhost:8888/api/v1/interference/sparse-scan?scene=Nanliao")
        if response.status_code == 200:
            data = response.json()
            debug_info = data.get('debug_info', {})
            
            print("✅ 後端API座標系統:")
            print(f"   網格大小: {debug_info.get('grid_shape')}")  
            print(f"   X範圍: {debug_info.get('x_range')}")
            print(f"   Y範圍: {debug_info.get('y_range')}")
            print(f"   格子大小: {debug_info.get('cell_size_inferred')}m")
            
            # 樣本jammer位置
            if 'sample_jammer_positions' in debug_info:
                print(f"   樣本Jammer位置: {debug_info['sample_jammer_positions']}")
        else:
            print(f"❌ 後端API無響應: {response.status_code}")
            
    except Exception as e:
        print(f"❌ 無法連接後端API: {e}")
    
    print()
    
    # 2. 離線版本參數 (從notebook)
    print("📝 離線版本座標系統:")
    print("   網格大小: ~(835, 1189) - 根據RSS形狀")
    print("   X範圍: 約(-500, +600)米")  
    print("   Y範圍: 約(-400, +400)米")
    print("   格子大小: 1.0米")
    print("   Jammer位置: [(-50, 60), (100, -60)]")
    
    print()
    
    # 3. 座標轉換函數
    print("🧮 座標轉換驗證:")
    
    def backend_world_to_grid(x_m, y_m, cell_size=4.0, width=512, height=512):
        """後端座標系統：世界座標 -> 網格座標"""  
        x_start = -width * cell_size / 2   # -1024
        y_start = -height * cell_size / 2  # -1024
        j = int((x_m - x_start) / cell_size)
        i = int((y_m - y_start) / cell_size)
        return i, j
    
    def offline_world_to_grid(x_m, y_m):
        """離線版本：假設的座標轉換 (需根據實際x_unique, y_unique調整)"""
        # 這裡需要你提供離線版本的實際x_unique, y_unique數組
        # 暫時使用近似值
        x_start, x_end = -500, 600
        y_start, y_end = -400, 400  
        width, height = 1189, 835
        
        j = int((x_m - x_start) / (x_end - x_start) * width)
        i = int((y_m - y_start) / (y_end - y_start) * height)
        return i, j
    
    # 測試相同jammer位置的網格座標
    test_positions = [(-50, 60), (100, -60), (0, 0)]
    
    print("   位置(x_m, y_m) -> 後端(i,j) vs 離線(i,j)")
    for x_m, y_m in test_positions:
        backend_ij = backend_world_to_grid(x_m, y_m)  
        offline_ij = offline_world_to_grid(x_m, y_m)
        print(f"   ({x_m:4}, {y_m:4}) -> {backend_ij} vs {offline_ij}")
    
    print()
    print("💡 解決建議:")
    print("1. 確認網站設定的TX/Jammer座標在±1000m範圍內")
    print("2. 檢查單位是否為公尺(不是pixel或經緯度)")  
    print("3. 如果結果仍不一致，請檢查cell_size設定")
    print("4. 建議統一使用4.0m的cell_size以匹配後端")

if __name__ == "__main__":
    check_coordinate_consistency()