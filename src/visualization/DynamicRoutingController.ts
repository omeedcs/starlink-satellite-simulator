import * as THREE from 'three';
import { DeniedRegion } from './DeniedRegion';
import { NetworkRoutingPathfinding } from './NetworkRoutingPathfinding';
import { NetworkRoutingVisualizer } from './NetworkRoutingVisualizer';
import { Satellite } from '../types/Satellite';

// Node types for the network
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

// Traffic simulation parameters
interface TrafficSimulationParams {
  packetGenerationRate: number; // packets per second
  groundStationTrafficDistribution: Map<string, number>; // % of traffic per ground station
  enablePredictiveRouting: boolean;
  rerouteAroundDeniedRegions: boolean;
  packetLifetime: number; // seconds
}

export class DynamicRoutingController {
  private object: THREE.Group;
  private deniedRegions: DeniedRegion;
  private visualizer: NetworkRoutingVisualizer;
  
  // Network data
  private nodes: Map<string, NetworkNode>;
  private edges: Map<string, NetworkEdge>;
  private activePaths: Map<string, NetworkPath>;
  private predictedPaths: Map<string, NetworkPath>;
  
  // Simulation parameters
  private trafficParams: TrafficSimulationParams;
  private packetGenerationTimer: number;
  private satellitePositionCache: Map<string, { lat: number, lon: number, alt: number }>;
  private groundStationPositionCache: Map<string, { lat: number, lon: number }>;
  
  // Performance optimization
  private routeCache: Map<string, NetworkPath>;
  private lastPathUpdateTime: number = 0;
  private pathUpdateInterval: number = 5.0; // Update paths every 5 seconds for much better performance
  private updateCounter: number = 0;
  private maxUpdatesPerFrame: number = 5; // Reduce max updates per frame for better performance
  private maxActivePathsAllowed: number = 10; // Limit maximum active paths for performance
  
  // Clock for time-based updates
  private clock: THREE.Clock;
  
  constructor(earthRadius: number) {
    this.object = new THREE.Group();
    this.deniedRegions = new DeniedRegion(earthRadius);
    this.visualizer = new NetworkRoutingVisualizer();
    
    this.nodes = new Map();
    this.edges = new Map();
    this.activePaths = new Map();
    this.predictedPaths = new Map();
    
    this.satellitePositionCache = new Map();
    this.groundStationPositionCache = new Map();
    this.routeCache = new Map();
    
    this.trafficParams = {
      packetGenerationRate: 0.5, // Reduced to 0.5 packets per second for better performance
      groundStationTrafficDistribution: new Map(), // Will be populated
      enablePredictiveRouting: true,
      rerouteAroundDeniedRegions: true,
      packetLifetime: 60 // 60 seconds
    };
    
    this.packetGenerationTimer = 0;
    this.clock = new THREE.Clock();
    
    // Add child objects to main group
    this.object.add(this.deniedRegions.getObject());
    this.object.add(this.visualizer.getObject());
  }
  
  public getObject(): THREE.Group {
    return this.object;
  }
  
  // Initialize the simulation with denied regions
  public initialize(deniedRegionNames: string[]): void {
    // Add specified denied regions
    deniedRegionNames.forEach(name => {
      this.deniedRegions.addPredefinedRegion(name);
    });
  }
  
  // Add a satellite to the network
  public addSatellite(
    satellite: Satellite,
    position: THREE.Vector3,
    lat: number,
    lon: number,
    alt: number
  ): void {
    const id = satellite.id;
    
    // Check if satellite is in a denied region
    const deniedCheck = this.deniedRegions.isPointInDeniedRegion(lat, lon);
    
    // Create node
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
    
    // Add to network
    this.nodes.set(id, node);
    
    // Add to position cache
    this.satellitePositionCache.set(id, { lat, lon, alt });
    
    // Update visualizer
    this.visualizer.updateNodePosition(id, position);
  }
  
  // Add a ground station to the network
  public addGroundStation(
    id: string,
    position: THREE.Vector3,
    lat: number,
    lon: number,
    trafficWeight: number = 1.0
  ): void {
    // Check if ground station is in a denied region
    const deniedCheck = this.deniedRegions.isPointInDeniedRegion(lat, lon);
    
    // Create node
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
    
    // Add to network
    this.nodes.set(id, node);
    
    // Add to position cache
    this.groundStationPositionCache.set(id, { lat, lon });
    
    // Add to traffic distribution
    this.trafficParams.groundStationTrafficDistribution.set(id, trafficWeight);
    
    // Update visualizer
    this.visualizer.updateNodePosition(id, position);
  }
  
