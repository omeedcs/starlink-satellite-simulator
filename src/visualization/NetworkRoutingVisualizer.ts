import * as THREE from 'three';
import { NetworkRoutingPathfinding } from './NetworkRoutingPathfinding';

// Types for visualization
interface DataPacket {
  id: string;
  source: string;
  destination: string;
  route: string[];
  position: THREE.Vector3;
  progress: number; // 0-1
  speed: number; // factor
  size: number; // visual size
  color: THREE.Color;
  startTime: number;
  isRerouted: boolean;
  originalRoute?: string[];
  lastNodeIndex: number;
  nextNodeIndex: number;
}

interface VisualizationOptions {
  packetSize: number;
  packetSpeed: number;
  pathLineWidth: number;
  activePathColor: THREE.Color;
  inactivePathColor: THREE.Color;
  deniedCrossingColor: THREE.Color;
  futurePredictionColor: THREE.Color;
  packetColors: {
    standard: THREE.Color;
    rerouted: THREE.Color;
    predicted: THREE.Color;
  };
  showPredictedPaths: boolean;
  predictionOpacity: number;
  showPackets: boolean;
  maxVisiblePackets: number;
}

export class NetworkRoutingVisualizer {
  private object: THREE.Group;
  private nodes: Map<string, { position: THREE.Vector3 }>;
  private pathLines: Map<string, THREE.Line>;
  private predictionLines: Map<string, THREE.Line>;
  private packetMeshes: Map<string, THREE.Mesh>;
  private satelliteMeshes: Map<string, THREE.Mesh>;
  private dataPackets: Map<string, DataPacket>;
  private packetGeometry: THREE.SphereGeometry;
  private packetMaterials: {
    standard: THREE.Material;
    rerouted: THREE.Material;
    predicted: THREE.Material;
  };
  private options: VisualizationOptions;
  private clock: THREE.Clock;
  private lastPacketId: number;
  
  constructor(options?: Partial<VisualizationOptions>) {
    this.object = new THREE.Group();
    this.nodes = new Map();
    this.pathLines = new Map();
    this.predictionLines = new Map();
    this.packetMeshes = new Map();
    this.dataPackets = new Map();
    this.clock = new THREE.Clock();
    this.lastPacketId = 0;
    this.satelliteMeshes = new Map();
    
    // Default options
    this.options = {
      packetSize: 0.5,
      packetSpeed: 1.0,
      pathLineWidth: 2,
      activePathColor: new THREE.Color(0x00ff00),
      inactivePathColor: new THREE.Color(0x555555),
      deniedCrossingColor: new THREE.Color(0xff0000),
      futurePredictionColor: new THREE.Color(0xffaa00),
      packetColors: {
        standard: new THREE.Color(0x00ffff),
        rerouted: new THREE.Color(0xff00ff),
        predicted: new THREE.Color(0xffff00)
      },
      showPredictedPaths: true,
      predictionOpacity: 0.3,
      showPackets: true,
      maxVisiblePackets: 30 // Reduced for better performance
    };
    
    // Override defaults with provided options
    if (options) {
      this.options = { ...this.options, ...options };
    }
    
    // Create reusable geometries and materials - use lower poly count for better performance
    this.packetGeometry = new THREE.SphereGeometry(this.options.packetSize, 6, 6);
    this.packetMaterials = {
      standard: new THREE.MeshBasicMaterial({
        color: this.options.packetColors.standard,
        transparent: true,
        opacity: 0.8
      }),
      rerouted: new THREE.MeshBasicMaterial({
        color: this.options.packetColors.rerouted,
        transparent: true,
        opacity: 0.8
      }),
      predicted: new THREE.MeshBasicMaterial({
        color: this.options.packetColors.predicted,
        transparent: true,
        opacity: 0.5
      })
    };
  }
  
  public getObject(): THREE.Group {
    return this.object;
  }
  
  // Add or update a node position
  public updateNodePosition(id: string, position: THREE.Vector3): void {
    this.nodes.set(id, { position: position.clone() });

    let satelliteMesh = this.satelliteMeshes.get(id);

    if (satelliteMesh) {
      // Update existing mesh position
      satelliteMesh.position.copy(position);
      // Always ensure visibility
      satelliteMesh.visible = true;
    } else {
      // Create a more visible satellite representation
      const geometry = new THREE.SphereGeometry(3, 16, 16); // Larger size for better visibility
      const material = new THREE.MeshBasicMaterial({ 
        color: 0x88aaff,  // Light blue color for better visibility
        transparent: false,
        opacity: 1.0
      });
      
      satelliteMesh = new THREE.Mesh(geometry, material);
      satelliteMesh.position.copy(position);
      satelliteMesh.visible = true; // Explicitly set visibility
      
      // Add to tracking collections
      this.satelliteMeshes.set(id, satelliteMesh);
      this.object.add(satelliteMesh);
      
      // Force the mesh to render in the next frame
      requestAnimationFrame(() => {
        if (satelliteMesh) {
          satelliteMesh.visible = true;
        }
      });
    }
  }
  
