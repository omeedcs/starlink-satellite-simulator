import * as THREE from 'three';
import { PBRMaterialSystem } from './PBRMaterialSystem';

export interface AntennaModelConfig {
  antennaId: string;
  type: 'parabolic' | 'phased_array' | 'helical' | 'horn' | 'patch';
  diameter: number; // meters
  position: THREE.Vector3;
  initialPointing: { azimuth: number; elevation: number };
  constraints: {
    azimuthMin: number;
    azimuthMax: number;
    elevationMin: number;
    elevationMax: number;
    slewRate: number; // degrees/second
  };
  visualConfig: {
    showBeam: boolean;
    beamColor: THREE.Color;
    beamOpacity: number;
    showSidelobes: boolean;
    animateTracking: boolean;
  };
}

export interface TrackingTarget {
  satelliteId: string;
  position: THREE.Vector3;
  priority: number; // Higher priority = preferred target
  signalStrength: number; // 0-1
  linkActive: boolean;
  modulation: string;
  dataRate: number; // Mbps
}

export interface RFBeamVisualization {
  antennaId: string;
  mainBeam: THREE.Mesh;
  sidelobes: THREE.Group;
  beamCone: THREE.Mesh;
  signalPath: THREE.Line;
  modulationIndicator: THREE.Sprite;
  powerIndicators: THREE.Group;
}

export interface LinkMetrics {
  snr: number; // dB
  rssi: number; // dBm
  ber: number; // Bit error rate
  throughput: number; // Mbps
  linkMargin: number; // dB
  frequency: number; // MHz
  modulation: string;
}

export class DynamicAntennaSystem {
  private scene: THREE.Scene;
  private materialSystem: PBRMaterialSystem;
  
  // Antenna models and components
  private antennaModels: Map<string, THREE.Group> = new Map();
  private antennaConfigs: Map<string, AntennaModelConfig> = new Map();
  private trackingTargets: Map<string, TrackingTarget> = new Map();
  private currentPointings: Map<string, { azimuth: number; elevation: number }> = new Map();
  
  // RF beam visualizations
  private beamVisualizations: Map<string, RFBeamVisualization> = new Map();
  private beamShaderMaterial!: THREE.ShaderMaterial;
  
  // Animation and tracking
  private trackingAnimations: Map<string, {
    startPointing: { azimuth: number; elevation: number };
    targetPointing: { azimuth: number; elevation: number };
    startTime: number;
    duration: number;
    easing: (t: number) => number;
  }> = new Map();
  
  // Performance optimization
  private updateCounter: number = 0;
  private updateFrequency: number = 30; // Hz
  private maxRenderDistance: number = 2000; // meters
  
  constructor(scene: THREE.Scene, materialSystem: PBRMaterialSystem) {
    this.scene = scene;
    this.materialSystem = materialSystem;
    
    this.initializeBeamShaders();
    this.createAntennaModels();
    
    console.log('DynamicAntennaSystem initialized');
  }

