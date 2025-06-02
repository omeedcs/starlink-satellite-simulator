import { EventEmitter } from 'events';

export interface OrbitalParameters {
  altitude: number;
  inclination: number;
  eccentricity: number;
  argumentOfPeriapsis: number;
  longitudeOfAscendingNode: number;
  meanAnomaly: number;
}

export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface Velocity {
  x: number;
  y: number;
  z: number;
}

export interface GeoPosition {
  latitude: number;
  longitude: number;
}

export interface Satellite {
  id: string;
  position: Position;
  velocity: Velocity;
  orbitalParameters: OrbitalParameters;
  connections: {
    satellites: string[];
    groundStations: string[];
  };
  bandwidth: {
    uplink: number;
    downlink: number;
    interSatellite: number;
  };
  beams: number; // Number of beams this satellite can project
  timeSlots: { duration: 15, allocation: string }[]; // 15-second time slots with allocation IDs
  queue: DataPacket[];
  status: 'operational' | 'degraded' | 'offline';
  type: 'v0.9' | 'v1.0' | 'v1.5' | 'v2.0';
}

export interface GroundStation {
  id: string;
  position: GeoPosition;
  connections: {
    satellites: string[];
    internet: boolean;
  };
  coverage: {
    radius: number;
  };
  bandwidth: number;
  queue: DataPacket[];
  status: 'operational' | 'degraded' | 'offline';
}

export interface DataPacket {
  id: string;
  source: {
    type: 'satellite' | 'groundStation' | 'internet';
    id: string;
  };
  destination: {
    type: 'satellite' | 'groundStation' | 'internet';
    id: string;
    position?: GeoPosition;
  };
  size: number;
  priority: number;
  timestamp: number;
  path: string[];
  status: 'queued' | 'in-transit' | 'delivered' | 'dropped';
  latency: number;
}

export class SatelliteNetwork extends EventEmitter {
  private satellites: Map<string, Satellite> = new Map();
  private groundStations: Map<string, GroundStation> = new Map();
  private packets: Map<string, DataPacket> = new Map();
  private packetCount: number = 0;
  private earthRadius: number = 6371; // km
  private mu: number = 398600.4418; // Earth's standard gravitational parameter (km³/s²)
  private lightSpeed: number = 299792.458; // km/s
  
  // Customer laser terminals (rare, special case)
  private customerLaserTerminals: Map<string, { satelliteId: string, bandwidth: number }> = new Map();
  
  constructor() {
    super();
    this.initializeConstellation();
    this.initializeGroundStations();
  }
  
  public getSatellite(id: string): Satellite | undefined {
    return this.satellites.get(id);
  }
  
  public getAllSatellites(): Satellite[] {
    return Array.from(this.satellites.values());
  }
  
  public getGroundStation(id: string): GroundStation | undefined {
    return this.groundStations.get(id);
  }
  
  public getAllGroundStations(): GroundStation[] {
    return Array.from(this.groundStations.values());
  }
  
  public getPacket(id: string): DataPacket | undefined {
    return this.packets.get(id);
  }
  
  public getAllPackets(): DataPacket[] {
    return Array.from(this.packets.values());
  }
  
  public update(deltaTime: number): void {
    // Update satellite positions
    this.updateSatellitePositions(deltaTime);
    
    // Update satellite connections
    this.updateSatelliteConnections();
    
    // Update ground station connections
    this.updateGroundStationConnections();
    
    // Process packet routing
    this.processPackets(deltaTime);
    
    // Generate new packets
    this.generateRandomPackets(deltaTime);
    
    // Emit update event
    this.emit('update');
  }
  
