import * as THREE from 'three';

export interface SatelliteVisibility {
  magnitude: number;          // Visual magnitude (-4 to +6)
  phaseAngle: number;        // Sun-satellite-observer angle
  distance: number;          // Distance from observer (km)
  sunElevation: number;      // Sun elevation angle
  isVisible: boolean;        // Whether satellite should be visible
  glintIntensity: number;    // Intensity for sprite overlay
}

export interface HDRConfig {
  exposureCompensation: number;  // Stops of exposure compensation
  toneMappingMode: 'linear' | 'reinhard' | 'aces';
  bloomThreshold: number;        // HDR bloom threshold
  bloomIntensity: number;        // Bloom effect intensity
  starMagnitudeLimit: number;    // Dimmest visible magnitude
}

export class HDRSatelliteRenderer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  
  private config: HDRConfig;
  
  // HDR rendering
  private renderTarget!: THREE.WebGLRenderTarget;
  private hdrFramebuffer!: THREE.WebGLRenderTarget;
  
  // Satellite rendering
  private satelliteSprites: Map<string, THREE.Sprite> = new Map();
  private glintMaterial!: THREE.SpriteMaterial;
  
  // Post-processing materials
  private toneMappingMaterial!: THREE.ShaderMaterial;
  private bloomMaterial!: THREE.ShaderMaterial;
  
  // Sun position for magnitude calculations
  private sunPosition: THREE.Vector3 = new THREE.Vector3(0, 1, 0);
  
  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    
    this.config = {
      exposureCompensation: 0.0,
      toneMappingMode: 'aces',
      bloomThreshold: 1.0,
      bloomIntensity: 0.8,
      starMagnitudeLimit: 5.5
    };
    
    this.setupHDRRendering();
    this.createSatelliteSpriteMaterial();
    this.createPostProcessingMaterials();
    
    console.log('HDRSatelliteRenderer initialized - Real magnitude-based visibility');
  }

  private setupHDRRendering(): void {
    // Create HDR render targets
    this.hdrFramebuffer = new THREE.WebGLRenderTarget(
      this.renderer.domElement.width,
      this.renderer.domElement.height,
      {
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
        magFilter: THREE.LinearFilter,
        minFilter: THREE.LinearFilter,
        encoding: THREE.LinearEncoding
      }
    );
    
    this.renderTarget = new THREE.WebGLRenderTarget(
      this.renderer.domElement.width,
      this.renderer.domElement.height,
      {
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        magFilter: THREE.LinearFilter,
        minFilter: THREE.LinearFilter,
        encoding: THREE.sRGBEncoding
      }
    );
    
    console.log('HDR framebuffer setup complete');
  }

  private createSatelliteSpriteMaterial(): void {
    this.glintMaterial = new THREE.SpriteMaterial({
      map: this.createGlintTexture(),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false
    });
  }

  private createGlintTexture(): THREE.Texture {
    // Create procedural glint texture
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d')!;
    
    // Create radial gradient for satellite glint
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
    
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    
    return texture;
  }

  private createPostProcessingMaterials(): void {
    // Tone mapping shader
    this.toneMappingMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        exposure: { value: 1.0 },
        toneMappingMode: { value: 2 } // 0=linear, 1=reinhard, 2=aces
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float exposure;
        uniform int toneMappingMode;
        varying vec2 vUv;
        
        // ACES tone mapping
        vec3 ACESFilm(vec3 x) {
          float a = 2.51;
          float b = 0.03;
          float c = 2.43;
          float d = 0.59;
          float e = 0.14;
          return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
        }
        
        // Reinhard tone mapping
        vec3 Reinhard(vec3 x) {
          return x / (1.0 + x);
        }
        
        void main() {
          vec4 texel = texture2D(tDiffuse, vUv);
          vec3 color = texel.rgb * exposure;
          
          if (toneMappingMode == 1) {
            color = Reinhard(color);
          } else if (toneMappingMode == 2) {
            color = ACESFilm(color);
          }
          
          // Gamma correction
          color = pow(color, vec3(1.0 / 2.2));
          
          gl_FragColor = vec4(color, texel.a);
        }
      `
    });
    
    // Bloom shader
    this.bloomMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        threshold: { value: this.config.bloomThreshold },
        intensity: { value: this.config.bloomIntensity }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float threshold;
        uniform float intensity;
        varying vec2 vUv;
        
        void main() {
          vec4 texel = texture2D(tDiffuse, vUv);
          float brightness = dot(texel.rgb, vec3(0.299, 0.587, 0.114));
          
          if (brightness > threshold) {
            gl_FragColor = texel * intensity;
          } else {
            gl_FragColor = vec4(0.0);
          }
        }
      `
    });
  }

  public calculateSatelliteVisibility(
    satellitePosition: THREE.Vector3,
    observerPosition: THREE.Vector3,
    sunPosition: THREE.Vector3,
    sunElevation: number,
    satelliteAlbedo: number = 0.3
  ): SatelliteVisibility {
    
    // Distance from observer to satellite (in km)
    const distance = observerPosition.distanceTo(satellitePosition) / 1000;
    
    // Vector from satellite to sun
    const satToSun = sunPosition.clone().sub(satellitePosition).normalize();
    
    // Vector from satellite to observer
    const satToObs = observerPosition.clone().sub(satellitePosition).normalize();
    
    // Phase angle (angle between sun-satellite-observer)
    const phaseAngle = Math.acos(Math.max(-1, Math.min(1, satToSun.dot(satToObs))));
    
    // Phase function (simplified - real satellites use more complex models)
    const phaseFunction = (1 + Math.cos(phaseAngle)) / 2;
    
    // Intrinsic brightness calculation
    // Based on typical satellite size and albedo
    const satelliteRadius = 1.5; // meters (typical small satellite)
    const solarConstant = 1361; // W/m² at Earth distance
    const phaseIntegral = 2.0 / 3.0; // Lambert sphere approximation
    
    // Reflected power
    const reflectedPower = solarConstant * Math.PI * satelliteRadius * satelliteRadius * 
                          satelliteAlbedo * phaseFunction / phaseIntegral;
    
    // Apparent magnitude calculation
    // Reference: Sun magnitude = -26.7, distance = 150M km
    const sunReferenceMag = -26.7;
    const sunDistance = 150000000; // km
    const refDistance = 1000; // km (reference distance for satellites)
    
    // Distance modulus
    const distanceModulus = 5 * Math.log10(distance / refDistance);
    
    // Phase modulus
    const phaseModulus = -2.5 * Math.log10(phaseFunction);
    
    // Albedo modulus
    const albedoModulus = -2.5 * Math.log10(satelliteAlbedo / 0.25); // Reference albedo
    
    // Final magnitude
    const magnitude = 4.0 + distanceModulus + phaseModulus + albedoModulus;
    
    // Visibility determination
    let isVisible = false;
    let glintIntensity = 0;
    
    if (sunElevation < -0.1) {
      // Night time - satellites visible if bright enough
      isVisible = magnitude < this.config.starMagnitudeLimit;
      glintIntensity = Math.max(0, (this.config.starMagnitudeLimit - magnitude) / 6.0);
    } else if (sunElevation < 0.1) {
      // Twilight - only very bright satellites visible
      isVisible = magnitude < 2.0;
      glintIntensity = Math.max(0, (2.0 - magnitude) / 4.0) * 0.5;
    } else {
      // Daytime - only extremely bright satellites/ISS visible
      isVisible = magnitude < -2.0;
      glintIntensity = Math.max(0, (-2.0 - magnitude) / 2.0) * 0.2;
    }
    
    return {
      magnitude,
      phaseAngle,
      distance,
      sunElevation,
      isVisible,
      glintIntensity
    };
  }

  public updateSatellite(
    id: string,
    position: THREE.Vector3,
    visibility: SatelliteVisibility
  ): void {
    
    let sprite = this.satelliteSprites.get(id);
    
    if (!sprite && visibility.isVisible) {
      // Create new sprite
      sprite = new THREE.Sprite(this.glintMaterial.clone());
      sprite.renderOrder = 1000; // Render after everything else
      this.scene.add(sprite);
      this.satelliteSprites.set(id, sprite);
    }
    
    if (sprite) {
      if (visibility.isVisible) {
        sprite.visible = true;
        sprite.position.copy(position);
        
        // Scale based on magnitude
        const scale = this.magnitudeToScale(visibility.magnitude);
        sprite.scale.setScalar(scale);
        
        // Color and intensity based on conditions
        const material = sprite.material as THREE.SpriteMaterial;
        material.opacity = visibility.glintIntensity;
        
        // Color temperature based on phase angle
        const colorTemp = this.phaseAngleToColor(visibility.phaseAngle);
        material.color.copy(colorTemp);
        
        // HDR intensity for bloom effect
        const hdrIntensity = Math.pow(2.512, -visibility.magnitude);
        material.color.multiplyScalar(hdrIntensity);
        
      } else {
        sprite.visible = false;
      }
    }
  }

  private magnitudeToScale(magnitude: number): number {
    // Convert magnitude to visual scale
    // Brighter objects (lower magnitude) appear larger
    const baseScale = 50.0;
    const scaleFactor = Math.pow(2.512, -magnitude * 0.4);
    return Math.max(0.5, Math.min(200, baseScale * scaleFactor));
  }

  private phaseAngleToColor(phaseAngle: number): THREE.Color {
    // Satellites can appear slightly colored based on phase angle
    // Full phase (behind sun) = warmer, thin crescent = cooler
    const warmness = (Math.PI - phaseAngle) / Math.PI;
    
    return new THREE.Color().setHSL(
      0.1 - warmness * 0.05, // Hue: slight yellow to blue shift
      0.1,                   // Low saturation
      1.0                    // Full lightness
    );
  }

  public setSunPosition(position: THREE.Vector3): void {
    this.sunPosition.copy(position);
  }

  public updateHDRExposure(sunElevation: number): void {
    // Automatic exposure based on lighting conditions
    let exposure: number;
    
    if (sunElevation > Math.PI / 4) {
      exposure = 0.5; // Bright daylight
    } else if (sunElevation > 0) {
      exposure = 0.7 + (1 - sunElevation / (Math.PI / 4)) * 0.8; // Morning/evening
    } else if (sunElevation > -0.2) {
      exposure = 1.5; // Twilight
    } else {
      exposure = 3.0; // Night
    }
    
    // Apply exposure compensation
    exposure *= Math.pow(2, this.config.exposureCompensation);
    
    this.toneMappingMaterial.uniforms.exposure.value = exposure;
    this.renderer.toneMappingExposure = exposure;
  }

  public render(): void {
    // Render to HDR framebuffer first
    this.renderer.setRenderTarget(this.hdrFramebuffer);
    this.renderer.render(this.scene, this.camera);
    
    // Apply tone mapping and output to screen
    this.renderer.setRenderTarget(null);
    
    // Simple tone mapping (in a full implementation, this would be a post-processing pass)
    const originalToneMapping = this.renderer.toneMapping;
    const originalExposure = this.renderer.toneMappingExposure;
    
    switch (this.config.toneMappingMode) {
      case 'linear':
        this.renderer.toneMapping = THREE.LinearToneMapping;
        break;
      case 'reinhard':
        this.renderer.toneMapping = THREE.ReinhardToneMapping;
        break;
      case 'aces':
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        break;
    }
    
    this.renderer.render(this.scene, this.camera);
    
    // Restore original settings
    this.renderer.toneMapping = originalToneMapping;
    this.renderer.toneMappingExposure = originalExposure;
  }

  public removeSatellite(id: string): void {
    const sprite = this.satelliteSprites.get(id);
    if (sprite) {
      this.scene.remove(sprite);
      sprite.material.dispose();
      this.satelliteSprites.delete(id);
    }
  }

  public setHDRConfig(config: Partial<HDRConfig>): void {
    Object.assign(this.config, config);
    
    this.toneMappingMaterial.uniforms.toneMappingMode.value = 
      this.config.toneMappingMode === 'linear' ? 0 :
      this.config.toneMappingMode === 'reinhard' ? 1 : 2;
      
    this.bloomMaterial.uniforms.threshold.value = this.config.bloomThreshold;
    this.bloomMaterial.uniforms.intensity.value = this.config.bloomIntensity;
  }

  public getVisibleSatelliteCount(): number {
    let count = 0;
    this.satelliteSprites.forEach(sprite => {
      if (sprite.visible) count++;
    });
    return count;
  }

  public dispose(): void {
    // Dispose render targets
    this.hdrFramebuffer.dispose();
    this.renderTarget.dispose();
    
    // Dispose materials
    this.glintMaterial.dispose();
    this.toneMappingMaterial.dispose();
    this.bloomMaterial.dispose();
    
    // Remove all sprites
    this.satelliteSprites.forEach(sprite => {
      this.scene.remove(sprite);
      sprite.material.dispose();
    });
    this.satelliteSprites.clear();
    
    console.log('HDRSatelliteRenderer disposed');
  }
}