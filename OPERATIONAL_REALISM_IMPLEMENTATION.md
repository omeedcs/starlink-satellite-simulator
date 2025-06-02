# Operational Realism Engine Implementation

## Overview

This implementation provides a comprehensive multi-fidelity operational realism system for the Starlink satellite simulation, transforming it from a basic visualization into a field-accurate, scenario-ready engineering tool.

## Core Components Implemented

### 1. RF Occlusion Engine (`RFOcclusionEngine.ts`)
**Raycasting-based occlusion system with terrain/building intersection detection**

- **THREE.Raycaster Implementation**: Fixed 1° angular resolution raycasting
- **Environment Mesh Integration**: Supports terrain, buildings, structures, and RF-opaque objects
- **Material-Based Attenuation**: Signal loss calculations per material type (concrete, metal, wood, earth)
- **View Mask Caching**: Real-time cached occlusion masks for performance optimization
- **Performance Pool**: Pre-allocated raycaster pool for high-performance operation

**Key Features:**
- Angular sweep occlusion mapping
- Signal attenuation modeling (dB loss per meter)
- RF opacity detection
- Real-time view mask generation and caching
- Comprehensive occlusion statistics

### 2. Regulation Engine (`RegulationEngine.ts`)
**Modular FCC/ITU regulatory compliance system**

- **FCC Part 25 Rules**: Real implementation of satellite communication regulations
- **Dynamic Legal Elevation Masks**: Per-location regulatory constraints
- **Power Limit Enforcement**: EIRP and PSD limits with real-time monitoring
- **Geographic Restrictions**: Exclusion zones around radio astronomy sites
- **Time-Based Restrictions**: Operational windows and seasonal constraints

**Implemented Rules:**
- FCC 25.209: Antenna performance standards
- FCC 25.227: Off-axis EIRP density limits
- FCC 25.232: Adjacent satellite protection
- ITU-R RA.769: Radio astronomy service protection

**Features:**
- Real-time compliance checking
- Regulatory visualization overlays
- Multi-region support (US/International)
- API integration for dynamic rule loading
- Violation tracking and reporting

### 3. Antenna Gain Profiles (`AntennaGainProfiles.ts`)
**Data-driven antenna patterns with polar plot LUTs and analytical functions**

- **Multiple Pattern Types**: LUT-based and analytical gain patterns
- **High-Resolution LUTs**: 0.1° resolution gain matrices for precision
- **Analytical Models**: Bessel function-based realistic antenna patterns
- **Frequency Scaling**: Dynamic gain adjustment for frequency variations
- **Link Budget Calculator**: Complete RF link analysis with atmospheric effects

**Pattern Library:**
- 3m Ku-band parabolic dish (42 dBi peak gain)
- Ka-band phased array (38 dBi, electronic steering)
- High-fidelity LUT pattern (45 dBi, 0.1° resolution)

**Link Budget Features:**
- Free space loss calculation
- Atmospheric/rain/scintillation losses
- SNR and link margin analysis
- Adaptive modulation selection
- Real-time link quality assessment

### 4. Antenna Slewing Controller (`AntennaSlewingController.ts`)
**Realistic mechanical behavior with velocity caps and handoff simulation**

- **Time-Optimal Trajectories**: Trapezoidal/triangular velocity profiles
- **Mechanical Constraints**: Angular rate and acceleration limits
- **Pointing Accuracy**: RMS error tracking and performance metrics
- **Handoff Management**: Seamless, break-before-make, make-before-break
- **Real-Time State Tracking**: Position, velocity, acceleration monitoring

**Slewing Profiles:**
- Parabolic dishes: 5°/s max rate, 2°/s² acceleration
- Phased arrays: 180°/s electronic steering, 1000°/s² acceleration
- Slip ring management for cable wrap protection

**Handoff Capabilities:**
- Predictive handoff initiation
- Link quality-based handoff decisions
- Acquisition delay simulation
- Success/failure tracking

### 5. RF Beam Visualizer (`RFBeamVisualizer.ts`)
**Dynamic beam rendering with modulation pattern visualization**

- **THREE.TubeGeometry Beams**: Curved beam paths with atmospheric refraction
- **Shader-Based Visualization**: Real-time modulation pattern rendering
- **Multiple Modulation Schemes**: QPSK, QAM16/64/256, OFDM visualization
- **Link Quality Mapping**: Color-coded SNR/BER visualization
- **Fresnel Zone Display**: RF propagation physics visualization

**Shader Features:**
- Real-time constellation pattern generation
- SNR-based noise visualization
- Power density mapping along beam path
- Frequency-dependent effects
- Link quality color coding (green=excellent, red=failed)

**Visualization Elements:**
- Main beam tubes with modulation patterns
- Beam cones showing antenna patterns
- Link lines with quality indicators
- Power density spheres along path
- Fresnel zone rings for RF analysis

