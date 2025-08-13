#!/usr/bin/env python3
"""
Test script for UAV sparse ISS sampling functionality
"""

# Example usage patterns for the new sparse ISS feature:

# 1. Using specific UAV trajectory points (frontend coordinates)
uav_trajectory = [
    (10.0, 15.0),   # UAV point 1
    (-5.0, 20.0),   # UAV point 2
    (25.0, -10.0),  # UAV point 3
    (0.0, 0.0),     # UAV point 4
]

# 2. Using random sampling
random_samples = 10

# Example API calls (when integrated):
"""
# With specific UAV points
result = await sionna_service.generate_iss_map(
    session=session,
    uav_points=uav_trajectory,
    sparse_noise_std_db=2.0,  # Add 2dB noise to measurements
    sparse_first_then_full=True
)

# With random sampling
result = await sionna_service.generate_iss_map(
    session=session,
    num_random_samples=15,
    sparse_first_then_full=True
)

# Disable sparse sampling (original behavior)
result = await sionna_service.generate_iss_map(
    session=session,
    sparse_first_then_full=False  # Skip sparse visualization
)
"""

print("Test file created. See comments for usage examples.")