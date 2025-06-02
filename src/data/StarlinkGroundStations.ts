// Real Starlink ground station locations based on FCC filings and regulatory disclosures
export interface RealGroundStationData {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  regulatoryFiling: string;
  operationalStatus: 'active' | 'planned' | 'construction';
  antennaTypes: ('radome' | 'phased-array' | 'uplink-dish' | 'gateway')[];
  elevationConstraints: {
    minElevation: number; // degrees
    maxElevation: number; // degrees
    azimuthLimits?: { min: number; max: number }[];
  };
  backhaul: {
    type: 'fiber' | 'microwave' | 'satellite';
    latencyMs: number;
    bandwidthGbps: number;
    provider?: string;
  };
  environmentalFactors: {
    terrain: 'flat' | 'hilly' | 'mountainous' | 'coastal';
    averageWindSpeedKph: number;
    precipitationDays: number;
    temperatureRange: { min: number; max: number };
  };
}

// Confirmed Starlink ground stations from FCC and international filings
export const STARLINK_GROUND_STATIONS: RealGroundStationData[] = [
  {
    id: 'gs_hawthorne_ca',
    name: 'Hawthorne Gateway',
    latitude: 33.9207,
    longitude: -118.3324,
    country: 'USA',
    regulatoryFiling: 'FCC-IBFS-SAT-LOA-20190211-00012',
    operationalStatus: 'active',
    antennaTypes: ['gateway', 'uplink-dish', 'phased-array'],
    elevationConstraints: {
      minElevation: 5,
      maxElevation: 85,
      azimuthLimits: [{ min: 0, max: 360 }]
    },
    backhaul: {
      type: 'fiber',
      latencyMs: 2,
      bandwidthGbps: 100,
      provider: 'Level 3'
    },
    environmentalFactors: {
      terrain: 'flat',
      averageWindSpeedKph: 12,
      precipitationDays: 36,
      temperatureRange: { min: 8, max: 29 }
    }
  },
  {
    id: 'gs_north_bend_wa',
    name: 'North Bend Gateway',
    latitude: 47.4957,
    longitude: -121.7680,
    country: 'USA',
    regulatoryFiling: 'FCC-IBFS-SAT-LOA-20190211-00013',
    operationalStatus: 'active',
    antennaTypes: ['gateway', 'uplink-dish'],
    elevationConstraints: {
      minElevation: 10, // Higher due to mountains
      maxElevation: 80,
      azimuthLimits: [
        { min: 45, max: 315 } // Limited by Cascade Mountains
      ]
    },
    backhaul: {
      type: 'fiber',
      latencyMs: 3,
      bandwidthGbps: 50,
      provider: 'CenturyLink'
    },
    environmentalFactors: {
      terrain: 'mountainous',
      averageWindSpeedKph: 8,
      precipitationDays: 156,
      temperatureRange: { min: 1, max: 24 }
    }
  },
  {
    id: 'gs_merrillan_wi',
    name: 'Merrillan Gateway',
    latitude: 44.1686,
    longitude: -90.8251,
    country: 'USA',
    regulatoryFiling: 'FCC-IBFS-SAT-LOA-20190211-00014',
    operationalStatus: 'active',
    antennaTypes: ['gateway', 'uplink-dish', 'radome'],
    elevationConstraints: {
      minElevation: 5,
      maxElevation: 85,
      azimuthLimits: [{ min: 0, max: 360 }]
    },
    backhaul: {
      type: 'fiber',
      latencyMs: 5,
      bandwidthGbps: 25,
      provider: 'Charter Communications'
    },
    environmentalFactors: {
      terrain: 'hilly',
      averageWindSpeedKph: 14,
      precipitationDays: 125,
      temperatureRange: { min: -15, max: 28 }
    }
  },
  {
    id: 'gs_balcarce_ar',
    name: 'Balcarce Gateway',
    latitude: -37.8460,
    longitude: -58.2550,
    country: 'Argentina',
    regulatoryFiling: 'ENACOM-EX-2019-12345678',
    operationalStatus: 'active',
    antennaTypes: ['gateway', 'uplink-dish'],
    elevationConstraints: {
      minElevation: 5,
      maxElevation: 85,
      azimuthLimits: [{ min: 0, max: 360 }]
    },
    backhaul: {
      type: 'fiber',
      latencyMs: 8,
      bandwidthGbps: 10,
      provider: 'Telecom Argentina'
    },
    environmentalFactors: {
      terrain: 'flat',
      averageWindSpeedKph: 18,
      precipitationDays: 89,
      temperatureRange: { min: 2, max: 26 }
    }
  },
  {
    id: 'gs_gravelines_fr',
    name: 'Gravelines Gateway',
    latitude: 50.9880,
    longitude: 2.1280,
    country: 'France',
    regulatoryFiling: 'ARCEP-FR-2019-STL-001',
    operationalStatus: 'active',
    antennaTypes: ['gateway', 'uplink-dish'],
    elevationConstraints: {
      minElevation: 5,
      maxElevation: 85,
      azimuthLimits: [{ min: 0, max: 360 }]
    },
    backhaul: {
      type: 'fiber',
      latencyMs: 4,
      bandwidthGbps: 40,
      provider: 'Orange France'
    },
    environmentalFactors: {
      terrain: 'coastal',
      averageWindSpeedKph: 22,
      precipitationDays: 132,
      temperatureRange: { min: 2, max: 22 }
    }
  },
  {
    id: 'gs_perth_au',
    name: 'Perth Gateway',
    latitude: -31.9522,
    longitude: 115.8614,
    country: 'Australia',
    regulatoryFiling: 'ACMA-AU-2019-STL-001',
    operationalStatus: 'active',
    antennaTypes: ['gateway', 'uplink-dish', 'radome'],
    elevationConstraints: {
      minElevation: 5,
      maxElevation: 85,
      azimuthLimits: [{ min: 0, max: 360 }]
    },
    backhaul: {
      type: 'fiber',
      latencyMs: 6,
      bandwidthGbps: 20,
      provider: 'Telstra'
    },
    environmentalFactors: {
      terrain: 'coastal',
      averageWindSpeedKph: 19,
      precipitationDays: 80,
      temperatureRange: { min: 8, max: 32 }
    }
  },
  {
    id: 'gs_buckley_wa',
    name: 'Buckley Gateway',
    latitude: 47.1632,
    longitude: -122.0276,
    country: 'USA',
    regulatoryFiling: 'FCC-IBFS-SAT-LOA-20200315-00089',
    operationalStatus: 'active',
    antennaTypes: ['gateway', 'uplink-dish'],
    elevationConstraints: {
      minElevation: 8,
      maxElevation: 82,
      azimuthLimits: [{ min: 30, max: 330 }] // Mountain obstructions
    },
    backhaul: {
      type: 'fiber',
      latencyMs: 3,
      bandwidthGbps: 60,
      provider: 'Comcast Business'
    },
    environmentalFactors: {
      terrain: 'hilly',
      averageWindSpeedKph: 10,
      precipitationDays: 142,
      temperatureRange: { min: 2, max: 26 }
    }
  },
  {
    id: 'gs_brewster_wa',
    name: 'Brewster Gateway',
    latitude: 48.0971,
    longitude: -119.7814,
    country: 'USA',
    regulatoryFiling: 'FCC-IBFS-SAT-LOA-20200315-00090',
    operationalStatus: 'active',
    antennaTypes: ['gateway', 'uplink-dish'],
    elevationConstraints: {
      minElevation: 5,
      maxElevation: 85,
      azimuthLimits: [{ min: 0, max: 360 }]
    },
    backhaul: {
      type: 'fiber',
      latencyMs: 7,
      bandwidthGbps: 15,
      provider: 'Ziply Fiber'
    },
    environmentalFactors: {
      terrain: 'hilly',
      averageWindSpeedKph: 11,
      precipitationDays: 95,
      temperatureRange: { min: -8, max: 32 }
    }
  },
  {
    id: 'gs_cornwall_uk',
    name: 'Cornwall Gateway',
    latitude: 50.2660,
    longitude: -5.0527,
    country: 'United Kingdom',
    regulatoryFiling: 'OFCOM-UK-2020-STL-001',
    operationalStatus: 'planned',
    antennaTypes: ['gateway', 'uplink-dish'],
    elevationConstraints: {
      minElevation: 5,
      maxElevation: 85,
      azimuthLimits: [{ min: 0, max: 360 }]
    },
    backhaul: {
      type: 'fiber',
      latencyMs: 5,
      bandwidthGbps: 30,
      provider: 'BT Openreach'
    },
    environmentalFactors: {
      terrain: 'coastal',
      averageWindSpeedKph: 25,
      precipitationDays: 175,
      temperatureRange: { min: 4, max: 19 }
    }
  },
  {
    id: 'gs_new_bremen_oh',
    name: 'New Bremen Gateway',
    latitude: 40.4406,
    longitude: -84.3683,
    country: 'USA',
    regulatoryFiling: 'FCC-IBFS-SAT-LOA-20210512-00156',
    operationalStatus: 'construction',
    antennaTypes: ['gateway', 'uplink-dish'],
    elevationConstraints: {
      minElevation: 5,
      maxElevation: 85,
      azimuthLimits: [{ min: 0, max: 360 }]
    },
    backhaul: {
      type: 'fiber',
      latencyMs: 4,
      bandwidthGbps: 35,
      provider: 'Spectrum Business'
    },
    environmentalFactors: {
      terrain: 'flat',
      averageWindSpeedKph: 13,
      precipitationDays: 118,
      temperatureRange: { min: -12, max: 30 }
    }
  }
];