  public createPacket(
    sourceType: 'satellite' | 'groundStation' | 'internet',
    sourceId: string,
    destinationType: 'satellite' | 'groundStation' | 'internet',
    destinationId: string,
    size: number,
    priority: number
  ): DataPacket | null {
    // Validate source
    if (sourceType === 'satellite' && !this.satellites.has(sourceId)) return null;
    if (sourceType === 'groundStation' && !this.groundStations.has(sourceId)) return null;
    
    // Validate destination
    if (destinationType === 'satellite' && !this.satellites.has(destinationId)) return null;
    if (destinationType === 'groundStation' && !this.groundStations.has(destinationId)) return null;
    
    // Create packet
    const packetId = `packet_${this.packetCount++}`;
    
    // Get destination position if it's a ground station
    let destinationPosition: GeoPosition | undefined;
    if (destinationType === 'groundStation') {
      const groundStation = this.groundStations.get(destinationId);
      if (groundStation) {
        destinationPosition = groundStation.position;
      }
    }
    
    const packet: DataPacket = {
      id: packetId,
      source: {
        type: sourceType,
        id: sourceId,
      },
      destination: {
        type: destinationType,
        id: destinationId,
        position: destinationPosition,
      },
      size,
      priority,
      timestamp: Date.now(),
      path: [sourceId],
      status: 'queued',
      latency: 0,
    };
    
    // Add to collection
    this.packets.set(packetId, packet);
    
    // Add to source queue
    if (sourceType === 'satellite') {
      const satellite = this.satellites.get(sourceId);
      if (satellite) {
        satellite.queue.push(packet);
      }
    } else if (sourceType === 'groundStation') {
      const groundStation = this.groundStations.get(sourceId);
      if (groundStation) {
        groundStation.queue.push(packet);
      }
    }
    
    // Start routing
    this.routePacket(packet);
    
    // Emit packet created event
    this.emit('packetCreated', packet);
    
    return packet;
  }
  
  private initializeConstellation(): void {
    // Create 9 orbital planes (simplified)
    const orbitalPlanes = 9;
    const satellitesPerPlane = 20; // Reduced for visualization
    const baseAltitude = 550; // km
    
    for (let plane = 0; plane < orbitalPlanes; plane++) {
      const inclination = 53 + (plane * 2); // Vary inclination slightly between planes
      const longitudeOfAscendingNode = (plane * 40) % 360; // Distribute planes around Earth
      
      for (let i = 0; i < satellitesPerPlane; i++) {
        const id = `sat_${plane}_${i}`;
        const meanAnomaly = (i * 360 / satellitesPerPlane) % 360; // Distribute satellites in plane
        
        // Determine satellite type first
        const satelliteType = this.getSatelliteType();
        
        // Create satellite object
        const satellite: Satellite = {
          id,
          position: { x: 0, y: 0, z: 0 },
          velocity: { x: 0, y: 0, z: 0 },
          orbitalParameters: {
            altitude: baseAltitude + (Math.random() * 20 - 10), // Small random variation
            inclination: inclination,
            eccentricity: 0.0001, // Nearly circular
            argumentOfPeriapsis: 0,
            longitudeOfAscendingNode: longitudeOfAscendingNode,
            meanAnomaly: meanAnomaly,
          },
          connections: {
            satellites: [],
            groundStations: [],
          },
          bandwidth: {
            uplink: 50, // Mbps per beam to ground
            downlink: 150, // Mbps per beam to ground  
            interSatellite: this.getIsLinkBandwidth(satelliteType), // RF ISL bandwidth based on generation
          },
          beams: Math.floor(Math.random() * 4) + 8, // 8-12 beams per satellite
          timeSlots: Array(24).fill(null).map((_, idx) => ({ 
            duration: 15, 
            allocation: idx % 3 === 0 ? 'open' : `resource_${Math.floor(Math.random() * 100)}` 
          })), // 24 15-second slots (6 minutes of scheduling)
          queue: [],
          status: 'operational',
          type: satelliteType, // Realistic mix of satellite generations
        };
        
        // Calculate initial position
        this.updateSatellitePosition(satellite, 0);
        
        // Add to collection
        this.satellites.set(id, satellite);
      }
    }
  }
  
