/**
 * UAV Path Visualization Component
 * 
 * Renders colored path visualization for UAV sparse scanning
 * Shows traversed positions with colors indicating signal strength
 */

import React, { useRef, useEffect } from 'react';
import { extend, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// Make Line available in JSX
extend({ Line: THREE.Line });

export interface UAVPathPoint {
  x: number;
  y: number;
  z: number;
  timestamp: number;
  color: string;
}

export interface UAVPathVisualizationProps {
  pathPoints: UAVPathPoint[];
  currentPosition?: [number, number, number];
  lineWidth?: number;
  showCurrentPosition?: boolean;
  maxPathLength?: number; // Maximum number of path points to show
}

const UAVPathVisualization: React.FC<UAVPathVisualizationProps> = ({
  pathPoints,
  currentPosition,
  lineWidth = 2,
  showCurrentPosition = true,
  maxPathLength = 1000
}) => {
  const lineRef = useRef<THREE.Line>(null);
  const currentPosRef = useRef<THREE.Mesh>(null);
  const { scene } = useThree();
  
  // Create line geometry and material
  useEffect(() => {
    if (!lineRef.current || pathPoints.length < 2) return;

    // Limit path length to prevent performance issues
    const displayPoints = pathPoints.slice(-maxPathLength);
    
    // Create geometry for the path line
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(displayPoints.length * 3);
    const colors = new Float32Array(displayPoints.length * 3);
    
    displayPoints.forEach((point, index) => {
      // Positions
      positions[index * 3] = point.x;
      positions[index * 3 + 1] = point.y;
      positions[index * 3 + 2] = point.z;
      
      // Parse color from rgba string
      const color = new THREE.Color();
      if (point.color.startsWith('rgba(')) {
        const values = point.color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*[\d.]+\)/);
        if (values) {
          color.setRGB(
            parseInt(values[1]) / 255,
            parseInt(values[2]) / 255,
            parseInt(values[3]) / 255
          );
        }
      } else {
        color.set(point.color);
      }
      
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    });
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    // Update line geometry
    lineRef.current.geometry.dispose();
    lineRef.current.geometry = geometry;
    
  }, [pathPoints, maxPathLength]);

  // Update current position indicator
  useEffect(() => {
    if (currentPosRef.current && currentPosition) {
      currentPosRef.current.position.set(
        currentPosition[0],
        currentPosition[1],
        currentPosition[2] + 2 // Slightly above the path
      );
    }
  }, [currentPosition]);

  // Animation for current position indicator
  useFrame((state) => {
    if (currentPosRef.current) {
      // Pulse effect
      const scale = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.2;
      currentPosRef.current.scale.setScalar(scale);
    }
  });

  return (
    <group>
      {/* Path line */}
      <line ref={lineRef}>
        <bufferGeometry />
        <lineBasicMaterial
          vertexColors
          linewidth={lineWidth}
          transparent={true}
          opacity={0.8}
        />
      </line>
      
      {/* Current position indicator */}
      {showCurrentPosition && currentPosition && (
        <mesh ref={currentPosRef} position={currentPosition}>
          <sphereGeometry args={[1, 8, 6]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
        </mesh>
      )}
      
      {/* Start position marker */}
      {pathPoints.length > 0 && (
        <mesh position={[pathPoints[0].x, pathPoints[0].y, pathPoints[0].z + 1]}>
          <coneGeometry args={[1.5, 3, 6]} />
          <meshBasicMaterial color="#00ff00" />
        </mesh>
      )}
      
      {/* End position marker (if animation is finished) */}
      {pathPoints.length > 1 && (
        <mesh position={[
          pathPoints[pathPoints.length - 1].x,
          pathPoints[pathPoints.length - 1].y,
          pathPoints[pathPoints.length - 1].z + 1
        ]}>
          <coneGeometry args={[1.5, 3, 6]} />
          <meshBasicMaterial color="#ff0000" />
        </mesh>
      )}
    </group>
  );
};

export default UAVPathVisualization;