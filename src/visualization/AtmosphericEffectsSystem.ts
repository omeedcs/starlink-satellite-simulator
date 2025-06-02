import * as THREE from 'three';

export interface AtmosphericConfig {
  // Sky scattering parameters
  rayleighScattering: {
    wavelengths: [number, number, number]; // R, G, B wavelengths in nm
    scatteringCoefficient: number;
    scaleHeight: number; // meters
  };
  mieScattering: {
    coefficient: number;
    directionalityG: number; // Henyey-Greenstein phase function parameter
    scaleHeight: number; // meters
  };
  
  // Atmospheric composition
  atmosphereThickness: number; // meters
  earthRadius: number; // meters
  
  // Environmental conditions
  visibility: number; // km (meteorological visibility)
  humidity: number; // 0-1
  pollution: number; // 0-1 (urban pollution factor)
  
  // Sun parameters
  sunPosition: THREE.Vector3;
  sunIntensity: number;
  
  // Visual settings
  fogDensity: number;
  horizonFadeDistance: number; // km
  atmosphericPerspective: boolean;
}

export interface HazeLayer {
  layerId: string;
  altitude: number; // meters above ground
  thickness: number; // meters
  density: number; // 0-1
  color: THREE.Color;
  particleSize: number; // micrometers
}

export interface DepthCue {
  distance: number; // meters
  colorShift: THREE.Color; // atmospheric color tint
  contrastReduction: number; // 0-1
  saturationReduction: number; // 0-1
  brightness: number; // luminance factor
}

export class AtmosphericEffectsSystem {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  
  // Atmospheric components
  private skyDome!: THREE.Mesh;
  private fogMaterial!: THREE.ShaderMaterial;
  private hazeParticles: THREE.Points[] = [];
  private atmosphericFog!: THREE.Fog;
  
  // Shader materials for atmospheric effects
  private atmosphericShader!: THREE.ShaderMaterial;
  private skyScatteringShader!: THREE.ShaderMaterial;
  private depthFogShader!: THREE.ShaderMaterial;
  
  // Environmental state
  private sunPosition: THREE.Vector3;
  private timeOfDay: number = 0.5; // 0 = midnight, 0.5 = noon, 1 = midnight
  private observerPosition: THREE.Vector3;
  
  // Performance optimization
  private updateCounter: number = 0;
  private updateFrequency: number = 2; // Hz
  
  // Configuration
  private config: AtmosphericConfig = {
    rayleighScattering: {
      wavelengths: [650, 510, 440], // Red, Green, Blue wavelengths in nm
      scatteringCoefficient: 5.8e-6,
      scaleHeight: 8400 // meters
    },
    mieScattering: {
      coefficient: 2.0e-5,
      directionalityG: 0.76,
      scaleHeight: 1200 // meters
    },
    atmosphereThickness: 100000, // 100km
    earthRadius: 6371000, // meters
    visibility: 20, // km
    humidity: 0.6,
    pollution: 0.2,
    sunPosition: new THREE.Vector3(0, 10000, 10000),
    sunIntensity: 20.0,
    fogDensity: 0.0001,
    horizonFadeDistance: 50, // km
    atmosphericPerspective: true
  };

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.observerPosition = new THREE.Vector3();
    this.sunPosition = this.config.sunPosition.clone();
    
    this.initializeShaders();
    this.createSkyDome();
    this.createAtmosphericFog();
    this.createHazeLayers();
    this.setupDepthCueing();
    
