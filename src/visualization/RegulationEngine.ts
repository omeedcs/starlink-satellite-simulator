import * as THREE from 'three';

export interface FCCRule {
  id: string;
  title: string;
  section: string;
  description: string;
  applicableFrequencyBands: string[];
  elevationConstraints?: {
    minElevation: number; // degrees
    maxElevation: number; // degrees
    azimuthExclusions?: Array<{ start: number; end: number }>; // degrees
  };
  powerLimits?: {
    maxEIRP: number; // dBW
    maxPSD: number; // dBW/Hz
    dutyCycle?: number; // percentage
  };
  coordinationRequirements?: {
    protectedServices: string[];
    coordinationDistance: number; // km
    notificationThreshold: number; // dBW
  };
  geographicRestrictions?: {
    excludedRegions: Array<{
      type: 'circle' | 'polygon';
      coordinates: number[][];
      radius?: number; // km for circle type
    }>;
  };
  timeRestrictions?: {
    allowedHours: Array<{ start: string; end: string }>; // UTC format "HH:MM"
    seasonalRestrictions?: string[];
  };
  validFrom: string; // ISO date
  validTo?: string; // ISO date
}

export interface RegulationCompliance {
  isCompliant: boolean;
  violatedRules: string[];
  warnings: string[];
  restrictions: {
    allowedElevationRange: { min: number; max: number };
    allowedAzimuthRanges: Array<{ min: number; max: number }>;
    maxAllowedPower: number; // dBW
    allowedFrequencyBands: string[];
  };
}

export interface SpectrumAllocation {
  frequencyBand: string;
  startFrequency: number; // MHz
  endFrequency: number; // MHz
  allocation: string; // e.g., "FIXED-SATELLITE (space-to-Earth)"
  footnotes: string[];
  priority: number; // 1 = primary, 2 = secondary
  regions: number[]; // ITU regions (1, 2, 3)
}

export interface PowerLimitProfile {
  groundStationId: string;
  antennaId: string;
  currentEIRP: number; // dBW
  maxAllowedEIRP: number; // dBW
  currentPSD: number; // dBW/Hz
  maxAllowedPSD: number; // dBW/Hz
  compliance: boolean;
  margin: number; // dB
}

export class RegulationEngine {
  private fccRules: Map<string, FCCRule> = new Map();
  private spectrumAllocations: Map<string, SpectrumAllocation> = new Map();
  private complianceCache: Map<string, RegulationCompliance> = new Map();
  private powerLimitProfiles: Map<string, PowerLimitProfile> = new Map();
  
  // Real-time regulatory state
  private activeElevationMasks: Map<string, { min: number; max: number }> = new Map();
  private activeAzimuthExclusions: Map<string, Array<{ start: number; end: number }>> = new Map();
  private activePowerLimits: Map<string, { maxEIRP: number; maxPSD: number }> = new Map();
  
  // Regulation visualization
  private regulationOverlays: Map<string, THREE.Group> = new Map();
  private scene: THREE.Scene | null = null;
  
  constructor(scene?: THREE.Scene) {
    this.scene = scene || null;
    this.initializeDefaultRules();
    this.initializeSpectrumAllocations();
    
    console.log('RegulationEngine initialized with FCC rules and ITU spectrum allocations');
  }

  private initializeDefaultRules(): void {
    // FCC Part 25 - Satellite Communications
    const part25Rules: FCCRule[] = [
      {
        id: 'fcc_25_209',
        title: 'Earth station antenna performance standards',
        section: '25.209',
        description: 'Antenna performance standards for earth stations',
        applicableFrequencyBands: ['Ka', 'Ku', 'C'],
        elevationConstraints: {
          minElevation: 5, // Minimum 5 degrees elevation
          maxElevation: 90
        },
        powerLimits: {
          maxEIRP: 65, // dBW for typical Ku-band
          maxPSD: -4.5, // dBW/Hz
          dutyCycle: 100
        },
        validFrom: '2000-01-01T00:00:00Z'
      },
      {
        id: 'fcc_25_227',
        title: 'Off-axis EIRP density limits',
        section: '25.227',
        description: 'Limitations on off-axis EIRP density for satellite terminals',
        applicableFrequencyBands: ['Ku', 'Ka'],
        powerLimits: {
          maxEIRP: 55, // dBW
          maxPSD: -14, // dBW/Hz for off-axis emissions
          dutyCycle: 100
        },
        geographicRestrictions: {
          excludedRegions: [
            {
              type: 'circle',
              coordinates: [[38.8951, -77.0364]], // Washington DC area
              radius: 100 // 100 km exclusion zone
            }
          ]
        },
        validFrom: '2003-03-07T00:00:00Z'
      },
      {
        id: 'fcc_25_232',
        title: 'Adjacent satellite protection',
        section: '25.232',
        description: 'Protection of adjacent satellites from interference',
        applicableFrequencyBands: ['Ka', 'Ku'],
        coordinationRequirements: {
          protectedServices: ['FSS', 'BSS'],
          coordinationDistance: 500, // km
          notificationThreshold: -130 // dBW
        },
        validFrom: '2005-09-15T00:00:00Z'
      },
      {
        id: 'radio_astronomy_protection',
        title: 'Radio Astronomy Service Protection',
        section: 'ITU-R RA.769',
        description: 'Protection of Radio Astronomy Services from satellite interference',
        applicableFrequencyBands: ['Ka', 'Ku', 'C'],
        elevationConstraints: {
          minElevation: 0,
          maxElevation: 10, // Low elevation restrictions near radio telescopes
          azimuthExclusions: [
            { start: 0, end: 360 } // Full azimuth exclusion when near RAS sites
          ]
        },
        geographicRestrictions: {
          excludedRegions: [
            {
              type: 'circle',
              coordinates: [[35.7721, -78.0943]], // Green Bank, WV
              radius: 50
            },
            {
              type: 'circle',
              coordinates: [[34.0788, -107.6184]], // VLA, NM
              radius: 30
            }
          ]
        },
        validFrom: '1992-01-01T00:00:00Z'
      }
    ];

    part25Rules.forEach(rule => {
      this.fccRules.set(rule.id, rule);
    });
  }