  private initializeGroundStations(): void {
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
          internet: true,
        },
        coverage: {
          radius: 1000, // km
        },
        bandwidth: 1000, // Mbps
        queue: [],
        status: 'operational',
      };
      
      // Add to collection
      this.groundStations.set(id, groundStation);
    });
  }
  
  private updateSatellitePositions(deltaTime: number): void {
    this.satellites.forEach(satellite => {
      this.updateSatellitePosition(satellite, deltaTime);
    });
  }
  
  private updateSatellitePosition(satellite: Satellite, deltaTime: number): void {
    // Simplified orbital mechanics calculation
    const { altitude, inclination, eccentricity, argumentOfPeriapsis, longitudeOfAscendingNode, meanAnomaly } = satellite.orbitalParameters;
    
    // Semi-major axis
    const semiMajorAxis = this.earthRadius + altitude;
    
    // Orbital period (in seconds) using Kepler's third law
    const period = 2 * Math.PI * Math.sqrt(Math.pow(semiMajorAxis, 3) / this.mu);
    
    // Update mean anomaly (in radians)
    const meanMotion = 2 * Math.PI / period; // radians per second
    satellite.orbitalParameters.meanAnomaly = (satellite.orbitalParameters.meanAnomaly + (meanMotion * deltaTime * 1000)) % 360;
    
    // Convert mean anomaly to eccentric anomaly (simplified for low eccentricity)
    const M = satellite.orbitalParameters.meanAnomaly * (Math.PI / 180);
    const E = M + eccentricity * Math.sin(M);
    
    // Convert eccentric anomaly to true anomaly
    const trueAnomaly = 2 * Math.atan2(
      Math.sqrt(1 + eccentricity) * Math.sin(E / 2),
      Math.sqrt(1 - eccentricity) * Math.cos(E / 2)
    );
    
    // Calculate distance from focus
    const distance = semiMajorAxis * (1 - eccentricity * Math.cos(E));
    
    // Convert orbital elements to position in orbital plane
    const xOrbit = distance * Math.cos(trueAnomaly);
    const yOrbit = distance * Math.sin(trueAnomaly);
    
    // Convert inclination, longitude of ascending node, and argument of periapsis to radians
    const incRad = inclination * (Math.PI / 180);
    const loanRad = longitudeOfAscendingNode * (Math.PI / 180);
    const aopRad = argumentOfPeriapsis * (Math.PI / 180);
    
    // Rotation matrices to transform from orbital plane to Earth-centered inertial frame
    // First rotate by argument of periapsis around z-axis
    const x1 = xOrbit * Math.cos(aopRad) - yOrbit * Math.sin(aopRad);
    const y1 = xOrbit * Math.sin(aopRad) + yOrbit * Math.cos(aopRad);
    const z1 = 0;
    
    // Then rotate by inclination around x-axis
    const x2 = x1;
    const y2 = y1 * Math.cos(incRad);
    const z2 = y1 * Math.sin(incRad);
    
    // Finally rotate by longitude of ascending node around z-axis
    const x = x2 * Math.cos(loanRad) - y2 * Math.sin(loanRad);
    const y = x2 * Math.sin(loanRad) + y2 * Math.cos(loanRad);
    const z = z2;
    
    // Update satellite position
    satellite.position = { x, y: z, z: y }; // Swap y and z for Three.js coordinate system
    
    // Calculate velocity (simplified)
    const speed = Math.sqrt(this.mu / semiMajorAxis);
    const vx = -speed * Math.sin(trueAnomaly + aopRad + loanRad);
    const vy = speed * Math.cos(trueAnomaly + aopRad + loanRad) * Math.cos(incRad);
    const vz = speed * Math.cos(trueAnomaly + aopRad + loanRad) * Math.sin(incRad);
    
    satellite.velocity = { x: vx, y: vz, z: vy }; // Swap y and z for Three.js coordinate system
  }
  
  private updateSatelliteConnections(): void {
    // Clear existing connections
    this.satellites.forEach(satellite => {
      satellite.connections.satellites = [];
    });
    
    // Establish new connections based on realistic RF field of view
    const satelliteArray = Array.from(this.satellites.values());
    
    for (let i = 0; i < satelliteArray.length; i++) {
      const satelliteA = satelliteArray[i];
      
      for (let j = i + 1; j < satelliteArray.length; j++) {
        const satelliteB = satelliteArray[j];
        
        // Check if satellites can "see" each other (RF line of sight)
        if (this.hasRfLineOfSight(satelliteA, satelliteB)) {
          // Calculate distance for connection feasibility
          const distance = this.calculateDistance(satelliteA.position, satelliteB.position);
          
          // Realistic RF connection ranges based on satellite generation
          const maxRfRange = this.getMaxRfRange(satelliteA, satelliteB);
          
          if (distance <= maxRfRange) {
            // Bidirectional RF connection
            satelliteA.connections.satellites.push(satelliteB.id);
            satelliteB.connections.satellites.push(satelliteA.id);
          }
        }
      }
    }
  }
  
  // Check if two satellites have RF line of sight (not blocked by Earth)
  private hasRfLineOfSight(satA: Satellite, satB: Satellite): boolean {
    const posA = satA.position;
    const posB = satB.position;
    
    // Vector from satA to satB
    const direction = {
      x: posB.x - posA.x,
      y: posB.y - posA.y,
      z: posB.z - posA.z
    };
    
    const distance = Math.sqrt(direction.x * direction.x + direction.y * direction.y + direction.z * direction.z);
    
    // Normalize direction vector
    const unitDir = {
      x: direction.x / distance,
      y: direction.y / distance,
      z: direction.z / distance
    };
    
    // Check for Earth occlusion by finding closest point on line to Earth center
    // Using parametric line equation: P = posA + t * unitDir
    // Find t where line is closest to origin (Earth center)
    const t = -(posA.x * unitDir.x + posA.y * unitDir.y + posA.z * unitDir.z);
    
    // Clamp t to line segment
    const tClamped = Math.max(0, Math.min(distance, t));
    
    // Calculate closest point on line segment to Earth center
    const closestPoint = {
      x: posA.x + tClamped * unitDir.x,
      y: posA.y + tClamped * unitDir.y,
      z: posA.z + tClamped * unitDir.z
    };
    
    // Calculate distance from closest point to Earth center
    const distanceToEarth = Math.sqrt(
      closestPoint.x * closestPoint.x + 
      closestPoint.y * closestPoint.y + 
      closestPoint.z * closestPoint.z
    );
    
    // If line passes within Earth radius + atmosphere buffer, it's blocked
    const earthRadiusWithBuffer = this.earthRadius + 100; // 100km atmosphere buffer
    
    return distanceToEarth > earthRadiusWithBuffer;
  }
  
  // Get maximum RF range between two satellites based on their capabilities
  private getMaxRfRange(satA: Satellite, satB: Satellite): number {
    // Base RF range for different satellite generations
    const baseRanges = {
      'v0.9': 1200, // km - early generation, limited RF
      'v1.0': 1400, // km - improved RF capabilities  
      'v1.5': 1600, // km - enhanced ISL capabilities
      'v2.0': 1800  // km - latest generation with best RF
    };
    
    // Take the minimum range of the two satellites (limiting factor)
    const rangeA = baseRanges[satA.type] || baseRanges['v1.0'];
    const rangeB = baseRanges[satB.type] || baseRanges['v1.0'];
    
    return Math.min(rangeA, rangeB);
  }
  
  // Get ISL bandwidth based on satellite generation (RF, not laser)
  private getIsLinkBandwidth(type: string): number {
    // RF ISL throughput is much lower than laser would be
    // These are realistic RF data rates for satellite ISL
    const rfBandwidths = {
      'v0.9': 25,  // Mbps - basic RF ISL
      'v1.0': 40,  // Mbps - improved RF modulation  
      'v1.5': 60,  // Mbps - better RF transceivers
      'v2.0': 80   // Mbps - latest RF technology
    };
    
    return rfBandwidths[type as keyof typeof rfBandwidths] || rfBandwidths['v1.0'];
  }
  
  // Get realistic satellite type distribution
  private getSatelliteType(): 'v0.9' | 'v1.0' | 'v1.5' | 'v2.0' {
    const random = Math.random();
    
    // Realistic distribution based on actual constellation deployment
    if (random < 0.05) return 'v0.9';     // 5% - early prototypes
    if (random < 0.30) return 'v1.0';     // 25% - initial production
    if (random < 0.85) return 'v1.5';     // 55% - current generation
    return 'v2.0';                        // 15% - latest generation
  }
  
  // Add customer laser terminal (special case for backhaul customers)
  public addCustomerLaserTerminal(customerId: string, satelliteId: string, bandwidth: number): boolean {
    // Customer brings their own laser terminal and uses satellite for backhaul
    // This is rare and expensive but provides high-bandwidth point-to-point link
    if (!this.satellites.has(satelliteId)) {
      return false;
    }
    
    this.customerLaserTerminals.set(customerId, {
      satelliteId: satelliteId,
      bandwidth: bandwidth // Much higher than RF (e.g., 1000+ Mbps)
    });
    
    return true;
  }
  
  // Get customer laser terminal info
  public getCustomerLaserTerminal(customerId: string): { satelliteId: string, bandwidth: number } | undefined {
    return this.customerLaserTerminals.get(customerId);
  }
  
  private updateGroundStationConnections(): void {
    // Clear existing connections
    this.groundStations.forEach(groundStation => {
      groundStation.connections.satellites = [];
    });
    
    this.satellites.forEach(satellite => {
      satellite.connections.groundStations = [];
    });
    
    // Establish new connections
    this.groundStations.forEach(groundStation => {
      const groundStationPosition = this.geoToCartesian(groundStation.position);
      
      this.satellites.forEach(satellite => {
        // Calculate distance
        const distance = this.calculateDistance(
          { x: groundStationPosition.x, y: groundStationPosition.y, z: groundStationPosition.z },
          satellite.position
        );
        
        // Check if satellite is visible from ground station
        // This is a simplification - in reality, visibility depends on elevation angle
        const maxGroundDistance = 2000; // km
        
        if (distance < maxGroundDistance) {
          groundStation.connections.satellites.push(satellite.id);
          satellite.connections.groundStations.push(groundStation.id);
        }
      });
    });
  }
  
  private processPackets(deltaTime: number): void {
    // Process each packet
    this.packets.forEach(packet => {
      // Skip delivered or dropped packets
      if (packet.status === 'delivered' || packet.status === 'dropped') {
        return;
      }
      
      // Update packet latency
      packet.latency += deltaTime;
      
      // Check if packet has timed out
      if (packet.latency > 30) { // 30 seconds timeout
        packet.status = 'dropped';
        this.emit('packetDropped', packet);
        return;
      }
      
      // Process packet based on current location
      const currentNodeId = packet.path[packet.path.length - 1];
      const currentNodeType = this.getNodeType(currentNodeId);
      
      if (currentNodeType === 'satellite') {
        const satellite = this.satellites.get(currentNodeId);
        if (!satellite) return;
        
        // Check if packet is at front of queue
        if (satellite.queue.length > 0 && satellite.queue[0].id === packet.id) {
          // Process packet
          this.processPacketAtSatellite(packet, satellite, deltaTime);
        }
      } else if (currentNodeType === 'groundStation') {
        const groundStation = this.groundStations.get(currentNodeId);
        if (!groundStation) return;
        
        // Check if packet is at front of queue
        if (groundStation.queue.length > 0 && groundStation.queue[0].id === packet.id) {
          // Process packet
          this.processPacketAtGroundStation(packet, groundStation, deltaTime);
        }
      }
    });
  }
  
  private processPacketAtSatellite(packet: DataPacket, satellite: Satellite, deltaTime: number): void {
    // Check if packet has reached destination
    if (packet.destination.type === 'satellite' && packet.destination.id === satellite.id) {
      // Packet delivered
      packet.status = 'delivered';
      
      // Remove from queue
      satellite.queue.shift();
      
      // Emit packet delivered event
      this.emit('packetDelivered', packet);
      return;
    }
    
    // Calculate transmission time based on packet size and bandwidth
    const transmissionTime = packet.size / (satellite.bandwidth.interSatellite * 1024 / 8); // seconds
    
    // Check if enough time has passed to transmit packet
    if (packet.latency >= transmissionTime) {
      // Find next hop
      const nextHop = this.findNextHop(packet, satellite.id);
      
      if (nextHop) {
        // Add to path
        packet.path.push(nextHop);
        
        // Remove from current queue
        satellite.queue.shift();
        
        // Add to next hop queue
        const nextNodeType = this.getNodeType(nextHop);
        if (nextNodeType === 'satellite') {
          const nextSatellite = this.satellites.get(nextHop);
          if (nextSatellite) {
            nextSatellite.queue.push(packet);
          }
        } else if (nextNodeType === 'groundStation') {
          const nextGroundStation = this.groundStations.get(nextHop);
          if (nextGroundStation) {
            nextGroundStation.queue.push(packet);
          }
        }
        
        // Emit packet routed event
        this.emit('packetRouted', packet, satellite.id, nextHop);
      } else {
        // No route found
        packet.status = 'dropped';
        
        // Remove from queue
        satellite.queue.shift();
        
        // Emit packet dropped event
        this.emit('packetDropped', packet);
      }
    }
  }
  
  private processPacketAtGroundStation(packet: DataPacket, groundStation: GroundStation, deltaTime: number): void {
    // Check if packet has reached destination
    if (packet.destination.type === 'groundStation' && packet.destination.id === groundStation.id) {
      // Packet delivered
      packet.status = 'delivered';
      
      // Remove from queue
      groundStation.queue.shift();
      
      // Emit packet delivered event
      this.emit('packetDelivered', packet);
      return;
    }
    
    // Check if packet destination is internet and ground station has internet
    if (packet.destination.type === 'internet' && groundStation.connections.internet) {
      // Packet delivered to internet
      packet.status = 'delivered';
      
      // Remove from queue
      groundStation.queue.shift();
      
      // Emit packet delivered event
      this.emit('packetDelivered', packet);
      return;
    }
    
    // Calculate transmission time based on packet size and bandwidth
    const transmissionTime = packet.size / (groundStation.bandwidth * 1024 / 8); // seconds
    
    // Check if enough time has passed to transmit packet
    if (packet.latency >= transmissionTime) {
      // Find next hop
      const nextHop = this.findNextHop(packet, groundStation.id);
      
      if (nextHop) {
        // Add to path
        packet.path.push(nextHop);
        
        // Remove from current queue
        groundStation.queue.shift();
        
        // Add to next hop queue
        const nextNodeType = this.getNodeType(nextHop);
        if (nextNodeType === 'satellite') {
          const nextSatellite = this.satellites.get(nextHop);
          if (nextSatellite) {
            nextSatellite.queue.push(packet);
          }
        } else if (nextNodeType === 'groundStation') {
          const nextGroundStation = this.groundStations.get(nextHop);
          if (nextGroundStation) {
            nextGroundStation.queue.push(packet);
          }
        }
        
        // Emit packet routed event
        this.emit('packetRouted', packet, groundStation.id, nextHop);
      } else {
        // No route found
        packet.status = 'dropped';
        
        // Remove from queue
        groundStation.queue.shift();
        
        // Emit packet dropped event
        this.emit('packetDropped', packet);
      }
    }
  }
  
  private findNextHop(packet: DataPacket, currentNodeId: string): string | null {
    const currentNodeType = this.getNodeType(currentNodeId);
    
    if (currentNodeType === 'satellite') {
      const satellite = this.satellites.get(currentNodeId);
      if (!satellite) return null;
      
      // PRIORITY 1: Always prefer ground stations when available (Starlink behavior)
      // Check if any connected ground station can reach the destination
      if (packet.destination.type === 'groundStation' || packet.destination.type === 'internet') {
        // Direct connection to destination ground station
        if (packet.destination.type === 'groundStation' && 
            satellite.connections.groundStations.includes(packet.destination.id)) {
          return packet.destination.id;
        }
        
        // For internet destinations or when no direct ground station connection,
        // prefer any ground station with internet connectivity
        for (const groundStationId of satellite.connections.groundStations) {
          if (packet.path.includes(groundStationId)) continue; // Avoid loops
          
          const groundStation = this.groundStations.get(groundStationId);
          if (groundStation && groundStation.connections.internet) {
            return groundStationId;
          }
        }
      }
        
      // PRIORITY 2: If no ground station available, use satellite mesh backhaul
      // This implements realistic Starlink routing behavior
      if (packet.destination.type === 'groundStation') {
        if (packet.destination.position) {
          // First, try to find a satellite that has direct ground station access
          // closer to the destination
          let bestSatelliteWithGroundAccess: string | null = null;
          let bestGroundStationDistance = Infinity;
          
          for (const connectedSatelliteId of satellite.connections.satellites) {
            if (packet.path.includes(connectedSatelliteId)) continue; // Avoid loops
            
            const connectedSatellite = this.satellites.get(connectedSatelliteId);
            if (!connectedSatellite) continue;
            
            // Check if this satellite has any ground station connections
            if (connectedSatellite.connections.groundStations.length > 0) {
              // Find the closest ground station to our destination from this satellite
              for (const gsId of connectedSatellite.connections.groundStations) {
                const gs = this.groundStations.get(gsId);
                if (!gs) continue;
                
                const distance = this.calculateGeoDistance(gs.position, packet.destination.position);
                if (distance < bestGroundStationDistance) {
                  bestGroundStationDistance = distance;
                  bestSatelliteWithGroundAccess = connectedSatelliteId;
                }
              }
            }
          }
          
          // If we found a satellite with better ground access, route through it
          if (bestSatelliteWithGroundAccess) {
            return bestSatelliteWithGroundAccess;
          }
          
          // Otherwise, use geographic routing through satellite mesh
          let bestMeshHop: string | null = null;
          let shortestDistance = Infinity;
          
          for (const connectedSatelliteId of satellite.connections.satellites) {
            if (packet.path.includes(connectedSatelliteId)) continue; // Avoid loops
            
            const connectedSatellite = this.satellites.get(connectedSatelliteId);
            if (!connectedSatellite) continue;
            
            // Calculate distance to destination
            const destPosition = this.geoToCartesian(packet.destination.position);
            const distance = this.calculateDistance(
              connectedSatellite.position,
              { x: destPosition.x, y: destPosition.y, z: destPosition.z }
            );
            
            if (distance < shortestDistance) {
              shortestDistance = distance;
              bestMeshHop = connectedSatelliteId;
            }
          }
          
          return bestMeshHop;
        }
      } else if (packet.destination.type === 'internet') {
        // Find ground station with internet
        for (const groundStationId of satellite.connections.groundStations) {
          const groundStation = this.groundStations.get(groundStationId);
          if (groundStation && groundStation.connections.internet) {
            return groundStationId;
          }
        }
        
        // If no direct connection to internet ground station, route through satellite network
        let bestNextHop: string | null = null;
        let shortestPathLength = Infinity;
        
        for (const connectedSatelliteId of satellite.connections.satellites) {
          // Skip if already in path (avoid loops)
          if (packet.path.includes(connectedSatelliteId)) continue;
          
          const connectedSatellite = this.satellites.get(connectedSatelliteId);
          if (!connectedSatellite) continue;
          
          // Check if this satellite has a ground station with internet
          let hasInternetGroundStation = false;
          let pathLength = 1; // Start with 1 for the hop to this satellite
          
          for (const gsId of connectedSatellite.connections.groundStations) {
            const gs = this.groundStations.get(gsId);
            if (gs && gs.connections.internet) {
              hasInternetGroundStation = true;
              pathLength += 1; // Add 1 for the hop to the ground station
              break;
            }
          }
          
          if (hasInternetGroundStation && pathLength < shortestPathLength) {
            shortestPathLength = pathLength;
            bestNextHop = connectedSatelliteId;
          }
        }
        
        return bestNextHop;
      }
    } else if (currentNodeType === 'groundStation') {
      const groundStation = this.groundStations.get(currentNodeId);
      if (!groundStation) return null;
      
      // If destination is internet and ground station has internet
      if (packet.destination.type === 'internet' && groundStation.connections.internet) {
        return 'internet';
      }
      
      // If destination is another ground station
      if (packet.destination.type === 'groundStation') {
        // If destination is this ground station
        if (packet.destination.id === groundStation.id) {
          return null; // Already at destination
        }
        
        // Route through satellite network
        // Find satellite closest to destination
        let bestNextHop: string | null = null;
        let shortestDistance = Infinity;
        
        for (const connectedSatelliteId of groundStation.connections.satellites) {
          // Skip if already in path (avoid loops)
          if (packet.path.includes(connectedSatelliteId)) continue;
          
          const connectedSatellite = this.satellites.get(connectedSatelliteId);
          if (!connectedSatellite) continue;
          
          // If destination has position, calculate distance
          if (packet.destination.position) {
            const destPosition = this.geoToCartesian(packet.destination.position);
            const distance = this.calculateDistance(
              connectedSatellite.position,
              { x: destPosition.x, y: destPosition.y, z: destPosition.z }
            );
            
            if (distance < shortestDistance) {
              shortestDistance = distance;
              bestNextHop = connectedSatelliteId;
            }
          } else {
            // If no position, just pick first satellite
            return connectedSatelliteId;
          }
        }
        
        return bestNextHop;
      }
    }
    
    return null;
  }
  
  private routePacket(packet: DataPacket): void {
    // Mark as in-transit
    packet.status = 'in-transit';
    
    // Find next hop
    const currentNodeId = packet.path[packet.path.length - 1];
    const nextHop = this.findNextHop(packet, currentNodeId);
    
    if (nextHop) {
      // Add to path
      packet.path.push(nextHop);
      
      // Add to next hop queue
      const nextNodeType = this.getNodeType(nextHop);
      if (nextNodeType === 'satellite') {
        const nextSatellite = this.satellites.get(nextHop);
        if (nextSatellite) {
          nextSatellite.queue.push(packet);
        }
      } else if (nextNodeType === 'groundStation') {
        const nextGroundStation = this.groundStations.get(nextHop);
        if (nextGroundStation) {
          nextGroundStation.queue.push(packet);
        }
      }
      
      // Emit packet routed event
      this.emit('packetRouted', packet, currentNodeId, nextHop);
    } else {
      // No route found
      packet.status = 'dropped';
      
      // Emit packet dropped event
      this.emit('packetDropped', packet);
    }
  }
  
  private generateRandomPackets(deltaTime: number): void {
    // Generate random packets
    // This is a placeholder - in a real implementation, this would be based on traffic models
    const packetGenerationRate = 0.1; // packets per second
    
    if (Math.random() < packetGenerationRate * deltaTime) {
      // Generate a random packet
      const groundStations = Array.from(this.groundStations.values());
      if (groundStations.length < 2) return;
      
      // Randomly select source and destination ground stations
      let sourceIndex = Math.floor(Math.random() * groundStations.length);
      let destIndex;
      do {
        destIndex = Math.floor(Math.random() * groundStations.length);
      } while (destIndex === sourceIndex);
      
      const source = groundStations[sourceIndex];
      const destination = groundStations[destIndex];
      
      // Create packet
      this.createPacket(
        'groundStation',
        source.id,
        'groundStation',
        destination.id,
        Math.floor(Math.random() * 1000) + 100, // 100-1100 KB
        Math.floor(Math.random() * 3) // 0-2 priority
      );
    }
  }
  
  private getNodeType(id: string): 'satellite' | 'groundStation' | 'internet' | null {
    if (id === 'internet') return 'internet';
    if (id.startsWith('sat_')) return 'satellite';
    if (id.startsWith('gs_')) return 'groundStation';
    return null;
  }
  
  private calculateDistance(posA: Position, posB: Position): number {
    const dx = posA.x - posB.x;
    const dy = posA.y - posB.y;
    const dz = posA.z - posB.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  
  private calculateGeoDistance(posA: GeoPosition, posB: GeoPosition): number {
    // Haversine formula
    const lat1 = posA.latitude * (Math.PI / 180);
    const lon1 = posA.longitude * (Math.PI / 180);
    const lat2 = posB.latitude * (Math.PI / 180);
    const lon2 = posB.longitude * (Math.PI / 180);
    
    const dLat = lat2 - lat1;
    const dLon = lon2 - lon1;
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return this.earthRadius * c;
  }
  
  private geoToCartesian(geoPosition: GeoPosition): { x: number, y: number, z: number } {
    const lat = geoPosition.latitude * (Math.PI / 180);
    const lon = geoPosition.longitude * (Math.PI / 180);
    
    const x = this.earthRadius * Math.cos(lat) * Math.cos(lon);
    const y = this.earthRadius * Math.sin(lat);
    const z = this.earthRadius * Math.cos(lat) * Math.sin(lon);
    
    return { x, y, z }; // Proper Three.js coordinate system
  }
}
