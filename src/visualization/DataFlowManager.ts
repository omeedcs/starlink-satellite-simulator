import * as THREE from 'three';
import { SatelliteManager } from './SatelliteManager';
import { GroundStationManager } from './GroundStationManager';

interface DataPacket {
  id: string;
  source: {
    type: 'satellite' | 'groundStation' | 'internet';
    id: string;
  };
  destination: {
    type: 'satellite' | 'groundStation' | 'internet';
    id: string;
    position?: {
      latitude: number;
      longitude: number;
    };
  };
  size: number;
  priority: number;
  timestamp: number;
  path: string[];
  status: 'queued' | 'in-transit' | 'delivered' | 'dropped';
  latency: number;
}

export class DataFlowManager {
  private object: THREE.Group;
  private satelliteManager: SatelliteManager;
  private groundStationManager: GroundStationManager;
  private packets: Map<string, DataPacket> = new Map();
  private packetMeshes: Map<string, THREE.Object3D> = new Map();
  private packetCount: number = 0;
  private packetSpeed: number = 500; // km/s
  private packetLifetime: number = 30; // seconds
  private packetGenerationRate: number = 0.5; // packets per second
  private timeSinceLastPacket: number = 0;
  
  constructor(
    satelliteManager: SatelliteManager,
    groundStationManager: GroundStationManager
  ) {
    this.object = new THREE.Group();
    this.satelliteManager = satelliteManager;
    this.groundStationManager = groundStationManager;
    
    // Create packet geometry and material
    this.initializePacketVisuals();
  }
  
  public getObject(): THREE.Group {
    return this.object;
  }
  
  public setVisible(visible: boolean): void {
    this.object.visible = visible;
  }
  
  public update(deltaTime: number): void {
    // Generate new packets
    this.timeSinceLastPacket += deltaTime;
    if (this.timeSinceLastPacket > 1 / this.packetGenerationRate) {
      this.generateRandomPacket();
      this.timeSinceLastPacket = 0;
    }
    
    // Update existing packets
    this.updatePackets(deltaTime);
  }
  
  // Make these methods public for VisualizationEngine integration
  public addPacket(packet: DataPacket): void {
    // Add packet to collection
    this.packets.set(packet.id, packet);
    
    // Create visual representation
    this.createPacketMesh(packet);
  }
  
  public updatePacket(packet: DataPacket): void {
    // Update existing packet
    this.packets.set(packet.id, packet);
  }
  
  public removePacket(packetId: string): void {
    // Remove mesh
    const mesh = this.packetMeshes.get(packetId);
    if (mesh) {
      this.object.remove(mesh);
      this.packetMeshes.delete(packetId);
    }
    
    // Remove packet data
    this.packets.delete(packetId);
  }
  
  private initializePacketVisuals(): void {
    // Nothing to initialize yet - packets will be created dynamically
  }
  
  private generateRandomPacket(): void {
    // Get all ground stations and satellites
    const groundStations = this.groundStationManager.getAllGroundStations();
    const satellites = this.satelliteManager.getAllSatellites();
    
    if (groundStations.length === 0 || satellites.size === 0) return;
    
    // Randomly decide if this is ground-to-satellite or satellite-to-ground
    const isUplink = Math.random() > 0.5;
    
    let source, destination;
    
    if (isUplink) {
      // Ground to satellite (uplink)
      source = {
        type: 'groundStation' as const,
        id: groundStations[Math.floor(Math.random() * groundStations.length)].id,
      };
      
      // Destination is either another ground station or the internet
      const isInternet = Math.random() > 0.3;
      
      if (isInternet) {
        destination = {
          type: 'internet' as const,
          id: 'internet',
        };
      } else {
        // Choose a different ground station
        let destGroundStation;
        do {
          destGroundStation = groundStations[Math.floor(Math.random() * groundStations.length)];
        } while (destGroundStation.id === source.id);
        
        destination = {
          type: 'groundStation' as const,
          id: destGroundStation.id,
          position: {
            latitude: destGroundStation.position.latitude,
            longitude: destGroundStation.position.longitude,
          },
        };
      }
    } else {
      // Satellite to ground (downlink)
      const satelliteArray = Array.from(satellites.values());
      source = {
        type: 'satellite' as const,
        id: satelliteArray[Math.floor(Math.random() * satelliteArray.length)].id,
      };
      
      destination = {
        type: 'groundStation' as const,
        id: groundStations[Math.floor(Math.random() * groundStations.length)].id,
        position: {
          latitude: groundStations[Math.floor(Math.random() * groundStations.length)].position.latitude,
          longitude: groundStations[Math.floor(Math.random() * groundStations.length)].position.longitude,
        },
      };
    }
    
    // Create packet
    const packetId = `packet_${this.packetCount++}`;
    const packet: DataPacket = {
      id: packetId,
      source,
      destination,
      size: Math.floor(Math.random() * 1000) + 100, // 100-1100 KB
      priority: Math.floor(Math.random() * 3), // 0-2
      timestamp: Date.now(),
      path: [source.id],
      status: 'queued',
      latency: 0,
    };
    
    // Add packet to collection
    this.packets.set(packetId, packet);
    
    // Create visual representation
    this.createPacketMesh(packet);
    
    // Start routing the packet
    this.routePacket(packet);
  }
  
