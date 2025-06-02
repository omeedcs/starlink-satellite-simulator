import { EventEmitter } from 'events';
import { GeoPosition } from '../models/SatelliteNetwork';
import { STARLINK_GROUND_STATIONS, RealGroundStationData } from '../data/StarlinkGroundStations';

export interface GroundStationData {
  id: string;
  name: string;
  position: GeoPosition;
  coverage: number;
  bandwidth: number;
  status: 'operational' | 'degraded' | 'offline';
  connections: {
    satellites: string[];
    internet: boolean;
  };
  traffic: {
    incoming: number;
    outgoing: number;
  };
  // Real-world data from regulatory filings
  country?: string;
  regulatoryFiling?: string;
  operationalStatus?: 'active' | 'planned' | 'construction';
  antennaTypes?: string[];
  elevationConstraints?: {
    minElevation: number;
    maxElevation: number;
    azimuthLimits?: { min: number; max: number }[];
  };
  backhaul?: {
    type: string;
    latencyMs: number;
    bandwidthGbps: number;
    provider?: string;
  };
  environmentalFactors?: {
    terrain: string;
    averageWindSpeedKph: number;
    precipitationDays: number;
    temperatureRange: { min: number; max: number };
  };
}

export class GroundStationNetwork extends EventEmitter {
  private groundStations: Map<string, GroundStationData> = new Map();
  
  constructor() {
    super();
    this.initializeGroundStations();
  }
  
  public getGroundStation(id: string): GroundStationData | undefined {
    return this.groundStations.get(id);
  }
  
  public getAllGroundStations(): GroundStationData[] {
    return Array.from(this.groundStations.values());
  }
  
  public update(deltaTime: number): void {
    // Update ground station traffic
    this.updateTraffic(deltaTime);
    
    // Emit update event
    this.emit('update');
  }
  
  public connectToSatellite(groundStationId: string, satelliteId: string): boolean {
    const groundStation = this.groundStations.get(groundStationId);
    if (!groundStation) return false;
    
    if (!groundStation.connections.satellites.includes(satelliteId)) {
      groundStation.connections.satellites.push(satelliteId);
      this.emit('connectionAdded', groundStationId, satelliteId);
      return true;
    }
    
    return false;
  }
  
  public disconnectFromSatellite(groundStationId: string, satelliteId: string): boolean {
    const groundStation = this.groundStations.get(groundStationId);
    if (!groundStation) return false;
    
    const index = groundStation.connections.satellites.indexOf(satelliteId);
    if (index !== -1) {
      groundStation.connections.satellites.splice(index, 1);
      this.emit('connectionRemoved', groundStationId, satelliteId);
      return true;
    }
    
    return false;
  }
  
  public setStatus(groundStationId: string, status: 'operational' | 'degraded' | 'offline'): boolean {
    const groundStation = this.groundStations.get(groundStationId);
    if (!groundStation) return false;
    
    groundStation.status = status;
    this.emit('statusChanged', groundStationId, status);
    return true;
  }
  
  public setBandwidth(groundStationId: string, bandwidth: number): boolean {
    const groundStation = this.groundStations.get(groundStationId);
    if (!groundStation) return false;
    
    groundStation.bandwidth = bandwidth;
    this.emit('bandwidthChanged', groundStationId, bandwidth);
    return true;
  }
  
  public addTraffic(groundStationId: string, direction: 'incoming' | 'outgoing', amount: number): boolean {
    const groundStation = this.groundStations.get(groundStationId);
    if (!groundStation) return false;
    
    if (direction === 'incoming') {
      groundStation.traffic.incoming += amount;
    } else {
      groundStation.traffic.outgoing += amount;
    }
    
    this.emit('trafficAdded', groundStationId, direction, amount);
    return true;
  }
  
  private initializeGroundStations(): void {
    // Use real Starlink ground station data from FCC filings
    STARLINK_GROUND_STATIONS.forEach((realStation: RealGroundStationData) => {
      // Convert real ground station data to internal format
      const groundStation: GroundStationData = {
        id: realStation.id,
        name: realStation.name,
        position: {
          latitude: realStation.latitude,
          longitude: realStation.longitude,
        },
        coverage: 1000, // km (standard coverage)
        bandwidth: realStation.backhaul.bandwidthGbps * 1000, // Convert Gbps to Mbps
        status: realStation.operationalStatus === 'active' ? 'operational' : 
                realStation.operationalStatus === 'construction' ? 'degraded' : 'offline',
        connections: {
          satellites: [],
          internet: true,
        },
        traffic: {
          incoming: 0,
          outgoing: 0,
        },
        // Include real-world data
        country: realStation.country,
        regulatoryFiling: realStation.regulatoryFiling,
        operationalStatus: realStation.operationalStatus,
        antennaTypes: realStation.antennaTypes,
        elevationConstraints: realStation.elevationConstraints,
        backhaul: realStation.backhaul,
        environmentalFactors: realStation.environmentalFactors,
      };
      
      // Add to collection
      this.groundStations.set(realStation.id, groundStation);
    });
    
    console.log(`Initialized ${STARLINK_GROUND_STATIONS.length} real Starlink ground stations from FCC filings`);
  }
  
  private updateTraffic(deltaTime: number): void {
    // Decay traffic over time
    this.groundStations.forEach(groundStation => {
      // Decay rate: 10% per second
      const decayRate = 0.1 * deltaTime;
      
      groundStation.traffic.incoming *= (1 - decayRate);
      groundStation.traffic.outgoing *= (1 - decayRate);
      
      // Add random traffic fluctuations
      if (groundStation.status === 'operational') {
        // Random traffic spikes (up to 10 Mbps)
        if (Math.random() < 0.05 * deltaTime) {
          const trafficSpike = Math.random() * 10;
          if (Math.random() < 0.5) {
            groundStation.traffic.incoming += trafficSpike;
          } else {
            groundStation.traffic.outgoing += trafficSpike;
          }
        }
      }
    });
  }
  
  // Calculate distance between two ground stations
  public calculateDistance(stationA: string, stationB: string): number {
    const a = this.groundStations.get(stationA);
    const b = this.groundStations.get(stationB);
    
    if (!a || !b) return Infinity;
    
    return this.calculateGeoDistance(a.position, b.position);
  }
  
  private calculateGeoDistance(posA: GeoPosition, posB: GeoPosition): number {
    // Haversine formula
    const earthRadius = 6371; // km
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
    
    return earthRadius * c;
  }
}
