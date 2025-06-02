import * as THREE from 'three';

// Interface imports (these would normally be in a shared types file)
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

// Helper class that contains the routing algorithms
export class NetworkRoutingPathfinding {
  // Find the shortest path between two nodes using Dijkstra's algorithm
  public static findShortestPath(
    sourceId: string,
    destinationId: string,
    nodes: Map<string, NetworkNode>,
    edges: Map<string, NetworkEdge>,
    optimizeFor: 'delay' | 'distance' = 'delay',
    avoidDeniedRegions: boolean = true,
    timeOffset: number = 0 // seconds in the future for prediction
  ): NetworkPath | null {
    // Priority queue for Dijkstra's algorithm
    const queue: { nodeId: string, priority: number }[] = [];
    
    // Track distances and previous nodes
    const distances = new Map<string, number>();
    const previous = new Map<string, string>();
    const visitedEdges = new Map<string, NetworkEdge>();
    
    // Set initial distances to infinity
    for (const [nodeId] of nodes) {
      distances.set(nodeId, Infinity);
    }
    
    // Set source distance to 0
    distances.set(sourceId, 0);
    queue.push({ nodeId: sourceId, priority: 0 });
    
    // Process queue
    while (queue.length > 0) {
      // Sort by priority and get the lowest
      queue.sort((a, b) => a.priority - b.priority);
      const { nodeId } = queue.shift()!;
      
      // If we've reached the destination, we're done
      if (nodeId === destinationId) {
        break;
      }
      
      // Get the current node
      const node = nodes.get(nodeId);
      if (!node) continue;
      
      // Check each connected node
      for (const connectedId of node.connections) {
        // Get the edge between these nodes
        const edgeId = `${nodeId}-${connectedId}`;
        const edge = edges.get(edgeId);
        
        if (!edge) continue;
        
        // Skip inactive edges
        if (!edge.active) continue;
        
        // If the edge crosses a denied region and we want to avoid them, skip
        if (avoidDeniedRegions && edge.crossing?.isDeniedRegion) continue;
        
        // Check if the edge will be available at the future time
        if (timeOffset > 0 && edge.predictiveData) {
          const currentTime = Date.now();
          const futureTime = currentTime + (timeOffset * 1000);
          
          // Skip if edge will be unavailable at future time
          if (edge.predictiveData.unavailableAt < futureTime && 
              edge.predictiveData.availableAt > futureTime) {
            continue;
          }
        }
        
        // Determine weight based on optimization preference
        const weight = optimizeFor === 'delay' ? edge.delay : edge.distance;
        
        // Calculate new distance
        const currentDistance = distances.get(nodeId) || Infinity;
        const newDistance = currentDistance + weight;
        
        // If this path is shorter, update
        const existingDistance = distances.get(connectedId) || Infinity;
        if (newDistance < existingDistance) {
          // Update distance
          distances.set(connectedId, newDistance);
          
          // Update previous node
          previous.set(connectedId, nodeId);
          
          // Track the edge used
          visitedEdges.set(edgeId, edge);
          
          // Add to queue
          queue.push({ nodeId: connectedId, priority: newDistance });
        }
      }
    }
    
    // If destination not reached, no path exists
    if (!previous.has(destinationId)) {
      return null;
    }
    
    // Reconstruct path
    const path: string[] = [];
    let current = destinationId;
    
    while (current !== sourceId) {
      path.unshift(current);
      const prev = previous.get(current);
      if (!prev) break;
      current = prev;
    }
    path.unshift(sourceId);
    
    // Extract edges used in the path
    const pathEdges: NetworkEdge[] = [];
    const deniedRegions: string[] = [];
    let crossesDeniedRegion = false;
    
    for (let i = 0; i < path.length - 1; i++) {
      const edgeId = `${path[i]}-${path[i + 1]}`;
      const edge = visitedEdges.get(edgeId);
      
      if (edge) {
        pathEdges.push(edge);
        
        // Check if this edge crosses a denied region
        if (edge.crossing?.isDeniedRegion && edge.crossing.regionName) {
          crossesDeniedRegion = true;
          if (!deniedRegions.includes(edge.crossing.regionName)) {
            deniedRegions.push(edge.crossing.regionName);
          }
        }
      }
    }
    
    // Calculate total delay and distance
    const totalDelay = pathEdges.reduce((sum, edge) => sum + edge.delay, 0);
    const totalDistance = pathEdges.reduce((sum, edge) => sum + edge.distance, 0);
    
    // Create path object
    const pathId = `${sourceId}-to-${destinationId}`;
    return {
      id: pathId,
      nodes: path,
      edges: pathEdges,
      totalDelay,
      totalDistance,
      crossesDeniedRegion,
      deniedRegions,
      isActive: pathEdges.every(edge => edge.active)
    };
  }
  
  // Find all possible paths between two nodes (up to a limit)
  public static findAllPaths(
    sourceId: string,
    destinationId: string,
    nodes: Map<string, NetworkNode>,
    edges: Map<string, NetworkEdge>,
    maxPaths: number = 3
  ): NetworkPath[] {
    // Find shortest path first
    const shortestPath = this.findShortestPath(
      sourceId, destinationId, nodes, edges, 'delay', true, 0
    );
    
    if (!shortestPath) return [];
    
    const paths: NetworkPath[] = [shortestPath];
    
    // Find alternative path that avoids denied regions
    if (shortestPath.crossesDeniedRegion) {
      const safePath = this.findShortestPath(
        sourceId, destinationId, nodes, edges, 'delay', true, 0
      );
      
      if (safePath && safePath.id !== shortestPath.id) {
        paths.push(safePath);
      }
    }
    
    // Find path optimized for distance instead of delay
    const distancePath = this.findShortestPath(
      sourceId, destinationId, nodes, edges, 'distance', false, 0
    );
    
    if (distancePath && !paths.some(p => p.id === distancePath.id)) {
      paths.push(distancePath);
    }
    
    // Find future path (prediction)
    const futurePath = this.findShortestPath(
      sourceId, destinationId, nodes, edges, 'delay', true, 300 // 5 min in future
    );
    
    if (futurePath && !paths.some(p => p.id === futurePath.id)) {
      futurePath.id = `future-${futurePath.id}`;
      paths.push(futurePath);
    }
    
    // Return paths, limited to max number
    return paths.slice(0, maxPaths);
  }
  
  // Calculate predicted paths based on future satellite positions
  public static calculatePredictivePaths(
    sourceId: string,
    destinationId: string,
    nodes: Map<string, NetworkNode>,
    edges: Map<string, NetworkEdge>,
    timeOffsets: number[] = [60, 120, 180, 240, 300] // 1-5 minutes ahead
  ): NetworkPath[] {
    const predictivePaths: NetworkPath[] = [];
    
    for (const timeOffset of timeOffsets) {
      const path = this.findShortestPath(
        sourceId, destinationId, nodes, edges, 'delay', true, timeOffset
      );
      
      if (path) {
        path.id = `predict-${timeOffset}-${path.id}`;
        predictivePaths.push(path);
      }
    }
    
    return predictivePaths;
  }
}