  private createPacketMesh(packet: DataPacket): void {
    // Create packet geometry based on size
    const size = Math.max(5, Math.min(20, packet.size / 100)); // Scale size between 5-20
    const geometry = new THREE.SphereGeometry(size, 8, 8);
    
    // Create packet material based on priority
    let color;
    switch (packet.priority) {
      case 0: // Low
        color = 0x00ff00; // Green
        break;
      case 1: // Medium
        color = 0xffff00; // Yellow
        break;
      case 2: // High
        color = 0xff0000; // Red
        break;
      default:
        color = 0xffffff; // White
    }
    
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.8,
    });
    
    // Create mesh
    const mesh = new THREE.Mesh(geometry, material);
    
    // Position at source
    const sourcePosition = this.getNodePosition(packet.source.type, packet.source.id);
    if (sourcePosition) {
      mesh.position.copy(sourcePosition);
    }
    
    // Add to collections
    this.packetMeshes.set(packet.id, mesh);
    this.object.add(mesh);
  }
  
  private getNodePosition(type: 'satellite' | 'groundStation' | 'internet', id: string): THREE.Vector3 | null {
    if (type === 'satellite') {
      const satellite = this.satelliteManager.getSatellite(id);
      return satellite ? satellite.position.clone() : null;
    } else if (type === 'groundStation') {
      const groundStation = this.groundStationManager.getGroundStation(id);
      if (groundStation && groundStation.position) {
        // Convert lat/long to 3D position
        // This assumes Earth class has been properly initialized in GroundStationManager
        const groundStationMesh = this.groundStationManager.getObject().children.find(
          child => child.name === id
        );
        return groundStationMesh ? groundStationMesh.position.clone() : null;
      }
      return null;
    } else if (type === 'internet') {
      // Internet is represented as a point in space far away
      return new THREE.Vector3(0, 20000, 0);
    }
    return null;
  }
  
  private routePacket(packet: DataPacket): void {
    // Mark as in-transit
    packet.status = 'in-transit';
    
    // Find next hop
    let nextHop: string | null = null;
    
    if (packet.source.type === 'groundStation' && packet.path.length === 1) {
      // First hop from ground station - find closest satellite
      const groundStation = this.groundStationManager.getGroundStation(packet.source.id);
      if (groundStation && groundStation.connections.satellites.length > 0) {
        // Use first connected satellite
        nextHop = groundStation.connections.satellites[0];
      } else {
        // Find closest satellite
        nextHop = this.findClosestSatellite(packet.source.id);
      }
    } else if (packet.source.type === 'satellite' && packet.path.length === 1) {
      // First hop from satellite - determine if destination is ground or another satellite
      if (packet.destination.type === 'groundStation') {
        // Check if satellite is directly connected to destination ground station
        const satellite = this.satelliteManager.getSatellite(packet.source.id);
        if (satellite && satellite.connections.groundStations.includes(packet.destination.id)) {
          nextHop = packet.destination.id;
        } else {
          // Route through satellite network
          nextHop = this.findNextSatelliteHop(packet.source.id, packet.destination);
        }
      } else if (packet.destination.type === 'internet') {
        // Route to closest ground station with internet
        nextHop = this.findClosestGroundStation(packet.source.id);
      }
    } else {
      // Packet is already in transit - determine next hop based on current position
      const currentNodeId = packet.path[packet.path.length - 1];
      const currentNodeType = this.getNodeType(currentNodeId);
      
      if (currentNodeType === 'satellite') {
        if (packet.destination.type === 'groundStation') {
          // Check if satellite is directly connected to destination ground station
          const satellite = this.satelliteManager.getSatellite(currentNodeId);
          if (satellite && satellite.connections.groundStations.includes(packet.destination.id)) {
            nextHop = packet.destination.id;
          } else {
            // Route through satellite network
            nextHop = this.findNextSatelliteHop(currentNodeId, packet.destination);
          }
        } else if (packet.destination.type === 'internet') {
          // Route to closest ground station with internet
          nextHop = this.findClosestGroundStation(currentNodeId);
        }
      } else if (currentNodeType === 'groundStation') {
        if (packet.destination.type === 'groundStation' && currentNodeId === packet.destination.id) {
          // Packet has reached destination ground station
          packet.status = 'delivered';
        } else if (packet.destination.type === 'internet' && currentNodeId !== packet.source.id) {
          // Packet has reached a ground station that can connect to internet
          packet.status = 'delivered';
        } else {
          // Route back to satellite network
          nextHop = this.findClosestSatellite(currentNodeId);
        }
      }
    }
    
    if (nextHop) {
      // Add to path
      packet.path.push(nextHop);
    } else {
      // No route found
      packet.status = 'dropped';
    }
  }
  
  private getNodeType(id: string): 'satellite' | 'groundStation' | 'internet' | null {
    if (id === 'internet') return 'internet';
    if (id.startsWith('sat_')) return 'satellite';
    if (id.startsWith('gs_')) return 'groundStation';
    return null;
  }
  
  private findClosestSatellite(groundStationId: string): string | null {
    const groundStation = this.groundStationManager.getGroundStation(groundStationId);
    if (!groundStation) return null;
    
    const satellites = this.satelliteManager.getAllSatellites();
    if (satellites.size === 0) return null;
    
    // Find satellite with shortest distance to ground station
    const satelliteArray = Array.from(satellites.values());
    let closestSatellite = satelliteArray[0];
    let shortestDistance = Infinity;
    
    const groundStationPosition = this.getNodePosition('groundStation', groundStationId);
    if (!groundStationPosition) return null;
    
    satelliteArray.forEach(satellite => {
      const distance = groundStationPosition.distanceTo(satellite.position);
      if (distance < shortestDistance) {
        shortestDistance = distance;
        closestSatellite = satellite;
      }
    });
    
    return closestSatellite.id;
  }
  
  private findClosestGroundStation(satelliteId: string): string | null {
    const satellite = this.satelliteManager.getSatellite(satelliteId);
    if (!satellite) return null;
    
    const groundStations = this.groundStationManager.getAllGroundStations();
    if (groundStations.length === 0) return null;
    
    // Find ground station with shortest distance to satellite
    let closestGroundStation = groundStations[0];
    let shortestDistance = Infinity;
    
    groundStations.forEach(groundStation => {
      const groundStationPosition = this.getNodePosition('groundStation', groundStation.id);
      if (groundStationPosition) {
        const distance = satellite.position.distanceTo(groundStationPosition);
        if (distance < shortestDistance) {
          shortestDistance = distance;
          closestGroundStation = groundStation;
        }
      }
    });
    
    return closestGroundStation.id;
  }
  
  private findNextSatelliteHop(currentSatelliteId: string, destination: DataPacket['destination']): string | null {
    const currentSatellite = this.satelliteManager.getSatellite(currentSatelliteId);
    if (!currentSatellite) return null;
    
    // If destination has position, use geographic routing
    if (destination.position) {
      // Find satellite that is closest to destination
      let bestNextHop: string | null = null;
      let shortestDistance = Infinity;
      
      // Check all connected satellites
      currentSatellite.connections.satellites.forEach(connectedSatelliteId => {
        const connectedSatellite = this.satelliteManager.getSatellite(connectedSatelliteId);
        if (connectedSatellite) {
          // Calculate distance to destination (simplified)
          const destLat = destination.position!.latitude * (Math.PI / 180);
          const destLon = destination.position!.longitude * (Math.PI / 180);
          
          // Convert destination lat/lon to 3D position (simplified)
          const earthRadius = 6371; // km
          const x = earthRadius * Math.cos(destLat) * Math.cos(destLon);
          const y = earthRadius * Math.cos(destLat) * Math.sin(destLon);
          const z = earthRadius * Math.sin(destLat);
          
          const destPosition = new THREE.Vector3(x, z, y); // Swap y and z for Three.js
          
          const distance = connectedSatellite.position.distanceTo(destPosition);
          if (distance < shortestDistance) {
            shortestDistance = distance;
            bestNextHop = connectedSatelliteId;
          }
        }
      });
      
      return bestNextHop;
    } else {
      // No position information - just pick a random connected satellite
      const connectedSatellites = currentSatellite.connections.satellites;
      if (connectedSatellites.length > 0) {
        return connectedSatellites[Math.floor(Math.random() * connectedSatellites.length)];
      }
    }
    
    return null;
  }
  
  private updatePackets(deltaTime: number): void {
    // Update each packet
    this.packets.forEach((packet, id) => {
      // Skip delivered or dropped packets
      if (packet.status === 'delivered' || packet.status === 'dropped') {
        // Remove old packets
        if (Date.now() - packet.timestamp > this.packetLifetime * 1000) {
          this.removePacket(id);
        }
        return;
      }
      
      // Update packet position
      this.updatePacketPosition(packet, deltaTime);
      
      // Check if packet has reached next hop
      if (packet.path.length >= 2) {
        const currentHop = packet.path[packet.path.length - 2];
        const nextHop = packet.path[packet.path.length - 1];
        
        const currentPosition = this.getNodePosition(
          this.getNodeType(currentHop) as any,
          currentHop
        );
        
        const nextPosition = this.getNodePosition(
          this.getNodeType(nextHop) as any,
          nextHop
        );
        
        if (currentPosition && nextPosition) {
          const packetMesh = this.packetMeshes.get(id);
          if (packetMesh) {
            // Calculate distance to next hop
            const distanceToNextHop = packetMesh.position.distanceTo(nextPosition);
            
            // If packet is close enough to next hop, consider it arrived
            if (distanceToNextHop < 100) { // 100 km threshold
              // If next hop is destination, mark as delivered
              if (nextHop === packet.destination.id) {
                packet.status = 'delivered';
              } else {
                // Otherwise, continue routing
                this.routePacket(packet);
              }
            }
          }
        }
      }
      
      // Update packet latency
      packet.latency += deltaTime;
    });
  }
  
  private updatePacketPosition(packet: DataPacket, deltaTime: number): void {
    if (packet.path.length < 2) return;
    
    const packetMesh = this.packetMeshes.get(packet.id);
    if (!packetMesh) return;
    
    // Get current and next hop positions
    const currentHopIndex = packet.path.length - 2;
    const nextHopIndex = packet.path.length - 1;
    
    const currentHop = packet.path[currentHopIndex];
    const nextHop = packet.path[nextHopIndex];
    
    const currentPosition = this.getNodePosition(
      this.getNodeType(currentHop) as any,
      currentHop
    );
    
    const nextPosition = this.getNodePosition(
      this.getNodeType(nextHop) as any,
      nextHop
    );
    
    if (!currentPosition || !nextPosition) return;
    
    // Calculate direction vector
    const direction = nextPosition.clone().sub(currentPosition).normalize();
    
    // Calculate distance to travel this frame
    const distance = this.packetSpeed * deltaTime;
    
    // Update position
    packetMesh.position.add(direction.multiplyScalar(distance));
    
    // Add trail effect (optional)
    this.addPacketTrail(packet, packetMesh.position.clone());
  }
  
  private addPacketTrail(packet: DataPacket, position: THREE.Vector3): void {
    // This would add a visual trail behind the packet
    // For simplicity, we'll skip this for now
  }
  
  // Dispose of resources
  public dispose(): void {
    // Dispose of packet meshes
    this.packetMeshes.forEach((mesh) => {
      if (mesh instanceof THREE.Mesh) {
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(material => material.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      }
      
      // Remove from parent
      this.object.remove(mesh);
    });
    
    // Clear collections
    this.packets.clear();
    this.packetMeshes.clear();
  }
}
