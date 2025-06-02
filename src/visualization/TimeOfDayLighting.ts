import * as THREE from 'three';

export interface SolarPosition {
  azimuth: number;        // Solar azimuth angle (radians from south)
  elevation: number;      // Solar elevation angle (radians from horizon)
  zenith: number;         // Solar zenith angle (radians from vertical)
  rightAscension: number; // Right ascension
  declination: number;    // Declination
  hourAngle: number;      // Hour angle
  intensity: number;      // Calculated intensity
}

export interface AtmosphericConditions {
  turbidity: number;      // Atmospheric turbidity (1-10)
  visibility: number;     // Visibility in km
  humidity: number;       // Relative humidity (0-1)
  pressure: number;       // Atmospheric pressure in hPa
  temperature: number;    // Temperature in Celsius
}

export interface TimeOfDayConfig {
  latitude: number;       // Observer latitude in degrees
  longitude: number;      // Observer longitude in degrees
  elevation: number;      // Observer elevation in meters
  timeZone: number;       // UTC offset in hours
  date: Date;            // Current date/time
  timeScale: number;     // How fast time progresses (1.0 = real time, 60 = 1 hour per minute)
  atmospheric: AtmosphericConditions;
}

export class TimeOfDayLighting {
  private scene: THREE.Scene;
  private config: TimeOfDayConfig;
  private currentTime: Date;
  
  // Lighting components
  private sunLight!: THREE.DirectionalLight;
  private moonLight!: THREE.DirectionalLight;
  private ambientLight!: THREE.AmbientLight;
  private skyDome!: THREE.Mesh;
  private stars!: THREE.Points;
  
  // Shadow and environment
  private shadowCamera!: THREE.OrthographicCamera;
  private pmremGenerator: THREE.PMREMGenerator;
  private envMap: THREE.CubeTexture | null = null;
  
  // Time tracking
  private timeUpdateInterval: number = 0;
  
  constructor(scene: THREE.Scene, config: TimeOfDayConfig, renderer: THREE.WebGLRenderer) {
    this.scene = scene;
    this.config = config;
    this.currentTime = new Date(config.date);
    
    // Initialize PMREM generator for environment mapping
    this.pmremGenerator = new THREE.PMREMGenerator(renderer);
    
    this.initializeLighting();
    this.createSkyDome();
    this.createStarField();
    this.updateLighting();
    
    console.log('TimeOfDayLighting system initialized for', config.latitude, config.longitude);
  }

  private initializeLighting(): void {
    // Sun light (main directional light)
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
    this.sunLight.castShadow = true;
    
    // Configure shadow properties
    this.sunLight.shadow.mapSize.width = 4096;
    this.sunLight.shadow.mapSize.height = 4096;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 1000;
    this.sunLight.shadow.camera.left = -100;
    this.sunLight.shadow.camera.right = 100;
    this.sunLight.shadow.camera.top = 100;
    this.sunLight.shadow.camera.bottom = -100;
    this.sunLight.shadow.bias = -0.0001;
    
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Moon light (secondary directional light)
    this.moonLight = new THREE.DirectionalLight(0x8888ff, 0.1);
    this.moonLight.castShadow = false; // Moon shadows are much softer, skip for performance
    this.scene.add(this.moonLight);

    // Ambient light (varies with time of day)
    this.ambientLight = new THREE.AmbientLight(0x404040, 0.2);
    this.scene.add(this.ambientLight);
  }

  private createSkyDome(): void {
    console.log('Creating realistic sky dome...');
    
    // Sky dome geometry
    const skyGeometry = new THREE.SphereGeometry(800, 32, 16);
    
    // Sky material with atmospheric scattering simulation
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        sunPosition: { value: new THREE.Vector3() },
        rayleighCoeff: { value: new THREE.Vector3(0.0025, 0.00104, 0.00017) },
        mieCoeff: { value: 0.005 },
        sunIntensity: { value: 1000 },
        up: { value: new THREE.Vector3(0, 1, 0) }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 sunPosition;
        uniform vec3 rayleighCoeff;
        uniform float mieCoeff;
        uniform float sunIntensity;
        uniform vec3 up;
        
        varying vec3 vWorldPosition;
        
        const float PI = 3.141592653589793;
        
        // Atmospheric scattering approximation
        float phase(float cosTheta, float g) {
          float g2 = g * g;
          return (3.0 * (1.0 - g2)) / (2.0 * (2.0 + g2)) * 
                 (1.0 + cosTheta * cosTheta) / pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5);
        }
        