  // Visualize a network path
  public visualizePath(
    path: {
      id: string;
      nodes: string[];
      isActive: boolean;
      crossesDeniedRegion: boolean;
    },
    isPrediction: boolean = false
  ): void {
    // Remove existing path visualization if it exists
    if (isPrediction) {
      if (this.predictionLines.has(path.id)) {
        this.object.remove(this.predictionLines.get(path.id)!);
        this.predictionLines.delete(path.id);
      }
    } else {
      if (this.pathLines.has(path.id)) {
        this.object.remove(this.pathLines.get(path.id)!);
        this.pathLines.delete(path.id);
      }
    }
    
    // Create path points
    const points: THREE.Vector3[] = [];
    for (const nodeId of path.nodes) {
      const node = this.nodes.get(nodeId);
      if (node) {
        points.push(node.position.clone());
      }
    }
    
    if (points.length < 2) return;
    
    // Create line geometry
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    
    // Determine color based on path status
    let color: THREE.Color;
    
    if (isPrediction) {
      color = this.options.futurePredictionColor;
    } else if (path.crossesDeniedRegion) {
      color = this.options.deniedCrossingColor;
    } else if (path.isActive) {
      color = this.options.activePathColor;
    } else {
      color = this.options.inactivePathColor;
    }
    
    // Create line material
    const material = new THREE.LineBasicMaterial({
      color,
      linewidth: this.options.pathLineWidth,
      transparent: true,
      opacity: isPrediction ? this.options.predictionOpacity : 1.0,
      // Using dashed line for prediction paths
      linecap: 'round',
      linejoin: 'round'
    });
    
    // Create line
    const line = new THREE.Line(geometry, material);
    
    // Add to scene
    this.object.add(line);
    
    // Store reference
    if (isPrediction) {
      this.predictionLines.set(path.id, line);
    } else {
      this.pathLines.set(path.id, line);
    }
  }
  
  // Create a data packet to visualize
  public createDataPacket(
    source: string,
    destination: string,
    route: string[],
    isRerouted: boolean = false,
    isPredicted: boolean = false
  ): string {
    // Generate unique ID
    const id = `packet-${++this.lastPacketId}`;
    
    // Ensure route has at least 2 nodes
    if (route.length < 2) return '';
    
    // Get source position
    const sourceNode = this.nodes.get(route[0]);
    if (!sourceNode) return '';
    
    // Create packet
    const packet: DataPacket = {
      id,
      source,
      destination,
      route,
      position: sourceNode.position.clone(),
      progress: 0,
      speed: this.options.packetSpeed * (0.8 + Math.random() * 0.4), // Small random variation
      size: this.options.packetSize,
      color: isRerouted 
        ? this.options.packetColors.rerouted 
        : (isPredicted ? this.options.packetColors.predicted : this.options.packetColors.standard),
      startTime: this.clock.getElapsedTime(),
      isRerouted,
      lastNodeIndex: 0,
      nextNodeIndex: 1
    };
    
    this.dataPackets.set(id, packet);
    
    // Create visual representation
    if (this.options.showPackets) {
      this.createPacketMesh(packet);
    }
    
    return id;
  }
  
  // Create a mesh for a data packet
  private createPacketMesh(packet: DataPacket): void {
    // Choose material based on packet type - use shared materials for better performance
    let material: THREE.Material;
    
    if (packet.isRerouted) {
      material = this.packetMaterials.rerouted;
    } else {
      material = this.packetMaterials.standard;
    }
    
    // Create mesh
    const mesh = new THREE.Mesh(this.packetGeometry, material);
    mesh.position.copy(packet.position);
    
    // Add to scene
    this.object.add(mesh);
    this.packetMeshes.set(packet.id, mesh);
  }
  
  // Update packet positions based on elapsed time
  public update(deltaTime: number): void {
    // Update packet positions
    const packetsToRemove: string[] = [];
    
    // Throttle updates - only update a subset of packets each frame
    const maxUpdatesPerFrame = 20;
    let updateCount = 0;
    
    for (const [id, packet] of this.dataPackets.entries()) {
      // Limit updates per frame for better performance
      if (updateCount >= maxUpdatesPerFrame) break;
      
      // Update packet position
      this.updatePacketPosition(packet, deltaTime);
      
      // Update mesh position
      const mesh = this.packetMeshes.get(id);
      if (mesh) {
        mesh.position.copy(packet.position);
      }
      
      // Check if packet has reached its destination
      if (packet.progress >= 1.0) {
        packetsToRemove.push(id);
      }
      
      updateCount++;
    }
    
    // Remove completed packets
    packetsToRemove.forEach(id => {
      this.removePacket(id);
    });
    
    // Limit the number of visible packets
    this.limitVisiblePackets();
  }
  
