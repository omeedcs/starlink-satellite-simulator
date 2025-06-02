import * as THREE from 'three';

export interface AntennaGainPattern {
  antennaId: string;
  antennaType: 'parabolic' | 'phased-array' | 'helical' | 'patch' | 'horn';
  frequencyBand: string;
  gainData: {
    type: 'lut' | 'analytical';
    // For LUT (Look-Up Table)
    azimuthSamples?: number[];
    elevationSamples?: number[];
    gainMatrix?: number[][]; // [azimuth][elevation] in dBi
    // For analytical
    peakGain?: number; // dBi
    beamwidth?: { azimuth: number; elevation: number }; // degrees
    sidelobeLevel?: number; // dB below peak
    crossPolLevel?: number; // dB
  };
  polarization: 'linear-h' | 'linear-v' | 'rhcp' | 'lhcp';
  mechanicalProperties: {
    diameter?: number; // meters
    efficiency?: number; // percentage
    maxSlewRate: number; // degrees/second
    maxAcceleration: number; // degrees/second²
    pointingAccuracy: number; // degrees RMS
  };
}

export interface AntennaConfiguration {
  antennaId: string;
  groundStationId: string;
  position: THREE.Vector3;
  currentPointing: { azimuth: number; elevation: number }; // degrees
  targetPointing: { azimuth: number; elevation: number }; // degrees
  slewState: {
    isSlewing: boolean;
    azimuthVelocity: number; // degrees/second
    elevationVelocity: number; // degrees/second
    targetAcquisitionTime: number; // seconds
    handoffInProgress: boolean;
  };
  gainProfile: AntennaGainPattern;
  currentGain: number; // dBi at current pointing
  maxGain: number; // dBi peak gain
}

export interface LinkBudgetCalculation {
  satelliteId: string;
  antennaId: string;
  frequency: number; // MHz
  distance: number; // km
  freeSpaceLoss: number; // dB
  antennaGain: number; // dBi
  atmosphericLoss: number; // dB
  rainLoss: number; // dB
  scintillationLoss: number; // dB
  totalPathLoss: number; // dB
  receivedPower: number; // dBW
  snr: number; // dB
  linkMargin: number; // dB
  linkQuality: 'excellent' | 'good' | 'marginal' | 'poor' | 'failed';
}

export class AntennaGainProfiles {
  private gainPatterns: Map<string, AntennaGainPattern> = new Map();
  private antennaConfigurations: Map<string, AntennaConfiguration> = new Map();
  private linkBudgets: Map<string, LinkBudgetCalculation> = new Map();
  
  // Performance optimization
  private gainInterpolationCache: Map<string, number> = new Map();
  private maxCacheSize: number = 10000;
  
  // Pre-computed analytical patterns
  private precomputedPatterns: Map<string, Float32Array> = new Map();
  
  constructor() {
    this.initializeStandardPatterns();
    console.log('AntennaGainProfiles initialized with standard patterns');
  }

  private initializeStandardPatterns(): void {
    // Standard parabolic dish pattern for Ku-band
    const kuParabolic: AntennaGainPattern = {
      antennaId: 'ku_parabolic_3m',
      antennaType: 'parabolic',
      frequencyBand: 'Ku',
      gainData: {
        type: 'analytical',
        peakGain: 42.0, // dBi for 3m dish at Ku-band
        beamwidth: { azimuth: 1.2, elevation: 1.2 }, // degrees
        sidelobeLevel: -18, // dB
        crossPolLevel: -25 // dB
      },
      polarization: 'rhcp',
      mechanicalProperties: {
        diameter: 3.0,
        efficiency: 65,
        maxSlewRate: 5.0, // degrees/second
        maxAcceleration: 2.0,
        pointingAccuracy: 0.1
      }
    };

    // Standard phased array pattern for Ka-band
    const kaPhased: AntennaGainPattern = {
      antennaId: 'ka_phased_array',
      antennaType: 'phased-array',
      frequencyBand: 'Ka',
      gainData: {
        type: 'analytical',
        peakGain: 38.0, // dBi
        beamwidth: { azimuth: 2.5, elevation: 2.5 },
        sidelobeLevel: -15,
        crossPolLevel: -20
      },
      polarization: 'linear-v',
      mechanicalProperties: {
        maxSlewRate: 180.0, // Electronic steering - very fast
        maxAcceleration: 1000.0,
        pointingAccuracy: 0.05
      }
    };

    // High-fidelity LUT pattern for specialized antenna
    const specializedLUT = this.generateHighFidelityLUT();
    
    this.gainPatterns.set(kuParabolic.antennaId, kuParabolic);
    this.gainPatterns.set(kaPhased.antennaId, kaPhased);
    this.gainPatterns.set(specializedLUT.antennaId, specializedLUT);
  }