  // Update a satellite's position
  public updateSatellitePosition(
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
    
    // Update position cache
    this.satellitePositionCache.set(id, { lat, lon, alt });
    
    // Check if satellite is now in a denied region
    const deniedCheck = this.deniedRegions.isPointInDeniedRegion(lat, lon);
    node.isInDeniedRegion = deniedCheck.inRegion;
    node.deniedRegionName = deniedCheck.regionName;
    
    // Update visualizer
    this.visualizer.updateNodePosition(id, position);
    
    // Update connections for this satellite
    this.updateSatelliteConnections(id);
    
    // Update paths that include this satellite
    this.updatePathsIncludingNode(id);
  }
  
  // Add a connection between two nodes
  public addConnection(
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
    let crossing: { isDeniedRegion: boolean; regionName?: string } = { isDeniedRegion: false, regionName: undefined };
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
      active
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
    
    // Update paths that might use this connection
    this.updatePathsIncludingNode(fromId);
    this.updatePathsIncludingNode(toId);
  }
  
  // Update satellite connections based on its position
  private updateSatelliteConnections(satelliteId: string): void {
    const satellite = this.nodes.get(satelliteId);
    if (!satellite || satellite.type !== 'satellite') return;
    
    // Check connections to ground stations
    for (const [gsId, node] of this.nodes.entries()) {
      if (node.type !== 'groundStation') continue;
      
      // Skip ground stations in denied regions
      if (node.isInDeniedRegion) continue;
      
      // Calculate distance
      const distance = satellite.position.distanceTo(node.position);
      
      // Check if in range (simplified: within 2000 units)
      // In a real implementation, this would use Earth's curvature, satellite altitude, etc.
      const inRange = distance < 2000;
      
      // Check if connection crosses denied region
      let deniedCrossing = false;
      if (satellite.lat !== undefined && satellite.lon !== undefined && 
          node.lat !== undefined && node.lon !== undefined) {
        const crossCheck = this.deniedRegions.doesLineCrossDeniedRegion(
          satellite.lat, satellite.lon, node.lat, node.lon
        );
        deniedCrossing = crossCheck.crosses;
      }
      
      // Edge ID
      const edgeId = `${satelliteId}-${gsId}`;
      const reverseEdgeId = `${gsId}-${satelliteId}`;
      
      // If in range and not crossing denied region, add connection
      if (inRange && !deniedCrossing) {
        this.addConnection(satelliteId, gsId, 'satellite-to-ground');
      } else {
        // Otherwise, remove connection if it exists
        if (this.edges.has(edgeId)) {
          this.edges.delete(edgeId);
          
          // Remove from connections lists
          const satelliteConnections = satellite.connections;
          const gsNode = this.nodes.get(gsId);
          
          if (gsNode) {
            const gsConnections = gsNode.connections;
            
            const satIndex = gsConnections.indexOf(satelliteId);
            if (satIndex !== -1) {
              gsConnections.splice(satIndex, 1);
            }
            
            const gsIndex = satelliteConnections.indexOf(gsId);
            if (gsIndex !== -1) {
              satelliteConnections.splice(gsIndex, 1);
            }
          }
        }
        
        // Also remove reverse edge
        if (this.edges.has(reverseEdgeId)) {
          this.edges.delete(reverseEdgeId);
        }
      }
    }
  }
  
  // Update paths that include a specific node - with performance optimizations
  private updatePathsIncludingNode(nodeId: string): void {
    // Only update a limited number of paths per call for better performance
    let updatedPaths = 0;
    const maxPathsToUpdate = 3; // Strict limit for performance
    
    // Check all paths that include this node
    for (const [pathId, path] of this.activePaths.entries()) {
      if (updatedPaths >= maxPathsToUpdate) break; // Limit reached
      
      if (path.nodes.includes(nodeId)) {
        updatedPaths++;
        
        // Get source and destination
        const [sourceId, destId] = pathId.split('-to-');
        
        // Skip if source or destination no longer exist
        if (!this.nodes.has(sourceId) || !this.nodes.has(destId)) {
          this.activePaths.delete(pathId);
          continue;
        }
        
        // Use cached path if available to avoid expensive calculations
        const cacheKey = `${sourceId}-${destId}-${Date.now() > this.lastPathUpdateTime + 10000 ? 'fresh' : 'cached'}`;
        if (this.routeCache.has(cacheKey)) {
          const cachedPath = this.routeCache.get(cacheKey)!;
          this.activePaths.set(pathId, cachedPath);
          continue;
        }
        
        // Find new path
        const newPath = NetworkRoutingPathfinding.findShortestPath(
          sourceId, destId, this.nodes, this.edges,
          'delay', this.trafficParams.rerouteAroundDeniedRegions
        );
        
        if (newPath) {
          // Update path
          this.activePaths.set(pathId, newPath);
          
          // Cache path for reuse
          this.routeCache.set(cacheKey, newPath);
          
          // Visualize updated path
          this.visualizer.visualizePath({
            id: newPath.id,
            nodes: newPath.nodes,
            isActive: newPath.isActive,
            crossesDeniedRegion: newPath.crossesDeniedRegion
          });
        } else {
          // No path exists, remove
          this.activePaths.delete(pathId);
        }
      }
    }
  }
  