### 6. Link Status UI (`LinkStatusUI.ts`)
**Comprehensive real-time monitoring interface**

- **Multi-Panel Display**: Grid layout for multiple antenna monitoring
- **Real-Time Metrics**: SNR, BER, RSSI, link margin, throughput
- **Historical Trending**: 5-minute rolling history with mini-charts
- **Detailed Analysis Tabs**: Constellation, spectrum, eye diagram views
- **Handoff Status**: Progress indicators and timing

**Analysis Tools:**
- **Constellation Diagram**: Real-time I/Q plot with EVM/MER metrics
- **Spectrum Analyzer**: Configurable frequency display with RBW control
- **Eye Diagram**: Symbol-rate visualization with eye opening metrics
- **Link Budget Table**: Detailed RF analysis breakdown

**Performance Features:**
- Configurable update rates (1-10 Hz)
- Pause/resume capability
- History clearing and export
- Quality-based color coding
- Alert/warning thresholds

### 7. Operational Realism Engine (`OperationalRealismEngine.ts`)
**Master integration system**

- **Scenario Management**: Complete operational scenario loading
- **System Coordination**: All subsystems working together
- **Performance Metrics**: Real-time system-wide statistics
- **Report Generation**: Comprehensive scenario analysis reports

**Integration Features:**
- RF occlusion → antenna pointing decisions
- Regulation compliance → power/elevation limits
- Gain patterns → link budget calculations
- Slewing → beam visualization updates
- All data → real-time UI updates

## Technical Specifications

### Performance Optimizations
- **Raycaster Pooling**: 20 pre-allocated raycasters for occlusion checks
- **Update Batching**: Configurable update frequencies (1-10 Hz)
- **View Mask Caching**: 1-second cache timeout for occlusion results
- **Shader Optimization**: GPU-accelerated modulation pattern rendering
- **Rolling Buffers**: 300-sample history with automatic pruning

### Accuracy Specifications
- **Angular Resolution**: 1° for RF occlusion, 0.1° for gain patterns
- **Pointing Accuracy**: 0.05-0.1° RMS for different antenna types
- **Frequency Coverage**: C/Ku/Ka bands with proper scaling
- **Link Budget Precision**: ITU-R standard atmospheric models
- **Regulatory Compliance**: Real FCC Part 25 implementation

### Real-World Data Integration
- **Ground Station Locations**: FCC filing coordinates
- **Antenna Specifications**: Industry-standard gain patterns
- **Regulatory Rules**: Actual FCC/ITU regulations with proper citations
- **Environmental Models**: ITU-R P.676/P.618 atmospheric loss models
- **Modulation Standards**: DVB-S2/S2X constellation patterns

## Usage Examples

### Basic Integration
```typescript
// Initialize the operational realism engine
const realismEngine = new OperationalRealismEngine(
  scene, camera, renderer, 'link-status-container'
);

// Load a scenario
const scenario: OperationalScenario = {
  scenarioId: 'test_001',
  name: 'Multi-Station Tracking Test',
  // ... scenario configuration
};

await realismEngine.loadScenario(scenario);
realismEngine.startSimulation();

// Update in render loop
realismEngine.update(deltaTime);
```

### Custom Antenna Pattern
```typescript
const customPattern: AntennaGainPattern = {
  antennaId: 'custom_dish',
  antennaType: 'parabolic',
  frequencyBand: 'Ka',
  gainData: {
    type: 'lut',
    azimuthSamples: azimuthArray,
    elevationSamples: elevationArray,
    gainMatrix: gainLUT
  }
  // ... configuration
};

antennaGains.addCustomPattern(customPattern);
```

### Regulatory Compliance Check
```typescript
const compliance = regulationEngine.checkCompliance(
  'gs_hawthorne_ca', 'antenna_01',
  { latitude: 33.9207, longitude: -118.3324 },
  'Ku', 45, 180, 55 // elevation, azimuth, EIRP
);

if (!compliance.isCompliant) {
  console.log('Violations:', compliance.violatedRules);
}
```

## Engineering Impact

This implementation transforms the simulation into a professional-grade tool suitable for:

1. **Mission Planning**: Real regulatory constraints and RF environment modeling
2. **Link Analysis**: Precise link budget calculations with environmental effects
3. **Handoff Optimization**: Realistic antenna slewing and acquisition timing
4. **Compliance Verification**: Actual FCC/ITU rule validation
5. **Performance Analysis**: Comprehensive system metrics and trending
6. **Training**: Realistic operational scenarios with authentic behavior

The system provides field-accurate simulation with proper engineering units, real-world constraints, and professional-quality visualization suitable for spacecraft operations teams and RF engineers.