  private generateHighFidelityLUT(): AntennaGainPattern {
    // Generate a high-resolution LUT pattern
    const azimuthSamples: number[] = [];
    const elevationSamples: number[] = [];
    const gainMatrix: number[][] = [];

    // Create samples every 0.1 degrees
    for (let az = 0; az < 360; az += 0.1) {
      azimuthSamples.push(az);
    }
    for (let el = 0; el <= 90; el += 0.1) {
      elevationSamples.push(el);
    }

    // Generate realistic gain pattern based on modified Bessel function
    for (let azIdx = 0; azIdx < azimuthSamples.length; azIdx++) {
      gainMatrix[azIdx] = [];
      for (let elIdx = 0; elIdx < elevationSamples.length; elIdx++) {
        const azimuth = azimuthSamples[azIdx];
        const elevation = elevationSamples[elIdx];
        
        // Calculate gain using realistic antenna pattern model
        const gain = this.calculateRealisticGainPattern(azimuth, elevation);
        gainMatrix[azIdx][elIdx] = gain;
      }
    }

    return {
      antennaId: 'high_fidelity_lut',
      antennaType: 'parabolic',
      frequencyBand: 'Ka',
      gainData: {
        type: 'lut',
        azimuthSamples,
        elevationSamples,
        gainMatrix,
        peakGain: 45.0
      },
      polarization: 'rhcp',
      mechanicalProperties: {
        diameter: 4.5,
        efficiency: 70,
        maxSlewRate: 3.0,
        maxAcceleration: 1.5,
        pointingAccuracy: 0.05
      }
    };
  }

  private calculateRealisticGainPattern(azimuth: number, elevation: number): number {
    // Realistic parabolic antenna gain pattern
    const peakGain = 45.0; // dBi
    const beamwidthAz = 0.8; // degrees
    const beamwidthEl = 0.8; // degrees
    
    // Normalized angular distances from boresight
    const thetaAz = azimuth * Math.PI / 180;
    const thetaEl = elevation * Math.PI / 180;
    const beamwidthAzRad = beamwidthAz * Math.PI / 180;
    const beamwidthElRad = beamwidthEl * Math.PI / 180;
    
    // Calculate pattern using modified sinc function
    const u = Math.PI * thetaAz / beamwidthAzRad;
    const v = Math.PI * thetaEl / beamwidthElRad;
    
    let gainLoss = 0;
    
    if (u !== 0) {
      gainLoss += 20 * Math.log10(Math.abs(Math.sin(u) / u));
    }
    if (v !== 0) {
      gainLoss += 20 * Math.log10(Math.abs(Math.sin(v) / v));
    }
    
    // Add sidelobe structure
    const sidelobeLevel = -18; // dB
    const angularDistance = Math.sqrt(thetaAz * thetaAz + thetaEl * thetaEl);
    
    if (angularDistance > beamwidthAzRad) {
      // Add realistic sidelobe pattern
      const sidelobePattern = sidelobeLevel + 
        10 * Math.log10(1 + Math.cos(angularDistance * 5));
      gainLoss = Math.max(gainLoss, sidelobePattern);
    }
    
    // Ensure minimum gain floor
    gainLoss = Math.max(gainLoss, -40); // -40 dB minimum
    
    return peakGain + gainLoss;
  }