  // Update all network paths with aggressive performance optimizations
  private updatePaths(): void {
    // Only update very infrequently to improve performance dramatically
    const currentTime = this.clock.getElapsedTime();
    if (currentTime - this.lastPathUpdateTime < this.pathUpdateInterval) {
      return;
    }
    
    this.lastPathUpdateTime = currentTime;
    
    // Skip updates randomly to improve performance
    if (Math.random() < 0.5) return;
    
    // Limit the number of nodes we check each update
    let checkedNodes = 0;
    const maxNodesToCheck = 5;
    
    // Check if any nodes are in denied regions and update - only check a subset
    for (const [nodeId, node] of this.nodes.entries()) {
      // Limit the number of nodes we process
      if (checkedNodes >= maxNodesToCheck) break;
      
      // Skip check if node already marked in denied region
      if (node.isInDeniedRegion) continue;
      
      checkedNodes++;
      
      // Check if node is in a denied region - but only if it's a satellite and at a random chance
      if (node.type === 'satellite' && node.lat !== undefined && node.lon !== undefined && Math.random() < 0.3) {
        const inDeniedRegion = this.deniedRegions.isPointInDeniedRegion(node.lat, node.lon);
        if (inDeniedRegion) {
          // Mark node as in denied region
          node.isInDeniedRegion = true;
          // Extract region name from the check result
          const regionInfo = this.deniedRegions.isPointInDeniedRegion(node.lat, node.lon);
          node.deniedRegionName = regionInfo.regionName || 'Unknown';
          
          // Update all paths that include this node
          this.updatePathsIncludingNode(nodeId);
        }
      }
    }
    
    // Only update edges occasionally
    if (this.updateCounter % 5 === 0) {
      // Limit the number of edges we check each update
      let checkedEdges = 0;
      const maxEdgesToCheck = 3;
      
      // Update edges crossing denied regions - only check a few
      for (const [edgeId, edge] of this.edges.entries()) {
        // Limit the number of edges we process
        if (checkedEdges >= maxEdgesToCheck) break;
        
        const fromNode = this.nodes.get(edge.from);
        const toNode = this.nodes.get(edge.to);
        
        if (!fromNode || !toNode) {
          // Skip invalid edges
          continue;
        }
        
        checkedEdges++;
        
        // Check if edge crosses denied region - only do this occasionally
        if (fromNode.lat !== undefined && fromNode.lon !== undefined &&
            toNode.lat !== undefined && toNode.lon !== undefined && 
            Math.random() < 0.2) {
          const crossesDeniedRegion = this.deniedRegions.doesLineCrossDeniedRegion(
            fromNode.lat, fromNode.lon,
            toNode.lat, toNode.lon
          ).crosses;
          
          if (crossesDeniedRegion) {
            // Mark edge as crossing denied region
            edge.crossing = {
              isDeniedRegion: true,
              regionName: this.deniedRegions.doesLineCrossDeniedRegion(
                fromNode.lat, fromNode.lon,
                toNode.lat, toNode.lon
              ).regionName || 'Unknown'
            };
            
            // Update one of the nodes that this edge connects - alternate between them
            if (Math.random() < 0.5) {
              this.updatePathsIncludingNode(edge.from);
            } else {
              this.updatePathsIncludingNode(edge.to);
            }
          }
        }
      }
    }
    
    // Limit the maximum number of active paths for performance
    if (this.activePaths.size > this.maxActivePathsAllowed) {
      // Remove oldest paths that exceed our limit
      const pathsToRemove = this.activePaths.size - this.maxActivePathsAllowed;
      let removed = 0;
      
      for (const pathId of this.activePaths.keys()) {
        if (removed >= pathsToRemove) break;
        this.activePaths.delete(pathId);
        removed++;
      }
    }
    
    // Regenerate visualizations for a subset of active paths
    if (this.updateCounter % 10 === 0) {
      let pathsVisualized = 0;
      const maxPathsToVisualize = 3;
      
      for (const path of this.activePaths.values()) {
        if (pathsVisualized >= maxPathsToVisualize) break;
        pathsVisualized++;
        
        this.visualizer.visualizePath({
          id: path.id,
          nodes: path.nodes,
          isActive: path.isActive,
          crossesDeniedRegion: path.crossesDeniedRegion
        });
      }
    }
    
    this.updateCounter++;
  }
  