        void main() {
          vec3 direction = normalize(vWorldPosition);
          float sunDot = dot(direction, normalize(sunPosition));
          
          // Sun elevation angle
          float sunElevation = max(0.0, dot(normalize(sunPosition), up));
          
          // Base sky color based on time of day
          vec3 dayColor = vec3(0.4, 0.7, 1.0);
          vec3 nightColor = vec3(0.05, 0.1, 0.2);
          vec3 sunsetColor = vec3(1.0, 0.6, 0.3);
          
          // Interpolate between day/night colors
          float dayFactor = smoothstep(-0.2, 0.2, sunElevation);
          float sunsetFactor = smoothstep(0.0, 0.3, sunElevation) * (1.0 - smoothstep(0.3, 0.8, sunElevation));
          
          vec3 skyColor = mix(nightColor, dayColor, dayFactor);
          skyColor = mix(skyColor, sunsetColor, sunsetFactor);
          
          // Add sun disc
          float sunDisc = smoothstep(0.996, 0.998, sunDot);
          skyColor += sunDisc * vec3(1.0, 1.0, 0.8) * sunElevation;
          
          // Atmospheric perspective
          float heightFactor = max(0.0, direction.y);
          skyColor = mix(vec3(0.8, 0.85, 0.9), skyColor, heightFactor);
          
          gl_FragColor = vec4(skyColor, 1.0);
        }
      `,
      side: THREE.BackSide
    });
    
    this.skyDome = new THREE.Mesh(skyGeometry, skyMaterial);
    this.skyDome.renderOrder = -1; // Render first
    this.scene.add(this.skyDome);
  }

  private createStarField(): void {
    console.log('Creating star field...');
    
    const starCount = 5000;
    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    
    for (let i = 0; i < starCount; i++) {
      // Random position on sphere
      const phi = Math.random() * Math.PI * 2;
      const theta = Math.random() * Math.PI;
      const radius = 750;
      
      starPositions[i * 3] = radius * Math.sin(theta) * Math.cos(phi);
      starPositions[i * 3 + 1] = radius * Math.cos(theta);
      starPositions[i * 3 + 2] = radius * Math.sin(theta) * Math.sin(phi);
      
      // Star color temperature simulation
      const temp = 0.3 + Math.random() * 0.7;
      starColors[i * 3] = 0.8 + temp * 0.2;     // Red
      starColors[i * 3 + 1] = 0.8 + temp * 0.15; // Green  
      starColors[i * 3 + 2] = 0.8 + temp * 0.3;  // Blue
    }
    
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    
    const starMaterial = new THREE.PointsMaterial({
      size: 2,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 0.8
    });
    
    this.stars = new THREE.Points(starGeometry, starMaterial);
    this.scene.add(this.stars);
  }

  public update(deltaTime: number): void {
    // Update time
    this.currentTime.setTime(this.currentTime.getTime() + deltaTime * 1000 * this.config.timeScale);
    
    // Update lighting every 100ms (10 times per second) to avoid excessive calculations
    this.timeUpdateInterval += deltaTime;
    if (this.timeUpdateInterval >= 0.1) {
      this.updateLighting();
      this.timeUpdateInterval = 0;
    }
  }

  private updateLighting(): void {
    const sunPos = this.calculateSunPosition(this.currentTime);
    const moonPos = this.calculateMoonPosition(this.currentTime);
    
    this.updateSunLight(sunPos);
    this.updateMoonLight(moonPos);
    this.updateAmbientLight(sunPos);
    this.updateSkyDome(sunPos);
    this.updateStarVisibility(sunPos);
  }

  private calculateSunPosition(date: Date): SolarPosition {
    // Enhanced solar position calculation with astronomical accuracy
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const hour = date.getUTCHours();
    const minute = date.getUTCMinutes();
    const second = date.getUTCSeconds();
    
    const decimalHour = hour + minute / 60 + second / 3600;
    const julianDay = this.calculateJulianDay(year, month, day, decimalHour);
    
    // Calculate solar coordinates
    const n = julianDay - 2451545.0; // Days since J2000.0
    const L = (280.460 + 0.9856474 * n) % 360; // Mean longitude
    const g = (357.528 + 0.9856003 * n) * Math.PI / 180; // Mean anomaly
    
    // Equation of center
    const C = 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g);
    const trueLongitude = (L + C) * Math.PI / 180;
    
    // Right ascension and declination
    const rightAscension = Math.atan2(
      Math.cos(23.439 * Math.PI / 180) * Math.sin(trueLongitude),
      Math.cos(trueLongitude)
    );
    
    const declination = Math.asin(
      Math.sin(23.439 * Math.PI / 180) * Math.sin(trueLongitude)
    );
    
    // Hour angle
    const hourAngle = (decimalHour - 12) * 15 * Math.PI / 180 + this.config.longitude * Math.PI / 180;
    
    // Local coordinates
    const latRad = this.config.latitude * Math.PI / 180;
    
    const elevation = Math.asin(
      Math.sin(declination) * Math.sin(latRad) + 
      Math.cos(declination) * Math.cos(latRad) * Math.cos(hourAngle)
    );
    
    const azimuth = Math.atan2(
      -Math.sin(hourAngle),
      Math.tan(declination) * Math.cos(latRad) - Math.sin(latRad) * Math.cos(hourAngle)
    );
    
    // Calculate intensity with atmospheric attenuation
    const rawIntensity = Math.max(0, Math.sin(elevation));
    const atmosphericAttenuation = this.calculateAtmosphericAttenuation(elevation);
    const intensity = rawIntensity * atmosphericAttenuation;
    
    return {
      azimuth: azimuth,
      elevation: elevation,
      zenith: Math.PI / 2 - elevation,
      rightAscension: rightAscension,
      declination: declination,
      hourAngle: hourAngle,
      intensity: intensity
    };
  }

  private calculateJulianDay(year: number, month: number, day: number, hour: number): number {
    let a = Math.floor((14 - month) / 12);
    let y = year + 4800 - a;
    let m = month + 12 * a - 3;
    
    let jdn = day + Math.floor((153 * m + 2) / 5) + 365 * y + 
              Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
    
    return jdn + (hour - 12) / 24;
  }

  private calculateAtmosphericAttenuation(elevation: number): number {
    if (elevation <= 0) return 0;
    
    // Air mass calculation
    const airMass = 1 / Math.sin(elevation);
    
    // Atmospheric extinction (simplified)
    const extinction = Math.exp(-airMass * this.config.atmospheric.turbidity * 0.1);
    
    return extinction;
  }

  private calculateMoonPosition(date: Date): SolarPosition {
    // Simplified moon position calculation
    const julianDay = this.calculateJulianDay(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
      date.getUTCHours() + date.getUTCMinutes() / 60
    );
    
    const n = julianDay - 2451545.0;
    
    // Lunar mean longitude
    const L = (218.316 + 13.176396 * n) % 360;
    const M = (134.963 + 13.064993 * n) % 360; // Mean anomaly
    const F = (93.272 + 13.229350 * n) % 360;  // Mean distance
    
    // Simplified longitude correction
    const longitude = (L + 6.289 * Math.sin(M * Math.PI / 180)) * Math.PI / 180;
    const latitude = 5.128 * Math.sin(F * Math.PI / 180) * Math.PI / 180;
    
    // Convert to right ascension and declination
    const rightAscension = Math.atan2(
      Math.sin(longitude) * Math.cos(23.439 * Math.PI / 180) - 
      Math.tan(latitude) * Math.sin(23.439 * Math.PI / 180),
      Math.cos(longitude)
    );
    
    const declination = Math.asin(
      Math.sin(latitude) * Math.cos(23.439 * Math.PI / 180) + 
      Math.cos(latitude) * Math.sin(23.439 * Math.PI / 180) * Math.sin(longitude)
    );
    
    // Local hour angle
    const decimalHour = date.getUTCHours() + date.getUTCMinutes() / 60;
    const hourAngle = (decimalHour - 12) * 15 * Math.PI / 180 + this.config.longitude * Math.PI / 180 - rightAscension;
    
    // Local coordinates
    const latRad = this.config.latitude * Math.PI / 180;
    const elevation = Math.asin(
      Math.sin(declination) * Math.sin(latRad) + 
      Math.cos(declination) * Math.cos(latRad) * Math.cos(hourAngle)
    );
    
    const azimuth = Math.atan2(
      -Math.sin(hourAngle),
      Math.tan(declination) * Math.cos(latRad) - Math.sin(latRad) * Math.cos(hourAngle)
    );
    
    // Lunar phase calculation
    const age = ((n + 4.867) % 29.53) / 29.53; // Approximate lunar age
    const phase = 0.5 * (1 - Math.cos(2 * Math.PI * age));
    const intensity = Math.max(0, Math.sin(elevation)) * phase * 0.1;
    
    return {
      azimuth: azimuth,
      elevation: elevation,
      zenith: Math.PI / 2 - elevation,
      rightAscension: rightAscension,
      declination: declination,
      hourAngle: hourAngle,
      intensity: intensity
    };
  }

  private updateSunLight(sunPos: SolarPosition): void {
    // Position sun light
    const distance = 500;
    this.sunLight.position.set(
      distance * Math.cos(sunPos.elevation) * Math.sin(sunPos.azimuth),
      distance * Math.sin(sunPos.elevation),
      distance * Math.cos(sunPos.elevation) * Math.cos(sunPos.azimuth)
    );
    
    // Update intensity and color based on elevation
    this.sunLight.intensity = sunPos.intensity * 3;
    
    // Color temperature changes throughout day
    if (sunPos.elevation > 0) {
      const temp = Math.min(1, sunPos.elevation / (Math.PI / 4)); // Normalize to 0-1
      
      if (temp < 0.3) {
        // Sunrise/sunset colors
        this.sunLight.color.setHSL(0.1, 0.8, 0.9); // Orange
      } else {
        // Daylight colors
        this.sunLight.color.setHSL(0.15, 0.1, 1.0); // White-yellow
      }
    } else {
      this.sunLight.intensity = 0;
    }
    
    // Update shadow camera position
    this.sunLight.target.position.set(0, 0, 0);
  }

  private updateMoonLight(moonPos: SolarPosition): void {
    const distance = 400;
    this.moonLight.position.set(
      distance * Math.cos(moonPos.elevation) * Math.sin(moonPos.azimuth),
      distance * Math.sin(moonPos.elevation),
      distance * Math.cos(moonPos.elevation) * Math.cos(moonPos.azimuth)
    );
    
    this.moonLight.intensity = moonPos.intensity;
    this.moonLight.color.setHSL(0.6, 0.2, 0.8); // Cool blue-white
  }

  private updateAmbientLight(sunPos: SolarPosition): void {
    // Ambient light varies with sun elevation
    const dayAmbient = 0.4;
    const nightAmbient = 0.05;
    
    const factor = Math.max(0, Math.min(1, (sunPos.elevation + 0.2) / 0.4));
    this.ambientLight.intensity = nightAmbient + (dayAmbient - nightAmbient) * factor;
    
    // Color shifts from cool night to warm day
    if (factor < 0.5) {
      this.ambientLight.color.setHSL(0.6, 0.3, 0.6); // Cool blue
    } else {
      this.ambientLight.color.setHSL(0.1, 0.2, 0.8); // Warm white
    }
  }

  private updateSkyDome(sunPos: SolarPosition): void {
    const skyMaterial = this.skyDome.material as THREE.ShaderMaterial;
    
    // Update sun position uniform
    const sunDirection = new THREE.Vector3(
      Math.cos(sunPos.elevation) * Math.sin(sunPos.azimuth),
      Math.sin(sunPos.elevation),
      Math.cos(sunPos.elevation) * Math.cos(sunPos.azimuth)
    );
    
    skyMaterial.uniforms.sunPosition.value.copy(sunDirection);
    skyMaterial.uniforms.sunIntensity.value = sunPos.intensity * 1000;
  }

  private updateStarVisibility(sunPos: SolarPosition): void {
    // Stars fade out during day
    const starOpacity = Math.max(0, 1 - sunPos.intensity * 2);
    (this.stars.material as THREE.PointsMaterial).opacity = starOpacity;
    
    // Rotate stars slowly for realism
    this.stars.rotation.y += 0.0001;
  }

  private getDayOfYear(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  // Get current lighting info for UI display
  public getCurrentTimeInfo(): { time: string; sunElevation: number; phase: string } {
    const sunPos = this.calculateSunPosition(this.currentTime);
    const elevation = sunPos.elevation * 180 / Math.PI;
    
    let phase: string;
    if (elevation > 10) {
      phase = 'Day';
    } else if (elevation > -6) {
      phase = elevation > 0 ? 'Golden Hour' : 'Civil Twilight';
    } else if (elevation > -12) {
      phase = 'Nautical Twilight';
    } else if (elevation > -18) {
      phase = 'Astronomical Twilight';
    } else {
      phase = 'Night';
    }
    
    return {
      time: this.currentTime.toLocaleTimeString(),
      sunElevation: elevation,
      phase
    };
  }

  public setTime(date: Date): void {
    this.currentTime = new Date(date);
    this.updateLighting();
  }

  public setTimeScale(scale: number): void {
    this.config.timeScale = scale;
  }

  public getSunLight(): THREE.DirectionalLight {
    return this.sunLight;
  }

  public getSolarPosition(): SolarPosition {
    return this.calculateSunPosition(this.currentTime);
  }

  public dispose(): void {
    this.scene.remove(this.sunLight);
    this.scene.remove(this.moonLight);
    this.scene.remove(this.ambientLight);
    this.scene.remove(this.skyDome);
    this.scene.remove(this.stars);
    
    // Dispose materials and geometries
    this.skyDome.geometry.dispose();
    (this.skyDome.material as THREE.Material).dispose();
    
    this.stars.geometry.dispose();
    (this.stars.material as THREE.Material).dispose();
    
    if (this.envMap) {
      this.envMap.dispose();
    }
    
    this.pmremGenerator.dispose();
    
    console.log('TimeOfDayLighting disposed');
  }
}