"""
Test suite for sparse scan API endpoints
"""

import pytest
import json
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_sparse_scan_endpoint_basic():
    """Test basic sparse scan endpoint functionality"""
    response = client.get("/api/v1/interference/sparse-scan?scene=Nanliao")
    
    assert response.status_code == 200
    data = response.json()
    
    # Check required keys exist
    assert "success" in data
    assert "height" in data
    assert "width" in data
    assert "x_axis" in data
    assert "y_axis" in data
    assert "points" in data
    assert "total_points" in data
    assert "step_x" in data
    assert "step_y" in data
    assert "scene" in data
    
    # Check data types
    assert isinstance(data["success"], bool)
    assert isinstance(data["height"], int)
    assert isinstance(data["width"], int)
    assert isinstance(data["x_axis"], list)
    assert isinstance(data["y_axis"], list)
    assert isinstance(data["points"], list)
    assert isinstance(data["total_points"], int)
    assert isinstance(data["step_x"], int)
    assert isinstance(data["step_y"], int)


def test_sparse_scan_custom_steps():
    """Test sparse scan with custom step sizes"""
    response = client.get("/api/v1/interference/sparse-scan?scene=test&step_x=8&step_y=6")
    
    assert response.status_code == 200
    data = response.json()
    
    assert data["step_x"] == 8
    assert data["step_y"] == 6
    assert data["total_points"] > 0


def test_sparse_scan_points_structure():
    """Test that points have correct structure"""
    response = client.get("/api/v1/interference/sparse-scan?scene=test")
    
    assert response.status_code == 200
    data = response.json()
    
    if data["points"]:
        point = data["points"][0]
        
        # Check point structure
        assert "i" in point
        assert "j" in point
        assert "x_m" in point
        assert "y_m" in point
        assert "iss_dbm" in point
        
        # Check point types
        assert isinstance(point["i"], int)
        assert isinstance(point["j"], int)
        assert isinstance(point["x_m"], (int, float))
        assert isinstance(point["y_m"], (int, float))
        assert isinstance(point["iss_dbm"], (int, float))


def test_sparse_scan_invalid_scene():
    """Test sparse scan with empty scene parameter"""
    response = client.get("/api/v1/interference/sparse-scan?scene=")
    
    # Should still work with sample data
    assert response.status_code == 200
    data = response.json()
    assert data["success"] == True


def test_sparse_scan_default_parameters():
    """Test sparse scan with default parameters"""
    response = client.get("/api/v1/interference/sparse-scan?scene=default")
    
    assert response.status_code == 200
    data = response.json()
    
    # Default step sizes should be 4
    assert data["step_x"] == 4
    assert data["step_y"] == 4


if __name__ == "__main__":
    pytest.main([__file__])