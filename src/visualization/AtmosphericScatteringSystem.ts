import * as THREE from 'three';

export interface ScatteringConfig {
  rayleighCoefficient: THREE.Vector3; // Rayleigh scattering coefficients (RGB)
  mieCoefficient: number;             // Mie scattering coefficient
  mieDirectionalG: number;            // Mie scattering anisotropy
  turbidity: number;                  // Atmospheric turbidity
  sunIntensity: number;               // Sun intensity multiplier
  rayleighZenithLength: number;       // Rayleigh optical depth at zenith
  mieZenithLength: number;            // Mie optical depth at zenith
  up: THREE.Vector3;                  // Up vector
  sunPosition: THREE.Vector3;         // Sun position
}

export class AtmosphericScatteringSystem {
  private scene: THREE.Scene;
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;
  
  // Scattering configuration
  private config: ScatteringConfig;
  
  // Sky sphere for atmospheric effects
  private atmosphereMesh!: THREE.Mesh;
  private atmosphereMaterial!: THREE.ShaderMaterial;
  
  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.renderer = renderer;
    this.camera = camera;
    
    // Initialize with Earth-like atmosphere
    this.config = {
      rayleighCoefficient: new THREE.Vector3(0.0025, 0.00104, 0.00017), // Blue-dominant scattering
      mieCoefficient: 0.005,
      mieDirectionalG: 0.8,
      turbidity: 2.0,
      sunIntensity: 1000.0,
      rayleighZenithLength: 8400, // meters
      mieZenithLength: 1200,     // meters
      up: new THREE.Vector3(0, 1, 0),
      sunPosition: new THREE.Vector3(0, 1, 0)
    };
    
    this.createAtmosphericScattering();
    
