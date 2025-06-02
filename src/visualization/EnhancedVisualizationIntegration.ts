import * as THREE from 'three';
import { GroundStationData } from '../models/GroundStationNetwork';
import { PBRMaterialSystem } from './PBRMaterialSystem';
import { AtmosphericEffectsSystem } from './AtmosphericEffectsSystem';
import { DynamicLightingSystem } from './DynamicLightingSystem';
import { EnhancedModelSystem } from './EnhancedModelSystem';
import { DynamicAntennaSystem } from './DynamicAntennaSystem';
import { SatelliteOverlaySystem } from './SatelliteOverlaySystem';

export interface EnhancedWalkableConfig {
  enablePBRMaterials: boolean;
  enableAtmosphericEffects: boolean;
  enableDynamicLighting: boolean;
  enableRFVisualization: boolean;
  enableSatelliteOverlay: boolean;
  enableRealtimeWeather: boolean;
  timeOfDay: number; // 0-1
  visualQuality: 'low' | 'medium' | 'high' | 'ultra';
}

export class EnhancedVisualizationIntegration {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private isActive: boolean = false;
  
  // Enhanced visual systems
  private pbrMaterialSystem!: PBRMaterialSystem;
  private atmosphericEffectsSystem!: AtmosphericEffectsSystem;
  private dynamicLightingSystem!: DynamicLightingSystem;
  private enhancedModelSystem!: EnhancedModelSystem;
  private dynamicAntennaSystem!: DynamicAntennaSystem;
  private satelliteOverlaySystem!: SatelliteOverlaySystem;
  
  // Environment
  private groundStationEnvironment!: THREE.Group;
  private currentGroundStation: GroundStationData | null = null;
  
  // Controls
  private keys: { [key: string]: boolean } = {};
  private mouseX: number = 0;
  private mouseY: number = 0;
  private isPointerLocked: boolean = false;
  
  // Movement
  private moveSpeed: number = 10;
  private lookSpeed: number = 0.002;
  private cameraHeight: number = 1.7;
  
  // Configuration
  private config: EnhancedWalkableConfig = {
    enablePBRMaterials: true,
    enableAtmosphericEffects: true,
    enableDynamicLighting: true,
    enableRFVisualization: true,
    enableSatelliteOverlay: true,
    enableRealtimeWeather: false,
    timeOfDay: 0.5, // Noon
    visualQuality: 'high'
  };
  
  // Info UI
  private infoDiv!: HTMLElement;
  private enhancedInfoDiv!: HTMLElement;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    
    this.initializeEnhancedSystems();
    this.setupControls();
    this.createEnhancedUI();
    
