import * as THREE from 'three';

export interface ModulationScheme {
  type: 'QPSK' | 'QAM16' | 'QAM64' | 'QAM256' | 'OFDM';
  symbolRate: number; // symbols/second
  carrierFrequency: number; // MHz
  bandwidth: number; // MHz
  spectralEfficiency: number; // bits/Hz
  requiredSNR: number; // dB for target BER
}

export interface LinkQualityMetrics {
  snr: number; // dB
  ber: number; // Bit Error Rate
  rssi: number; // dBm
  codewordErrorRate: number;
  frameErrorRate: number;
  linkMargin: number; // dB
  adaptiveModulation: boolean;
  currentModulation: ModulationScheme['type'];
}

export interface BeamVisualizationConfig {
  beamId: string;
  antennaPosition: THREE.Vector3;
  targetPosition: THREE.Vector3;
  frequency: number; // MHz
  power: number; // dBW
  beamwidth: number; // degrees
  polarization: 'linear-h' | 'linear-v' | 'rhcp' | 'lhcp';
  modulation: ModulationScheme;
  linkQuality: LinkQualityMetrics;
  visualProperties: {
    showModulationPattern: boolean;
    showFresnelZones: boolean;
    showPowerDensity: boolean;
    animationSpeed: number;
    colorScheme: 'quality' | 'power' | 'frequency' | 'modulation';
  };
}

export interface BeamMesh {
  beamId: string;
  mainBeam: THREE.Mesh;
  modulationTexture: THREE.Mesh | null;
  fresnelZones: THREE.Group | null;
  powerIndicators: THREE.Group | null;
  beamCone: THREE.Mesh;
  linkLine: THREE.Line;
  animationMixers: THREE.AnimationMixer[];
}

export class RFBeamVisualizer {
  private scene: THREE.Scene;
  private beamMeshes: Map<string, BeamMesh> = new Map();
  private shaderMaterials: Map<string, THREE.ShaderMaterial> = new Map();
  private modulationTextures: Map<string, THREE.DataTexture> = new Map();
  private animationMixers: THREE.AnimationMixer[] = [];
  
  // Performance optimization
  private readonly maxBeams: number = 50;
  private readonly textureResolution: number = 256;
  private updateCounter: number = 0;
  private readonly updateFrequency: number = 4; // Update every 4 frames
  
