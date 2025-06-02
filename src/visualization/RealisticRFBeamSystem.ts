import * as THREE from 'three';

export interface RFBeamConfig {
  sourcePosition: THREE.Vector3;
  targetPosition: THREE.Vector3;
  frequency: number;           // GHz
  eirp: number;               // dBW - Effective Isotropic Radiated Power
  beamwidth: number;          // degrees
  polarization: 'linear' | 'circular';
  modulation: 'QPSK' | '8PSK' | '16APSK' | '32APSK';
  linkMargin: number;         // dB
  isActive: boolean;
  isAcquiring: boolean;
}

export interface AtmosphericConditions {
  rainRate: number;           // mm/hr
  humidity: number;           // 0-1
  visibility: number;         // km
  temperature: number;        // Celsius
}

export interface FrequencyBand {
  name: string;
  color: THREE.Color;
  minFreq: number;
  maxFreq: number;
}

export class RealisticRFBeamSystem {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  
  private beams: Map<string, THREE.Mesh> = new Map();
  private beamMaterials: Map<string, THREE.ShaderMaterial> = new Map();
  private acquisitionEffects: Map<string, THREE.Points> = new Map();
  
  private atmosphericConditions: AtmosphericConditions = {
    rainRate: 0.0,
    humidity: 0.6,
    visibility: 20.0,
    temperature: 15.0
  };
  
  // Frequency band definitions (realistic SpaceX bands)
  private frequencyBands: FrequencyBand[] = [
    { name: 'Ku-band', color: new THREE.Color(0x4488ff), minFreq: 12, maxFreq: 18 },
    { name: 'Ka-band', color: new THREE.Color(0xff8844), minFreq: 26.5, maxFreq: 40 },
    { name: 'V-band', color: new THREE.Color(0xff4444), minFreq: 40, maxFreq: 75 },
    { name: 'E-band', color: new THREE.Color(0x8844ff), minFreq: 71, maxFreq: 86 },
    { name: 'X-band', color: new THREE.Color(0x44ff44), minFreq: 8, maxFreq: 12 }
  ];

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.camera = camera;
    