  // Update a packet's position along its route
  private updatePacketPosition(packet: DataPacket, deltaTime: number): void {
    // Calculate distance to travel this frame
    const distanceThisFrame = packet.speed * deltaTime;
    
    // Get current segment nodes
    const currentNode = this.nodes.get(packet.route[packet.lastNodeIndex]);
    const nextNode = this.nodes.get(packet.route[packet.nextNodeIndex]);
    
    if (!currentNode || !nextNode) return;
    
    // Calculate direction and distance
    const direction = nextNode.position.clone().sub(currentNode.position).normalize();
    const segmentLength = currentNode.position.distanceTo(nextNode.position);
    
    // Calculate progress along this segment
    const currentSegmentProgress = packet.position.distanceTo(currentNode.position) / segmentLength;
    
    // Move packet
    packet.position.add(direction.multiplyScalar(distanceThisFrame));
    
    // Check if we've reached the next node
    if (packet.position.distanceTo(nextNode.position) < distanceThisFrame) {
      // Move to next segment
      packet.lastNodeIndex++;
      packet.nextNodeIndex++;
      
      // If we've reached the end, mark as completed
      if (packet.nextNodeIndex >= packet.route.length) {
        packet.progress = 1.0;
      } else {
        // Otherwise, update position and progress
        packet.position.copy(nextNode.position);
        
        // Calculate overall progress along route
        packet.progress = packet.lastNodeIndex / (packet.route.length - 1);
      }
    } else {
      // Update overall progress
      const segmentContribution = 1.0 / (packet.route.length - 1);
      const segmentProgress = packet.position.distanceTo(currentNode.position) / segmentLength;
      
      packet.progress = (packet.lastNodeIndex + segmentProgress) / (packet.route.length - 1);
    }
  }
  
  // Limit the number of visible packets
  private limitVisiblePackets(): void {
    if (this.dataPackets.size <= this.options.maxVisiblePackets) return;
    
    // Sort packets by creation time (oldest first)
    const sortedPackets = Array.from(this.dataPackets.entries())
      .sort((a, b) => a[1].startTime - b[1].startTime);
    
    // Remove oldest packets until we're under the limit
    const packetsToRemove = sortedPackets.slice(0, sortedPackets.length - this.options.maxVisiblePackets);
    
    packetsToRemove.forEach(([id]) => {
      this.removePacket(id);
    });
  }
  
  // Remove a packet and its associated mesh
  private removePacket(id: string): void {
    // Remove mesh
    if (this.packetMeshes.has(id)) {
      this.object.remove(this.packetMeshes.get(id)!);
      this.packetMeshes.delete(id);
    }
    
    // Remove packet data
    this.dataPackets.delete(id);
  }
  
  // Properly dispose of all resources
  public dispose(): void {
    // Dispose of geometries
    if (this.packetGeometry) this.packetGeometry.dispose();

    // Dispose of materials
    Object.values(this.packetMaterials).forEach(material => {
      material.dispose();
    });

    // Dispose of path lines
    this.pathLines.forEach(line => {
      if (line.geometry) line.geometry.dispose();
      if (line.material) {
        if (Array.isArray(line.material)) {
          line.material.forEach(mat => mat.dispose());
        } else {
          (line.material as THREE.Material).dispose();
        }
      }
      this.object.remove(line);
    });

    // Dispose of prediction lines
    this.predictionLines.forEach(line => {
      if (line.geometry) line.geometry.dispose();
      if (line.material) {
        if (Array.isArray(line.material)) {
          line.material.forEach(mat => mat.dispose());
        } else {
          (line.material as THREE.Material).dispose();
        }
      }
      this.object.remove(line);
    });

    // Dispose of packet meshes
    this.packetMeshes.forEach(mesh => {
      // Assuming packet meshes don't have their own complex materials/geometries managed here
      // that aren't part of this.packetGeometry or this.packetMaterials
      this.object.remove(mesh);
    });

    // Dispose of satellite meshes
    this.satelliteMeshes.forEach(mesh => {
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(mat => mat.dispose());
        } else {
          (mesh.material as THREE.Material).dispose();
        }
      }
      this.object.remove(mesh);
    });

    // Clear all collections
    this.pathLines.clear();
    this.predictionLines.clear();
    this.packetMeshes.clear();
    this.dataPackets.clear();
    this.nodes.clear();
    this.satelliteMeshes.clear();
  }

  // Clear all visualizations
  public clear(): void {
    // Remove all path lines
    for (const line of this.pathLines.values()) {
      this.object.remove(line);
    }
    this.pathLines.clear();

    // Remove all prediction lines
    for (const line of this.predictionLines.values()) {
      this.object.remove(line);
    }
    this.predictionLines.clear();

    // Remove all packet meshes
    for (const mesh of this.packetMeshes.values()) {
      this.object.remove(mesh);
    }
    this.packetMeshes.clear();

    // Remove all satellite meshes
    for (const mesh of this.satelliteMeshes.values()) {
      this.object.remove(mesh);
    }
    this.satelliteMeshes.clear();

    // Clear data packets
    this.dataPackets.clear();
  }
}