  // Calculate and update predicted paths - significantly optimized
  private updatePredictedPaths(): void {
    // Skip if predictive routing is disabled
    if (!this.trafficParams.enablePredictiveRouting) return;
    
    // Skip most updates to dramatically improve performance
    if (Math.random() < 0.8) return;
    
    // Clear existing predicted paths
    this.predictedPaths.clear();
    
    // For each active path, calculate predicted paths (with strict limits for performance)
    let pathCount = 0;
    const maxPredictivePaths = 1; // Only predict one path at a time for better performance
    
    // Select a random subset of active paths to predict
    const activePaths = Array.from(this.activePaths.entries());
    if (activePaths.length === 0) return;
    
    // Randomly select a path to predict
    const randomIndex = Math.floor(Math.random() * activePaths.length);
    const [pathId, path] = activePaths[randomIndex];
    
    const [sourceId, destId] = pathId.split('-to-');
    
    // Skip if source or destination no longer exist
    if (!this.nodes.has(sourceId) || !this.nodes.has(destId)) return;
    
    // Calculate predicted paths at different time offsets (reduced for performance)
    const predictedPaths = NetworkRoutingPathfinding.calculatePredictivePaths(
      sourceId, destId, this.nodes, this.edges, [60] // Only predict 60 seconds ahead for performance
    );
    
    // Only store and visualize the first predicted path
    if (predictedPaths.length > 0) {
      const predictedPath = predictedPaths[0];
      this.predictedPaths.set(predictedPath.id, predictedPath);
      
      // Only visualize if different from current path and on a limited basis
      if (!this.arraysEqual(predictedPath.nodes, path.nodes) && Math.random() < 0.3) {
        this.visualizer.visualizePath({
          id: predictedPath.id,
          nodes: predictedPath.nodes,
          isActive: predictedPath.isActive,
          crossesDeniedRegion: predictedPath.crossesDeniedRegion
        }, true);
      }
    }
  }
  
  // Helper to compare arrays
  private arraysEqual(a: any[], b: any[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
  
  // Simulate traffic between ground stations
  public simulateTraffic(): void {
    // Get active ground stations (not in denied regions)
    const activeGroundStations = Array.from(this.nodes.values())
      .filter(node => node.type === 'groundStation' && !node.isInDeniedRegion);
    
    if (activeGroundStations.length < 2) return;
    
    // Generate random source and destination ground stations
    const sourceIndex = Math.floor(Math.random() * activeGroundStations.length);
    let destIndex;
    do {
      destIndex = Math.floor(Math.random() * activeGroundStations.length);
    } while (destIndex === sourceIndex);
    
    const sourceGs = activeGroundStations[sourceIndex];
    const destGs = activeGroundStations[destIndex];
    
    // Find or create path between these ground stations
    const pathId = `${sourceGs.id}-to-${destGs.id}`;
    
    if (!this.activePaths.has(pathId)) {
      // Find new path
      const newPath = NetworkRoutingPathfinding.findShortestPath(
        sourceGs.id, destGs.id, this.nodes, this.edges,
        'delay', this.trafficParams.rerouteAroundDeniedRegions
      );
      
      if (newPath) {
        // Store path
        this.activePaths.set(pathId, newPath);
        
        // Visualize path
        this.visualizer.visualizePath({
          id: newPath.id,
          nodes: newPath.nodes,
          isActive: newPath.isActive,
          crossesDeniedRegion: newPath.crossesDeniedRegion
        });
      } else {
        // No path exists between these ground stations
        return;
      }
    }
    
    // Get path
    const path = this.activePaths.get(pathId)!;
    
    // Create a data packet to visualize
    this.visualizer.createDataPacket(
      sourceGs.id,
      destGs.id,
      path.nodes,
      path.crossesDeniedRegion
    );
  }
  
  // Update the simulation
  public update(deltaTime: number): void {
    // Throttle updates for better performance
    this.updateCounter++;
    if (this.updateCounter % 3 !== 0) {
      // Only update visualizer on throttled frames
      this.visualizer.update(deltaTime);
      return;
    }
    
    // Update packet generation timer
    this.packetGenerationTimer += deltaTime;
    
    // Generate packets based on rate - with reduced frequency
    const packetInterval = 3 / this.trafficParams.packetGenerationRate; // Less frequent packets
    if (this.packetGenerationTimer >= packetInterval) {
      this.packetGenerationTimer = 0;
      this.simulateTraffic();
    }
    
    // Update visualizer
    this.visualizer.update(deltaTime);
  }

  // Update the visualization
  public updateVisualization(): void {
    this.visualizer.update(0);
  }
}
