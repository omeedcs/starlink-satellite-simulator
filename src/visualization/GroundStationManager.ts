import * as THREE from 'three';
import { Earth } from './Earth';
import { GroundStationData } from '../models/GroundStationNetwork';

interface GroundStation {
  id: string;
  position: {
    latitude: number;
    longitude: number;
  };
  connections: {
    satellites: string[];
  };
  coverage: {
    radius: number;
  };
  status: string;
}

export class GroundStationManager {
  private object: THREE.Group;
  private groundStations: Map<string, GroundStation> = new Map();
  private groundStationMeshes: Map<string, THREE.Object3D> = new Map();
  private connectionLines: Map<string, THREE.Line> = new Map();
  private earth: Earth | null = null;
  
  constructor() {
    this.object = new THREE.Group();
    
    // Create ground station material
    const groundStationMaterial = new THREE.MeshPhongMaterial({
      color: 0xff0000,
      emissive: 0x441111,
      shininess: 30,
    });
    
    // Create ground station geometry
    const groundStationGeometry = new THREE.CylinderGeometry(50, 100, 100, 8);
    
    // Initialize ground stations
    this.initializeGroundStations(groundStationGeometry, groundStationMaterial);
  }
  
  public getObject(): THREE.Group {
    return this.object;
  }
  
  public setVisible(visible: boolean): void {
    this.object.visible = visible;
  }
  
  public getGroundStation(id: string): GroundStation | undefined {
    return this.groundStations.get(id);
  }
  
  public getAllGroundStations(): GroundStation[] {
    return Array.from(this.groundStations.values());
  }
  
  public setEarth(earth: Earth): void {
    this.earth = earth;
    
    // Update ground station positions
    this.updateGroundStationPositions();
  }
  
  public update(deltaTime: number): void {
    // Update ground station positions (as Earth rotates)
    this.updateGroundStationPositions();
    
    // Update connection lines
    this.updateConnectionLines();
  }
  
  // New method for VisualizationEngine integration
  public updateGroundStation(groundStationData: GroundStationData): void {
    const groundStation = this.groundStations.get(groundStationData.id);
    if (groundStation) {
      groundStation.status = groundStationData.status;
      groundStation.connections.satellites = [...groundStationData.connections.satellites];
      
      // Update visual representation if needed
      const mesh = this.groundStationMeshes.get(groundStationData.id);
      if (mesh) {
        // Update color based on status
        const material = (mesh as THREE.Mesh).material as THREE.MeshPhongMaterial;
        switch (groundStationData.status) {
          case 'operational':
            material.color.set(0xff0000);
            material.emissive.set(0x441111);
            break;
          case 'degraded':
            material.color.set(0xffaa00);
            material.emissive.set(0x443311);
            break;
          case 'offline':
            material.color.set(0x666666);
            material.emissive.set(0x222222);
            break;
        }
      }
    }
  }
  
  private initializeGroundStations(
    groundStationGeometry: THREE.CylinderGeometry,
    groundStationMaterial: THREE.MeshPhongMaterial
  ): void {
    // Define major ground station locations
    const stationLocations = [
      { id: 'gs_1', name: 'North America 1', latitude: 37.7749, longitude: -122.4194 }, // San Francisco
      { id: 'gs_2', name: 'North America 2', latitude: 40.7128, longitude: -74.0060 },  // New York
      { id: 'gs_3', name: 'Europe 1', latitude: 51.5074, longitude: -0.1278 },          // London
      { id: 'gs_4', name: 'Europe 2', latitude: 48.8566, longitude: 2.3522 },           // Paris
      { id: 'gs_5', name: 'Asia 1', latitude: 35.6762, longitude: 139.6503 },           // Tokyo
      { id: 'gs_6', name: 'Asia 2', latitude: 22.3193, longitude: 114.1694 },           // Hong Kong
      { id: 'gs_7', name: 'Australia', latitude: -33.8688, longitude: 151.2093 },       // Sydney
      { id: 'gs_8', name: 'South America', latitude: -23.5505, longitude: -46.6333 },   // São Paulo
      { id: 'gs_9', name: 'Africa', latitude: -33.9249, longitude: 18.4241 },           // Cape Town
    ];
    
    stationLocations.forEach(({ id, name, latitude, longitude }) => {
      // Create ground station object
      const groundStation: GroundStation = {
        id,
        position: {
          latitude,
          longitude,
        },
        connections: {
          satellites: [],
        },
        coverage: {
          radius: 1000, // km
        },
        status: 'operational',
      };
      
      // Create ground station mesh
      const groundStationMesh = new THREE.Mesh(groundStationGeometry, groundStationMaterial.clone());
      groundStationMesh.name = id;
      
      // Add to collections
      this.groundStations.set(id, groundStation);
      this.groundStationMeshes.set(id, groundStationMesh);
      this.object.add(groundStationMesh);
      
      // Add coverage area visualization
      this.addCoverageArea(id, groundStation);
    });
  }
  