  public getAntennaGain(
    antennaId: string,
    azimuth: number,
    elevation: number,
    frequency?: number
  ): number {
    const pattern = this.gainPatterns.get(antennaId);
    if (!pattern) {
      console.warn(`Antenna pattern not found: ${antennaId}`);
      return 0;
    }

    // Check cache first
    const cacheKey = `${antennaId}_${azimuth.toFixed(2)}_${elevation.toFixed(2)}`;
    const cachedGain = this.gainInterpolationCache.get(cacheKey);
    if (cachedGain !== undefined) {
      return cachedGain;
    }

    let gain = 0;

    if (pattern.gainData.type === 'analytical') {
      gain = this.calculateAnalyticalGain(pattern, azimuth, elevation);
    } else if (pattern.gainData.type === 'lut') {
      gain = this.interpolateGainFromLUT(pattern, azimuth, elevation);
    }

    // Apply frequency scaling if provided
    if (frequency && pattern.gainData.peakGain) {
      const frequencyScaling = this.calculateFrequencyScaling(
        frequency,
        pattern.frequencyBand
      );
      gain += frequencyScaling;
    }

    // Cache the result
    if (this.gainInterpolationCache.size < this.maxCacheSize) {
      this.gainInterpolationCache.set(cacheKey, gain);
    }

    return gain;
  }

  private calculateAnalyticalGain(
    pattern: AntennaGainPattern,
    azimuth: number,
    elevation: number
  ): number {
    const { peakGain, beamwidth, sidelobeLevel } = pattern.gainData;
    
    if (!peakGain || !beamwidth) {
      return 0;
    }

    // Normalize angles to boresight (assuming boresight at 0°, 90°)
    const boresightAz = 0;
    const boresightEl = 90;
    
    const deltaAz = azimuth - boresightAz;
    const deltaEl = elevation - boresightEl;
    
    // Calculate angular distance from boresight
    const angularDistance = Math.sqrt(deltaAz * deltaAz + deltaEl * deltaEl);
    
    // Main beam calculation
    if (angularDistance <= beamwidth.azimuth / 2) {
      // Within main beam - use cosine taper
      const tapering = Math.cos(
        Math.PI * angularDistance / beamwidth.azimuth
      );
      return peakGain + 20 * Math.log10(tapering);
    }
    
    // Sidelobe region
    const sidelobeGain = peakGain + (sidelobeLevel || -20);
    
    // Add random sidelobe variation for realism
    const sidelobeVariation = (Math.random() - 0.5) * 4; // ±2 dB variation
    
    return sidelobeGain + sidelobeVariation;
  }

  private interpolateGainFromLUT(
    pattern: AntennaGainPattern,
    azimuth: number,
    elevation: number
  ): number {
    const { azimuthSamples, elevationSamples, gainMatrix } = pattern.gainData;
    
    if (!azimuthSamples || !elevationSamples || !gainMatrix) {
      return 0;
    }

    // Find surrounding sample points
    const azIdx1 = this.findLowerIndex(azimuthSamples, azimuth);
    const azIdx2 = Math.min(azIdx1 + 1, azimuthSamples.length - 1);
    const elIdx1 = this.findLowerIndex(elevationSamples, elevation);
    const elIdx2 = Math.min(elIdx1 + 1, elevationSamples.length - 1);

    // Bilinear interpolation
    const az1 = azimuthSamples[azIdx1];
    const az2 = azimuthSamples[azIdx2];
    const el1 = elevationSamples[elIdx1];
    const el2 = elevationSamples[elIdx2];

    const gain11 = gainMatrix[azIdx1][elIdx1];
    const gain12 = gainMatrix[azIdx1][elIdx2];
    const gain21 = gainMatrix[azIdx2][elIdx1];
    const gain22 = gainMatrix[azIdx2][elIdx2];

    // Interpolation weights
    const wAz = az2 !== az1 ? (azimuth - az1) / (az2 - az1) : 0;
    const wEl = el2 !== el1 ? (elevation - el1) / (el2 - el1) : 0;

    // Bilinear interpolation
    const gain1 = gain11 * (1 - wEl) + gain12 * wEl;
    const gain2 = gain21 * (1 - wEl) + gain22 * wEl;
    const finalGain = gain1 * (1 - wAz) + gain2 * wAz;

    return finalGain;
  }