    console.log('AtmosphericEffectsSystem initialized with realistic scattering');
  }

  private initializeShaders(): void {
    // Sky scattering shader (Rayleigh + Mie)
    const skyVertexShader = `
      varying vec3 vWorldPosition;
      varying vec3 vDirection;
      
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vDirection = normalize(worldPosition.xyz - cameraPosition);
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const skyFragmentShader = `
      uniform vec3 sunPosition;
      uniform float sunIntensity;
      uniform vec3 rayleighWavelengths;
      uniform float rayleighCoeff;
      uniform float mieCoeff;
      uniform float mieG;
      uniform float earthRadius;
      uniform float atmosphereRadius;
      uniform float timeOfDay;
      
      varying vec3 vWorldPosition;
      varying vec3 vDirection;
      
      // Phase function for Rayleigh scattering
      float rayleighPhase(float cosTheta) {
        return (3.0 / (16.0 * 3.14159)) * (1.0 + cosTheta * cosTheta);
      }
      
      // Henyey-Greenstein phase function for Mie scattering
      float miePhase(float cosTheta, float g) {
        float g2 = g * g;
        return (3.0 / (8.0 * 3.14159)) * ((1.0 - g2) / (2.0 + g2)) *
               (1.0 + cosTheta * cosTheta) / pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5);
      }
      
      // Atmospheric density at height
      float atmosphericDensity(float height) {
        return exp(-height / 8400.0); // Scale height 8.4km
      }
      
      // Optical depth calculation
      float opticalDepth(vec3 start, vec3 direction, float distance) {
        float stepSize = distance / 16.0;
        float depth = 0.0;
        
        for (int i = 0; i < 16; i++) {
          vec3 pos = start + direction * (float(i) + 0.5) * stepSize;
          float height = length(pos) - earthRadius;
          depth += atmosphericDensity(height) * stepSize;
        }
        
        return depth;
      }
      
      vec3 scatteringColor(vec3 viewDir, vec3 lightDir) {
        float cosTheta = dot(viewDir, lightDir);
        
        // Rayleigh scattering (wavelength dependent)
        vec3 rayleighBeta = vec3(
          pow(400.0 / rayleighWavelengths.x, 4.0),
          pow(400.0 / rayleighWavelengths.y, 4.0),
          pow(400.0 / rayleighWavelengths.z, 4.0)
        ) * rayleighCoeff;
        
        // Mie scattering (wavelength independent)
        float mieBeta = mieCoeff;
        
        // Phase functions
        float rayleighPhaseValue = rayleighPhase(cosTheta);
        float miePhaseValue = miePhase(cosTheta, mieG);
        
        // Sun angle factor (sunrise/sunset effects)
        float sunHeight = sunPosition.y / length(sunPosition);
        float sunFactor = clamp(sunHeight, 0.0, 1.0);
        
        // Time of day color temperature
        vec3 dayColor = vec3(1.0, 0.95, 0.9);
        vec3 sunsetColor = vec3(1.0, 0.6, 0.3);
        vec3 nightColor = vec3(0.1, 0.2, 0.4);
        
        vec3 timeColor = mix(
          mix(nightColor, dayColor, smoothstep(0.0, 0.3, timeOfDay)),
          mix(dayColor, sunsetColor, smoothstep(0.7, 1.0, abs(timeOfDay - 0.5) * 2.0)),
          sunFactor
        );
        
        // Combine scattering effects
        vec3 color = (rayleighBeta * rayleighPhaseValue + vec3(mieBeta) * miePhaseValue) * 
                     sunIntensity * sunFactor * timeColor;
        
        return color;
      }
      
      void main() {
        vec3 viewDirection = normalize(vDirection);
        vec3 sunDirection = normalize(sunPosition);
        
        // Calculate scattering
        vec3 scattering = scatteringColor(viewDirection, sunDirection);
        
        // Horizon glow effect
        float horizonGlow = 1.0 - abs(viewDirection.y);
        horizonGlow = pow(horizonGlow, 3.0);
        
        // Distance-based atmospheric perspective
        float distance = length(vWorldPosition - cameraPosition);
        float atmospheric = 1.0 - exp(-distance * 0.00001);
        
        // Final color
        vec3 finalColor = scattering * (1.0 + horizonGlow * 0.5);
        finalColor = mix(finalColor, finalColor * 1.5, atmospheric);
        
        // Tone mapping
        finalColor = finalColor / (finalColor + vec3(1.0));
        finalColor = pow(finalColor, vec3(1.0 / 2.2)); // Gamma correction
        
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

    this.skyScatteringShader = new THREE.ShaderMaterial({
      uniforms: {
        sunPosition: { value: this.sunPosition },
        sunIntensity: { value: this.config.sunIntensity },
        rayleighWavelengths: { value: new THREE.Vector3(...this.config.rayleighScattering.wavelengths) },
        rayleighCoeff: { value: this.config.rayleighScattering.scatteringCoefficient },
        mieCoeff: { value: this.config.mieScattering.coefficient },
        mieG: { value: this.config.mieScattering.directionalityG },
        earthRadius: { value: this.config.earthRadius },
        atmosphereRadius: { value: this.config.earthRadius + this.config.atmosphereThickness },
        timeOfDay: { value: this.timeOfDay }
      },
      vertexShader: skyVertexShader,
      fragmentShader: skyFragmentShader,
      side: THREE.BackSide,
      depthWrite: false
    });

    // Atmospheric fog shader for distance effects
    const fogVertexShader = `
      varying vec3 vWorldPosition;
      varying float vDistance;
      
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vDistance = length(mvPosition.xyz);
        
        gl_Position = projectionMatrix * mvPosition;
      }
    `;

    const fogFragmentShader = `
      uniform vec3 fogColor;
      uniform float fogDensity;
      uniform float fogNear;
      uniform float fogFar;
      uniform float visibility;
      uniform float humidity;
      uniform float pollution;
      uniform vec3 sunPosition;
      uniform vec3 cameraPosition;
      
      varying vec3 vWorldPosition;
      varying float vDistance;
      
      // Koschmieder equation for meteorological visibility
      float visibilityFactor(float distance, float meteorologicalRange) {
        return exp(-3.912 * distance / meteorologicalRange);
      }
      
      // Atmospheric perspective color
      vec3 atmosphericColor(vec3 viewDir, float distance) {
        vec3 sunDir = normalize(sunPosition - cameraPosition);
        float sunAlignment = dot(viewDir, sunDir) * 0.5 + 0.5;
        
        // Base atmospheric color (sky blue to horizon white)
        vec3 baseAtmosphere = mix(
          vec3(0.5, 0.7, 1.0), // Sky blue
          vec3(0.8, 0.8, 0.9), // Horizon white
          pow(sunAlignment, 2.0)
        );
        
        // Pollution and humidity effects
        vec3 pollutionTint = vec3(0.8, 0.7, 0.6);
        vec3 humidityTint = vec3(0.9, 0.95, 1.0);
        
        baseAtmosphere = mix(baseAtmosphere, pollutionTint, pollution * 0.3);
        baseAtmosphere = mix(baseAtmosphere, humidityTint, humidity * 0.2);
        
        return baseAtmosphere;
      }
      
      void main() {
        vec3 viewDirection = normalize(vWorldPosition - cameraPosition);
        
        // Distance-based fog
        float fogFactor = 1.0 - exp(-vDistance * fogDensity);
        fogFactor = clamp(fogFactor, 0.0, 1.0);
        
        // Visibility-based fog
        float visibilityFog = 1.0 - visibilityFactor(vDistance / 1000.0, visibility);
        
        // Combine fog effects
        float totalFog = max(fogFactor, visibilityFog);
        
        // Atmospheric color based on viewing direction
        vec3 atmosphericColorValue = atmosphericColor(viewDirection, vDistance);
        
        gl_FragColor = vec4(atmosphericColorValue, totalFog);
      }
    `;

    this.depthFogShader = new THREE.ShaderMaterial({
      uniforms: {
        fogColor: { value: new THREE.Color(0.7, 0.8, 0.9) },
        fogDensity: { value: this.config.fogDensity },
        fogNear: { value: 1000 },
        fogFar: { value: 50000 },
        visibility: { value: this.config.visibility * 1000 }, // Convert to meters
        humidity: { value: this.config.humidity },
        pollution: { value: this.config.pollution },
        sunPosition: { value: this.sunPosition },
        cameraPosition: { value: this.camera.position }
      },
      vertexShader: fogVertexShader,
      fragmentShader: fogFragmentShader,
      transparent: true,
      depthWrite: false
    });
  }

  private createSkyDome(): void {
    // Create large sky sphere
    const skyGeometry = new THREE.SphereGeometry(50000, 32, 16);
    this.skyDome = new THREE.Mesh(skyGeometry, this.skyScatteringShader);
    this.skyDome.renderOrder = -1000; // Render first
    this.scene.add(this.skyDome);
  }

  private createAtmosphericFog(): void {
    // Set up scene fog
    this.atmosphericFog = new THREE.Fog(
      0x8ab6ff, // Light blue fog color
      1000, // Near distance
      this.config.horizonFadeDistance * 1000 // Far distance in meters
    );
    this.scene.fog = this.atmosphericFog;
  }

  private createHazeLayers(): void {
    // Create layered haze using particle systems
    const hazeLayers: HazeLayer[] = [
      {
        layerId: 'ground_haze',
        altitude: 0,
        thickness: 200,
        density: 0.3,
        color: new THREE.Color(0.9, 0.9, 0.85),
        particleSize: 50
      },
      {
        layerId: 'mid_haze',
        altitude: 500,
        thickness: 1000,
        density: 0.15,
        color: new THREE.Color(0.85, 0.9, 0.95),
        particleSize: 100
      },
      {
        layerId: 'high_haze',
        altitude: 2000,
        thickness: 3000,
        density: 0.05,
        color: new THREE.Color(0.8, 0.85, 0.95),
        particleSize: 200
      }
    ];

    hazeLayers.forEach(layer => {
      this.createHazeLayer(layer);
    });
  }

  private createHazeLayer(layer: HazeLayer): void {
    const particleCount = Math.floor(layer.density * 10000);
    const positions = new Float32Array(particleCount * 3);
    const opacities = new Float32Array(particleCount);
    
    // Distribute particles in the layer
    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      
      // Random position within layer bounds
      const radius = Math.random() * 30000 + 5000; // 5-35km from center
      const angle = Math.random() * Math.PI * 2;
      const height = layer.altitude + (Math.random() - 0.5) * layer.thickness;
      
      positions[i3] = Math.cos(angle) * radius;
      positions[i3 + 1] = height;
      positions[i3 + 2] = Math.sin(angle) * radius;
      
      // Distance-based opacity
      const distance = Math.sqrt(positions[i3] ** 2 + positions[i3 + 2] ** 2);
      opacities[i] = layer.density * (1 - distance / 30000) * (Math.random() * 0.5 + 0.5);
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('opacity', new THREE.BufferAttribute(opacities, 1));
    
    // Create haze particle material
    const material = new THREE.PointsMaterial({
      color: layer.color,
      size: layer.particleSize,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      vertexColors: false,
      fog: false // Don't apply scene fog to haze particles
    });
    
    const hazeParticles = new THREE.Points(geometry, material);
    hazeParticles.name = `haze_layer_${layer.layerId}`;
    
    this.scene.add(hazeParticles);
    this.hazeParticles.push(hazeParticles);
  }

  private setupDepthCueing(): void {
    // Configure depth cueing for all materials in the scene
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach(material => {
            this.applyDepthCueing(material);
          });
        } else {
          this.applyDepthCueing(object.material);
        }
      }
    });
  }

  private applyDepthCueing(material: THREE.Material): void {
    if (material instanceof THREE.MeshStandardMaterial || 
        material instanceof THREE.MeshPhongMaterial ||
        material instanceof THREE.MeshLambertMaterial) {
      
      // Enable fog on material
      material.fog = true;
      
      // Store original color for atmospheric perspective calculations
      if (!material.userData.originalColor) {
        material.userData.originalColor = material.color.clone();
      }
    }
  }

  public setTimeOfDay(time: number): void {
    // time: 0 = midnight, 0.5 = noon, 1 = midnight
    this.timeOfDay = Math.max(0, Math.min(1, time));
    
    // Update sun position based on time
    const sunAngle = (this.timeOfDay - 0.5) * Math.PI * 2;
    const sunHeight = Math.sin(sunAngle) * 10000;
    const sunDistance = Math.cos(sunAngle) * 10000;
    
    this.sunPosition.set(sunDistance, Math.max(-2000, sunHeight), 0);
    
    // Update shader uniforms
    this.skyScatteringShader.uniforms.sunPosition.value = this.sunPosition;
    this.skyScatteringShader.uniforms.timeOfDay.value = this.timeOfDay;
    this.depthFogShader.uniforms.sunPosition.value = this.sunPosition;
    
    // Update sun intensity based on time (dim at night)
    const sunIntensity = Math.max(0.1, Math.sin(sunAngle + Math.PI / 2));
    this.skyScatteringShader.uniforms.sunIntensity.value = sunIntensity * this.config.sunIntensity;
    
    // Update atmospheric fog color
    if (this.atmosphericFog) {
      const nightColor = new THREE.Color(0.1, 0.1, 0.2);
      const dayColor = new THREE.Color(0.5, 0.7, 0.9);
      const sunsetColor = new THREE.Color(1.0, 0.6, 0.3);
      
      let fogColor = dayColor.clone();
      
      if (this.timeOfDay < 0.2 || this.timeOfDay > 0.8) {
        // Night
        fogColor = nightColor;
      } else if (this.timeOfDay < 0.3 || this.timeOfDay > 0.7) {
        // Sunrise/sunset
        const sunsetFactor = this.timeOfDay < 0.3 ? 
          (0.3 - this.timeOfDay) / 0.1 : 
          (this.timeOfDay - 0.7) / 0.1;
        fogColor = dayColor.clone().lerp(sunsetColor, sunsetFactor);
      }
      
      this.atmosphericFog.color = fogColor;
    }
  }

  public setWeatherConditions(visibility: number, humidity: number, pollution: number): void {
    this.config.visibility = Math.max(0.1, visibility);
    this.config.humidity = Math.max(0, Math.min(1, humidity));
    this.config.pollution = Math.max(0, Math.min(1, pollution));
    
    // Update fog density based on visibility
    this.config.fogDensity = 3.912 / (this.config.visibility * 1000); // Koschmieder equation
    
    // Update shader uniforms
    this.depthFogShader.uniforms.visibility.value = this.config.visibility * 1000;
    this.depthFogShader.uniforms.humidity.value = this.config.humidity;
    this.depthFogShader.uniforms.pollution.value = this.config.pollution;
    this.depthFogShader.uniforms.fogDensity.value = this.config.fogDensity;
    
    // Update scene fog
    if (this.atmosphericFog) {
      this.atmosphericFog.far = this.config.visibility * 1000;
    }
    
    // Update haze particle opacity based on conditions
    this.hazeParticles.forEach((particles, index) => {
      if (particles.material instanceof THREE.PointsMaterial) {
        const baseOpacity = 0.1;
        const weatherFactor = (1 + this.config.humidity) * (1 + this.config.pollution * 0.5);
        const visibilityFactor = Math.max(0.2, this.config.visibility / 20);
        
        particles.material.opacity = baseOpacity * weatherFactor / visibilityFactor;
      }
    });
  }

  public setObserverPosition(position: THREE.Vector3): void {
    this.observerPosition.copy(position);
    
    // Update depth fog uniforms
    this.depthFogShader.uniforms.cameraPosition.value = position;
  }

  public calculateDepthCue(distance: number): DepthCue {
    // Calculate atmospheric effects based on distance
    const visibilityFactor = Math.exp(-3.912 * distance / (this.config.visibility * 1000));
    const atmosphericFactor = 1 - visibilityFactor;
    
    // Color shift toward atmospheric color
    const atmosphericColor = new THREE.Color(0.7, 0.8, 0.9);
    const colorShift = atmosphericColor.multiplyScalar(atmosphericFactor);
    
    // Contrast and saturation reduction
    const contrastReduction = atmosphericFactor * 0.8;
    const saturationReduction = atmosphericFactor * 0.6;
    
    // Brightness adjustment (aerial perspective)
    const brightness = 1 + atmosphericFactor * 0.3;
    
    return {
      distance,
      colorShift,
      contrastReduction,
      saturationReduction,
      brightness
    };
  }

  public update(deltaTime: number): void {
    this.updateCounter++;
    
    // Update at specified frequency
    if (this.updateCounter % Math.floor(60 / this.updateFrequency) !== 0) return;
    
    // Update sky dome position to follow camera
    if (this.skyDome) {
      this.skyDome.position.copy(this.camera.position);
    }
    
    // Animate haze particles
    this.updateHazeAnimation(deltaTime);
    
    // Update atmospheric perspective for distant objects
    this.updateAtmosphericPerspective();
  }

  private updateHazeAnimation(deltaTime: number): void {
    const time = Date.now() * 0.0001;
    
    this.hazeParticles.forEach((particles, layerIndex) => {
      if (particles.geometry.attributes.position) {
        const positionsAttribute = particles.geometry.attributes.position;
        if (!(positionsAttribute instanceof THREE.BufferAttribute)) return;
        const positions = positionsAttribute.array as Float32Array;
        
        // Subtle animation of haze particles
        for (let i = 0; i < positions.length; i += 3) {
          const originalY = positions[i + 1];
          const waveOffset = (positions[i] + positions[i + 2]) * 0.0001 + time;
          positions[i + 1] = originalY + Math.sin(waveOffset) * 10 * (layerIndex + 1);
        }
        
        particles.geometry.attributes.position.needsUpdate = true;
      }
    });
  }

  private updateAtmosphericPerspective(): void {
    // Apply distance-based atmospheric effects to scene objects
    const cameraPosition = this.camera.position;
    
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material && object !== this.skyDome) {
        const distance = cameraPosition.distanceTo(object.position);
        
        if (distance > 1000) { // Only apply to distant objects
          const depthCue = this.calculateDepthCue(distance);
          
          if (Array.isArray(object.material)) {
            object.material.forEach(material => {
              this.applyAtmosphericEffects(material, depthCue);
            });
          } else {
            this.applyAtmosphericEffects(object.material, depthCue);
          }
        }
      }
    });
  }

  private applyAtmosphericEffects(material: THREE.Material, depthCue: DepthCue): void {
    if (material instanceof THREE.MeshStandardMaterial && material.userData.originalColor) {
      // Apply atmospheric color shift
      const newColor = material.userData.originalColor.clone();
      newColor.lerp(depthCue.colorShift, depthCue.contrastReduction);
      material.color.copy(newColor);
      
      // Reduce material contrast (increase roughness slightly)
      if (material.userData.originalRoughness === undefined) {
        material.userData.originalRoughness = material.roughness;
      }
      material.roughness = material.userData.originalRoughness + depthCue.contrastReduction * 0.2;
    }
  }

  public setAtmosphericConfig(config: Partial<AtmosphericConfig>): void {
    Object.assign(this.config, config);
    
    // Update shader uniforms
    if (config.rayleighScattering) {
      this.skyScatteringShader.uniforms.rayleighWavelengths.value.set(
        ...this.config.rayleighScattering.wavelengths
      );
      this.skyScatteringShader.uniforms.rayleighCoeff.value = this.config.rayleighScattering.scatteringCoefficient;
    }
    
    if (config.mieScattering) {
      this.skyScatteringShader.uniforms.mieCoeff.value = this.config.mieScattering.coefficient;
      this.skyScatteringShader.uniforms.mieG.value = this.config.mieScattering.directionalityG;
    }
    
    if (config.sunIntensity !== undefined) {
      this.skyScatteringShader.uniforms.sunIntensity.value = this.config.sunIntensity;
    }
  }

  public getAtmosphericConfig(): AtmosphericConfig {
    return { ...this.config };
  }

  public dispose(): void {
    // Remove sky dome
    if (this.skyDome) {
      this.scene.remove(this.skyDome);
      this.skyDome.geometry.dispose();
      this.skyScatteringShader.dispose();
    }
    
    // Remove haze particles
    this.hazeParticles.forEach(particles => {
      this.scene.remove(particles);
      particles.geometry.dispose();
      if (particles.material instanceof THREE.Material) {
        particles.material.dispose();
      }
    });
    this.hazeParticles = [];
    
    // Dispose shaders
    this.depthFogShader.dispose();
    
    // Remove scene fog
    this.scene.fog = null;
    
    console.log('AtmosphericEffectsSystem disposed');
  }
}