  private initializeSpectrumAllocations(): void {
    // ITU spectrum allocations for satellite services
    const allocations: SpectrumAllocation[] = [
      {
        frequencyBand: 'Ku_uplink',
        startFrequency: 14000, // MHz
        endFrequency: 14500,
        allocation: 'FIXED-SATELLITE (Earth-to-space)',
        footnotes: ['US315', 'S5.487A'],
        priority: 1,
        regions: [1, 2, 3]
      },
      {
        frequencyBand: 'Ku_downlink',
        startFrequency: 11700,
        endFrequency: 12200,
        allocation: 'FIXED-SATELLITE (space-to-Earth)',
        footnotes: ['S5.487', 'S5.487A'],
        priority: 1,
        regions: [1, 2, 3]
      },
      {
        frequencyBand: 'Ka_uplink',
        startFrequency: 27500,
        endFrequency: 30000,
        allocation: 'FIXED-SATELLITE (Earth-to-space)',
        footnotes: ['S5.536A', 'S5.541A'],
        priority: 1,
        regions: [1, 2, 3]
      },
      {
        frequencyBand: 'Ka_downlink',
        startFrequency: 17700,
        endFrequency: 20200,
        allocation: 'FIXED-SATELLITE (space-to-Earth)',
        footnotes: ['S5.484A', 'S5.516B'],
        priority: 1,
        regions: [1, 2, 3]
      }
    ];

    allocations.forEach(allocation => {
      this.spectrumAllocations.set(allocation.frequencyBand, allocation);
    });
  }

  public async loadRulesFromAPI(apiEndpoint: string): Promise<void> {
    try {
      const response = await fetch(apiEndpoint);
      const rules: FCCRule[] = await response.json();
      
      rules.forEach(rule => {
        this.fccRules.set(rule.id, rule);
      });
      
      console.log(`Loaded ${rules.length} regulatory rules from API`);
    } catch (error) {
      console.error('Failed to load rules from API:', error);
    }
  }

