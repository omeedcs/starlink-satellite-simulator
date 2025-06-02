import * as THREE from 'three';

export interface BeamConfig {
  sourcePosition: THREE.Vector3;
  targetPosition: THREE.Vector3;
  beamWidth: number;          // Beam width in degrees
  eirp: number;              // Effective Isotropic Radiated Power (dBW)
  frequency: number;         // Frequency in GHz
  linkQuality: number;       // 0-1, affects visual intensity
  beamType: 'uplink' | 'downlink' | 'crosslink';
}

export interface AtmosphericPathLoss {
  rainAttenuation: number;    // dB
  gasAttenuation: number;     // dB
  scintillation: number;      // dB
  totalLoss: number;          // dB
}

export class VolumetricBeamSystem {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  
  private beams: Map<string, THREE.Mesh> = new Map();
  private beamMaterials: Map<string, THREE.ShaderMaterial> = new Map();
  
  // Atmospheric parameters
  private atmosphericHeight: number = 100000; // meters
  private groundLevel: number = 0;
  
  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.camera = camera;
    
    console.log('VolumetricBeamSystem initialized');
  }

  public createBeam(id: string, config: BeamConfig): void {
    const beamGeometry = this.createBeamGeometry(config);
    const beamMaterial = this.createBeamMaterial(config);
    
    const beamMesh = new THREE.Mesh(beamGeometry, beamMaterial);
    beamMesh.renderOrder = 100; // Render after most objects
    
    this.scene.add(beamMesh);
    this.beams.set(id, beamMesh);
    this.beamMaterials.set(id, beamMaterial);
    
    console.log(`Created volumetric beam: ${id}`);
  }

  private createBeamGeometry(config: BeamConfig): THREE.BufferGeometry {
    const direction = config.targetPosition.clone().sub(config.sourcePosition).normalize();
    const distance = config.sourcePosition.distanceTo(config.targetPosition);
    
    // Create cone geometry for the beam
    const beamWidthRadians = (config.beamWidth * Math.PI) / 180;
    const radiusAtTarget = Math.tan(beamWidthRadians / 2) * distance;
    
    // Use custom geometry for better control over beam shape
    const geometry = new THREE.BufferGeometry();
    
    // Create vertices for beam cone
    const segments = 16;
    const heightSegments = 32;
    const vertices: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];
    const normals: number[] = [];
    
    // Create vertices along the beam
    for (let h = 0; h <= heightSegments; h++) {
      const t = h / heightSegments;
      const currentDistance = distance * t;
      const currentRadius = radiusAtTarget * t;
      
      // Add center vertex
      const centerPos = config.sourcePosition.clone().add(direction.clone().multiplyScalar(currentDistance));
      vertices.push(centerPos.x, centerPos.y, centerPos.z);
      uvs.push(0.5, t);
      normals.push(0, 0, 1);
      
      // Add rim vertices
      for (let s = 0; s < segments; s++) {
        const angle = (s / segments) * Math.PI * 2;
        
        // Create perpendicular vectors to beam direction
        const up = new THREE.Vector3(0, 1, 0);
        const right = direction.clone().cross(up).normalize();
        const actualUp = right.clone().cross(direction).normalize();
        
        const rimOffset = right.clone().multiplyScalar(Math.cos(angle) * currentRadius)
          .add(actualUp.clone().multiplyScalar(Math.sin(angle) * currentRadius));
        
        const rimPos = centerPos.clone().add(rimOffset);
        vertices.push(rimPos.x, rimPos.y, rimPos.z);
        uvs.push((Math.cos(angle) + 1) / 2, t);
        normals.push(rimOffset.x, rimOffset.y, rimOffset.z);
      }
    }
    
    // Create indices for triangles
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
        
        // Connect to center if at source
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

  private createBeamMaterial(config: BeamConfig): THREE.ShaderMaterial {
    // Calculate atmospheric path loss
    const pathLoss = this.calculateAtmosphericPathLoss(config);
    
    // Determine beam color based on type and frequency
    const beamColor = this.getBeamColor(config);
    
    const material = new THREE.ShaderMaterial({
      uniforms: {
        beamColor: { value: beamColor },
        sourcePosition: { value: config.sourcePosition.clone() },
        targetPosition: { value: config.targetPosition.clone() },
        linkQuality: { value: config.linkQuality },
        eirp: { value: config.eirp },
        frequency: { value: config.frequency },
        pathLoss: { value: pathLoss.totalLoss },
        rainAttenuation: { value: pathLoss.rainAttenuation },
        time: { value: 0 },
        cameraPosition: { value: this.camera.position.clone() }
      },
      
      vertexShader: `
        varying vec3 vWorldPosition;
        varying vec3 vNormal;
        varying vec2 vUv;
        varying float vDistanceToCamera;
        varying float vDistanceFromSource;
        
        uniform vec3 sourcePosition;
        uniform vec3 targetPosition;
        uniform vec3 cameraPosition;
        
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          vNormal = normalize(normalMatrix * normal);
          vUv = uv;
          
          // Distance calculations for atmospheric effects
          vDistanceToCamera = distance(worldPosition.xyz, cameraPosition);
          vDistanceFromSource = distance(worldPosition.xyz, sourcePosition);
          
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      
      fragmentShader: `
        varying vec3 vWorldPosition;
        varying vec3 vNormal;
        varying vec2 vUv;
        varying float vDistanceToCamera;
        varying float vDistanceFromSource;
        
        uniform vec3 beamColor;
        uniform vec3 sourcePosition;
        uniform vec3 targetPosition;
        uniform float linkQuality;
        uniform float eirp;
        uniform float frequency;
        uniform float pathLoss;
        uniform float rainAttenuation;
        uniform float time;
        uniform vec3 cameraPosition;
        
        // Atmospheric scattering approximation
        vec3 applyAtmosphericScattering(vec3 color, float distance, float altitude) {
          // Simplified Rayleigh scattering
          float scatterAmount = exp(-distance * 0.00001 * (1.0 + altitude * 0.0001));
          vec3 scatterColor = vec3(0.4, 0.7, 1.0); // Blue sky color
          return mix(scatterColor, color, scatterAmount);
        }
        
        // Fresnel effect for beam edges
        float fresnel(vec3 viewDir, vec3 normal, float power) {
          return pow(1.0 - abs(dot(viewDir, normal)), power);
        }
        
        void main() {
          // Calculate view direction
          vec3 viewDir = normalize(cameraPosition - vWorldPosition);
          
          // Distance-based intensity falloff
          float beamLength = distance(sourcePosition, targetPosition);
          float normalizedDistance = vDistanceFromSource / beamLength;
          
          // EIRP-based intensity (convert from dBW to linear)
          float powerLinear = pow(10.0, eirp / 10.0);
          float baseIntensity = powerLinear / (4.0 * 3.14159 * vDistanceFromSource * vDistanceFromSource);
          
          // Path loss attenuation (convert from dB)
          float pathLossLinear = pow(10.0, -pathLoss / 10.0);
          baseIntensity *= pathLossLinear;
          
          // Link quality modulation
          baseIntensity *= linkQuality;
          
          // Radial falloff from beam center
          float radialDistance = length(vUv - vec2(0.5, vUv.y));
          float radialFalloff = exp(-radialDistance * 8.0);
          
          // Fresnel glow at beam edges
          float fresnelGlow = fresnel(viewDir, vNormal, 2.0);
          
          // Atmospheric scattering
          float altitude = vWorldPosition.y;
          vec3 scatteredColor = applyAtmosphericScattering(beamColor, vDistanceToCamera, altitude);
          
          // Rain fade visualization
          float rainFade = 1.0 - (rainAttenuation / 20.0); // Normalize rain attenuation
          rainFade = max(0.1, rainFade); // Don't completely fade out
          
          // Animated scintillation effects
          float scintillation = 0.8 + 0.2 * sin(time * 10.0 + vDistanceFromSource * 0.01);
          
          // Combine all effects
          float finalIntensity = baseIntensity * radialFalloff * rainFade * scintillation;
          finalIntensity += fresnelGlow * 0.3; // Add edge glow
          
          // Depth-based opacity for volumetric effect
          float depthOpacity = 1.0 - exp(-vDistanceToCamera * 0.00005);
          depthOpacity = clamp(depthOpacity, 0.1, 0.8);
          
          vec3 finalColor = scatteredColor * finalIntensity;
          
          // Gamma correction
          finalColor = pow(finalColor, vec3(1.0 / 2.2));
          
          gl_FragColor = vec4(finalColor, depthOpacity);
        }
      `,
      
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    
    return material;
  }

  private calculateAtmosphericPathLoss(config: BeamConfig): AtmosphericPathLoss {
    const sourceHeight = Math.max(0, config.sourcePosition.y);
    const targetHeight = Math.max(0, config.targetPosition.y);
    const distance = config.sourcePosition.distanceTo(config.targetPosition);
    
    // Simplified atmospheric loss calculations
    // In reality, this would use ITU models
    
    // Rain attenuation (varies with frequency and rain rate)
    const rainRate = 10; // mm/hr (typical)
    const rainAttenuation = this.calculateRainAttenuation(config.frequency, rainRate, distance);
    
    // Gaseous absorption (O2 and H2O)
    const gasAttenuation = this.calculateGaseousAttenuation(config.frequency, distance);
    
    // Scintillation (atmospheric turbulence)
    const scintillation = Math.random() * 2; // Simplified random scintillation
    
    const totalLoss = rainAttenuation + gasAttenuation + scintillation;
    
    return {
      rainAttenuation,
      gasAttenuation,
      scintillation,
      totalLoss
    };
  }

  private calculateRainAttenuation(frequency: number, rainRate: number, distance: number): number {
    // ITU-R P.838 rain attenuation model (simplified)
    let k, alpha;
    
    if (frequency < 10) {
      k = 0.0001 * Math.pow(frequency, 1.5);
      alpha = 1.0;
    } else if (frequency < 100) {
      k = 0.01 * Math.pow(frequency / 10, 0.7);
      alpha = 1.2;
    } else {
      k = 0.1;
      alpha = 1.3;
    }
    
    const specificAttenuation = k * Math.pow(rainRate, alpha); // dB/km
    const pathLength = distance / 1000; // Convert to km
    
    return specificAttenuation * pathLength;
  }

  private calculateGaseousAttenuation(frequency: number, distance: number): number {
    // Simplified gaseous absorption
    const pathLength = distance / 1000; // km
    
    // O2 absorption peaks around 60 GHz
    const o2Absorption = frequency < 60 ? 0.01 * frequency / 60 : 0.01 * (120 - frequency) / 60;
    
    // H2O absorption increases with frequency
    const h2oAbsorption = 0.001 * frequency;
    
    return (o2Absorption + h2oAbsorption) * pathLength;
  }

  private getBeamColor(config: BeamConfig): THREE.Vector3 {
    // Color coding for different beam types and frequencies
    switch (config.beamType) {
      case 'uplink':
        return new THREE.Vector3(0.3, 0.8, 0.3); // Green
      case 'downlink':
        return new THREE.Vector3(0.3, 0.3, 0.8); // Blue
      case 'crosslink':
        return new THREE.Vector3(0.8, 0.3, 0.3); // Red
      default:
        return new THREE.Vector3(0.8, 0.8, 0.8); // White
    }
  }

  public updateBeam(id: string, config: Partial<BeamConfig>): void {
    const material = this.beamMaterials.get(id);
    if (!material) return;
    
    // Update uniforms based on config changes
    if (config.sourcePosition) {
      material.uniforms.sourcePosition.value.copy(config.sourcePosition);
    }
    if (config.targetPosition) {
      material.uniforms.targetPosition.value.copy(config.targetPosition);
    }
    if (config.linkQuality !== undefined) {
      material.uniforms.linkQuality.value = config.linkQuality;
    }
    if (config.eirp !== undefined) {
      material.uniforms.eirp.value = config.eirp;
    }
    
    // Recalculate path loss if positions or frequency changed
    if (config.sourcePosition || config.targetPosition || config.frequency) {
      const fullConfig = { ...this.getBeamConfig(id), ...config };
      const pathLoss = this.calculateAtmosphericPathLoss(fullConfig as BeamConfig);
      material.uniforms.pathLoss.value = pathLoss.totalLoss;
      material.uniforms.rainAttenuation.value = pathLoss.rainAttenuation;
    }
  }

  private getBeamConfig(id: string): Partial<BeamConfig> {
    const material = this.beamMaterials.get(id);
    if (!material) return {};
    
    return {
      sourcePosition: material.uniforms.sourcePosition.value,
      targetPosition: material.uniforms.targetPosition.value,
      linkQuality: material.uniforms.linkQuality.value,
      eirp: material.uniforms.eirp.value,
      frequency: material.uniforms.frequency.value
    };
  }

  public removeBeam(id: string): void {
    const beam = this.beams.get(id);
    const material = this.beamMaterials.get(id);
    
    if (beam) {
      this.scene.remove(beam);
      beam.geometry.dispose();
      this.beams.delete(id);
    }
    
    if (material) {
      material.dispose();
      this.beamMaterials.delete(id);
    }
  }

  public update(deltaTime: number): void {
    // Update animation time for all beam materials
    this.beamMaterials.forEach((material) => {
      material.uniforms.time.value += deltaTime;
      material.uniforms.cameraPosition.value.copy(this.camera.position);
    });
  }

  public setWeatherConditions(rainRate: number, humidity: number, temperature: number): void {
    // Update all beams with new weather conditions
    this.beamMaterials.forEach((material, id) => {
      const config = this.getBeamConfig(id) as BeamConfig;
      if (config.frequency) {
        const distance = config.sourcePosition?.distanceTo(config.targetPosition!) || 0;
        const rainAttenuation = this.calculateRainAttenuation(config.frequency, rainRate, distance);
        material.uniforms.rainAttenuation.value = rainAttenuation;
      }
    });
  }

  public dispose(): void {
    this.beams.forEach((beam) => {
      this.scene.remove(beam);
      beam.geometry.dispose();
    });
    
    this.beamMaterials.forEach((material) => {
      material.dispose();
    });
    
    this.beams.clear();
    this.beamMaterials.clear();
    
    console.log('VolumetricBeamSystem disposed');
  }
}