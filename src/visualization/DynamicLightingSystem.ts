import * as THREE from 'three';

export interface LightingConfig {
  // Sun parameters
  sun: {
    intensity: number;
    color: THREE.Color;
    position: THREE.Vector3;
    castShadows: boolean;
    shadowMapSize: number;
    shadowCameraNear: number;
    shadowCameraFar: number;
  };
  
  // Moon parameters
  moon: {
    intensity: number;
    color: THREE.Color;
    position: THREE.Vector3;
    castShadows: boolean;
  };
  
  // Ambient lighting
  ambient: {
    intensity: number;
    color: THREE.Color;
    groundReflection: number; // Ground bounce light
  };
  
  // Time progression
  timeOfDay: number; // 0-1 (0=midnight, 0.5=noon, 1=midnight)
  timeScale: number; // Real-time multiplier
  
  // Environmental lighting
  environment: {
    hdrIntensity: number;
    groundAlbedo: number; // 0-1 ground reflectance
    skyLuminance: number;
  };
  
  // Facility lighting
  artificialLights: {
    floodlights: boolean;
    buildingLights: boolean;
    runwayLights: boolean;
    obstacleMarkers: boolean;
    intensity: number;
  };
}

export interface ShadowConfig {
  enabled: boolean;
  type: 'PCF' | 'PCFSS' | 'VSM';
  mapSize: number;
  radius: number;
  bias: number;
  cascades: number; // For CSM (Cascaded Shadow Maps)
}

export interface TimeOfDayPreset {
  name: string;
  timeOfDay: number;
  sunIntensity: number;
  sunColor: THREE.Color;
  ambientIntensity: number;
  ambientColor: THREE.Color;
  fogColor: THREE.Color;
  skyColor: THREE.Color;
  description: string;
}

export class DynamicLightingSystem {
  private scene: THREE.Scene;
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;
  
  // Primary light sources
  private sunLight!: THREE.DirectionalLight;
  private moonLight!: THREE.DirectionalLight;
  private ambientLight!: THREE.AmbientLight;
  private hemisphereLight!: THREE.HemisphereLight;
  
  // Facility lighting
  private floodlights: THREE.SpotLight[] = [];
  private buildingLights: THREE.PointLight[] = [];
  private runwayLights: THREE.PointLight[] = [];
  private obstacleMarkers: THREE.PointLight[] = [];
  
  // Shadow systems
  private shadowCameraHelper: THREE.CameraHelper | null = null;
  private lightProbes: THREE.LightProbe[] = [];
  
  // Environment mapping
  private pmremGenerator: THREE.PMREMGenerator;
  private envMapTexture: THREE.CubeTexture | null = null;
  
  // Time and animation
  private timeOfDay: number = 0.5; // Start at noon
  private timeScale: number = 0; // Paused by default
  private lastUpdateTime: number = 0;
  
  // Configuration
  private config: LightingConfig = {
    sun: {
      intensity: 3.0,
      color: new THREE.Color(0xffffff),
      position: new THREE.Vector3(0, 10000, 10000),
      castShadows: true,
      shadowMapSize: 4096,
      shadowCameraNear: 100,
      shadowCameraFar: 50000
    },
    moon: {
      intensity: 0.1,
      color: new THREE.Color(0xaaccff),
      position: new THREE.Vector3(0, -5000, -10000),
      castShadows: false
    },
    ambient: {
      intensity: 0.3,
      color: new THREE.Color(0x404080),
      groundReflection: 0.2
    },
    timeOfDay: 0.5,
    timeScale: 0,
    environment: {
      hdrIntensity: 1.0,
      groundAlbedo: 0.3,
      skyLuminance: 20000
    },
    artificialLights: {
      floodlights: true,
      buildingLights: true,
      runwayLights: true,
      obstacleMarkers: true,
      intensity: 1.0
    }
  };
  
  // Time of day presets
  private presets: Map<string, TimeOfDayPreset> = new Map();

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.renderer = renderer;
    this.camera = camera;
    this.pmremGenerator = new THREE.PMREMGenerator(renderer);
    
    this.initializeTimePresets();
    this.setupShadows();
    this.createPrimaryLighting();
    this.createFacilityLighting();
    this.setupEnvironmentMapping();
    