  public checkCompliance(
    groundStationId: string,
    antennaId: string,
    position: { latitude: number; longitude: number },
    frequencyBand: string,
    currentElevation: number,
    currentAzimuth: number,
    currentEIRP: number,
    currentTime: Date = new Date()
  ): RegulationCompliance {
    const cacheKey = `${groundStationId}_${antennaId}_${frequencyBand}_${currentElevation.toFixed(1)}_${currentAzimuth.toFixed(1)}`;
    
    // Check cache first
    const cached = this.complianceCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const compliance: RegulationCompliance = {
      isCompliant: true,
      violatedRules: [],
      warnings: [],
      restrictions: {
        allowedElevationRange: { min: 0, max: 90 },
        allowedAzimuthRanges: [{ min: 0, max: 360 }],
        maxAllowedPower: 65, // Default dBW
        allowedFrequencyBands: [frequencyBand]
      }
    };

    // Check each applicable rule
    for (const rule of this.fccRules.values()) {
      if (!rule.applicableFrequencyBands.includes(frequencyBand)) {
        continue;
      }

      // Check if rule is currently valid
      const ruleValidFrom = new Date(rule.validFrom);
      const ruleValidTo = rule.validTo ? new Date(rule.validTo) : null;
      
      if (currentTime < ruleValidFrom || (ruleValidTo && currentTime > ruleValidTo)) {
        continue;
      }

      // Check elevation constraints
      if (rule.elevationConstraints) {
        if (currentElevation < rule.elevationConstraints.minElevation ||
            currentElevation > rule.elevationConstraints.maxElevation) {
          compliance.isCompliant = false;
          compliance.violatedRules.push(`${rule.id}: Elevation ${currentElevation.toFixed(1)}° outside allowed range [${rule.elevationConstraints.minElevation}°, ${rule.elevationConstraints.maxElevation}°]`);
        }
        
        // Update allowed elevation range (most restrictive)
        compliance.restrictions.allowedElevationRange.min = Math.max(
          compliance.restrictions.allowedElevationRange.min,
          rule.elevationConstraints.minElevation
        );
        compliance.restrictions.allowedElevationRange.max = Math.min(
          compliance.restrictions.allowedElevationRange.max,
          rule.elevationConstraints.maxElevation
        );
      }

      // Check azimuth exclusions
      if (rule.elevationConstraints?.azimuthExclusions) {
        for (const exclusion of rule.elevationConstraints.azimuthExclusions) {
          if (this.isAzimuthInRange(currentAzimuth, exclusion.start, exclusion.end)) {
            compliance.isCompliant = false;
            compliance.violatedRules.push(`${rule.id}: Azimuth ${currentAzimuth.toFixed(1)}° in excluded range [${exclusion.start}°, ${exclusion.end}°]`);
          }
        }
      }

      // Check power limits
      if (rule.powerLimits) {
        if (currentEIRP > rule.powerLimits.maxEIRP) {
          compliance.isCompliant = false;
          compliance.violatedRules.push(`${rule.id}: EIRP ${currentEIRP.toFixed(1)} dBW exceeds limit ${rule.powerLimits.maxEIRP} dBW`);
        }
        
        // Update max allowed power (most restrictive)
        compliance.restrictions.maxAllowedPower = Math.min(
          compliance.restrictions.maxAllowedPower,
          rule.powerLimits.maxEIRP
        );
      }

      // Check geographic restrictions
      if (rule.geographicRestrictions?.excludedRegions) {
        for (const region of rule.geographicRestrictions.excludedRegions) {
          if (this.isPositionInExcludedRegion(position, region)) {
            compliance.isCompliant = false;
            compliance.violatedRules.push(`${rule.id}: Ground station in excluded geographic region`);
          }
        }
      }

      // Check time restrictions
      if (rule.timeRestrictions) {
        if (!this.isTimeAllowed(currentTime, rule.timeRestrictions)) {
          compliance.isCompliant = false;
          compliance.violatedRules.push(`${rule.id}: Operation not allowed at current time ${currentTime.toISOString()}`);
        }
      }
    }

    // Cache the result
    this.complianceCache.set(cacheKey, compliance);
    
    return compliance;
  }

  private isAzimuthInRange(azimuth: number, start: number, end: number): boolean {
    // Handle azimuth wrap-around
    const normalizedAz = ((azimuth % 360) + 360) % 360;
    const normalizedStart = ((start % 360) + 360) % 360;
    const normalizedEnd = ((end % 360) + 360) % 360;
    
    if (normalizedStart <= normalizedEnd) {
      return normalizedAz >= normalizedStart && normalizedAz <= normalizedEnd;
    } else {
      // Range crosses 0°
      return normalizedAz >= normalizedStart || normalizedAz <= normalizedEnd;
    }
  }

