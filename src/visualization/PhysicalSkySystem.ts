import * as THREE from 'three';

// Hosek-Wilkie sky model coefficients
interface HosekWilkieCoeffs {
  A: number;
  B: number;
  C: number;
  D: number;
  E: number;
  F: number;
  G: number;
  H: number;
  I: number;
}

// Solar position calculation
interface SolarPosition {
  azimuth: number;
  elevation: number;
  zenith: number;
}

export interface SkyConfig {
  turbidity: number;      // 1-10, atmospheric clarity (1=clear, 10=hazy)
  rayleigh: number;       // 0-4, Rayleigh scattering coefficient
  mieCoefficient: number; // 0-0.1, Mie scattering coefficient  
  mieDirectionalG: number; // 0-1, Mie scattering directionality
  elevation: number;      // Sun elevation angle
  azimuth: number;        // Sun azimuth angle
  exposure: number;       // Camera exposure
  starIntensity: number;  // Night sky star intensity
}

export class PhysicalSkySystem {
  private scene: THREE.Scene;
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;
  
  // Sky components
  private skyMesh!: THREE.Mesh;
  private starsMesh!: THREE.Points;
  private sunMesh!: THREE.Mesh;
  private moonMesh!: THREE.Mesh;
  
  // Shaders and materials
  private skyMaterial!: THREE.ShaderMaterial;
  private starMaterial!: THREE.ShaderMaterial;
  
  // Sky configuration
  private config: SkyConfig = {
    turbidity: 2.0,
    rayleigh: 1.0,
    mieCoefficient: 0.005,
    mieDirectionalG: 0.8,
    elevation: Math.PI / 4, // 45 degrees
    azimuth: 0,
    exposure: 0.68,
    starIntensity: 0.0
  };
  
  // Time and location
  private latitude: number = 0;
  private longitude: number = 0;
  private utcTime: Date = new Date();
  
  // Hosek-Wilkie model coefficients
  private readonly hosekWilkieX: HosekWilkieCoeffs = {
    A: -1.0670, B: -0.2818, C: -5.7513, D: 6.3451, E: -3.0000,
    F: 0.1787, G: -1.4630, H: -0.0227, I: 0.1206
  };
  
  private readonly hosekWilkieY: HosekWilkieCoeffs = {
    A: -1.0370, B: -0.2498, C: -1.9735, D: 2.1225, E: -3.0000,
    F: 0.0947, G: -1.0015, H: -0.0158, I: 0.0734
  };
  
  private readonly hosekWilkieZ: HosekWilkieCoeffs = {
    A: -0.7341, B: -1.6164, C: 1.9198, D: -5.3295, E: -2.5744,
    F: -0.0844, G: 0.1374, H: 0.0624, I: -0.0319
  };

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.renderer = renderer;
    this.camera = camera;
    
    this.createSkyDome();
    this.createStarField();
    this.createCelestialBodies();
    this.updateSky();
    