    console.log('DynamicLightingSystem initialized with realistic day/night cycle');
  }

  private initializeTimePresets(): void {
    const presets: TimeOfDayPreset[] = [
      {
        name: 'midnight',
        timeOfDay: 0.0,
        sunIntensity: 0.0,
        sunColor: new THREE.Color(0x000000),
        ambientIntensity: 0.05,
        ambientColor: new THREE.Color(0x202040),
        fogColor: new THREE.Color(0x101020),
        skyColor: new THREE.Color(0x000011),
        description: 'Deep night with starlight only'
      },
      {
        name: 'pre_dawn',
        timeOfDay: 0.15,
        sunIntensity: 0.1,
        sunColor: new THREE.Color(0x4466aa),
        ambientIntensity: 0.15,
        ambientColor: new THREE.Color(0x303060),
        fogColor: new THREE.Color(0x202040),
        skyColor: new THREE.Color(0x001122),
        description: 'Pre-dawn twilight with civil twilight beginning'
      },
      {
        name: 'sunrise',
        timeOfDay: 0.25,
        sunIntensity: 1.5,
        sunColor: new THREE.Color(0xffaa44),
        ambientIntensity: 0.4,
        ambientColor: new THREE.Color(0x6699cc),
        fogColor: new THREE.Color(0x8899aa),
        skyColor: new THREE.Color(0x4488cc),
        description: 'Golden hour sunrise with warm lighting'
      },
      {
        name: 'morning',
        timeOfDay: 0.35,
        sunIntensity: 2.5,
        sunColor: new THREE.Color(0xffeecc),
        ambientIntensity: 0.6,
        ambientColor: new THREE.Color(0x99aacc),
        fogColor: new THREE.Color(0xaabbcc),
        skyColor: new THREE.Color(0x6699dd),
        description: 'Bright morning with clear visibility'
      },
      {
        name: 'noon',
        timeOfDay: 0.5,
        sunIntensity: 3.0,
        sunColor: new THREE.Color(0xffffff),
        ambientIntensity: 0.8,
        ambientColor: new THREE.Color(0xaaccff),
        fogColor: new THREE.Color(0xccddee),
        skyColor: new THREE.Color(0x87ceeb),
        description: 'Peak daylight with maximum visibility'
      },
      {
        name: 'afternoon',
        timeOfDay: 0.65,
        sunIntensity: 2.5,
        sunColor: new THREE.Color(0xffeedd),
        ambientIntensity: 0.6,
        ambientColor: new THREE.Color(0x99aacc),
        fogColor: new THREE.Color(0xaabbcc),
        skyColor: new THREE.Color(0x6699dd),
        description: 'Afternoon with slightly warmer tones'
      },
      {
        name: 'sunset',
        timeOfDay: 0.75,
        sunIntensity: 1.5,
        sunColor: new THREE.Color(0xff6622),
        ambientIntensity: 0.4,
        ambientColor: new THREE.Color(0x6699cc),
        fogColor: new THREE.Color(0x8899aa),
        skyColor: new THREE.Color(0x4488cc),
        description: 'Golden hour sunset with dramatic lighting'
      },
      {
        name: 'dusk',
        timeOfDay: 0.85,
        sunIntensity: 0.1,
        sunColor: new THREE.Color(0x4466aa),
        ambientIntensity: 0.15,
        ambientColor: new THREE.Color(0x303060),
        fogColor: new THREE.Color(0x202040),
        skyColor: new THREE.Color(0x001122),
        description: 'Evening twilight transitioning to night'
      }
    ];

    presets.forEach(preset => {
      this.presets.set(preset.name, preset);
    });
  }

  private setupShadows(): void {
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = true;
  }

  private createPrimaryLighting(): void {
    // Sun light (primary directional light)
    this.sunLight = new THREE.DirectionalLight(
      this.config.sun.color,
      this.config.sun.intensity
    );
    this.sunLight.position.copy(this.config.sun.position);
    this.sunLight.castShadow = this.config.sun.castShadows;
    
    // Configure sun shadows
    this.sunLight.shadow.mapSize.width = this.config.sun.shadowMapSize;
    this.sunLight.shadow.mapSize.height = this.config.sun.shadowMapSize;
    this.sunLight.shadow.camera.near = this.config.sun.shadowCameraNear;
    this.sunLight.shadow.camera.far = this.config.sun.shadowCameraFar;
    this.sunLight.shadow.camera.left = -5000;
    this.sunLight.shadow.camera.right = 5000;
    this.sunLight.shadow.camera.top = 5000;
    this.sunLight.shadow.camera.bottom = -5000;
    this.sunLight.shadow.bias = -0.0001;
    this.sunLight.shadow.radius = 4;
    
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);
    
    // Moon light (secondary directional light for night)
    this.moonLight = new THREE.DirectionalLight(
      this.config.moon.color,
      this.config.moon.intensity
    );
    this.moonLight.position.copy(this.config.moon.position);
    this.moonLight.castShadow = this.config.moon.castShadows;
    this.moonLight.visible = false; // Start invisible
    
    this.scene.add(this.moonLight);
    
    // Ambient light (base illumination)
    this.ambientLight = new THREE.AmbientLight(
      this.config.ambient.color,
      this.config.ambient.intensity
    );
    this.scene.add(this.ambientLight);
    
    // Hemisphere light (sky/ground bounce)
    this.hemisphereLight = new THREE.HemisphereLight(
      0x87ceeb, // Sky color
      0x362d1d, // Ground color
      0.6
    );
    this.hemisphereLight.position.set(0, 1000, 0);
    this.scene.add(this.hemisphereLight);
  }

  private createFacilityLighting(): void {
    // Floodlights for ground station illumination
    this.createFloodlights();
    
    // Building interior/exterior lights
    this.createBuildingLights();
    
    // Runway/taxiway lighting
    this.createRunwayLights();
    
    // Obstacle warning markers
    this.createObstacleMarkers();
  }

  private createFloodlights(): void {
    const floodlightPositions = [
      { x: -100, y: 25, z: -100 },
      { x: 100, y: 25, z: -100 },
      { x: -100, y: 25, z: 100 },
      { x: 100, y: 25, z: 100 },
      { x: 0, y: 30, z: 0 } // Central floodlight
    ];

    floodlightPositions.forEach((pos, index) => {
      const floodlight = new THREE.SpotLight(
        0xffeedd, // Warm white
        2.0,      // Intensity
        500,      // Distance
        Math.PI / 4, // Angle
        0.2,      // Penumbra
        2         // Decay
      );
      
      floodlight.position.set(pos.x, pos.y, pos.z);
      floodlight.target.position.set(pos.x, 0, pos.z);
      floodlight.castShadow = true;
      floodlight.shadow.mapSize.width = 1024;
      floodlight.shadow.mapSize.height = 1024;
      floodlight.shadow.camera.near = 10;
      floodlight.shadow.camera.far = 500;
      floodlight.visible = false; // Start invisible, activate at dusk
      
      this.scene.add(floodlight);
      this.scene.add(floodlight.target);
      this.floodlights.push(floodlight);
    });
  }

  private createBuildingLights(): void {
    const buildingLightPositions = [
      { x: -50, y: 15, z: -200 }, // Control tower
      { x: 200, y: 8, z: -50 },   // Equipment building
      { x: -200, y: 6, z: 100 },  // Maintenance facility
      { x: 0, y: 12, z: 200 }     // Operations center
    ];

    buildingLightPositions.forEach(pos => {
      const buildingLight = new THREE.PointLight(
        0xffeeaa, // Warm interior light
        1.5,      // Intensity
        100       // Distance
      );
      
      buildingLight.position.set(pos.x, pos.y, pos.z);
      buildingLight.decay = 2;
      buildingLight.visible = false; // Activate at sunset
      
      this.scene.add(buildingLight);
      this.buildingLights.push(buildingLight);
    });
  }

  private createRunwayLights(): void {
    // Create runway edge lights
    for (let i = -300; i <= 300; i += 50) {
      // Left edge
      const leftLight = new THREE.PointLight(0xffffff, 0.8, 30);
      leftLight.position.set(i, 0.5, -25);
      leftLight.visible = false;
      this.scene.add(leftLight);
      this.runwayLights.push(leftLight);
      
      // Right edge
      const rightLight = new THREE.PointLight(0xffffff, 0.8, 30);
      rightLight.position.set(i, 0.5, 25);
      rightLight.visible = false;
      this.scene.add(rightLight);
      this.runwayLights.push(rightLight);
    }
    
    // Threshold lights (green/red)
    const thresholdGreen = new THREE.PointLight(0x00ff00, 1.2, 50);
    thresholdGreen.position.set(-300, 1, 0);
    thresholdGreen.visible = false;
    this.scene.add(thresholdGreen);
    this.runwayLights.push(thresholdGreen);
    
    const thresholdRed = new THREE.PointLight(0xff0000, 1.2, 50);
    thresholdRed.position.set(300, 1, 0);
    thresholdRed.visible = false;
    this.scene.add(thresholdRed);
    this.runwayLights.push(thresholdRed);
  }

  private createObstacleMarkers(): void {
    const obstacleLightPositions = [
      { x: 0, y: 50, z: 0 },     // Main antenna
      { x: -100, y: 35, z: -100 }, // Tower
      { x: 100, y: 30, z: 100 },   // Mast
      { x: 200, y: 25, z: -200 }   // Equipment
    ];

    obstacleLightPositions.forEach(pos => {
      const obstacleLight = new THREE.PointLight(
        0xff0000, // Red warning light
        2.0,      // High intensity for visibility
        200       // Long range
      );
      
      obstacleLight.position.set(pos.x, pos.y, pos.z);
      obstacleLight.visible = false; // Activate at dusk
      
      this.scene.add(obstacleLight);
      this.obstacleMarkers.push(obstacleLight);
    });
  }

  private setupEnvironmentMapping(): void {
    // Create environment map for realistic reflections
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();
    
    // This would typically load an HDR environment map
    // For now, we'll create a procedural sky
    this.updateEnvironmentMap();
  }

  private updateEnvironmentMap(): void {
    // Update environment mapping based on time of day
    // This is a simplified implementation - would typically use HDR textures
    const skyColor = this.getCurrentSkyColor();
    const groundColor = this.getCurrentGroundColor();
    
    this.hemisphereLight.color.copy(skyColor);
    this.hemisphereLight.groundColor.copy(groundColor);
  }

  private getCurrentSkyColor(): THREE.Color {
    const preset = this.getCurrentPreset();
    return preset.skyColor.clone();
  }

  private getCurrentGroundColor(): THREE.Color {
    // Ground color varies with lighting but is generally darker
    const skyColor = this.getCurrentSkyColor();
    return skyColor.clone().multiplyScalar(0.3);
  }

  private getCurrentPreset(): TimeOfDayPreset {
    // Find the closest preset to current time
    const presetNames = ['midnight', 'pre_dawn', 'sunrise', 'morning', 'noon', 'afternoon', 'sunset', 'dusk'];
    const presetTimes = [0.0, 0.15, 0.25, 0.35, 0.5, 0.65, 0.75, 0.85];
    
    let closestIndex = 0;
    let closestDistance = Math.abs(this.timeOfDay - presetTimes[0]);
    
    for (let i = 1; i < presetTimes.length; i++) {
      const distance = Math.abs(this.timeOfDay - presetTimes[i]);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = i;
      }
    }
    
    return this.presets.get(presetNames[closestIndex])!;
  }

  public setTimeOfDay(time: number): void {
    this.timeOfDay = Math.max(0, Math.min(1, time));
    this.updateLightingForTime();
  }

  private updateLightingForTime(): void {
    const preset = this.getCurrentPreset();
    
    // Update sun position and intensity
    const sunAngle = (this.timeOfDay - 0.5) * Math.PI * 2;
    const sunHeight = Math.sin(sunAngle) * 10000;
    const sunDistance = Math.cos(sunAngle) * 10000;
    
    this.sunLight.position.set(sunDistance, Math.max(-2000, sunHeight), 0);
    this.sunLight.intensity = preset.sunIntensity;
    this.sunLight.color.copy(preset.sunColor);
    
    // Update moon (opposite of sun)
    this.moonLight.position.set(-sunDistance, Math.max(-2000, -sunHeight), 0);
    this.moonLight.visible = sunHeight < 0; // Only visible at night
    
    // Update ambient lighting
    this.ambientLight.intensity = preset.ambientIntensity;
    this.ambientLight.color.copy(preset.ambientColor);
    
    // Update artificial lighting based on time
    this.updateArtificialLights();
    
    // Update environment mapping
    this.updateEnvironmentMap();
    
    // Update scene fog if present
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(preset.fogColor);
    }
  }

  private updateArtificialLights(): void {
    const isDark = this.timeOfDay < 0.2 || this.timeOfDay > 0.8;
    const isDusk = (this.timeOfDay > 0.7 && this.timeOfDay < 0.9) || 
                   (this.timeOfDay > 0.1 && this.timeOfDay < 0.3);
    
    // Floodlights: activate at dusk/dawn and during night
    const floodlightActive = isDark || isDusk;
    this.floodlights.forEach(light => {
      light.visible = floodlightActive && this.config.artificialLights.floodlights;
      if (light.visible) {
        light.intensity = 2.0 * this.config.artificialLights.intensity;
      }
    });
    
    // Building lights: on during night and evening
    const buildingLightsActive = this.timeOfDay < 0.25 || this.timeOfDay > 0.7;
    this.buildingLights.forEach(light => {
      light.visible = buildingLightsActive && this.config.artificialLights.buildingLights;
      if (light.visible) {
        light.intensity = 1.5 * this.config.artificialLights.intensity;
      }
    });
    
    // Runway lights: on when dark
    this.runwayLights.forEach(light => {
      light.visible = isDark && this.config.artificialLights.runwayLights;
      if (light.visible) {
        light.intensity = 0.8 * this.config.artificialLights.intensity;
      }
    });
    
    // Obstacle markers: blinking red lights at night
    this.obstacleMarkers.forEach((light, index) => {
      light.visible = isDark && this.config.artificialLights.obstacleMarkers;
      if (light.visible) {
        // Create blinking effect with different phases
        const time = Date.now() * 0.001;
        const blinkPhase = (time + index * 0.5) % 2;
        light.intensity = (blinkPhase < 1 ? 2.0 : 0.2) * this.config.artificialLights.intensity;
      }
    });
  }

  public setTimeScale(scale: number): void {
    this.timeScale = scale;
  }

  public applyPreset(presetName: string): void {
    const preset = this.presets.get(presetName);
    if (preset) {
      this.setTimeOfDay(preset.timeOfDay);
    }
  }

  public enableShadowDebug(enabled: boolean): void {
    if (enabled && !this.shadowCameraHelper) {
      this.shadowCameraHelper = new THREE.CameraHelper(this.sunLight.shadow.camera);
      this.scene.add(this.shadowCameraHelper);
    } else if (!enabled && this.shadowCameraHelper) {
      this.scene.remove(this.shadowCameraHelper);
      this.shadowCameraHelper = null;
    }
  }

  public setShadowQuality(quality: 'low' | 'medium' | 'high' | 'ultra'): void {
    const sizeMap = {
      low: 1024,
      medium: 2048,
      high: 4096,
      ultra: 8192
    };
    
    const size = sizeMap[quality];
    this.sunLight.shadow.mapSize.width = size;
    this.sunLight.shadow.mapSize.height = size;
    
    // Update floodlight shadows
    this.floodlights.forEach(light => {
      light.shadow.mapSize.width = Math.min(size / 2, 2048);
      light.shadow.mapSize.height = Math.min(size / 2, 2048);
    });
  }

  public update(deltaTime: number): void {
    // Update time progression
    if (this.timeScale > 0) {
      this.timeOfDay += deltaTime * this.timeScale / 86400; // 86400 seconds per day
      if (this.timeOfDay > 1) {
        this.timeOfDay -= 1; // Wrap around
      }
      this.updateLightingForTime();
    }
    
    // Update shadow camera helper
    if (this.shadowCameraHelper) {
      this.shadowCameraHelper.update();
    }
    
    // Update artificial light animations (blinking, etc.)
    this.updateArtificialLights();
  }

  public getLightingConfig(): LightingConfig {
    return { ...this.config };
  }

  public setLightingConfig(config: Partial<LightingConfig>): void {
    Object.assign(this.config, config);
    this.updateLightingForTime();
  }

  public getAvailablePresets(): string[] {
    return Array.from(this.presets.keys());
  }

  public getCurrentTimeString(): string {
    const hours = Math.floor(this.timeOfDay * 24);
    const minutes = Math.floor((this.timeOfDay * 24 - hours) * 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  public dispose(): void {
    // Remove all lights
    this.scene.remove(this.sunLight);
    this.scene.remove(this.moonLight);
    this.scene.remove(this.ambientLight);
    this.scene.remove(this.hemisphereLight);
    
    // Remove artificial lights
    this.floodlights.forEach(light => {
      this.scene.remove(light);
      this.scene.remove(light.target);
    });
    this.buildingLights.forEach(light => this.scene.remove(light));
    this.runwayLights.forEach(light => this.scene.remove(light));
    this.obstacleMarkers.forEach(light => this.scene.remove(light));
    
    // Remove shadow camera helper
    if (this.shadowCameraHelper) {
      this.scene.remove(this.shadowCameraHelper);
    }
    
    // Dispose environment mapping
    this.pmremGenerator.dispose();
    if (this.envMapTexture) {
      this.envMapTexture.dispose();
    }
    
    console.log('DynamicLightingSystem disposed');
  }
}