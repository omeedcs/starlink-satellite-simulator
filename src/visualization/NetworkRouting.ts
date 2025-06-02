import * as THREE from 'three';
import { DeniedRegion } from './DeniedRegion';
import { Satellite } from '../types/Satellite';

// Graph node for network routing
interface NetworkNode {
  id: string;
  type: 'satellite' | 'groundStation';
  position: THREE.Vector3;
  lat?: number;
  lon?: number;
  alt?: number;
  connections: string[];
  isInDeniedRegion?: boolean;
  deniedRegionName?: string;
}

// Edge between network nodes
interface NetworkEdge {
  from: string;
  to: string;
  type: 'satellite-to-satellite' | 'satellite-to-ground';
  distance: number;
  delay: number; // ms
  bandwidth: number; // Mbps
  crossing?: {
    isDeniedRegion: boolean;
    regionName?: string;
  };
  active: boolean;
  predictiveData?: {
    availableAt: number; // timestamp
    unavailableAt: number; // timestamp
    reason?: string;
  };
}

// Data packet for visualization
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
}

// Network path
interface NetworkPath {
  id: string;
  nodes: string[];
  edges: NetworkEdge[];
  totalDelay: number;
  totalDistance: number;
  crossesDeniedRegion: boolean;
  deniedRegions: string[];
  isActive: boolean;
}

export class NetworkRouting {
  private object: THREE.Group;
  private nodes: Map<string, NetworkNode>;
  private edges: Map<string, NetworkEdge>;
  private paths: Map<string, NetworkPath>;
  private dataPackets: Map<string, DataPacket>;
  private deniedRegions: DeniedRegion;
  
  // Visualization objects
  private packetMeshes: Map<string, THREE.Mesh>;
  private pathLines: Map<string, THREE.Line>;
  private activePathColor: THREE.Color;
  private inactivePathColor: THREE.Color;
  private deniedCrossingColor: THREE.Color;
  
  // Cache calculated routes to avoid recalculation
  private routeCache: Map<string, NetworkPath>;
  
  // Clock for time-based updates
  private clock: THREE.Clock;
  
  // Prediction window (how far ahead to predict routing changes)
  private predictionWindowSeconds: number;
  
  constructor(deniedRegions: DeniedRegion) {
    this.object = new THREE.Group();
    this.nodes = new Map();
    this.edges = new Map();
    this.paths = new Map();
    this.dataPackets = new Map();
    this.deniedRegions = deniedRegions;
    
    this.packetMeshes = new Map();
    this.pathLines = new Map();
    this.activePathColor = new THREE.Color(0x00ff00);
    this.inactivePathColor = new THREE.Color(0x555555);
    this.deniedCrossingColor = new THREE.Color(0xff0000);
    
    this.routeCache = new Map();
    this.clock = new THREE.Clock();
    this.predictionWindowSeconds = 300; // 5 minutes prediction window
    
    // Create packet geometry for reuse
    this.initializeVisualization();
  }
  
  public getObject(): THREE.Group {
    return this.object;
  }
  
  private initializeVisualization(): void {
    // Nothing specific to initialize yet
  }
  
  // Add a satellite node to the network
  public addSatelliteNode(
    id: string, 
    position: THREE.Vector3, 
    lat: number, 
    lon: number, 
    alt: number
  ): void {
    // Check if satellite is in a denied region
    const deniedCheck = this.deniedRegions.isPointInDeniedRegion(lat, lon);
    
    const node: NetworkNode = {
      id,
      type: 'satellite',
      position: position.clone(),
      lat,
      lon,
      alt,
      connections: [],
      isInDeniedRegion: deniedCheck.inRegion,
      deniedRegionName: deniedCheck.regionName
    };
    
    this.nodes.set(id, node);
  }
  
  // Add a ground station node to the network
  public addGroundStationNode(
    id: string, 
    position: THREE.Vector3, 
    lat: number, 
    lon: number
  ): void {
    // Check if ground station is in a denied region
    const deniedCheck = this.deniedRegions.isPointInDeniedRegion(lat, lon);
    
    const node: NetworkNode = {
      id,
      type: 'groundStation',
      position: position.clone(),
      lat,
      lon,
      alt: 0,
      connections: [],
      isInDeniedRegion: deniedCheck.inRegion,
      deniedRegionName: deniedCheck.regionName
    };
    
    this.nodes.set(id, node);
  }
  