  private initializeBeamShaders(): void {
    // Advanced shader for RF beam visualization with realistic patterns
    const beamVertexShader = `
      varying vec3 vPosition;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying vec2 vUv;
      varying float vDistance;
      
      void main() {
        vPosition = position;
        vNormal = normalize(normalMatrix * normal);
        vUv = uv;
        
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vDistance = length(mvPosition.xyz);
        
        gl_Position = projectionMatrix * mvPosition;
      }
    `;

    const beamFragmentShader = `
      uniform float time;
      uniform float frequency; // MHz
      uniform float power; // dBW
      uniform float beamwidth; // degrees
      uniform vec3 beamDirection;
      uniform vec3 antennaPosition;
      uniform float signalStrength; // 0-1
      uniform float linkActive; // 0 or 1
      uniform vec3 modulationColor;
      uniform float modulationRate; // Hz
      
      varying vec3 vPosition;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying vec2 vUv;
      varying float vDistance;
      
      // Antenna gain pattern simulation
      float calculateGainPattern(vec3 direction, vec3 beamDir, float beamwidth) {
        float angle = acos(dot(normalize(direction), normalize(beamDir)));
        float halfBeamwidth = radians(beamwidth * 0.5);
        
        if (angle <= halfBeamwidth) {
          // Main beam - cosine taper
          return cos(angle / halfBeamwidth * 3.14159 * 0.5);
        } else {
          // Sidelobes - simplified pattern
          float sidelobeLevel = 0.1;
          float sidelobePattern = sidelobeLevel * (1.0 + 0.5 * sin(angle * 8.0));
          return max(0.01, sidelobePattern);
        }
      }
      
      // Signal modulation visualization
      vec3 getModulationPattern(float t, vec3 baseColor) {
        float modulation = sin(t * modulationRate * 6.28318) * 0.5 + 0.5;
        return mix(baseColor * 0.3, baseColor, modulation);
      }
      
      // Distance-based attenuation
      float getPathLoss(float distance, float freq) {
        // Free space path loss: 20*log10(d) + 20*log10(f) + 32.44
        float pathLossDb = 20.0 * log(distance / 1000.0) / log(10.0) + 
                          20.0 * log(freq) / log(10.0) + 32.44;
        return pow(10.0, -pathLossDb / 20.0); // Convert dB to linear
      }
      
      void main() {
        vec3 rayDirection = normalize(vWorldPosition - antennaPosition);
        
        // Calculate antenna gain
        float gain = calculateGainPattern(rayDirection, beamDirection, beamwidth);
        
        // Calculate distance from antenna
        float distance = length(vWorldPosition - antennaPosition);
        
        // Path loss calculation
        float pathLoss = getPathLoss(distance, frequency);
        
        // Signal strength with distance
        float signalLevel = signalStrength * gain * pathLoss;
        
        // Base beam color based on signal strength
        vec3 baseColor = mix(vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), signalLevel);
        
        // Apply modulation pattern if link is active
        vec3 finalColor = baseColor;
        if (linkActive > 0.5) {
          finalColor = getModulationPattern(time, modulationColor);
        }
        
        // Distance-based opacity
        float opacity = signalLevel * (1.0 - smoothstep(0.0, 1000.0, distance));
        
        // Add power density visualization
        float powerDensity = power * gain / (distance * distance + 1.0);
        finalColor += vec3(powerDensity * 0.1);
        
        // Pulsing effect for active links
        if (linkActive > 0.5) {
          float pulse = sin(time * 4.0) * 0.2 + 0.8;
          opacity *= pulse;
        }
        
        gl_FragColor = vec4(finalColor, opacity * 0.7);
      }
    `;

    this.beamShaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0.0 },
        frequency: { value: 14000.0 },
        power: { value: 50.0 },
        beamwidth: { value: 1.0 },
        beamDirection: { value: new THREE.Vector3(0, 0, 1) },
        antennaPosition: { value: new THREE.Vector3(0, 0, 0) },
        signalStrength: { value: 1.0 },
        linkActive: { value: 0.0 },
        modulationColor: { value: new THREE.Color(0x00ff00) },
        modulationRate: { value: 10.0 }
      },
      vertexShader: beamVertexShader,
      fragmentShader: beamFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
  }

  private createAntennaModels(): void {
    // Create detailed antenna model templates
    this.createParabolicDishModel();
    this.createPhasedArrayModel();
    this.createHelicalAntennaModel();
  }

  private createParabolicDishModel(): void {
    const dishGroup = new THREE.Group();
    
    // Main reflector dish
    const dishGeometry = new THREE.SphereGeometry(2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const dishMaterial = this.materialSystem.createMaterial('antenna_aluminum');
    const dish = new THREE.Mesh(dishGeometry, dishMaterial);
    dish.rotation.x = Math.PI; // Face upward
    dishGroup.add(dish);
    
    // Feed horn at focus
    const feedGeometry = new THREE.ConeGeometry(0.1, 0.3, 8);
    const feedMaterial = this.materialSystem.createMaterial('antenna_steel');
    const feed = new THREE.Mesh(feedGeometry, feedMaterial);
    feed.position.set(0, 0.8, 0); // At focal point
    feed.rotation.x = Math.PI;
    dishGroup.add(feed);
    
    // Support struts
    const strutGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.8);
    const strutMaterial = this.materialSystem.createMaterial('antenna_steel');
    
    for (let i = 0; i < 4; i++) {
      const strut = new THREE.Mesh(strutGeometry, strutMaterial);
      const angle = (i / 4) * Math.PI * 2;
      strut.position.set(Math.cos(angle) * 0.8, 0.4, Math.sin(angle) * 0.8);
      strut.rotation.z = angle;
      strut.rotation.x = Math.PI / 6; // Angled support
      dishGroup.add(strut);
    }
    
    // Mount and pedestal
    const pedestalGeometry = new THREE.CylinderGeometry(0.3, 0.3, 2);
    const pedestalMaterial = this.materialSystem.createMaterial('concrete_smooth');
    const pedestal = new THREE.Mesh(pedestalGeometry, pedestalMaterial);
    pedestal.position.y = -1;
    dishGroup.add(pedestal);
    
    // Azimuth bearing housing
    const bearingGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.3);
    const bearingMaterial = this.materialSystem.createMaterial('metal_painted');
    const bearing = new THREE.Mesh(bearingGeometry, bearingMaterial);
    bearing.position.y = 0.15;
    dishGroup.add(bearing);
    
    // Store template
    dishGroup.name = 'parabolic_template';
    dishGroup.visible = false;
    this.scene.add(dishGroup);
  }

  private createPhasedArrayModel(): void {
    const arrayGroup = new THREE.Group();
    
    // Main panel
    const panelGeometry = new THREE.BoxGeometry(1.2, 1.2, 0.1);
    const panelMaterial = this.materialSystem.createMaterial('radome_fiberglass');
    const panel = new THREE.Mesh(panelGeometry, panelMaterial);
    arrayGroup.add(panel);
    
    // Individual array elements
    const elementGeometry = new THREE.BoxGeometry(0.05, 0.05, 0.01);
    const elementMaterial = this.materialSystem.createMaterial('antenna_steel');
    
    const elementsPerSide = 16;
    const spacing = 1.0 / elementsPerSide;
    
    for (let x = 0; x < elementsPerSide; x++) {
      for (let y = 0; y < elementsPerSide; y++) {
        const element = new THREE.Mesh(elementGeometry, elementMaterial);
        element.position.set(
          (x - elementsPerSide / 2 + 0.5) * spacing,
          (y - elementsPerSide / 2 + 0.5) * spacing,
          0.06
        );
        arrayGroup.add(element);
      }
    }
    
    // Control electronics housing
    const electronicsGeometry = new THREE.BoxGeometry(1.0, 0.3, 0.2);
    const electronicsMaterial = this.materialSystem.createMaterial('plastic_black');
    const electronics = new THREE.Mesh(electronicsGeometry, electronicsMaterial);
    electronics.position.set(0, -0.75, 0);
    arrayGroup.add(electronics);
    
    // Status LEDs
    const ledGeometry = new THREE.SphereGeometry(0.01, 8, 8);
    const ledMaterial = this.materialSystem.createMaterial('led_indicator');
    
    for (let i = 0; i < 3; i++) {
      const led = new THREE.Mesh(ledGeometry, ledMaterial);
      led.position.set(-0.4 + i * 0.4, -0.75, 0.11);
      arrayGroup.add(led);
    }
    
    // Mount
    const mountGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.5);
    const mountMaterial = this.materialSystem.createMaterial('metal_painted');
    const mount = new THREE.Mesh(mountGeometry, mountMaterial);
    mount.position.y = -1;
    arrayGroup.add(mount);
    
    arrayGroup.name = 'phased_array_template';
    arrayGroup.visible = false;
    this.scene.add(arrayGroup);
  }

  private createHelicalAntennaModel(): void {
    const helixGroup = new THREE.Group();
    
    // Helical coil
    const helixPath = new THREE.CatmullRomCurve3([]);
    const points: THREE.Vector3[] = [];
    
    const turns = 8;
    const radius = 0.2;
    const height = 1.0;
    
    for (let i = 0; i <= turns * 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const y = (i / (turns * 20)) * height;
      points.push(new THREE.Vector3(
        Math.cos(angle) * radius,
        y,
        Math.sin(angle) * radius
      ));
    }
    
    helixPath.points = points;
    const helixGeometry = new THREE.TubeGeometry(helixPath, 160, 0.01, 8);
    const helixMaterial = this.materialSystem.createMaterial('copper_pipe');
    const helix = new THREE.Mesh(helixGeometry, helixMaterial);
    helixGroup.add(helix);
    
    // Ground plane
    const groundGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.02);
    const groundMaterial = this.materialSystem.createMaterial('antenna_aluminum');
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.position.y = -0.01;
    helixGroup.add(ground);
    
    // Support mast
    const mastGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.5);
    const mastMaterial = this.materialSystem.createMaterial('antenna_steel');
    const mast = new THREE.Mesh(mastGeometry, mastMaterial);
    mast.position.y = -0.25;
    helixGroup.add(mast);
    
    helixGroup.name = 'helical_template';
    helixGroup.visible = false;
    this.scene.add(helixGroup);
  }

  public addAntenna(config: AntennaModelConfig): void {
    // Clone appropriate template
    const templateName = `${config.type}_template`;
    const template = this.scene.getObjectByName(templateName) as THREE.Group;
    
    if (!template) {
      console.error(`Antenna template not found: ${templateName}`);
      return;
    }
    
    const antennaModel = template.clone();
    antennaModel.visible = true;
    antennaModel.name = `antenna_${config.antennaId}`;
    antennaModel.position.copy(config.position);
    
    // Scale to specified diameter
    const scaleFactor = config.diameter / 2; // Templates are 2m diameter
    antennaModel.scale.setScalar(scaleFactor);
    
    // Add to scene and maps first
    this.scene.add(antennaModel);
    this.antennaModels.set(config.antennaId, antennaModel);
    this.antennaConfigs.set(config.antennaId, config);
    this.currentPointings.set(config.antennaId, { ...config.initialPointing });
    
    // Set initial pointing after antenna is registered
    this.pointAntenna(config.antennaId, config.initialPointing.azimuth, config.initialPointing.elevation);
    
    // Create RF beam visualization if enabled
    if (config.visualConfig.showBeam) {
      this.createBeamVisualization(config);
    }
    
    console.log(`Added antenna ${config.antennaId} (${config.type}) at position`, config.position);
  }

  private createBeamVisualization(config: AntennaModelConfig): void {
    const beamViz: Partial<RFBeamVisualization> = {};
    
    // Main beam cone
    const beamGeometry = new THREE.ConeGeometry(
      Math.tan(THREE.MathUtils.degToRad(config.diameter * 2)) * 100, // Beam radius at 100m
      100, // Length
      16,
      1,
      true
    );
    
    const beamMaterial = this.beamShaderMaterial.clone();
    beamMaterial.uniforms.antennaPosition.value = config.position;
    beamMaterial.uniforms.modulationColor.value = config.visualConfig.beamColor;
    
    const mainBeam = new THREE.Mesh(beamGeometry, beamMaterial);
    mainBeam.position.copy(config.position);
    this.scene.add(mainBeam);
    beamViz.mainBeam = mainBeam;
    
    // Beam cone outline
    const coneGeometry = new THREE.ConeGeometry(
      Math.tan(THREE.MathUtils.degToRad(config.diameter)) * 200,
      200,
      16,
      1,
      true
    );
    const coneMaterial = new THREE.MeshBasicMaterial({
      color: config.visualConfig.beamColor,
      transparent: true,
      opacity: 0.1,
      wireframe: true
    });
    const beamCone = new THREE.Mesh(coneGeometry, coneMaterial);
    beamCone.position.copy(config.position);
    this.scene.add(beamCone);
    beamViz.beamCone = beamCone;
    
    // Sidelobe visualization
    if (config.visualConfig.showSidelobes) {
      const sidelobes = new THREE.Group();
      
      // Create multiple smaller cones for sidelobes
      for (let i = 0; i < 8; i++) {
        const sidelobeGeometry = new THREE.ConeGeometry(
          Math.tan(THREE.MathUtils.degToRad(config.diameter * 0.3)) * 150,
          150,
          8
        );
        const sidelobeMaterial = new THREE.MeshBasicMaterial({
          color: config.visualConfig.beamColor,
          transparent: true,
          opacity: 0.05
        });
        const sidelobe = new THREE.Mesh(sidelobeGeometry, sidelobeMaterial);
        
        // Position sidelobes around main beam
        const angle = (i / 8) * Math.PI * 2;
        const offsetAngle = THREE.MathUtils.degToRad(15); // 15° off main beam
        sidelobe.rotateY(angle);
        sidelobe.rotateX(offsetAngle);
        
        sidelobes.add(sidelobe);
      }
      
      sidelobes.position.copy(config.position);
      this.scene.add(sidelobes);
      beamViz.sidelobes = sidelobes;
    }
    
    // Modulation indicator sprite
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true
    });
    const modulationSprite = new THREE.Sprite(spriteMaterial);
    modulationSprite.scale.set(5, 5, 1);
    modulationSprite.position.copy(config.position);
    modulationSprite.position.y += 5;
    this.scene.add(modulationSprite);
    beamViz.modulationIndicator = modulationSprite;
    
    // Power indicators along beam path
    const powerGroup = new THREE.Group();
    for (let i = 1; i <= 10; i++) {
      const distance = i * 20; // Every 20 meters
      const indicatorGeometry = new THREE.SphereGeometry(0.2, 8, 8);
      const indicatorMaterial = new THREE.MeshBasicMaterial({
        color: config.visualConfig.beamColor,
        transparent: true,
        opacity: 0.5 / i // Fade with distance
      });
      const indicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
      indicator.position.set(0, 0, distance);
      powerGroup.add(indicator);
    }
    powerGroup.position.copy(config.position);
    this.scene.add(powerGroup);
    beamViz.powerIndicators = powerGroup;
    
    this.beamVisualizations.set(config.antennaId, beamViz as RFBeamVisualization);
  }

  public pointAntenna(antennaId: string, azimuth: number, elevation: number): void {
    const model = this.antennaModels.get(antennaId);
    const config = this.antennaConfigs.get(antennaId);
    
    if (!model || !config) {
      console.error(`Antenna not found: ${antennaId}`);
      return;
    }
    
    // Check constraints
    const constrainedAzimuth = Math.max(config.constraints.azimuthMin, 
                                       Math.min(config.constraints.azimuthMax, azimuth));
    const constrainedElevation = Math.max(config.constraints.elevationMin, 
                                         Math.min(config.constraints.elevationMax, elevation));
    
    if (config.visualConfig.animateTracking) {
      // Animate to new position
      const currentPointing = this.currentPointings.get(antennaId)!;
      const deltaAz = Math.abs(constrainedAzimuth - currentPointing.azimuth);
      const deltaEl = Math.abs(constrainedElevation - currentPointing.elevation);
      const maxDelta = Math.max(deltaAz, deltaEl);
      
      const duration = Math.max(0.5, maxDelta / config.constraints.slewRate); // seconds
      
      this.trackingAnimations.set(antennaId, {
        startPointing: { ...currentPointing },
        targetPointing: { azimuth: constrainedAzimuth, elevation: constrainedElevation },
        startTime: Date.now(),
        duration: duration * 1000, // Convert to milliseconds
        easing: this.easeInOutCubic
      });
    } else {
      // Immediate pointing
      this.setAntennaOrientation(antennaId, constrainedAzimuth, constrainedElevation);
    }
  }

  private setAntennaOrientation(antennaId: string, azimuth: number, elevation: number): void {
    const model = this.antennaModels.get(antennaId);
    if (!model) return;
    
    // Convert azimuth/elevation to Three.js rotation
    model.rotation.set(0, 0, 0); // Reset
    model.rotateY(THREE.MathUtils.degToRad(azimuth));
    model.rotateX(THREE.MathUtils.degToRad(90 - elevation)); // Convert elevation to Three.js convention
    
    // Update beam visualization orientation
    const beamViz = this.beamVisualizations.get(antennaId);
    if (beamViz) {
      const beamDirection = new THREE.Vector3(0, 0, 1);
      beamDirection.applyEuler(model.rotation);
      
      beamViz.mainBeam.rotation.copy(model.rotation);
      beamViz.beamCone.rotation.copy(model.rotation);
      
      if (beamViz.sidelobes) {
        beamViz.sidelobes.rotation.copy(model.rotation);
      }
      
      if (beamViz.powerIndicators) {
        beamViz.powerIndicators.rotation.copy(model.rotation);
      }
      
      // Update shader uniforms
      if (beamViz.mainBeam.material instanceof THREE.ShaderMaterial) {
        beamViz.mainBeam.material.uniforms.beamDirection.value = beamDirection;
      }
    }
    
    // Update current pointing
    this.currentPointings.set(antennaId, { azimuth, elevation });
  }

  public trackSatellite(antennaId: string, target: TrackingTarget): void {
    const config = this.antennaConfigs.get(antennaId);
    if (!config) return;
    
    // Calculate pointing angles to satellite
    const antennaPos = config.position;
    const direction = target.position.clone().sub(antennaPos).normalize();
    
    const azimuth = Math.atan2(direction.x, direction.z) * 180 / Math.PI;
    const elevation = Math.asin(direction.y) * 180 / Math.PI;
    
    // Point antenna
    this.pointAntenna(antennaId, azimuth, elevation);
    
    // Update beam visualization with link data
    this.updateBeamVisualization(antennaId, target);
    
    // Store target
    this.trackingTargets.set(antennaId, target);
  }

  private updateBeamVisualization(antennaId: string, target: TrackingTarget): void {
    const beamViz = this.beamVisualizations.get(antennaId);
    if (!beamViz || !beamViz.mainBeam.material) return;
    
    const material = beamViz.mainBeam.material as THREE.ShaderMaterial;
    
    // Update shader uniforms
    material.uniforms.signalStrength.value = target.signalStrength;
    material.uniforms.linkActive.value = target.linkActive ? 1.0 : 0.0;
    material.uniforms.modulationRate.value = target.dataRate / 100; // Scale data rate to animation speed
    
    // Update modulation indicator
    if (beamViz.modulationIndicator) {
      this.updateModulationSprite(beamViz.modulationIndicator, target);
    }
    
    // Create signal path line to satellite
    if (target.linkActive && !beamViz.signalPath) {
      const config = this.antennaConfigs.get(antennaId)!;
      const points = [config.position, target.position];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color: config.visualConfig.beamColor,
        transparent: true,
        opacity: 0.6
      });
      beamViz.signalPath = new THREE.Line(geometry, material);
      this.scene.add(beamViz.signalPath);
    } else if (!target.linkActive && beamViz.signalPath) {
      this.scene.remove(beamViz.signalPath);
      beamViz.signalPath = null as any;
    }
    
    // Update signal path if it exists
    if (beamViz.signalPath && target.linkActive) {
      const config = this.antennaConfigs.get(antennaId)!;
      const points = [config.position, target.position];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      beamViz.signalPath.geometry = geometry;
    }
  }

  private updateModulationSprite(sprite: THREE.Sprite, target: TrackingTarget): void {
    if (!sprite.material || !(sprite.material instanceof THREE.SpriteMaterial)) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    
    // Clear canvas
    ctx.clearRect(0, 0, 64, 64);
    
    if (target.linkActive) {
      // Draw modulation indicator
      ctx.fillStyle = target.signalStrength > 0.7 ? '#00ff00' : 
                     target.signalStrength > 0.4 ? '#ffff00' : '#ff0000';
      ctx.beginPath();
      ctx.arc(32, 32, 20, 0, Math.PI * 2);
      ctx.fill();
      
      // Add modulation type text
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(target.modulation, 32, 36);
      
      // Data rate
      ctx.font = '8px Arial';
      ctx.fillText(`${target.dataRate.toFixed(0)} Mbps`, 32, 48);
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    sprite.material.map = texture;
    sprite.material.needsUpdate = true;
  }

  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  public update(deltaTime: number): void {
    this.updateCounter++;
    
    // Update at specified frequency
    if (this.updateCounter % Math.floor(60 / this.updateFrequency) !== 0) return;
    
    const currentTime = Date.now();
    
    // Update antenna animations
    this.updateTrackingAnimations(currentTime);
    
    // Update beam shader time uniform
    this.beamVisualizations.forEach(beamViz => {
      if (beamViz.mainBeam.material instanceof THREE.ShaderMaterial) {
        beamViz.mainBeam.material.uniforms.time.value = currentTime * 0.001;
      }
    });
    
    // Update visibility based on distance
    this.updateVisibility();
  }

  private updateTrackingAnimations(currentTime: number): void {
    this.trackingAnimations.forEach((animation, antennaId) => {
      const elapsed = currentTime - animation.startTime;
      const progress = Math.min(1, elapsed / animation.duration);
      const easedProgress = animation.easing(progress);
      
      // Interpolate pointing angles
      const azimuth = THREE.MathUtils.lerp(
        animation.startPointing.azimuth,
        animation.targetPointing.azimuth,
        easedProgress
      );
      const elevation = THREE.MathUtils.lerp(
        animation.startPointing.elevation,
        animation.targetPointing.elevation,
        easedProgress
      );
      
      this.setAntennaOrientation(antennaId, azimuth, elevation);
      
      // Remove animation when complete
      if (progress >= 1) {
        this.trackingAnimations.delete(antennaId);
      }
    });
  }

  private updateVisibility(): void {
    this.antennaModels.forEach((model, antennaId) => {
      const config = this.antennaConfigs.get(antennaId)!;
      
      // Simple distance-based visibility
      // In a real implementation, this would use camera frustum culling
      const distance = model.position.length();
      model.visible = distance < this.maxRenderDistance;
      
      // Update beam visualization visibility
      const beamViz = this.beamVisualizations.get(antennaId);
      if (beamViz) {
        const target = this.trackingTargets.get(antennaId);
        const showBeam = model.visible && (target?.linkActive || false) && config.visualConfig.showBeam;
        
        beamViz.mainBeam.visible = showBeam;
        beamViz.beamCone.visible = showBeam;
        if (beamViz.sidelobes) beamViz.sidelobes.visible = showBeam;
        if (beamViz.modulationIndicator) beamViz.modulationIndicator.visible = showBeam;
        if (beamViz.powerIndicators) beamViz.powerIndicators.visible = showBeam;
        if (beamViz.signalPath) beamViz.signalPath.visible = showBeam;
      }
    });
  }

  public setBeamVisible(antennaId: string, visible: boolean): void {
    const beamViz = this.beamVisualizations.get(antennaId);
    if (beamViz) {
      beamViz.mainBeam.visible = visible;
      beamViz.beamCone.visible = visible;
      if (beamViz.sidelobes) beamViz.sidelobes.visible = visible;
      if (beamViz.modulationIndicator) beamViz.modulationIndicator.visible = visible;
      if (beamViz.powerIndicators) beamViz.powerIndicators.visible = visible;
      if (beamViz.signalPath) beamViz.signalPath.visible = visible;
    }
  }

  public getAntennaStatus(antennaId: string): {
    pointing: { azimuth: number; elevation: number };
    target: TrackingTarget | null;
    isTracking: boolean;
  } | null {
    const pointing = this.currentPointings.get(antennaId);
    const target = this.trackingTargets.get(antennaId);
    
    if (!pointing) return null;
    
    return {
      pointing,
      target: target || null,
      isTracking: this.trackingAnimations.has(antennaId) || !!target?.linkActive
    };
  }

  public removeAntenna(antennaId: string): void {
    // Remove model
    const model = this.antennaModels.get(antennaId);
    if (model) {
      this.scene.remove(model);
      this.antennaModels.delete(antennaId);
    }
    
    // Remove beam visualization
    const beamViz = this.beamVisualizations.get(antennaId);
    if (beamViz) {
      this.scene.remove(beamViz.mainBeam);
      this.scene.remove(beamViz.beamCone);
      if (beamViz.sidelobes) this.scene.remove(beamViz.sidelobes);
      if (beamViz.modulationIndicator) this.scene.remove(beamViz.modulationIndicator);
      if (beamViz.powerIndicators) this.scene.remove(beamViz.powerIndicators);
      if (beamViz.signalPath) this.scene.remove(beamViz.signalPath);
      
      this.beamVisualizations.delete(antennaId);
    }
    
    // Clean up state
    this.antennaConfigs.delete(antennaId);
    this.currentPointings.delete(antennaId);
    this.trackingTargets.delete(antennaId);
    this.trackingAnimations.delete(antennaId);
  }

  public dispose(): void {
    // Remove all antennas
    Array.from(this.antennaModels.keys()).forEach(id => {
      this.removeAntenna(id);
    });
    
    // Remove templates
    ['parabolic_template', 'phased_array_template', 'helical_template'].forEach(name => {
      const template = this.scene.getObjectByName(name);
      if (template) {
        this.scene.remove(template);
      }
    });
    
    // Dispose shader material
    this.beamShaderMaterial.dispose();
    
    console.log('DynamicAntennaSystem disposed');
  }
}