  // Shader uniforms for real-time effects
  private uniformsTemplate = {
    time: { value: 0.0 },
    frequency: { value: 14000.0 },
    power: { value: 1.0 },
    snr: { value: 20.0 },
    modulationType: { value: 0 }, // 0=QPSK, 1=QAM16, etc.
    linkQuality: { value: 1.0 },
    beamPattern: { value: null as THREE.DataTexture | null },
    noisePattern: { value: null as THREE.DataTexture | null }
  };

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.initializeShaders();
    this.generateModulationTextures();
    console.log('RFBeamVisualizer initialized');
  }

  private initializeShaders(): void {
    // Main beam shader with modulation visualization
    const beamVertexShader = `
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec2 vUv;
      varying float vDistance;
      
      void main() {
        vPosition = position;
        vNormal = normal;
        vUv = uv;
        
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vDistance = length(mvPosition.xyz);
        
        gl_Position = projectionMatrix * mvPosition;
      }
    `;

    const beamFragmentShader = `
      uniform float time;
      uniform float frequency;
      uniform float power;
      uniform float snr;
      uniform int modulationType;
      uniform float linkQuality;
      uniform sampler2D beamPattern;
      uniform sampler2D noisePattern;
      
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec2 vUv;
      varying float vDistance;
      
      vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
      }
      
      float generateQPSKPattern(vec2 uv, float time) {
        vec2 grid = floor(uv * 20.0 + time * 2.0);
        float pattern = mod(grid.x + grid.y, 4.0);
        return pattern / 4.0;
      }
      
      float generateQAMPattern(vec2 uv, float time, int order) {
        vec2 grid = floor(uv * float(order) * 2.0 + time);
        float pattern = mod(grid.x * 7.0 + grid.y * 3.0, float(order));
        return pattern / float(order);
      }
      
      float generateOFDMPattern(vec2 uv, float time) {
        float carrier = sin(uv.x * 50.0 + time * 10.0);
        float subcarrier1 = sin(uv.x * 47.0 + time * 9.5) * 0.3;
        float subcarrier2 = sin(uv.x * 53.0 + time * 10.5) * 0.3;
        return (carrier + subcarrier1 + subcarrier2) * 0.5 + 0.5;
      }
      
      void main() {
        vec2 centeredUv = vUv - 0.5;
        float distanceFromCenter = length(centeredUv);
        
        // Base beam intensity (Gaussian profile)
        float beamIntensity = exp(-distanceFromCenter * distanceFromCenter * 8.0);
        
        // Modulation pattern
        float modulationPattern = 0.0;
        if (modulationType == 0) {
          modulationPattern = generateQPSKPattern(vUv, time);
        } else if (modulationType == 1) {
          modulationPattern = generateQAMPattern(vUv, time, 16);
        } else if (modulationType == 2) {
          modulationPattern = generateQAMPattern(vUv, time, 64);
        } else if (modulationType == 3) {
          modulationPattern = generateQAMPattern(vUv, time, 256);
        } else if (modulationType == 4) {
          modulationPattern = generateOFDMPattern(vUv, time);
        }
        
        // Add noise based on SNR
        float noiseLevel = 1.0 / (1.0 + snr / 10.0);
        vec4 noise = texture2D(noisePattern, vUv + time * 0.1);
        modulationPattern += (noise.r - 0.5) * noiseLevel;
        
        // Power-based color mapping
        float normalizedPower = clamp(power / 65.0, 0.0, 1.0); // Normalize to 65 dBW max
        
        // Link quality affects color
        float hue = 0.3 - linkQuality * 0.3; // Green (good) to red (bad)
        float saturation = 0.8;
        float brightness = beamIntensity * normalizedPower * (0.5 + modulationPattern * 0.5);
        
        vec3 color = hsv2rgb(vec3(hue, saturation, brightness));
        
        // Add frequency-dependent effects
        float freqEffect = sin(frequency / 1000.0 + time) * 0.1 + 0.9;
        color *= freqEffect;
        
        // Distance-based attenuation
        float attenuation = 1.0 / (1.0 + vDistance * 0.0001);
        
        // Final alpha based on beam pattern and quality
        float alpha = beamIntensity * linkQuality * attenuation * 0.7;
        
        gl_FragColor = vec4(color, alpha);
      }
    `;

    const beamMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(this.uniformsTemplate),
      vertexShader: beamVertexShader,
      fragmentShader: beamFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.shaderMaterials.set('mainBeam', beamMaterial);
  }

  private generateModulationTextures(): void {
    // Generate noise texture for SNR visualization
    const noiseSize = 128;
    const noiseData = new Uint8Array(noiseSize * noiseSize * 4);
    
    for (let i = 0; i < noiseSize * noiseSize; i++) {
      const offset = i * 4;
      const noise = Math.random();
      noiseData[offset] = noise * 255;     // R
      noiseData[offset + 1] = noise * 255; // G
      noiseData[offset + 2] = noise * 255; // B
      noiseData[offset + 3] = 255;         // A
    }
    
    const noiseTexture = new THREE.DataTexture(
      noiseData,
      noiseSize,
      noiseSize,
      THREE.RGBAFormat
    );
    noiseTexture.needsUpdate = true;
    this.modulationTextures.set('noise', noiseTexture);

    // Generate constellation pattern textures
    this.generateConstellationTexture('QPSK', 4);
    this.generateConstellationTexture('QAM16', 16);
    this.generateConstellationTexture('QAM64', 64);
  }

  private generateConstellationTexture(type: string, order: number): void {
    const size = 256;
    const data = new Uint8Array(size * size * 4);
    
    const points = this.generateConstellationPoints(order);
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const offset = (y * size + x) * 4;
        
        // Normalize coordinates to [-1, 1]
        const nx = (x / size) * 2 - 1;
        const ny = (y / size) * 2 - 1;
        
        // Find closest constellation point
        let minDist = Infinity;
        let closestPoint = points[0];
        
        for (const point of points) {
          const dist = Math.sqrt((nx - point.x) ** 2 + (ny - point.y) ** 2);
          if (dist < minDist) {
            minDist = dist;
            closestPoint = point;
          }
        }
        
        // Color based on distance to closest point
        const intensity = Math.exp(-minDist * 5) * 255;
        
        data[offset] = intensity;     // R
        data[offset + 1] = intensity; // G  
        data[offset + 2] = intensity; // B
        data[offset + 3] = 255;       // A
      }
    }
    
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.needsUpdate = true;
    this.modulationTextures.set(type, texture);
  }

  private generateConstellationPoints(order: number): Array<{ x: number; y: number }> {
    const points: Array<{ x: number; y: number }> = [];
    
    if (order === 4) {
      // QPSK
      points.push({ x: 0.7, y: 0.7 });   // 00
      points.push({ x: -0.7, y: 0.7 });  // 01
      points.push({ x: -0.7, y: -0.7 }); // 11
      points.push({ x: 0.7, y: -0.7 });  // 10
    } else {
      // Rectangular QAM
      const sideLength = Math.sqrt(order);
      const spacing = 2 / (sideLength - 1);
      
      for (let i = 0; i < sideLength; i++) {
        for (let j = 0; j < sideLength; j++) {
          points.push({
            x: -1 + i * spacing,
            y: -1 + j * spacing
          });
        }
      }
    }
    
    return points;
  }

  public createBeam(config: BeamVisualizationConfig): string {
    if (this.beamMeshes.size >= this.maxBeams) {
      console.warn('Maximum number of beams reached');
      return '';
    }

    const beamMesh = this.generateBeamGeometry(config);
    this.beamMeshes.set(config.beamId, beamMesh);
    
    // Add to scene
    this.scene.add(beamMesh.mainBeam);
    this.scene.add(beamMesh.beamCone);
    this.scene.add(beamMesh.linkLine);
    
    if (beamMesh.modulationTexture) {
      this.scene.add(beamMesh.modulationTexture);
    }
    
    if (beamMesh.fresnelZones) {
      this.scene.add(beamMesh.fresnelZones);
    }
    
    if (beamMesh.powerIndicators) {
      this.scene.add(beamMesh.powerIndicators);
    }

    console.log(`Created RF beam: ${config.beamId}`);
    return config.beamId;
  }

  private generateBeamGeometry(config: BeamVisualizationConfig): BeamMesh {
    const direction = config.targetPosition.clone().sub(config.antennaPosition).normalize();
    const distance = config.antennaPosition.distanceTo(config.targetPosition);
    
    // Main beam using TubeGeometry
    const beamPath = this.createBeamPath(config.antennaPosition, config.targetPosition, config.beamwidth);
    const tubeGeometry = new THREE.TubeGeometry(beamPath, 64, config.beamwidth * distance * 0.01, 16);
    
    // Clone and configure material
    const beamMaterial = this.shaderMaterials.get('mainBeam')!.clone();
    this.configureBeamMaterial(beamMaterial, config);
    
    const mainBeam = new THREE.Mesh(tubeGeometry, beamMaterial);
    
    // Beam cone for beam pattern visualization
    const coneGeometry = new THREE.ConeGeometry(
      Math.tan(config.beamwidth * Math.PI / 180) * distance,
      distance,
      16
    );
    const coneMaterial = new THREE.MeshBasicMaterial({
      color: this.getLinkQualityColor(config.linkQuality.linkMargin),
      transparent: true,
      opacity: 0.1,
      wireframe: true
    });
    const beamCone = new THREE.Mesh(coneGeometry, coneMaterial);
    beamCone.position.copy(config.antennaPosition);
    beamCone.lookAt(config.targetPosition);

    // Link line
    const linkGeometry = new THREE.BufferGeometry().setFromPoints([
      config.antennaPosition,
      config.targetPosition
    ]);
    const linkMaterial = new THREE.LineBasicMaterial({
      color: this.getLinkQualityColor(config.linkQuality.linkMargin),
      linewidth: 2
    });
    const linkLine = new THREE.Line(linkGeometry, linkMaterial);

    // Modulation pattern overlay
    let modulationTexture: THREE.Mesh | null = null;
    if (config.visualProperties.showModulationPattern) {
      modulationTexture = this.createModulationOverlay(config);
    }

    // Fresnel zones
    let fresnelZones: THREE.Group | null = null;
    if (config.visualProperties.showFresnelZones) {
      fresnelZones = this.createFresnelZones(config);
    }

    // Power density indicators
    let powerIndicators: THREE.Group | null = null;
    if (config.visualProperties.showPowerDensity) {
      powerIndicators = this.createPowerIndicators(config);
    }

    return {
      beamId: config.beamId,
      mainBeam,
      modulationTexture,
      fresnelZones,
      powerIndicators,
      beamCone,
      linkLine,
      animationMixers: []
    };
  }

  private createBeamPath(start: THREE.Vector3, end: THREE.Vector3, beamwidth: number): THREE.CatmullRomCurve3 {
    const direction = end.clone().sub(start).normalize();
    const distance = start.distanceTo(end);
    
    // Create slight curve to simulate atmospheric refraction
    const midPoint = start.clone().add(direction.clone().multiplyScalar(distance * 0.5));
    midPoint.y += distance * 0.002; // Slight atmospheric bend
    
    const points = [start, midPoint, end];
    return new THREE.CatmullRomCurve3(points);
  }

  private configureBeamMaterial(material: THREE.ShaderMaterial, config: BeamVisualizationConfig): void {
    const uniforms = material.uniforms;
    
    uniforms.frequency.value = config.frequency;
    uniforms.power.value = config.power;
    uniforms.snr.value = config.linkQuality.snr;
    uniforms.linkQuality.value = Math.max(0, Math.min(1, config.linkQuality.linkMargin / 10));
    
    // Set modulation type
    const modulationMap: Record<ModulationScheme['type'], number> = {
      'QPSK': 0,
      'QAM16': 1,
      'QAM64': 2,
      'QAM256': 3,
      'OFDM': 4
    };
    uniforms.modulationType.value = modulationMap[config.modulation.type];
    
    // Assign textures
    uniforms.noisePattern.value = this.modulationTextures.get('noise');
    uniforms.beamPattern.value = this.modulationTextures.get(config.modulation.type);
  }

  private createModulationOverlay(config: BeamVisualizationConfig): THREE.Mesh {
    const distance = config.antennaPosition.distanceTo(config.targetPosition);
    const overlaySize = Math.tan(config.beamwidth * Math.PI / 180) * distance * 2;
    
    const geometry = new THREE.PlaneGeometry(overlaySize, overlaySize, 32, 32);
    const material = new THREE.MeshBasicMaterial({
      map: this.modulationTextures.get(config.modulation.type),
      transparent: true,
      opacity: 0.3
    });
    
    const overlay = new THREE.Mesh(geometry, material);
    const midPoint = config.antennaPosition.clone().lerp(config.targetPosition, 0.5);
    overlay.position.copy(midPoint);
    overlay.lookAt(config.targetPosition);
    
    return overlay;
  }

  private createFresnelZones(config: BeamVisualizationConfig): THREE.Group {
    const group = new THREE.Group();
    const distance = config.antennaPosition.distanceTo(config.targetPosition);
    const wavelength = 300 / config.frequency; // meters
    
    // First 3 Fresnel zones
    for (let zone = 1; zone <= 3; zone++) {
      const radius = Math.sqrt(zone * wavelength * distance / 4);
      const geometry = new THREE.RingGeometry(radius * 0.9, radius, 32);
      const material = new THREE.MeshBasicMaterial({
        color: zone % 2 === 1 ? 0x00ff00 : 0xff0000,
        transparent: true,
        opacity: 0.1,
        side: THREE.DoubleSide
      });
      
      const ring = new THREE.Mesh(geometry, material);
      const midPoint = config.antennaPosition.clone().lerp(config.targetPosition, 0.5);
      ring.position.copy(midPoint);
      ring.lookAt(config.targetPosition);
      
      group.add(ring);
    }
    
    return group;
  }

  private createPowerIndicators(config: BeamVisualizationConfig): THREE.Group {
    const group = new THREE.Group();
    const distance = config.antennaPosition.distanceTo(config.targetPosition);
    
    // Create power density visualization along the beam
    const samples = 10;
    for (let i = 0; i < samples; i++) {
      const t = i / (samples - 1);
      const position = config.antennaPosition.clone().lerp(config.targetPosition, t);
      
      // Calculate power density at this point
      const powerDensity = config.power - 20 * Math.log10(distance * t + 1);
      const normalizedPower = Math.max(0, (powerDensity + 100) / 100); // Normalize
      
      const geometry = new THREE.SphereGeometry(normalizedPower * 10, 8, 8);
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(normalizedPower * 0.3, 1, 0.5),
        transparent: true,
        opacity: 0.6
      });
      
      const indicator = new THREE.Mesh(geometry, material);
      indicator.position.copy(position);
      group.add(indicator);
    }
    
    return group;
  }

  private getLinkQualityColor(linkMargin: number): number {
    // Color mapping: red (poor) -> yellow (marginal) -> green (excellent)
    if (linkMargin < 0) return 0xff0000; // Red
    if (linkMargin < 3) return 0xff8800; // Orange
    if (linkMargin < 6) return 0xffff00; // Yellow
    return 0x00ff00; // Green
  }

  public updateBeam(beamId: string, updates: Partial<BeamVisualizationConfig>): void {
    const beamMesh = this.beamMeshes.get(beamId);
    if (!beamMesh) return;

    // Update material uniforms based on changes
    const material = beamMesh.mainBeam.material as THREE.ShaderMaterial;
    
    if (updates.frequency !== undefined) {
      material.uniforms.frequency.value = updates.frequency;
    }
    
    if (updates.power !== undefined) {
      material.uniforms.power.value = updates.power;
    }
    
    if (updates.linkQuality) {
      material.uniforms.snr.value = updates.linkQuality.snr;
      material.uniforms.linkQuality.value = Math.max(0, Math.min(1, updates.linkQuality.linkMargin / 10));
      
      // Update link line color
      const linkMaterial = beamMesh.linkLine.material as THREE.LineBasicMaterial;
      linkMaterial.color.setHex(this.getLinkQualityColor(updates.linkQuality.linkMargin));
    }
    
    if (updates.modulation) {
      const modulationMap: Record<ModulationScheme['type'], number> = {
        'QPSK': 0,
        'QAM16': 1,
        'QAM64': 2,
        'QAM256': 3,
        'OFDM': 4
      };
      material.uniforms.modulationType.value = modulationMap[updates.modulation.type];
    }
  }

  public update(deltaTime: number): void {
    this.updateCounter++;
    
    // Update shader time uniform
    const time = Date.now() * 0.001;
    this.shaderMaterials.forEach(material => {
      material.uniforms.time.value = time;
    });
    
    // Update beam animations less frequently for performance
    if (this.updateCounter % this.updateFrequency === 0) {
      this.updateBeamAnimations(deltaTime);
    }
    
    // Update animation mixers
    this.animationMixers.forEach(mixer => {
      mixer.update(deltaTime);
    });
  }

  private updateBeamAnimations(deltaTime: number): void {
    // Update modulation pattern animations
    this.beamMeshes.forEach(beamMesh => {
      if (beamMesh.modulationTexture) {
        // Rotate modulation pattern to simulate symbol updates
        beamMesh.modulationTexture.rotation.z += deltaTime * 0.5;
      }
      
      // Pulse beam cone based on link quality
      const material = beamMesh.mainBeam.material as THREE.ShaderMaterial;
      const linkQuality = material.uniforms.linkQuality.value;
      const pulseScale = 1.0 + Math.sin(Date.now() * 0.003) * 0.1 * linkQuality;
      beamMesh.beamCone.scale.setScalar(pulseScale);
    });
  }

  public removeBeam(beamId: string): void {
    const beamMesh = this.beamMeshes.get(beamId);
    if (!beamMesh) return;

    // Remove from scene
    this.scene.remove(beamMesh.mainBeam);
    this.scene.remove(beamMesh.beamCone);
    this.scene.remove(beamMesh.linkLine);
    
    if (beamMesh.modulationTexture) {
      this.scene.remove(beamMesh.modulationTexture);
    }
    
    if (beamMesh.fresnelZones) {
      this.scene.remove(beamMesh.fresnelZones);
    }
    
    if (beamMesh.powerIndicators) {
      this.scene.remove(beamMesh.powerIndicators);
    }
    
    // Dispose geometries and materials
    beamMesh.mainBeam.geometry.dispose();
    (beamMesh.mainBeam.material as THREE.Material).dispose();
    beamMesh.beamCone.geometry.dispose();
    (beamMesh.beamCone.material as THREE.Material).dispose();
    
    // Clean up animation mixers
    beamMesh.animationMixers.forEach(mixer => {
      const index = this.animationMixers.indexOf(mixer);
      if (index > -1) {
        this.animationMixers.splice(index, 1);
      }
    });
    
    this.beamMeshes.delete(beamId);
    console.log(`Removed RF beam: ${beamId}`);
  }

  public getBeamStatistics(): {
    activeBeams: number;
    averageLinkQuality: number;
    totalThroughput: number;
    modulationDistribution: Record<string, number>;
  } {
    let totalLinkQuality = 0;
    let totalThroughput = 0;
    const modulationCount: Record<string, number> = {};
    
    this.beamMeshes.forEach(beamMesh => {
      const material = beamMesh.mainBeam.material as THREE.ShaderMaterial;
      totalLinkQuality += material.uniforms.linkQuality.value;
      
      // Estimate throughput based on modulation and SNR
      const modulationType = material.uniforms.modulationType.value;
      const modTypes = ['QPSK', 'QAM16', 'QAM64', 'QAM256', 'OFDM'];
      const modType = modTypes[modulationType] || 'QPSK';
      
      modulationCount[modType] = (modulationCount[modType] || 0) + 1;
      
      // Simplified throughput calculation
      const spectralEfficiencies = { QPSK: 2, QAM16: 4, QAM64: 6, QAM256: 8, OFDM: 5 };
      const efficiency = spectralEfficiencies[modType as keyof typeof spectralEfficiencies] || 2;
      totalThroughput += efficiency * 36; // 36 MHz bandwidth assumption
    });
    
    return {
      activeBeams: this.beamMeshes.size,
      averageLinkQuality: this.beamMeshes.size > 0 ? totalLinkQuality / this.beamMeshes.size : 0,
      totalThroughput,
      modulationDistribution: modulationCount
    };
  }

  public setVisualizationQuality(level: 'low' | 'medium' | 'high'): void {
    const qualitySettings = {
      low: { updateFreq: 8, textureRes: 128 },
      medium: { updateFreq: 4, textureRes: 256 },
      high: { updateFreq: 2, textureRes: 512 }
    };
    
    const settings = qualitySettings[level];
    (this as any).updateFrequency = settings.updateFreq;
    
    console.log(`Set RF beam visualization quality to: ${level}`);
  }

  public dispose(): void {
    // Remove all beams
    Array.from(this.beamMeshes.keys()).forEach(beamId => {
      this.removeBeam(beamId);
    });
    
    // Dispose textures
    this.modulationTextures.forEach(texture => {
      texture.dispose();
    });
    this.modulationTextures.clear();
    
    // Dispose shader materials
    this.shaderMaterials.forEach(material => {
      material.dispose();
    });
    this.shaderMaterials.clear();
    
    this.animationMixers = [];
    
    console.log('RFBeamVisualizer disposed');
  }
}