  private addCoverageArea(id: string, groundStation: GroundStation): void {
    // Fix: Check if earth is null before using it
    if (!this.earth) return;
    
    // Create coverage area geometry
    const coverageGeometry = new THREE.CircleGeometry(groundStation.coverage.radius, 32);
    
    // Create coverage area material
    const coverageMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide,
    });
    
    // Create coverage area mesh
    const coverageMesh = new THREE.Mesh(coverageGeometry, coverageMaterial);
    
    // Add to ground station mesh
    const groundStationMesh = this.groundStationMeshes.get(id);
    if (groundStationMesh) {
      groundStationMesh.add(coverageMesh);
      
      // Position coverage area slightly above Earth surface
      coverageMesh.position.y = 5;
      coverageMesh.rotation.x = Math.PI / 2;
    }
  }
  
  private updateGroundStationPositions(): void {
    // Fix: Check if earth is null before using it
    if (!this.earth) return;
    
    this.groundStations.forEach((groundStation, id) => {
      const mesh = this.groundStationMeshes.get(id);
      if (mesh) {
        // Calculate position on Earth's surface
        const position = this.earth!.latLongToVector3(
          groundStation.position.latitude,
          groundStation.position.longitude,
          10 // Slight elevation above surface
        );
        
        // Update mesh position
        mesh.position.copy(position);
        
        // Orient ground station to point away from Earth center
        mesh.lookAt(new THREE.Vector3(0, 0, 0));
        mesh.rotateX(Math.PI); // Flip to point outward
      }
    });
  }
  
  private updateConnectionLines(): void {
    // This will be implemented when we have satellite connections
    // For now, we'll leave it empty as it will be handled by the DataFlowManager
  }
  
  // Connect a ground station to a satellite
  public connectToSatellite(groundStationId: string, satelliteId: string): void {
    const groundStation = this.groundStations.get(groundStationId);
    if (groundStation) {
      if (!groundStation.connections.satellites.includes(satelliteId)) {
        groundStation.connections.satellites.push(satelliteId);
      }
    }
  }
  
  // Disconnect a ground station from a satellite
  public disconnectFromSatellite(groundStationId: string, satelliteId: string): void {
    const groundStation = this.groundStations.get(groundStationId);
    if (groundStation) {
      groundStation.connections.satellites = groundStation.connections.satellites.filter(
        id => id !== satelliteId
      );
    }
  }
  
  // Dispose of resources
  public dispose(): void {
    // Dispose of geometries and materials
    this.groundStationMeshes.forEach((mesh) => {
      if (mesh instanceof THREE.Mesh) {
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(material => material.dispose());
          } else {
            mesh.material.dispose();
          }
        }
        
        // Dispose of child meshes (coverage areas)
        mesh.children.forEach(child => {
          if (child instanceof THREE.Mesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach(material => material.dispose());
              } else {
                child.material.dispose();
              }
            }
          }
        });
      }
      
      // Remove from parent
      this.object.remove(mesh);
    });
    
    // Dispose of connection lines
    this.connectionLines.forEach(line => {
      if (line.geometry) line.geometry.dispose();
      if (line.material) {
        if (Array.isArray(line.material)) {
          line.material.forEach(material => material.dispose());
        } else {
          line.material.dispose();
        }
      }
      this.object.remove(line);
    });
    
    // Clear collections
    this.groundStations.clear();
    this.groundStationMeshes.clear();
    this.connectionLines.clear();
  }
}