    console.log('AtmosphericScatteringSystem initialized');
  }

  private createAtmosphericScattering(): void {
    // Create large atmosphere sphere
    const geometry = new THREE.SphereGeometry(50000, 64, 32);
    
    // Advanced atmospheric scattering shader
    this.atmosphereMaterial = new THREE.ShaderMaterial({
      uniforms: {
        // Scattering parameters
        rayleighCoefficient: { value: this.config.rayleighCoefficient },
        mieCoefficient: { value: this.config.mieCoefficient },
        mieDirectionalG: { value: this.config.mieDirectionalG },
        turbidity: { value: this.config.turbidity },
        sunIntensity: { value: this.config.sunIntensity },
        
        // Optical depths
        rayleighZenithLength: { value: this.config.rayleighZenithLength },
        mieZenithLength: { value: this.config.mieZenithLength },
        
        // Directions
        sunPosition: { value: this.config.sunPosition.clone() },
        up: { value: this.config.up.clone() },
        
        // Camera
        viewerPosition: { value: this.camera.position.clone() },
        
        // Constants
        lambda: { value: new THREE.Vector3(680E-9, 550E-9, 450E-9) }, // Wavelengths (RGB)
        totalRayleigh: { value: new THREE.Vector3(5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5) },
        v: { value: 4.0 },
        
        // Angular constants
        sunAngularDiameterCos: { value: 0.999956676946448443553574619906976478926848692873900859324 },
        threeSixteenPi: { value: 0.05968310365946075 },
        oneFourPi: { value: 0.07957747154594767 }
      },
      
      vertexShader: `
        // Mathematical constants
        const float pi = 3.141592653589793238462643383279502884197169;
        const float e = 2.718281828459045235360287471352662497757247;
        
        varying vec3 vWorldPosition;
        varying vec3 vSunDirection;
        varying float vSunfade;
        varying vec3 vBetaR;
        varying vec3 vBetaM;
        varying float vSunE;
        
        uniform vec3 sunPosition;
        uniform vec3 up;
        uniform vec3 rayleighCoefficient;
        uniform float mieCoefficient;
        uniform float turbidity;
        uniform float sunIntensity;
        uniform float rayleighZenithLength;
        uniform float mieZenithLength;
        uniform vec3 totalRayleigh;
        uniform vec3 lambda;
        uniform float v;
        
        // Calculate total Mie scattering coefficient
        vec3 totalMie(vec3 lambda, vec3 K, float T) {
          float c = (0.2 * T) * 10E-18;
          return 0.434 * c * pow((2.0 * pi) / lambda, v - 2.0) * K;
        }
        
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position.z = gl_Position.w; // Set z to w for far plane rendering
          
          vSunDirection = normalize(sunPosition);
          
          // Sun intensity calculation
          vSunE = sunIntensity * pow(max(dot(vSunDirection, up), 0.0), 0.4);
          
          // Sun fade based on elevation
          vSunfade = 1.0 - clamp(1.0 - exp((sunPosition.y / 450000.0)), 0.0, 1.0);
          
          // Rayleigh coefficient
          float rayleighCoef = rayleighCoefficient.x - (1.0 * (1.0 - vSunfade));
          vBetaR = totalRayleigh * rayleighCoef;
          
          // Mie coefficient  
          vec3 K = vec3(0.686, 0.678, 0.666);
          vBetaM = totalMie(lambda, K, turbidity) * mieCoefficient;
        }
      `,
      
      fragmentShader: `
        // Mathematical constants
        const float pi = 3.141592653589793238462643383279502884197169;
        const float e = 2.718281828459045235360287471352662497757247;
        const float n = 1.0003; // Refractive index of air
        const float N = 2.545E25; // Number density of molecules
        const float pn = 0.035; // Depolarization factor
        
        varying vec3 vWorldPosition;
        varying vec3 vSunDirection;
        varying float vSunfade;
        varying vec3 vBetaR;
        varying vec3 vBetaM;
        varying float vSunE;
        
        uniform float mieDirectionalG;
        uniform vec3 up;
        uniform vec3 viewerPosition;
        uniform float rayleighZenithLength;
        uniform float mieZenithLength;
        uniform float sunAngularDiameterCos;
        uniform float threeSixteenPi;
        uniform float oneFourPi;
        
        // Uncharted 2 tone mapping function
        vec3 Uncharted2Tonemap(vec3 color) {
          float A = 0.15;
          float B = 0.50;
          float C = 0.10;
          float D = 0.20;
          float E = 0.02;
          float F = 0.30;
          return ((color * (A * color + C * B) + D * E) / (color * (A * color + B) + D * F)) - E / F;
        }
        
        // Rayleigh phase function
        float rayleighPhase(float cosTheta) {
          return threeSixteenPi * (1.0 + pow(cosTheta, 2.0));
        }
        
        // Henyey-Greenstein phase function for Mie scattering
        float hgPhase(float cosTheta, float g) {
          float g2 = pow(g, 2.0);
          float inverse = 1.0 / pow(1.0 - 2.0 * g * cosTheta + g2, 1.5);
          return oneFourPi * ((1.0 - g2) * inverse);
        }
        
        void main() {
          vec3 direction = normalize(vWorldPosition - viewerPosition);
          
          // Zenith angle
          float zenithAngle = acos(max(0.0, dot(up, direction)));
          
          // Optical depth
          float inverse = 1.0 / (cos(zenithAngle) + 0.15 * pow(93.885 - zenithAngle * 180.0 / pi, -1.253));
          float sR = rayleighZenithLength * inverse;
          float sM = mieZenithLength * inverse;
          
          // Combined extinction factor
          vec3 Fex = exp(-(vBetaR * sR + vBetaM * sM));
          
          // Phase calculations
          float cosTheta = dot(direction, vSunDirection);
          float rPhase = rayleighPhase(cosTheta);
          vec3 betaRTheta = vBetaR * rPhase;
          
          float mPhase = hgPhase(cosTheta, mieDirectionalG);
          vec3 betaMTheta = vBetaM * mPhase;
          
          // Inscattered light
          vec3 Lin = pow(vSunE * ((betaRTheta + betaMTheta) / (vBetaR + vBetaM)) * (1.0 - Fex), vec3(1.5));
          Lin *= mix(vec3(1.0), pow(vSunE * ((betaRTheta + betaMTheta) / (vBetaR + vBetaM)) * Fex, vec3(1.0 / 2.0)), clamp(pow(1.0 - dot(up, vSunDirection), 5.0), 0.0, 1.0));
          
          // Nighttime
          vec3 L0 = vec3(0.1) * Fex;
          
          // Solar disk
          float sundisk = smoothstep(sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta);
          L0 += (vSunE * 19000.0 * Fex) * sundisk;
          
          vec3 whiteScale = 1.0 / Uncharted2Tonemap(vec3(1000.0 / 2000.0));
          vec3 finalColor = Uncharted2Tonemap(Lin + L0) * whiteScale;
          
          // Gamma correction
          finalColor = pow(finalColor, vec3(1.0 / 2.2));
          
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
      
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false
    });
    
    this.atmosphereMesh = new THREE.Mesh(geometry, this.atmosphereMaterial);
    this.atmosphereMesh.renderOrder = -1000; // Render very first
    this.scene.add(this.atmosphereMesh);
  }

  public updateSunPosition(sunPosition: THREE.Vector3): void {
    this.config.sunPosition.copy(sunPosition.clone().normalize());
    this.atmosphereMaterial.uniforms.sunPosition.value.copy(this.config.sunPosition);
  }

  public updateAtmosphericConditions(config: Partial<ScatteringConfig>): void {
    Object.assign(this.config, config);
    
    // Update shader uniforms
    this.atmosphereMaterial.uniforms.rayleighCoefficient.value.copy(this.config.rayleighCoefficient);
    this.atmosphereMaterial.uniforms.mieCoefficient.value = this.config.mieCoefficient;
    this.atmosphereMaterial.uniforms.mieDirectionalG.value = this.config.mieDirectionalG;
    this.atmosphereMaterial.uniforms.turbidity.value = this.config.turbidity;
    this.atmosphereMaterial.uniforms.sunIntensity.value = this.config.sunIntensity;
    this.atmosphereMaterial.uniforms.rayleighZenithLength.value = this.config.rayleighZenithLength;
    this.atmosphereMaterial.uniforms.mieZenithLength.value = this.config.mieZenithLength;
  }

  public update(deltaTime: number): void {
    // Update camera position for atmospheric perspective
    this.atmosphereMaterial.uniforms.viewerPosition.value.copy(this.camera.position);
  }

  public getAtmosphericDepth(position: THREE.Vector3, viewDirection: THREE.Vector3): number {
    // Calculate atmospheric depth for object visibility
    const distance = position.distanceTo(this.camera.position);
    const altitude = position.y;
    
    // Simplified atmospheric density calculation
    const seaLevelDensity = 1.225; // kg/m³
    const scaleHeight = 8400; // meters
    const density = seaLevelDensity * Math.exp(-altitude / scaleHeight);
    
    // Optical depth
    const opticalDepth = density * distance * this.config.turbidity * 0.001;
    
    return Math.min(opticalDepth, 10.0); // Clamp to reasonable values
  }

  public applyAtmosphericPerspective(color: THREE.Color, position: THREE.Vector3): THREE.Color {
    const depth = this.getAtmosphericDepth(position, new THREE.Vector3());
    const extinction = Math.exp(-depth);
    
    // Apply scattering color shift
    const scatterColor = new THREE.Color(0.4, 0.7, 1.0); // Blue sky color
    const scatterAmount = 1.0 - extinction;
    
    return color.clone().multiplyScalar(extinction).lerp(scatterColor, scatterAmount * 0.3);
  }

  public dispose(): void {
    this.scene.remove(this.atmosphereMesh);
    this.atmosphereMaterial.dispose();
    this.atmosphereMesh.geometry.dispose();
    
    console.log('AtmosphericScatteringSystem disposed');
  }
}