  private findLowerIndex(array: number[], value: number): number {
    let left = 0;
    let right = array.length - 1;
    
    while (left < right) {
      const mid = Math.floor((left + right + 1) / 2);
      if (array[mid] <= value) {
        left = mid;
      } else {
        right = mid - 1;
      }
    }
    
    return left;
  }

  private calculateFrequencyScaling(frequency: number, band: string): number {
    // Gain scales with frequency for aperture antennas
    // G = η * (π * D / λ)²
    
    const referenceFequencies = {
      'C': 6000, // MHz
      'Ku': 14000, // MHz
      'Ka': 20000, // MHz
    };
    
    const referenceFreq = referenceFequencies[band as keyof typeof referenceFequencies] || 14000;
    const freqRatio = frequency / referenceFreq;
    
    // Gain scales as 20*log10(frequency ratio)
    return 20 * Math.log10(freqRatio);
  }

  public calculateLinkBudget(
    antennaId: string,
    satelliteId: string,
    satellitePosition: THREE.Vector3,
    antennaPosition: THREE.Vector3,
    frequency: number, // MHz
    transmitPower: number, // dBW
    atmosphericConditions?: {
      rain: number; // mm/hr
      humidity: number; // %
      temperature: number; // °C
    }
  ): LinkBudgetCalculation {
    // Calculate distance
    const distance = antennaPosition.distanceTo(satellitePosition) / 1000; // Convert to km
    
    // Calculate pointing angles
    const direction = satellitePosition.clone().sub(antennaPosition).normalize();
    const azimuth = Math.atan2(direction.x, direction.z) * 180 / Math.PI;
    const elevation = Math.asin(direction.y) * 180 / Math.PI;
    
    // Get antenna gain
    const antennaGain = this.getAntennaGain(antennaId, azimuth, elevation, frequency);
    
    // Calculate free space loss
    const freeSpaceLoss = 20 * Math.log10(frequency) + 20 * Math.log10(distance) + 32.44;
    
    // Atmospheric losses
    const atmosphericLoss = this.calculateAtmosphericLoss(frequency, elevation, distance);
    const rainLoss = this.calculateRainLoss(
      frequency,
      elevation,
      atmosphericConditions?.rain || 0
    );
    const scintillationLoss = this.calculateScintillationLoss(frequency, elevation);
    
    // Total path loss
    const totalPathLoss = freeSpaceLoss + atmosphericLoss + rainLoss + scintillationLoss;
    
    // Received power
    const receivedPower = transmitPower + antennaGain - totalPathLoss;
    
    // Calculate SNR (simplified)
    const noiseTemperature = 150; // K (system noise temperature)
    const boltzmann = -228.6; // dBW/K/Hz
    const bandwidth = 36e6; // 36 MHz typical
    const noisePower = boltzmann + 10 * Math.log10(noiseTemperature) + 10 * Math.log10(bandwidth);
    const snr = receivedPower - noisePower;
    
    // Link margin
    const requiredSNR = 10; // dB for decent quality
    const linkMargin = snr - requiredSNR;
    
    // Determine link quality
    let linkQuality: LinkBudgetCalculation['linkQuality'];
    if (linkMargin > 6) linkQuality = 'excellent';
    else if (linkMargin > 3) linkQuality = 'good';
    else if (linkMargin > 0) linkQuality = 'marginal';
    else if (linkMargin > -6) linkQuality = 'poor';
    else linkQuality = 'failed';
    
    const linkBudget: LinkBudgetCalculation = {
      satelliteId,
      antennaId,
      frequency,
      distance,
      freeSpaceLoss,
      antennaGain,
      atmosphericLoss,
      rainLoss,
      scintillationLoss,
      totalPathLoss,
      receivedPower,
      snr,
      linkMargin,
      linkQuality
    };
    
    // Cache the result
    const linkKey = `${antennaId}_${satelliteId}`;
    this.linkBudgets.set(linkKey, linkBudget);
    
    return linkBudget;
  }