    console.log('PhysicalSkySystem initialized with Hosek-Wilkie model');
  }

  private createSkyDome(): void {
    // Create large sky sphere
    const skyGeometry = new THREE.SphereGeometry(50000, 32, 16);
    
    // Hosek-Wilkie sky shader
    this.skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        turbidity: { value: this.config.turbidity },
        rayleigh: { value: this.config.rayleigh },
        mieCoefficient: { value: this.config.mieCoefficient },
        mieDirectionalG: { value: this.config.mieDirectionalG },
        sunPosition: { value: new THREE.Vector3() },
        up: { value: new THREE.Vector3(0, 1, 0) },
        
        // Hosek-Wilkie coefficients
        hosekA: { value: new THREE.Vector3(this.hosekWilkieX.A, this.hosekWilkieY.A, this.hosekWilkieZ.A) },
        hosekB: { value: new THREE.Vector3(this.hosekWilkieX.B, this.hosekWilkieY.B, this.hosekWilkieZ.B) },
        hosekC: { value: new THREE.Vector3(this.hosekWilkieX.C, this.hosekWilkieY.C, this.hosekWilkieZ.C) },
        hosekD: { value: new THREE.Vector3(this.hosekWilkieX.D, this.hosekWilkieY.D, this.hosekWilkieZ.D) },
        hosekE: { value: new THREE.Vector3(this.hosekWilkieX.E, this.hosekWilkieY.E, this.hosekWilkieZ.E) },
        hosekF: { value: new THREE.Vector3(this.hosekWilkieX.F, this.hosekWilkieY.F, this.hosekWilkieZ.F) },
        hosekG: { value: new THREE.Vector3(this.hosekWilkieX.G, this.hosekWilkieY.G, this.hosekWilkieZ.G) },
        hosekH: { value: new THREE.Vector3(this.hosekWilkieX.H, this.hosekWilkieY.H, this.hosekWilkieZ.H) },
        hosekI: { value: new THREE.Vector3(this.hosekWilkieX.I, this.hosekWilkieY.I, this.hosekWilkieZ.I) },
        
        // Time-based parameters
        sunIntensity: { value: 1000.0 },
        exposure: { value: this.config.exposure }
      },
      
      vertexShader: `
        varying vec3 vWorldPosition;
        varying vec3 vSunDirection;
        varying float vSunfade;
        varying vec3 vBetaR;
        varying vec3 vBetaM;
        varying float vSunE;
        
        uniform vec3 sunPosition;
        uniform float rayleigh;
        uniform float turbidity;
        uniform float mieCoefficient;
        
        const vec3 lambda = vec3(680E-9, 550E-9, 450E-9);
        const vec3 totalRayleigh = vec3(5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5);
        const float v = 4.0;
        const float rayleighZenithLength = 8.4E3;
        const float mieZenithLength = 1.25E3;
        const vec3 up = vec3(0.0, 1.0, 0.0);
        const float sunAngularDiameterCos = 0.999956676946448443553574619906976478926848692873900859324;
        const float THREE_OVER_SIXTEENPI = 0.05968310365946075;
        const float ONE_OVER_FOURPI = 0.07957747154594767;
        
        float rayleighPhase(float cosTheta) {
          return THREE_OVER_SIXTEENPI * (1.0 + pow(cosTheta, 2.0));
        }
        
        float hgPhase(float cosTheta, float g) {
          float g2 = pow(g, 2.0);
          float inverse = 1.0 / pow(1.0 - 2.0 * g * cosTheta + g2, 1.5);
          return ONE_OVER_FOURPI * ((1.0 - g2) * inverse);
        }
        
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position.z = gl_Position.w; // Set z to w to render at far plane
          
          vSunDirection = normalize(sunPosition);
          vSunE = sunIntensity * pow(max(dot(vSunDirection, up), 0.0), 0.4);
          vSunfade = 1.0 - clamp(1.0 - exp((sunPosition.y / 450000.0)), 0.0, 1.0);
          
          float rayleighCoefficient = rayleigh - (1.0 * (1.0 - vSunfade));
          vBetaR = totalRayleigh * rayleighCoefficient;
          
          float mieCoeff = mieCoefficient;
          vBetaM = totalMie(lambda, vec3(turbidity), mieCoeff) * mieCoeff;
        }
        
        vec3 totalMie(vec3 lambda, vec3 T, float c) {
          float c2 = c * c;
          vec3 cm = 0.2 * c2 * 2.0 * T;
          return 0.434 * c2 * ((6.0 + 3.0 * cm) / (6.0 - 7.0 * cm));
        }
      `,
      
      fragmentShader: `
        varying vec3 vWorldPosition;
        varying vec3 vSunDirection;
        varying float vSunfade;
        varying vec3 vBetaR;
        varying vec3 vBetaM;
        varying float vSunE;
        
        uniform float mieDirectionalG;
        uniform float exposure;
        uniform vec3 hosekA, hosekB, hosekC, hosekD, hosekE, hosekF, hosekG, hosekH, hosekI;
        
        const vec3 cameraPos = vec3(0.0, 0.0, 0.0);
        const float pi = 3.141592653589793238462643383279502884197169;
        const float n = 1.0003;
        const float N = 2.545E25;
        const float pn = 0.035;
        const float rayleighZenithLength = 8.4E3;
        const float mieZenithLength = 1.25E3;
        const vec3 up = vec3(0.0, 1.0, 0.0);
        
        float rayleighPhase(float cosTheta) {
          return (3.0 / (16.0 * pi)) * (1.0 + pow(cosTheta, 2.0));
        }
        
        float hgPhase(float cosTheta, float g) {
          float g2 = pow(g, 2.0);
          float inverse = 1.0 / pow(1.0 - 2.0 * g * cosTheta + g2, 1.5);
          return (1.0 / (4.0 * pi)) * ((1.0 - g2) * inverse);
        }
        
        float hosekWilkieModel(float theta, float gamma, vec3 A, vec3 B, vec3 C, vec3 D, vec3 E, vec3 F, vec3 G, vec3 H, vec3 I) {
          float expM = exp(E.x * gamma);
          float cosTheta = cos(theta);
          return (1.0 + A.x * exp(B.x / (cosTheta + 0.01))) * 
                 (C.x + D.x * expM + F.x * cosTheta * cosTheta + G.x * cosTheta + H.x * sqrt(cosTheta) + I.x);
        }
        
        void main() {
          vec3 direction = normalize(vWorldPosition - cameraPos);
          
          // Calculate angles
          float theta = acos(direction.y); // Zenith angle
          float gamma = acos(dot(direction, vSunDirection)); // Angle from sun
          
          // Hosek-Wilkie sky radiance
          vec3 radiance = vec3(
            hosekWilkieModel(theta, gamma, hosekA, hosekB, hosekC, hosekD, hosekE, hosekF, hosekG, hosekH, hosekI),
            hosekWilkieModel(theta, gamma, hosekA, hosekB, hosekC, hosekD, hosekE, hosekF, hosekG, hosekH, hosekI),
            hosekWilkieModel(theta, gamma, hosekA, hosekB, hosekC, hosekD, hosekE, hosekF, hosekG, hosekH, hosekI)
          );
          
          // Apply atmospheric scattering for additional realism
          float cosTheta = dot(direction, vSunDirection);
          float rayleighPhaseFunc = rayleighPhase(cosTheta);
          float miePhaseFunc = hgPhase(cosTheta, mieDirectionalG);
          
          vec3 betaRTheta = vBetaR * rayleighPhaseFunc;
          vec3 betaMTheta = vBetaM * miePhaseFunc;
          
          vec3 extinction = exp(-(vBetaR + vBetaM) * (rayleighZenithLength + mieZenithLength));
          vec3 scatter = (betaRTheta + betaMTheta) / (vBetaR + vBetaM);
          
          vec3 inscatterRayleigh = scatter * (1.0 - extinction);
          vec3 L0 = vSunE * inscatterRayleigh;
          
          // Combine Hosek-Wilkie with scattering
          vec3 finalColor = radiance * 0.0001 + L0;
          
          // Apply exposure and tone mapping
          finalColor = 1.0 - exp(-exposure * finalColor);
          finalColor = pow(finalColor, vec3(1.0 / 2.2)); // Gamma correction
          
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false
    });
    
    this.skyMesh = new THREE.Mesh(skyGeometry, this.skyMaterial);
    this.skyMesh.renderOrder = -1000; // Render first
    this.scene.add(this.skyMesh);
  }

  private createStarField(): void {
    // Create star field for night sky
    const starsGeometry = new THREE.BufferGeometry();
    const starCount = 10000;
    
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);
    
    for (let i = 0; i < starCount; i++) {
      // Random position on sphere
      const phi = Math.random() * Math.PI * 2;
      const theta = Math.acos(1 - Math.random() * 2);
      
      const x = Math.sin(theta) * Math.cos(phi);
      const y = Math.cos(theta);
      const z = Math.sin(theta) * Math.sin(phi);
      
      positions[i * 3] = x * 45000;
      positions[i * 3 + 1] = Math.max(y * 45000, 0); // Only upper hemisphere
      positions[i * 3 + 2] = z * 45000;
      
      // Star color variation (blue giants to red dwarfs)
      const temp = Math.random();
      if (temp < 0.1) {
        // Blue giants
        colors[i * 3] = 0.7;
        colors[i * 3 + 1] = 0.8;
        colors[i * 3 + 2] = 1.0;
      } else if (temp < 0.3) {
        // White stars
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 1.0;
        colors[i * 3 + 2] = 1.0;
      } else if (temp < 0.8) {
        // Yellow stars (like our sun)
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 0.9;
        colors[i * 3 + 2] = 0.7;
      } else {
        // Red giants
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 0.6;
        colors[i * 3 + 2] = 0.4;
      }
      
      // Size variation
      sizes[i] = Math.random() * 3 + 1;
    }
    
    starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starsGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    starsGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    
    this.starMaterial = new THREE.ShaderMaterial({
      uniforms: {
        starIntensity: { value: this.config.starIntensity },
        time: { value: 0 }
      },
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        uniform float starIntensity;
        
        void main() {
          vColor = color; // Use built-in color attribute from THREE.js
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mvPosition.z) * starIntensity;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float time;
        varying vec3 vColor;
        
        void main() {
          float r = distance(gl_PointCoord, vec2(0.5, 0.5));
          if (r > 0.5) discard;
          
          // Subtle twinkling
          float twinkle = sin(time * 2.0 + gl_FragCoord.x * 0.01 + gl_FragCoord.y * 0.01) * 0.1 + 0.9;
          float alpha = (1.0 - r * 2.0) * twinkle;
          
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      vertexColors: true
    });
    
    this.starsMesh = new THREE.Points(starsGeometry, this.starMaterial);
    this.starsMesh.renderOrder = -999; // Render after sky
    this.scene.add(this.starsMesh);
  }

  private createCelestialBodies(): void {
    // Create sun
    const sunGeometry = new THREE.SphereGeometry(500, 16, 16);
    const sunMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.8
    });
    this.sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
    this.scene.add(this.sunMesh);
    
    // Create moon
    const moonGeometry = new THREE.SphereGeometry(300, 16, 16);
    const moonMaterial = new THREE.MeshBasicMaterial({
      color: 0xccccdd,
      transparent: true,
      opacity: 0.6
    });
    this.moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
    this.scene.add(this.moonMesh);
  }

  public setLocation(latitude: number, longitude: number): void {
    this.latitude = latitude;
    this.longitude = longitude;
    this.updateSky();
  }

  public setTime(utcTime: Date): void {
    this.utcTime = utcTime;
    this.updateSky();
  }

  private calculateSolarPosition(): SolarPosition {
    // Calculate solar position using astronomical algorithms
    const day = this.utcTime.getTime() / (1000 * 60 * 60 * 24);
    const julianDay = day + 2440587.5;
    
    // Solar declination
    const n = julianDay - 2451545.0;
    const L = (280.460 + 0.9856474 * n) % 360;
    const g = ((357.528 + 0.9856003 * n) % 360) * Math.PI / 180;
    const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * Math.PI / 180;
    
    const declination = Math.asin(Math.sin(lambda) * Math.sin(23.439 * Math.PI / 180));
    
    // Hour angle
    const hourAngle = (this.utcTime.getHours() + this.utcTime.getMinutes() / 60 - 12) * 15 * Math.PI / 180;
    
    // Convert to local coordinates
    const latRad = this.latitude * Math.PI / 180;
    const elevation = Math.asin(
      Math.sin(declination) * Math.sin(latRad) + 
      Math.cos(declination) * Math.cos(latRad) * Math.cos(hourAngle)
    );
    
    const azimuth = Math.atan2(
      Math.sin(hourAngle),
      Math.cos(hourAngle) * Math.sin(latRad) - Math.tan(declination) * Math.cos(latRad)
    );
    
    return {
      azimuth: azimuth,
      elevation: elevation,
      zenith: Math.PI / 2 - elevation
    };
  }

  private updateSky(): void {
    const solar = this.calculateSolarPosition();
    
    // Update sun position
    this.config.elevation = solar.elevation;
    this.config.azimuth = solar.azimuth;
    
    // Calculate sun direction vector
    const sunDistance = 40000;
    const sunPosition = new THREE.Vector3(
      Math.cos(solar.elevation) * Math.sin(solar.azimuth) * sunDistance,
      Math.sin(solar.elevation) * sunDistance,
      Math.cos(solar.elevation) * Math.cos(solar.azimuth) * sunDistance
    );
    
    // Update sky material uniforms
    this.skyMaterial.uniforms.sunPosition.value.copy(sunPosition);
    this.skyMaterial.uniforms.turbidity.value = this.config.turbidity;
    this.skyMaterial.uniforms.rayleigh.value = this.config.rayleigh;
    this.skyMaterial.uniforms.mieCoefficient.value = this.config.mieCoefficient;
    this.skyMaterial.uniforms.mieDirectionalG.value = this.config.mieDirectionalG;
    this.skyMaterial.uniforms.exposure.value = this.config.exposure;
    
    // Update star intensity based on sun elevation
    const isNight = solar.elevation < 0;
    const twilightFactor = Math.max(0, Math.min(1, -solar.elevation / (Math.PI / 6))); // Fade in over 30 degrees
    this.config.starIntensity = isNight ? twilightFactor : 0;
    this.starMaterial.uniforms.starIntensity.value = this.config.starIntensity;
    
    // Position sun mesh
    this.sunMesh.position.copy(sunPosition.clone().normalize().multiplyScalar(35000));
    this.sunMesh.visible = solar.elevation > -0.1; // Hide when well below horizon
    
    // Position moon (opposite side of sky, simplified)
    const moonPosition = sunPosition.clone().negate();
    this.moonMesh.position.copy(moonPosition.clone().normalize().multiplyScalar(35000));
    this.moonMesh.visible = solar.elevation < 0.1; // Hide during day
  }

  public update(deltaTime: number): void {
    // Update star twinkling animation
    this.starMaterial.uniforms.time.value += deltaTime;
    
    // Auto-update sky if time is progressing
    this.updateSky();
  }

  public setConfig(config: Partial<SkyConfig>): void {
    Object.assign(this.config, config);
    this.updateSky();
  }

  public getConfig(): SkyConfig {
    return { ...this.config };
  }

  public dispose(): void {
    this.scene.remove(this.skyMesh);
    this.scene.remove(this.starsMesh);
    this.scene.remove(this.sunMesh);
    this.scene.remove(this.moonMesh);
    
    this.skyMaterial.dispose();
    this.starMaterial.dispose();
    
    console.log('PhysicalSkySystem disposed');
  }
}