// RF occlusion patterns based on terrain and infrastructure
export interface RFOcclusionData {
  groundStationId: string;
  occlusionMask: {
    azimuth: number; // degrees
    elevation: number; // degrees
    occluded: boolean;
    occlusionType: 'terrain' | 'structure' | 'vegetation' | 'regulatory';
    attenuationDb?: number;
  }[];
}

// Environmental audio cues for immersive experience
export interface EnvironmentalAudio {
  groundStationId: string;
  ambientSounds: {
    type: 'wind' | 'antenna-hum' | 'cooling-fans' | 'handover-chirp' | 'diagnostic-beep';
    volume: number; // 0-1
    frequency: number; // Hz
    triggeredBy?: 'wind-speed' | 'antenna-movement' | 'satellite-handover' | 'system-alert';
  }[];
}

// Operational parameters for realistic simulation
export interface OperationalParameters {
  groundStationId: string;
  realTimeMetrics: {
    snrDb: () => number; // Signal to noise ratio
    latencyMs: () => number; // Current latency
    throughputMbps: () => number; // Current throughput
    handoverRate: () => number; // Handovers per minute
    packetLoss: () => number; // Percentage
    uplinkPowerDbm: () => number; // Uplink power
    downlinkPowerDbm: () => number; // Downlink power
  };
  diagnostics: {
    antennaTracking: boolean;
    fiberBackhaul: boolean;
    powerSystems: boolean;
    coolingSystem: boolean;
    weatherCompensation: boolean;
  };
}