    console.log('RealisticRFBeamSystem initialized - Frequency-coded volumetric beams');
  }

  public createBeam(id: string, config: RFBeamConfig): void {
    const beamGeometry = this.createVolumetricBeamGeometry(config);
    const beamMaterial = this.createBeamMaterial(config);
    
    const beam = new THREE.Mesh(beamGeometry, beamMaterial);
    beam.renderOrder = 100;
    beam.frustumCulled = false; // Always render for beam effects
    
    this.scene.add(beam);
    this.beams.set(id, beam);
    this.beamMaterials.set(id, beamMaterial);
    
    // Add acquisition effect if beam is acquiring
    if (config.isAcquiring) {
      this.createAcquisitionEffect(id, config);
    }
    
    console.log(`Created realistic RF beam: ${id} at ${config.frequency}GHz`);
  }

  private createVolumetricBeamGeometry(config: RFBeamConfig): THREE.BufferGeometry {
    const direction = config.targetPosition.clone().sub(config.sourcePosition).normalize();
    const distance = config.sourcePosition.distanceTo(config.targetPosition);
    
    // Beamwidth determines cone angle
    const beamAngle = (config.beamwidth * Math.PI) / 180;
    const radiusAtTarget = Math.tan(beamAngle / 2) * distance;
    
    // Create custom cone geometry with proper UV mapping for volumetric effects
    const geometry = new THREE.BufferGeometry();
    
    const segments = 16;
    const heightSegments = 32;
    const vertices: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];
    const normals: number[] = [];
    
    // Calculate beam orientation
    const up = new THREE.Vector3(0, 1, 0);
    const right = direction.clone().cross(up).normalize();
    const actualUp = right.clone().cross(direction).normalize();
    
    // Create vertices along beam path
    for (let h = 0; h <= heightSegments; h++) {
      const t = h / heightSegments;
      const currentDistance = distance * t;
      const currentRadius = radiusAtTarget * t;
      
      const centerPos = config.sourcePosition.clone().add(direction.clone().multiplyScalar(currentDistance));
      
      // Add center vertex
      vertices.push(centerPos.x, centerPos.y, centerPos.z);
      uvs.push(0.5, t);
      normals.push(direction.x, direction.y, direction.z);
      
      // Add edge vertices
      for (let s = 0; s < segments; s++) {
        const angle = (s / segments) * Math.PI * 2;
        
        const edgeOffset = right.clone().multiplyScalar(Math.cos(angle) * currentRadius)
          .add(actualUp.clone().multiplyScalar(Math.sin(angle) * currentRadius));
        
        const edgePos = centerPos.clone().add(edgeOffset);
        vertices.push(edgePos.x, edgePos.y, edgePos.z);
        
        uvs.push((Math.cos(angle) + 1) / 2, t);
        normals.push(edgeOffset.x, edgeOffset.y, edgeOffset.z);
      }
    }
    
    // Create indices for triangulation
    for (let h = 0; h < heightSegments; h++) {
      const currentRow = h * (segments + 1);
      const nextRow = (h + 1) * (segments + 1);
      
      for (let s = 0; s < segments; s++) {
        const a = currentRow + s + 1;
        const b = currentRow + ((s + 1) % segments) + 1;
        const c = nextRow + ((s + 1) % segments) + 1;
        const d = nextRow + s + 1;
        
        // Two triangles per quad
        indices.push(a, b, c);
        indices.push(a, c, d);
        
        // Connect to center at source
        if (h === 0) {
          indices.push(currentRow, a, b);
        }
      }
    }
    
    geometry.setIndex(indices);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    
    return geometry;
  }

  private createBeamMaterial(config: RFBeamConfig): THREE.ShaderMaterial {
    const frequencyBand = this.getFrequencyBand(config.frequency);
    const pathLoss = this.calculatePathLoss(config);
    const linkQuality = this.calculateLinkQuality(config);
    
    return new THREE.ShaderMaterial({
      uniforms: {
        beamColor: { value: frequencyBand.color },
        sourcePosition: { value: config.sourcePosition.clone() },
        targetPosition: { value: config.targetPosition.clone() },
        frequency: { value: config.frequency },
        eirp: { value: config.eirp },
        pathLoss: { value: pathLoss },
        linkQuality: { value: linkQuality },
        time: { value: 0 },
        isActive: { value: config.isActive ? 1.0 : 0.0 },
        isAcquiring: { value: config.isAcquiring ? 1.0 : 0.0 },
        cameraPosition: { value: this.camera.position.clone() },
        
        // Atmospheric parameters
        rainRate: { value: this.atmosphericConditions.rainRate },
        humidity: { value: this.atmosphericConditions.humidity },
        visibility: { value: this.atmosphericConditions.visibility },
        
        // Modulation effects
        modulationType: { value: this.getModulationCode(config.modulation) }
      },
      
      vertexShader: `
        varying vec3 vWorldPosition;
        varying vec3 vNormal;
        varying vec2 vUv;
        varying float vDistanceFromSource;
        varying float vDistanceToCamera;
        
        uniform vec3 sourcePosition;
        uniform vec3 cameraPosition;
        
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          vNormal = normalize(normalMatrix * normal);
          vUv = uv;
          
          vDistanceFromSource = distance(worldPosition.xyz, sourcePosition);
          vDistanceToCamera = distance(worldPosition.xyz, cameraPosition);
          
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      
      fragmentShader: `
        varying vec3 vWorldPosition;
        varying vec3 vNormal;
        varying vec2 vUv;
        varying float vDistanceFromSource;
        varying float vDistanceToCamera;
        
        uniform vec3 beamColor;
        uniform vec3 sourcePosition;
        uniform vec3 targetPosition;
        uniform float frequency;
        uniform float eirp;
        uniform float pathLoss;
        uniform float linkQuality;
        uniform float time;
        uniform float isActive;
        uniform float isAcquiring;
        uniform vec3 cameraPosition;
        
        uniform float rainRate;
        uniform float humidity;
        uniform float visibility;
        uniform int modulationType;
        
        // Noise function for atmospheric scattering
        float noise(vec3 p) {
          return fract(sin(dot(p, vec3(12.9898, 78.233, 45.543))) * 43758.5453);
        }
        
        // Atmospheric scattering
        vec3 atmosphericScattering(vec3 color, float distance) {
          float scatterAmount = 1.0 - exp(-distance * 0.00001 * (2.0 - visibility / 20.0));
          vec3 scatterColor = vec3(0.5, 0.7, 1.0);
          return mix(color, scatterColor, scatterAmount * 0.3);
        }
        
        // Rain attenuation visualization
        float rainAttenuation(float dist, float freq, float rain) {
          // ITU-R P.838 approximation
          float k = 0.01 * pow(freq / 10.0, 0.7);
          float specificAtten = k * pow(rain, 1.2);
          return exp(-specificAtten * dist / 1000.0);
        }
        
        // Phase tracking simulation for acquisition
        float phaseNoise(vec3 pos, float t) {
          return 0.5 + 0.5 * sin(t * 20.0 + noise(pos * 0.1) * 6.28318);
        }
        
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPosition);
          
          // Distance-based intensity falloff
          float beamLength = distance(sourcePosition, targetPosition);
          float normalizedDistance = vDistanceFromSource / beamLength;
          
          // EIRP-based power calculation
          float powerLinear = pow(10.0, eirp / 10.0);
          float distanceAttenuation = 1.0 / (4.0 * 3.14159 * vDistanceFromSource * vDistanceFromSource);
          float baseIntensity = powerLinear * distanceAttenuation * 0.001;
          
          // Path loss effects
          float pathLossLinear = pow(10.0, -pathLoss / 10.0);
          baseIntensity *= pathLossLinear;
          
          // Rain attenuation
          float rainAtten = rainAttenuation(vDistanceFromSource, frequency, rainRate);
          baseIntensity *= rainAtten;
          
          // Link quality modulation
          baseIntensity *= linkQuality;
          
          // Radial beam profile (Gaussian-like)
          float radialDistance = length(vUv - vec2(0.5, vUv.y));
          float beamProfile = exp(-radialDistance * radialDistance * 8.0);
          
          // Fresnel edge effects
          float fresnel = 1.0 - abs(dot(viewDir, normalize(vNormal)));
          fresnel = pow(fresnel, 2.0);
          
          // Modulation effects (simulate data transmission)
          float modulation = 1.0;
          if (modulationType == 1) { // QPSK
            modulation = 0.8 + 0.2 * sin(time * 100.0 + vDistanceFromSource * 0.1);
          } else if (modulationType == 2) { // 8PSK
            modulation = 0.7 + 0.3 * sin(time * 200.0 + vDistanceFromSource * 0.2);
          } else if (modulationType == 3) { // 16APSK
            modulation = 0.6 + 0.4 * sin(time * 400.0 + vDistanceFromSource * 0.3);
          }
          
          // Acquisition phase effects
          float acquisitionEffect = 1.0;
          if (isAcquiring > 0.5) {
            acquisitionEffect = phaseNoise(vWorldPosition, time);
            baseIntensity *= 0.3; // Reduced intensity during acquisition
          }
          
          // Atmospheric scattering
          vec3 scatteredColor = atmosphericScattering(beamColor, vDistanceToCamera);
          
          // Combine all effects
          float finalIntensity = baseIntensity * beamProfile * modulation * acquisitionEffect * isActive;
          finalIntensity += fresnel * 0.1; // Edge glow
          
          // Frequency-dependent scintillation
          float scintillation = 1.0 + 0.1 * sin(time * frequency * 0.5 + vDistanceFromSource * 0.05);
          finalIntensity *= scintillation;
          
          // Distance fog for depth perception
          float fogFactor = 1.0 - exp(-vDistanceToCamera * 0.00005);
          float opacity = finalIntensity * (1.0 - fogFactor * 0.5);
          
          vec3 finalColor = scatteredColor * finalIntensity;
          
          // HDR bloom preparation
          if (finalIntensity > 1.0) {
            finalColor = mix(finalColor, vec3(1.0), (finalIntensity - 1.0) * 0.5);
          }
          
          gl_FragColor = vec4(finalColor, opacity);
        }
      `,
      
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
  }

  private createAcquisitionEffect(id: string, config: RFBeamConfig): void {
    // Create particle system for beam acquisition visualization
    const particleCount = 50;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    
    const frequencyBand = this.getFrequencyBand(config.frequency);
    
    for (let i = 0; i < particleCount; i++) {
      // Particles along beam path with some scatter
      const t = Math.random();
      const beamPos = config.sourcePosition.clone().lerp(config.targetPosition, t);
      
      // Add some scatter for acquisition search pattern
      const scatter = 5.0;
      beamPos.x += (Math.random() - 0.5) * scatter;
      beamPos.y += (Math.random() - 0.5) * scatter;
      beamPos.z += (Math.random() - 0.5) * scatter;
      
      positions[i * 3] = beamPos.x;
      positions[i * 3 + 1] = beamPos.y;
      positions[i * 3 + 2] = beamPos.z;
      
      colors[i * 3] = frequencyBand.color.r;
      colors[i * 3 + 1] = frequencyBand.color.g;
      colors[i * 3 + 2] = frequencyBand.color.b;
      
      sizes[i] = Math.random() * 3 + 1;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    
    const material = new THREE.PointsMaterial({
      size: 2,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending
    });
    
    const particles = new THREE.Points(geometry, material);
    this.scene.add(particles);
    this.acquisitionEffects.set(id, particles);
  }

  private getFrequencyBand(frequency: number): FrequencyBand {
    for (const band of this.frequencyBands) {
      if (frequency >= band.minFreq && frequency <= band.maxFreq) {
        return band;
      }
    }
    // Default to Ku-band color if no match
    return this.frequencyBands[0];
  }

  private getModulationCode(modulation: string): number {
    switch (modulation) {
      case 'QPSK': return 1;
      case '8PSK': return 2;
      case '16APSK': return 3;
      case '32APSK': return 4;
      default: return 0;
    }
  }

  private calculatePathLoss(config: RFBeamConfig): number {
    const distance = config.sourcePosition.distanceTo(config.targetPosition) / 1000; // km
    const frequency = config.frequency; // GHz
    
    // Free space path loss: FSPL = 20*log10(d) + 20*log10(f) + 92.45
    const fspl = 20 * Math.log10(distance) + 20 * Math.log10(frequency) + 92.45;
    
    // Additional atmospheric losses
    const rainLoss = this.calculateRainLoss(distance, frequency);
    const gasLoss = this.calculateGaseousLoss(distance, frequency);
    
    return fspl + rainLoss + gasLoss;
  }

  private calculateRainLoss(distance: number, frequency: number): number {
    const rainRate = this.atmosphericConditions.rainRate;
    if (rainRate === 0) return 0;
    
    // ITU-R P.838 rain attenuation model (simplified)
    let k, alpha;
    if (frequency < 10) {
      k = 0.0001 * Math.pow(frequency, 1.5);
      alpha = 1.0;
    } else {
      k = 0.01 * Math.pow(frequency / 10, 0.7);
      alpha = 1.2;
    }
    
    const specificAttenuation = k * Math.pow(rainRate, alpha);
    return specificAttenuation * distance;
  }

  private calculateGaseousLoss(distance: number, frequency: number): number {
    // Simplified atmospheric absorption
    const humidity = this.atmosphericConditions.humidity;
    const temperature = this.atmosphericConditions.temperature;
    
    // Water vapor and oxygen absorption (simplified)
    const h2oLoss = 0.001 * frequency * humidity;
    const o2Loss = frequency < 60 ? 0.002 * frequency : 0.01;
    
    return (h2oLoss + o2Loss) * distance;
  }

  private calculateLinkQuality(config: RFBeamConfig): number {
    // Simplified link quality based on margin and conditions
    const baseQuality = Math.min(1.0, Math.max(0.1, config.linkMargin / 20.0));
    
    // Weather degradation
    const weatherFactor = 1.0 - (this.atmosphericConditions.rainRate * 0.1);
    
    return baseQuality * weatherFactor;
  }

  public updateBeam(id: string, config: Partial<RFBeamConfig>): void {
    const material = this.beamMaterials.get(id);
    if (!material) return;
    
    if (config.isActive !== undefined) {
      material.uniforms.isActive.value = config.isActive ? 1.0 : 0.0;
    }
    
    if (config.isAcquiring !== undefined) {
      material.uniforms.isAcquiring.value = config.isAcquiring ? 1.0 : 0.0;
      
      const particles = this.acquisitionEffects.get(id);
      if (particles) {
        particles.visible = config.isAcquiring;
      }
    }
    
    if (config.linkMargin !== undefined) {
      const linkQuality = this.calculateLinkQuality(config as RFBeamConfig);
      material.uniforms.linkQuality.value = linkQuality;
    }
  }

  public setAtmosphericConditions(conditions: Partial<AtmosphericConditions>): void {
    Object.assign(this.atmosphericConditions, conditions);
    
    // Update all beam materials
    this.beamMaterials.forEach(material => {
      material.uniforms.rainRate.value = this.atmosphericConditions.rainRate;
      material.uniforms.humidity.value = this.atmosphericConditions.humidity;
      material.uniforms.visibility.value = this.atmosphericConditions.visibility;
    });
  }

  public simulateBeamAcquisition(id: string, duration: number = 3000): void {
    const material = this.beamMaterials.get(id);
    if (!material) return;
    
    // Start acquisition phase
    material.uniforms.isAcquiring.value = 1.0;
    material.uniforms.isActive.value = 0.0;
    
    const particles = this.acquisitionEffects.get(id);
    if (particles) particles.visible = true;
    
    // Transition to active after duration
    setTimeout(() => {
      material.uniforms.isAcquiring.value = 0.0;
      material.uniforms.isActive.value = 1.0;
      
      if (particles) particles.visible = false;
    }, duration);
  }

  public update(deltaTime: number): void {
    const time = Date.now() * 0.001;
    
    // Update time uniform for all materials
    this.beamMaterials.forEach(material => {
      material.uniforms.time.value = time;
      material.uniforms.cameraPosition.value.copy(this.camera.position);
    });
    
    // Animate acquisition particles
    this.acquisitionEffects.forEach(particles => {
      if (particles.visible) {
        particles.rotation.y += deltaTime * 0.5;
        
        // Pulse effect
        const pulseScale = 1.0 + 0.3 * Math.sin(time * 2);
        particles.scale.setScalar(pulseScale);
      }
    });
  }

  public removeBeam(id: string): void {
    const beam = this.beams.get(id);
    const material = this.beamMaterials.get(id);
    const particles = this.acquisitionEffects.get(id);
    
    if (beam) {
      this.scene.remove(beam);
      beam.geometry.dispose();
      this.beams.delete(id);
    }
    
    if (material) {
      material.dispose();
      this.beamMaterials.delete(id);
    }
    
    if (particles) {
      this.scene.remove(particles);
      particles.geometry.dispose();
      (particles.material as THREE.Material).dispose();
      this.acquisitionEffects.delete(id);
    }
  }

  public dispose(): void {
    this.beams.forEach(beam => {
      this.scene.remove(beam);
      beam.geometry.dispose();
    });
    
    this.beamMaterials.forEach(material => material.dispose());
    
    this.acquisitionEffects.forEach(particles => {
      this.scene.remove(particles);
      particles.geometry.dispose();
      (particles.material as THREE.Material).dispose();
    });
    
    this.beams.clear();
    this.beamMaterials.clear();
    this.acquisitionEffects.clear();
    
    console.log('RealisticRFBeamSystem disposed');
  }
}