    console.log('🚀 Enhanced Visualization Integration initialized');
  }

  private initializeEnhancedSystems(): void {
    // Initialize PBR Material System
    this.pbrMaterialSystem = new PBRMaterialSystem(this.renderer);
    
    // Initialize Dynamic Lighting System
    this.dynamicLightingSystem = new DynamicLightingSystem(this.scene, this.renderer, this.camera);
    this.dynamicLightingSystem.setTimeOfDay(this.config.timeOfDay);
    
    // Initialize Atmospheric Effects System
    this.atmosphericEffectsSystem = new AtmosphericEffectsSystem(this.scene, this.camera, this.renderer);
    this.atmosphericEffectsSystem.setTimeOfDay(this.config.timeOfDay);
    
    // Initialize Enhanced Model System
    this.enhancedModelSystem = new EnhancedModelSystem(this.scene, this.pbrMaterialSystem, this.camera);
    
    // Initialize Dynamic Antenna System
    this.dynamicAntennaSystem = new DynamicAntennaSystem(this.scene, this.pbrMaterialSystem);
    
    // Initialize Satellite Overlay System
    this.satelliteOverlaySystem = new SatelliteOverlaySystem(this.scene, this.camera, new THREE.Vector3(0, 0, 0));
    
    console.log('✅ All enhanced visual systems initialized');
  }

  private async createEnhancedGroundStationEnvironment(groundStation: GroundStationData): Promise<void> {
    this.groundStationEnvironment = new THREE.Group();
    this.groundStationEnvironment.name = 'enhanced_ground_station_environment';

    // Create terrain with enhanced materials
    await this.createEnhancedTerrain();
    
    // Create buildings with PBR materials
    await this.createEnhancedBuildings(groundStation);
    
    // Create antennas with realistic models
    await this.createEnhancedAntennas(groundStation);
    
    // Create infrastructure with detailed models
    await this.createEnhancedInfrastructure(groundStation);
    
    // Add environment to scene
    this.scene.add(this.groundStationEnvironment);
    
    console.log('🏗️ Enhanced ground station environment created');
  }

  private async createEnhancedTerrain(): Promise<void> {
    // Create realistic terrain with multiple material zones
    const terrainSize = 400;
    const terrainGeometry = new THREE.PlaneGeometry(terrainSize, terrainSize, 128, 128);
    
    // Apply height variation for realistic terrain
    const positionAttribute = terrainGeometry.attributes.position;
    if (positionAttribute instanceof THREE.BufferAttribute) {
      for (let i = 0; i < positionAttribute.count; i++) {
        const x = positionAttribute.getX(i);
        const z = positionAttribute.getZ(i);
        
        // Simple terrain height variation
        const height = Math.sin(x * 0.01) * Math.cos(z * 0.01) * 2 + 
                      Math.sin(x * 0.02) * Math.sin(z * 0.015) * 1;
        positionAttribute.setY(i, height);
      }
      positionAttribute.needsUpdate = true;
      terrainGeometry.computeVertexNormals();
    }
    
    // Main grass terrain
    const grassMaterial = this.pbrMaterialSystem.createMaterial('grass');
    const terrain = new THREE.Mesh(terrainGeometry, grassMaterial);
    terrain.rotation.x = -Math.PI / 2;
    terrain.receiveShadow = true;
    this.groundStationEnvironment.add(terrain);

    // Asphalt roads/paths
    const roadGeometry = new THREE.PlaneGeometry(200, 8);
    const asphaltMaterial = this.pbrMaterialSystem.createMaterial('asphalt');
    const road = new THREE.Mesh(roadGeometry, asphaltMaterial);
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.1;
    road.receiveShadow = true;
    this.groundStationEnvironment.add(road);

    // Cross road
    const crossRoad = new THREE.Mesh(roadGeometry, asphaltMaterial);
    crossRoad.rotation.x = -Math.PI / 2;
    crossRoad.rotation.z = Math.PI / 2;
    crossRoad.position.y = 0.1;
    crossRoad.receiveShadow = true;
    this.groundStationEnvironment.add(crossRoad);
  }

  private async createEnhancedBuildings(groundStation: GroundStationData): Promise<void> {
    // Create main control building
    const controlBuilding = await this.enhancedModelSystem.createInstance(
      'control_building',
      'main_control_building',
      new THREE.Vector3(-50, 0, -80),
      new THREE.Euler(0, 0, 0),
      new THREE.Vector3(1, 1, 1)
    );

    if (controlBuilding) {
      console.log('✅ Main control building created');
    }

    // Create smaller equipment buildings
    const positions = [
      { x: 40, z: -60 },
      { x: -80, z: 40 },
      { x: 60, z: 60 }
    ];

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      const building = await this.enhancedModelSystem.createInstance(
        'control_building',
        `equipment_building_${i}`,
        new THREE.Vector3(pos.x, 0, pos.z),
        new THREE.Euler(0, Math.random() * Math.PI * 2, 0),
        new THREE.Vector3(0.6, 0.5, 0.7)
      );
      
      if (building) {
        console.log(`✅ Equipment building ${i} created`);
      }
    }
  }

  private async createEnhancedAntennas(groundStation: GroundStationData): Promise<void> {
    // Create main parabolic dish antenna
    const mainDish = await this.enhancedModelSystem.createInstance(
      'parabolic_antenna_3m',
      'main_parabolic_dish',
      new THREE.Vector3(0, 0, 20),
      new THREE.Euler(0, 0, 0),
      new THREE.Vector3(1.5, 1.5, 1.5)
    );

    if (mainDish) {
      // Add dynamic antenna capabilities
      this.dynamicAntennaSystem.addAntenna({
        antennaId: 'main_dish',
        type: 'parabolic',
        diameter: 4.5,
        position: new THREE.Vector3(0, 0, 20),
        initialPointing: { azimuth: 45, elevation: 30 },
        constraints: {
          azimuthMin: -180,
          azimuthMax: 180,
          elevationMin: 5,
          elevationMax: 90,
          slewRate: 5.0
        },
        visualConfig: {
          showBeam: true,
          beamColor: new THREE.Color(0x00ff44),
          beamOpacity: 0.6,
          showSidelobes: true,
          animateTracking: true
        }
      });
      console.log('✅ Main parabolic dish with RF visualization created');
    }

    // Create additional antennas at various positions
    const antennaPositions = [
      { x: -30, z: 35, type: 'parabolic' },
      { x: 25, z: -25, type: 'phased_array' },
      { x: -40, z: -40, type: 'helical' }
    ];

    for (let i = 0; i < antennaPositions.length; i++) {
      const pos = antennaPositions[i];
      const antennaId = `antenna_${i}`;
      
      if (pos.type === 'parabolic') {
        const antenna = await this.enhancedModelSystem.createInstance(
          'parabolic_antenna_3m',
          antennaId,
          new THREE.Vector3(pos.x, 0, pos.z),
          new THREE.Euler(0, Math.random() * Math.PI * 2, 0),
          new THREE.Vector3(1, 1, 1)
        );

        if (antenna) {
          this.dynamicAntennaSystem.addAntenna({
            antennaId,
            type: 'parabolic',
            diameter: 3.0,
            position: new THREE.Vector3(pos.x, 0, pos.z),
            initialPointing: { azimuth: Math.random() * 360, elevation: 20 + Math.random() * 40 },
            constraints: {
              azimuthMin: -180,
              azimuthMax: 180,
              elevationMin: 5,
              elevationMax: 90,
              slewRate: 3.0
            },
            visualConfig: {
              showBeam: true,
              beamColor: new THREE.Color(0x0088ff),
              beamOpacity: 0.4,
              showSidelobes: false,
              animateTracking: true
            }
          });
        }
      }
    }

    console.log('✅ Multiple enhanced antennas with RF visualization created');
  }

  private async createEnhancedInfrastructure(groundStation: GroundStationData): Promise<void> {
    // Create lattice tower
    const tower = await this.enhancedModelSystem.createInstance(
      'lattice_tower_30m',
      'main_communications_tower',
      new THREE.Vector3(-70, 0, 70),
      new THREE.Euler(0, 0, 0),
      new THREE.Vector3(1, 1, 1)
    );

    if (tower) {
      console.log('✅ Communications tower created');
    }

    // Create security perimeter
    const perimeter = await this.enhancedModelSystem.createInstance(
      'security_perimeter',
      'security_fence',
      new THREE.Vector3(0, 0, 0),
      new THREE.Euler(0, 0, 0),
      new THREE.Vector3(1, 1, 1)
    );

    if (perimeter) {
      console.log('✅ Security perimeter created');
    }

    // Add ground vehicles and equipment
    this.createEquipmentDetails();
  }

  private createEquipmentDetails(): void {
    // Create detailed equipment using basic geometries with PBR materials
    const equipmentGroup = new THREE.Group();

    // Generator building
    const generatorGeometry = new THREE.BoxGeometry(6, 3, 4);
    const metalMaterial = this.pbrMaterialSystem.createMaterial('metal_painted');
    const generator = new THREE.Mesh(generatorGeometry, metalMaterial);
    generator.position.set(30, 1.5, 35);
    generator.castShadow = true;
    equipmentGroup.add(generator);

    // Cooling units
    for (let i = 0; i < 3; i++) {
      const coolingGeometry = new THREE.BoxGeometry(2, 1.5, 1.5);
      const coolingUnit = new THREE.Mesh(coolingGeometry, metalMaterial);
      coolingUnit.position.set(-25 + i * 3, 0.75, -65);
      coolingUnit.castShadow = true;
      equipmentGroup.add(coolingUnit);
    }

    // Utility poles
    for (let i = 0; i < 8; i++) {
      const poleGeometry = new THREE.CylinderGeometry(0.15, 0.15, 8);
      const poleMaterial = this.pbrMaterialSystem.createMaterial('concrete_smooth');
      const pole = new THREE.Mesh(poleGeometry, poleMaterial);
      
      const angle = (i / 8) * Math.PI * 2;
      pole.position.set(Math.cos(angle) * 85, 4, Math.sin(angle) * 85);
      pole.castShadow = true;
      equipmentGroup.add(pole);
    }

    this.groundStationEnvironment.add(equipmentGroup);
    console.log('✅ Equipment details added');
  }

  private setupControls(): void {
    // Keyboard events
    document.addEventListener('keydown', (event) => {
      if (!this.isActive) return;
      this.keys[event.code] = true;
      
      if (event.code === 'Escape') {
        this.exitView();
      }
      
      // Time of day controls
      if (event.code === 'KeyT') {
        // Cycle through time presets
        this.cycleTimeOfDay();
      }
      
      // Quality toggle
      if (event.code === 'KeyQ') {
        this.toggleVisualQuality();
      }
      
      // Weather toggle
      if (event.code === 'KeyE') {
        this.toggleWeatherEffects();
      }
    });
    
    document.addEventListener('keyup', (event) => {
      if (!this.isActive) return;
      this.keys[event.code] = false;
    });
    
    // Mouse events
    document.addEventListener('mousemove', (event) => {
      if (!this.isActive || !this.isPointerLocked) return;
      
      this.mouseX += event.movementX * this.lookSpeed;
      this.mouseY += event.movementY * this.lookSpeed;
      this.mouseY = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.mouseY));
    });
    
    // Pointer lock
    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === this.renderer.domElement;
      this.updateInfoUI();
    });
    
    this.renderer.domElement.addEventListener('click', () => {
      if (this.isActive && !this.isPointerLocked) {
        this.renderer.domElement.requestPointerLock();
      }
    });
  }

  private createEnhancedUI(): void {
    // Main info UI
    this.infoDiv = document.createElement('div');
    this.infoDiv.style.cssText = `
      position: absolute;
      top: 20px;
      left: 20px;
      color: white;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 14px;
      background: linear-gradient(135deg, rgba(0,0,0,0.9), rgba(20,20,40,0.8));
      padding: 15px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.2);
      backdrop-filter: blur(10px);
      z-index: 1000;
      display: none;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    `;
    document.body.appendChild(this.infoDiv);

    // Enhanced info panel
    this.enhancedInfoDiv = document.createElement('div');
    this.enhancedInfoDiv.style.cssText = `
      position: absolute;
      top: 20px;
      right: 20px;
      color: white;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 12px;
      background: linear-gradient(135deg, rgba(0,0,0,0.9), rgba(40,20,0,0.8));
      padding: 15px;
      border-radius: 10px;
      border: 1px solid rgba(255,165,0,0.3);
      backdrop-filter: blur(10px);
      z-index: 1000;
      display: none;
      min-width: 280px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    `;
    document.body.appendChild(this.enhancedInfoDiv);
  }

  private updateInfoUI(): void {
    if (!this.isActive) return;
    
    if (this.isPointerLocked) {
      this.infoDiv.innerHTML = `
        <div style="font-size: 16px; margin-bottom: 10px;">🚀 <strong>Enhanced Walking Mode</strong></div>
        <div>WASD: Move | Mouse: Look Around</div>
        <div>T: Cycle Time of Day | Q: Visual Quality</div>
        <div>E: Weather Effects | ESC: Exit</div>
        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.2);">
          <small>Enhanced with PBR materials, dynamic lighting, and atmospheric effects</small>
        </div>
      `;
    } else {
      this.infoDiv.innerHTML = `
        <div style="font-size: 16px; margin-bottom: 10px;">🖱️ <strong>Click to Start Enhanced Walking</strong></div>
        <div style="opacity: 0.8;">Experience the ground station with:</div>
        <div style="margin-left: 10px; margin-top: 5px;">
          • Physically-based materials<br>
          • Real-time atmospheric effects<br>
          • Dynamic antenna tracking<br>
          • RF beam visualization
        </div>
      `;
    }
  }

  private updateEnhancedInfoUI(): void {
    if (!this.isActive || !this.currentGroundStation) return;

    const timeString = this.dynamicLightingSystem.getCurrentTimeString();
    const lightingConfig = this.dynamicLightingSystem.getLightingConfig();
    const atmosConfig = this.atmosphericEffectsSystem.getAtmosphericConfig();
    const modelMetrics = this.enhancedModelSystem.getPerformanceMetrics();

    this.enhancedInfoDiv.innerHTML = `
      <div style="font-size: 14px; color: #ffaa00; margin-bottom: 10px;">
        <strong>🛰️ ${this.currentGroundStation.name}</strong>
      </div>
      
      <div style="margin-bottom: 8px;">
        <strong>📍 Location:</strong> ${this.currentGroundStation.position.latitude.toFixed(4)}°, ${this.currentGroundStation.position.longitude.toFixed(4)}°
      </div>
      
      <div style="margin-bottom: 8px;">
        <strong>⏰ Time:</strong> ${timeString} | Quality: ${this.config.visualQuality.toUpperCase()}
      </div>
      
      <div style="margin-bottom: 8px;">
        <strong>🌤️ Conditions:</strong> ${atmosConfig.visibility}km visibility
      </div>
      
      <div style="margin-bottom: 8px;">
        <strong>📡 Antennas:</strong> ${this.currentGroundStation.connections?.satellites?.length || 0} satellites tracked
      </div>
      
      <div style="margin-bottom: 8px;">
        <strong>⚡ Status:</strong> ${this.currentGroundStation.operationalStatus || this.currentGroundStation.status}
      </div>
      
      <div style="border-top: 1px solid rgba(255,165,0,0.3); padding-top: 8px; margin-top: 10px;">
        <div style="font-size: 11px; opacity: 0.8;">
          <div>Models: ${modelMetrics.modelsRendered} | Triangles: ${Math.floor(modelMetrics.trianglesRendered)}</div>
          <div>Visual Enhancement: Active</div>
        </div>
      </div>
    `;
  }

  private cycleTimeOfDay(): void {
    const times = [0.0, 0.25, 0.5, 0.75]; // Midnight, sunrise, noon, sunset
    const currentIndex = times.findIndex(t => Math.abs(t - this.config.timeOfDay) < 0.1);
    const nextIndex = (currentIndex + 1) % times.length;
    
    this.config.timeOfDay = times[nextIndex];
    this.dynamicLightingSystem.setTimeOfDay(this.config.timeOfDay);
    this.atmosphericEffectsSystem.setTimeOfDay(this.config.timeOfDay);
    
    console.log(`🕐 Time of day changed to: ${this.config.timeOfDay}`);
  }

  private toggleVisualQuality(): void {
    const qualities = ['low', 'medium', 'high', 'ultra'] as const;
    const currentIndex = qualities.indexOf(this.config.visualQuality);
    const nextIndex = (currentIndex + 1) % qualities.length;
    
    this.config.visualQuality = qualities[nextIndex];
    this.dynamicLightingSystem.setShadowQuality(this.config.visualQuality);
    
    console.log(`🎨 Visual quality changed to: ${this.config.visualQuality}`);
  }

  private toggleWeatherEffects(): void {
    this.config.enableRealtimeWeather = !this.config.enableRealtimeWeather;
    
    if (this.config.enableRealtimeWeather) {
      // Simulate changing weather
      const visibility = 5 + Math.random() * 15; // 5-20km
      const humidity = Math.random();
      const pollution = Math.random() * 0.3;
      
      this.atmosphericEffectsSystem.setWeatherConditions(visibility, humidity, pollution);
      console.log(`🌧️ Weather effects enabled: ${visibility.toFixed(1)}km visibility`);
    } else {
      // Clear conditions
      this.atmosphericEffectsSystem.setWeatherConditions(20, 0.3, 0.1);
      console.log('☀️ Weather effects disabled: Clear conditions');
    }
  }

  public async activateView(groundStation: GroundStationData): Promise<void> {
    console.log('🚀 Activating enhanced walkable view for:', groundStation.name);
    
    this.isActive = true;
    this.currentGroundStation = groundStation;
    
    // Create enhanced environment
    await this.createEnhancedGroundStationEnvironment(groundStation);
    
    // Position camera at ground level
    this.camera.position.set(0, this.cameraHeight, -30);
    this.camera.rotation.set(0, 0, 0);
    this.mouseX = 0;
    this.mouseY = 0;
    
    // Set observer position for atmospheric effects
    this.atmosphericEffectsSystem.setObserverPosition(this.camera.position);
    
    // Show enhanced UI
    this.infoDiv.style.display = 'block';
    this.enhancedInfoDiv.style.display = 'block';
    this.updateInfoUI();
    this.updateEnhancedInfoUI();
    
    console.log('✅ Enhanced walkable view activated with full visual fidelity');
  }

  public async exitView(): Promise<void> {
    console.log('🚀 Exiting enhanced walkable view');
    
    this.isActive = false;
    this.isPointerLocked = false;
    this.currentGroundStation = null;
    
    // Remove enhanced environment
    if (this.groundStationEnvironment) {
      this.scene.remove(this.groundStationEnvironment);
      
      // Dispose of model instances
      this.enhancedModelSystem.getAllInstances().forEach(instance => {
        this.enhancedModelSystem.removeInstance(instance.instanceId);
      });
      
      // Clear antenna visualizations
      // Note: Would need to track antenna IDs to remove them properly
    }
    
    // Hide UI
    this.infoDiv.style.display = 'none';
    this.enhancedInfoDiv.style.display = 'none';
    
    // Exit pointer lock
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    
    console.log('✅ Enhanced walkable view exited');
  }

  public update(deltaTime: number): void {
    if (!this.isActive) return;
    
    // Update camera rotation from mouse
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = -this.mouseX;
    this.camera.rotation.x = -this.mouseY;
    
    // Movement
    const moveVector = new THREE.Vector3();
    
    if (this.keys['KeyW']) moveVector.z -= 1;
    if (this.keys['KeyS']) moveVector.z += 1;
    if (this.keys['KeyA']) moveVector.x -= 1;
    if (this.keys['KeyD']) moveVector.x += 1;
    
    if (moveVector.length() > 0) {
      moveVector.normalize();
      moveVector.multiplyScalar(this.moveSpeed * deltaTime);
      
      // Apply camera rotation to movement
      const cameraDirection = new THREE.Vector3();
      this.camera.getWorldDirection(cameraDirection);
      cameraDirection.y = 0; // Don't move up/down
      cameraDirection.normalize();
      
      const right = new THREE.Vector3();
      right.crossVectors(cameraDirection, new THREE.Vector3(0, 1, 0));
      
      const finalMove = new THREE.Vector3();
      finalMove.addScaledVector(right, moveVector.x);
      finalMove.addScaledVector(cameraDirection, -moveVector.z);
      
      this.camera.position.add(finalMove);
      this.camera.position.y = this.cameraHeight; // Keep at eye level
      
      // Boundary check
      this.camera.position.x = Math.max(-150, Math.min(150, this.camera.position.x));
      this.camera.position.z = Math.max(-150, Math.min(150, this.camera.position.z));
      
      // Update observer position for atmospheric effects
      this.atmosphericEffectsSystem.setObserverPosition(this.camera.position);
    }
    
    // Update enhanced systems
    this.dynamicLightingSystem.update(deltaTime);
    this.atmosphericEffectsSystem.update(deltaTime);
    this.enhancedModelSystem.update(deltaTime);
    this.dynamicAntennaSystem.update(deltaTime);
    this.satelliteOverlaySystem.update(deltaTime);
    
    // Update UI periodically
    if (Math.random() < 0.01) { // ~1% chance per frame
      this.updateEnhancedInfoUI();
    }
  }

  public updateSatellitePositions(satellites: Array<{ id: string; position: THREE.Vector3 }>): void {
    if (!this.isActive) return;
    
    // Update satellite overlay system
    satellites.forEach(sat => {
      // Convert to appropriate format for satellite overlay
      this.satelliteOverlaySystem.updateSatelliteStatus(sat.id, {
        id: sat.id,
        active: true,
        linking: false,
        health: 'good',
        signalStrength: 0.8,
        elevation: 45,
        azimuth: 180,
        range: sat.position.length() / 1000, // Convert to km
        velocity: new THREE.Vector3(0, 0, 0)
      });
    });
    
    // Update antenna tracking
    if (satellites.length > 0) {
      const closestSatellite = satellites[0]; // Simplified - track first satellite
      this.dynamicAntennaSystem.trackSatellite('main_dish', {
        satelliteId: closestSatellite.id,
        position: closestSatellite.position,
        priority: 1,
        signalStrength: 0.8,
        linkActive: true,
        modulation: 'QPSK',
        dataRate: 100
      });
    }
  }

  public isViewActive(): boolean {
    return this.isActive;
  }

  public setConfiguration(config: Partial<EnhancedWalkableConfig>): void {
    Object.assign(this.config, config);
    
    if (config.timeOfDay !== undefined) {
      this.dynamicLightingSystem.setTimeOfDay(config.timeOfDay);
      this.atmosphericEffectsSystem.setTimeOfDay(config.timeOfDay);
    }
    
    if (config.visualQuality !== undefined) {
      this.dynamicLightingSystem.setShadowQuality(config.visualQuality);
    }
  }

  public dispose(): void {
    // Dispose enhanced systems
    this.dynamicLightingSystem.dispose();
    this.atmosphericEffectsSystem.dispose();
    this.enhancedModelSystem.dispose();
    this.dynamicAntennaSystem.dispose();
    this.satelliteOverlaySystem.dispose();
    this.pbrMaterialSystem.dispose();
    
    // Remove UI
    if (this.infoDiv && this.infoDiv.parentNode) {
      this.infoDiv.parentNode.removeChild(this.infoDiv);
    }
    if (this.enhancedInfoDiv && this.enhancedInfoDiv.parentNode) {
      this.enhancedInfoDiv.parentNode.removeChild(this.enhancedInfoDiv);
    }
    
    // Remove environment
    if (this.isActive) {
      this.exitView();
    }
    
    console.log('🚀 Enhanced Visualization Integration disposed');
  }
}