  private isPositionInExcludedRegion(
    position: { latitude: number; longitude: number },
    region: { type: 'circle' | 'polygon'; coordinates: number[][]; radius?: number }
  ): boolean {
    if (region.type === 'circle') {
      const [centerLat, centerLon] = region.coordinates[0];
      const distance = this.calculateDistance(
        position.latitude, position.longitude,
        centerLat, centerLon
      );
      return distance <= (region.radius || 0);
    }
    
    // For polygon regions, implement point-in-polygon test
    // Simplified implementation for now
    return false;
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    // Haversine formula for great circle distance
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  private isTimeAllowed(currentTime: Date, restrictions: FCCRule['timeRestrictions']): boolean {
    if (!restrictions?.allowedHours || restrictions.allowedHours.length === 0) {
      return true;
    }
    
    const currentHour = currentTime.getUTCHours();
    const currentMinute = currentTime.getUTCMinutes();
    const currentTimeMinutes = currentHour * 60 + currentMinute;
    
    for (const window of restrictions.allowedHours) {
      const [startHour, startMinute] = window.start.split(':').map(Number);
      const [endHour, endMinute] = window.end.split(':').map(Number);
      
      const startMinutes = startHour * 60 + startMinute;
      const endMinutes = endHour * 60 + endMinute;
      
      if (startMinutes <= endMinutes) {
        if (currentTimeMinutes >= startMinutes && currentTimeMinutes <= endMinutes) {
          return true;
        }
      } else {
        // Window crosses midnight
        if (currentTimeMinutes >= startMinutes || currentTimeMinutes <= endMinutes) {
          return true;
        }
      }
    }
    
    return false;
  }

  public createRegulationVisualization(
    groundStationId: string,
    antennaPosition: THREE.Vector3,
    compliance: RegulationCompliance
  ): THREE.Group {
    if (!this.scene) {
      console.warn('No scene provided for regulation visualization');
      return new THREE.Group();
    }

    const visualizationGroup = new THREE.Group();
    visualizationGroup.name = `regulation_overlay_${groundStationId}`;

    // Create elevation mask visualization
    const elevationMask = this.createElevationMaskGeometry(
      antennaPosition,
      compliance.restrictions.allowedElevationRange
    );
    
    if (elevationMask) {
      visualizationGroup.add(elevationMask);
    }

    // Create azimuth exclusion zones
    compliance.restrictions.allowedAzimuthRanges.forEach((range, index) => {
      const azimuthZone = this.createAzimuthZoneGeometry(
        antennaPosition,
        range,
        compliance.isCompliant
      );
      if (azimuthZone) {
        azimuthZone.name = `azimuth_zone_${index}`;
        visualizationGroup.add(azimuthZone);
      }
    });

    // Store in cache
    this.regulationOverlays.set(groundStationId, visualizationGroup);

    return visualizationGroup;
  }

  private createElevationMaskGeometry(
    antennaPosition: THREE.Vector3,
    elevationRange: { min: number; max: number }
  ): THREE.Mesh | null {
    const radius = 1000; // 1km visualization radius
    const segments = 64;
    
    const geometry = new THREE.RingGeometry(
      radius * Math.tan(elevationRange.min * Math.PI / 180),
      radius * Math.tan(elevationRange.max * Math.PI / 180),
      0, segments
    );
    
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(antennaPosition);
    mesh.rotation.x = -Math.PI / 2; // Make horizontal
    
    return mesh;
  }

  private createAzimuthZoneGeometry(
    antennaPosition: THREE.Vector3,
    azimuthRange: { min: number; max: number },
    isCompliant: boolean
  ): THREE.Mesh | null {
    const radius = 500; // 500m visualization radius
    const height = 200; // 200m height
    
    const startAngle = azimuthRange.min * Math.PI / 180;
    const endAngle = azimuthRange.max * Math.PI / 180;
    
    const geometry = new THREE.CylinderGeometry(
      radius, radius, height,
      16, 1, false,
      startAngle, endAngle - startAngle
    );
    
    const material = new THREE.MeshBasicMaterial({
      color: isCompliant ? 0x00ff00 : 0xff0000,
      transparent: true,
      opacity: 0.3
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(antennaPosition);
    mesh.position.y += height / 2;
    
    return mesh;
  }

  public updatePowerLimitProfile(
    groundStationId: string,
    antennaId: string,
    currentEIRP: number,
    currentPSD: number
  ): PowerLimitProfile {
    const profileId = `${groundStationId}_${antennaId}`;
    
    // Get maximum allowed limits from regulations
    let maxEIRP = 65; // Default
    let maxPSD = -4.5; // Default
    
    for (const rule of this.fccRules.values()) {
      if (rule.powerLimits) {
        maxEIRP = Math.min(maxEIRP, rule.powerLimits.maxEIRP);
        maxPSD = Math.min(maxPSD, rule.powerLimits.maxPSD);
      }
    }
    
    const profile: PowerLimitProfile = {
      groundStationId,
      antennaId,
      currentEIRP,
      maxAllowedEIRP: maxEIRP,
      currentPSD,
      maxAllowedPSD: maxPSD,
      compliance: currentEIRP <= maxEIRP && currentPSD <= maxPSD,
      margin: Math.min(maxEIRP - currentEIRP, maxPSD - currentPSD)
    };
    
    this.powerLimitProfiles.set(profileId, profile);
    
    return profile;
  }

  public getRegulationSummary(): {
    totalRules: number;
    activeRules: number;
    complianceChecks: number;
    violationCount: number;
  } {
    let violationCount = 0;
    
    this.complianceCache.forEach(compliance => {
      if (!compliance.isCompliant) {
        violationCount++;
      }
    });
    
    return {
      totalRules: this.fccRules.size,
      activeRules: this.fccRules.size, // Simplification - in practice would check validity dates
      complianceChecks: this.complianceCache.size,
      violationCount
    };
  }

  public clearCache(): void {
    this.complianceCache.clear();
  }

  public dispose(): void {
    this.clearCache();
    this.powerLimitProfiles.clear();
    this.regulationOverlays.forEach(overlay => {
      if (this.scene) {
        this.scene.remove(overlay);
      }
    });
    this.regulationOverlays.clear();
  }
}