  private calculateAtmosphericLoss(frequency: number, elevation: number, distance: number): number {
    // ITU-R P.676 atmospheric attenuation model (simplified)
    const elevationRad = elevation * Math.PI / 180;
    const zenithLoss = 0.1 * Math.pow(frequency / 1000, 2); // dB at zenith
    
    // Atmospheric path length factor
    const pathFactor = 1 / Math.sin(elevationRad);
    
    return zenithLoss * Math.min(pathFactor, 10); // Cap at 10x zenith loss
  }

  private calculateRainLoss(frequency: number, elevation: number, rainRate: number): number {
    // ITU-R P.618 rain attenuation model (simplified)
    if (rainRate <= 0) return 0;
    
    // Rain attenuation coefficients (frequency dependent)
    const k = 0.0001 * Math.pow(frequency / 1000, 1.5);
    const alpha = 1.2;
    
    // Specific attenuation
    const gammaR = k * Math.pow(rainRate, alpha);
    
    // Effective path length through rain
    const elevationRad = elevation * Math.PI / 180;
    const effectiveHeight = 4; // km (typical rain height)
    const pathLength = effectiveHeight / Math.sin(elevationRad);
    
    return gammaR * pathLength;
  }

  private calculateScintillationLoss(frequency: number, elevation: number): number {
    // Scintillation loss due to atmospheric turbulence
    const elevationRad = elevation * Math.PI / 180;
    const scintillationVariance = 0.1 * Math.pow(frequency / 10000, 1.5) / Math.sin(elevationRad);
    
    // Return 99% availability loss
    return 2 * Math.sqrt(scintillationVariance);
  }

  public addCustomPattern(pattern: AntennaGainPattern): void {
    this.gainPatterns.set(pattern.antennaId, pattern);
    
    // Pre-compute pattern for performance if it's analytical
    if (pattern.gainData.type === 'analytical') {
      this.precomputeAnalyticalPattern(pattern);
    }
  }

  private precomputeAnalyticalPattern(pattern: AntennaGainPattern): void {
    const resolution = 1.0; // degrees
    const samples = Math.ceil(360 / resolution) * Math.ceil(90 / resolution);
    const precomputed = new Float32Array(samples);
    
    let index = 0;
    for (let az = 0; az < 360; az += resolution) {
      for (let el = 0; el <= 90; el += resolution) {
        precomputed[index] = this.calculateAnalyticalGain(pattern, az, el);
        index++;
      }
    }
    
    this.precomputedPatterns.set(pattern.antennaId, precomputed);
  }

  public getPatternStatistics(antennaId: string): {
    peakGain: number;
    beamwidth3dB: { azimuth: number; elevation: number };
    sidelobeLevel: number;
    frontToBackRatio: number;
  } | null {
    const pattern = this.gainPatterns.get(antennaId);
    if (!pattern) return null;
    
    // Calculate statistics from the pattern
    const stats = {
      peakGain: pattern.gainData.peakGain || 0,
      beamwidth3dB: pattern.gainData.beamwidth || { azimuth: 0, elevation: 0 },
      sidelobeLevel: pattern.gainData.sidelobeLevel || -20,
      frontToBackRatio: 25 // Typical value
    };
    
    return stats;
  }

  public clearCache(): void {
    this.gainInterpolationCache.clear();
  }

  public dispose(): void {
    this.clearCache();
    this.linkBudgets.clear();
    this.precomputedPatterns.clear();
  }
}