  // Update a node's position (for satellites)
  public updateNodePosition(
    id: string, 
    position: THREE.Vector3, 
    lat: number, 
    lon: number, 
    alt: number
  ): void {
    const node = this.nodes.get(id);
    if (!node) return;
    
    // Update position
    node.position.copy(position);
    node.lat = lat;
    node.lon = lon;
    node.alt = alt;
    
    // Check if satellite is now in a denied region
    const deniedCheck = this.deniedRegions.isPointInDeniedRegion(lat, lon);
    node.isInDeniedRegion = deniedCheck.inRegion;
    node.deniedRegionName = deniedCheck.regionName;
    
    // Update edges connected to this node
    this.updateEdgesForNode(id);
  }
  
  // Add or update an edge between two nodes
  public addOrUpdateEdge(
    fromId: string, 
    toId: string, 
    type: 'satellite-to-satellite' | 'satellite-to-ground',
    bandwidth?: number
  ): void {
    const fromNode = this.nodes.get(fromId);
    const toNode = this.nodes.get(toId);
    
    if (!fromNode || !toNode) return;
    
    // Create a unique edge ID
    const edgeId = `${fromId}-${toId}`;
    
    // Calculate distance
    const distance = fromNode.position.distanceTo(toNode.position);
    
    // Calculate delay (speed of light is ~300,000 km/s, so 300 m/μs)
    // Convert distance to meters and divide by speed of light
    const delayMs = (distance * 1000) / 300000;
    
    // Check if edge crosses denied region
    let crossing: { isDeniedRegion: boolean; regionName?: string } = { isDeniedRegion: false };
    if (fromNode.lat !== undefined && fromNode.lon !== undefined && 
        toNode.lat !== undefined && toNode.lon !== undefined) {
      const crossCheck = this.deniedRegions.doesLineCrossDeniedRegion(
        fromNode.lat, fromNode.lon, toNode.lat, toNode.lon
      );
      crossing = { 
        isDeniedRegion: crossCheck.crosses, 
        regionName: crossCheck.regionName 
      };
    }
    
    // Determine if edge should be active
    // Edge is inactive if it crosses denied region with no transmission allowed
    let active = true;
    if (crossing.isDeniedRegion && crossing.regionName) {
      const constraints = this.deniedRegions.getRegionConstraints(crossing.regionName);
      if (constraints && constraints.noTransmission) {
        active = false;
      }
    }
    
    // Add edge
    const edge: NetworkEdge = {
      from: fromId,
      to: toId,
      type,
      distance,
      delay: delayMs,
      bandwidth: bandwidth || 100, // Default bandwidth
      crossing,
      active,
      predictiveData: this.calculatePredictiveData(fromNode, toNode)
    };
    
    // Update the edge or add a new one
    this.edges.set(edgeId, edge);
    
    // Ensure nodes have this connection in their connections list
    if (!fromNode.connections.includes(toId)) {
      fromNode.connections.push(toId);
    }
    if (!toNode.connections.includes(fromId)) {
      toNode.connections.push(fromId);
    }
    
    // Invalidate route cache for any paths using these nodes
    // this.invalidateRouteCacheForNodes([fromId, toId]);
  }
  
  // Calculate predictive data for when an edge will be available/unavailable
  private calculatePredictiveData(fromNode: NetworkNode, toNode: NetworkNode): {
    availableAt: number;
    unavailableAt: number;
    reason?: string;
  } | undefined {
    // For now, just return undefined (no prediction)
    // In a full implementation, this would use orbital mechanics to predict
    // when satellites will move in/out of denied regions or line of sight
    return undefined;
  }
  
  // Update all edges connected to a node (after node position change)
  private updateEdgesForNode(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    
    // Update all edges connected to this node
    node.connections.forEach(connectedId => {
      // Update in both directions
      this.addOrUpdateEdge(nodeId, connectedId, 
        this.nodes.get(connectedId)?.type === 'groundStation' 
          ? 'satellite-to-ground' 
          : 'satellite-to-satellite'
      );
      
      this.addOrUpdateEdge(connectedId, nodeId,
        this.nodes.get(connectedId)?.type === 'groundStation' 
          ? 'satellite-to-ground' 
          : 'satellite-to-satellite'
      );
    });
  }
}
