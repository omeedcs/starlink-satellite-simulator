import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { PBRMaterialSystem } from './PBRMaterialSystem';

export interface ModelConfig {
  modelId: string;
  name: string;
  category: 'antenna' | 'building' | 'vehicle' | 'infrastructure' | 'terrain';
  filePath?: string; // Path to GLTF/GLB file
  proceduralConfig?: ProceduralModelConfig;
  scale: THREE.Vector3;
  defaultPosition: THREE.Vector3;
  defaultRotation: THREE.Euler;
  materialOverrides?: Map<string, string>; // Material name -> PBR material config name
  lodLevels?: LODConfig[];
  animations?: string[]; // Available animation names
  interactionZones?: InteractionZone[];
}

export interface ProceduralModelConfig {
  type: 'parabolic_dish' | 'lattice_tower' | 'building_complex' | 'control_room' | 'fence_perimeter';
  parameters: Record<string, any>;
  detailLevel: 'low' | 'medium' | 'high' | 'ultra';
}

export interface LODConfig {
  distance: number; // Meters from camera
  modelPath?: string; // Optional different model for this LOD
  materialQuality: 'low' | 'medium' | 'high';
  geometrySimplification?: number; // 0-1, amount to simplify geometry
}

export interface InteractionZone {
  zoneId: string;
  type: 'walkable' | 'restricted' | 'maintenance' | 'control';
  bounds: THREE.Box3;
  description: string;
}

export interface ModelInstance {
  instanceId: string;
  modelConfig: ModelConfig;
  mesh: THREE.Group;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  animations: THREE.AnimationMixer | null;
  animationClips: THREE.AnimationClip[];
  lodLevel: number;
  materialVariant: 'base' | 'weathered' | 'worn' | 'new';
  interactionEnabled: boolean;
}

export class EnhancedModelSystem {
  private scene: THREE.Scene;
  private materialSystem: PBRMaterialSystem;
  private camera: THREE.PerspectiveCamera;
  
  // Loaders
  private gltfLoader!: GLTFLoader;
  private dracoLoader!: DRACOLoader;
  
  // Model management
  private modelConfigs: Map<string, ModelConfig> = new Map();
  private modelInstances: Map<string, ModelInstance> = new Map();
  private modelCache: Map<string, THREE.Group> = new Map();
  private proceduralModels: Map<string, THREE.Group> = new Map();
  
  // LOD system
  private lodSystem: THREE.LOD[] = [];
  private maxRenderDistance: number = 10000; // meters
  
  // Animation system
  private animationMixers: THREE.AnimationMixer[] = [];
  private clock: THREE.Clock = new THREE.Clock();
  
  // Performance tracking
  private performanceMetrics = {
    modelsRendered: 0,
    trianglesRendered: 0,
    drawCalls: 0,
    memoryUsage: 0
  };

  constructor(scene: THREE.Scene, materialSystem: PBRMaterialSystem, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.materialSystem = materialSystem;
    this.camera = camera;
    
    this.initializeLoaders();
    this.defineModelConfigurations();
    this.createProceduralModels();
    
    console.log('EnhancedModelSystem initialized with high-quality assets');
  }

  private initializeLoaders(): void {
    // Set up DRACO loader for compressed geometry
    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath('/draco/'); // Path to DRACO decoder
    
    // Set up GLTF loader with DRACO support
    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setDRACOLoader(this.dracoLoader);
  }

  private defineModelConfigurations(): void {
    // Define all available high-quality models
    const configs: ModelConfig[] = [
      {
        modelId: 'starlink_user_terminal',
        name: 'Starlink User Terminal',
        category: 'antenna',
        filePath: '/models/starlink-satellite.glb',
        scale: new THREE.Vector3(1, 1, 1),
        defaultPosition: new THREE.Vector3(0, 0, 0),
        defaultRotation: new THREE.Euler(0, 0, 0),
        materialOverrides: new Map([
          ['dish_material', 'antenna_aluminum'],
          ['base_material', 'plastic_black'],
          ['cable_material', 'plastic_black']
        ]),
        lodLevels: [
          { distance: 0, materialQuality: 'high' },
          { distance: 100, materialQuality: 'medium' },
          { distance: 500, materialQuality: 'low', geometrySimplification: 0.5 },
          { distance: 2000, materialQuality: 'low', geometrySimplification: 0.8 }
        ],
        interactionZones: [
          {
            zoneId: 'terminal_maintenance',
            type: 'maintenance',
            bounds: new THREE.Box3(
              new THREE.Vector3(-2, 0, -2),
              new THREE.Vector3(2, 3, 2)
            ),
            description: 'User terminal maintenance access'
          }
        ]
      },
      {
        modelId: 'control_building',
        name: 'Ground Station Control Building',
        category: 'building',
        proceduralConfig: {
          type: 'building_complex',
          parameters: {
            width: 40,
            length: 60,
            height: 12,
            floors: 2,
            windowStyle: 'modern',
            roofType: 'flat',
            entrances: 2,
            hvacUnits: true,
            antennaRoofMount: true
          },
          detailLevel: 'high'
        },
        scale: new THREE.Vector3(1, 1, 1),
        defaultPosition: new THREE.Vector3(0, 0, -100),
        defaultRotation: new THREE.Euler(0, 0, 0),
        materialOverrides: new Map([
          ['wall_material', 'concrete_smooth'],
          ['window_material', 'glass_reflective'],
          ['roof_material', 'metal_painted'],
          ['door_material', 'metal_painted']
        ]),
        lodLevels: [
          { distance: 0, materialQuality: 'high' },
          { distance: 200, materialQuality: 'medium' },
          { distance: 1000, materialQuality: 'low', geometrySimplification: 0.6 }
        ],
        interactionZones: [
          {
            zoneId: 'control_room',
            type: 'control',
            bounds: new THREE.Box3(
              new THREE.Vector3(-20, 0, -30),
              new THREE.Vector3(20, 12, 30)
            ),
            description: 'Mission control and monitoring center'
          }
        ]
      },
      {
        modelId: 'parabolic_antenna_3m',
        name: '3-Meter Parabolic Antenna',
        category: 'antenna',
        proceduralConfig: {
          type: 'parabolic_dish',
          parameters: {
            diameter: 3.0,
            focalLength: 1.2,
            feedType: 'horn',
            pedestalHeight: 2.5,
            azimuthRange: 360,
            elevationRange: 90,
            surfaceAccuracy: 0.5 // mm RMS
          },
          detailLevel: 'ultra'
        },
        scale: new THREE.Vector3(1, 1, 1),
        defaultPosition: new THREE.Vector3(50, 0, 50),
        defaultRotation: new THREE.Euler(0, 0, 0),
        materialOverrides: new Map([
          ['dish_material', 'antenna_aluminum'],
          ['feed_material', 'antenna_steel'],
          ['pedestal_material', 'concrete_smooth'],
          ['mount_material', 'metal_painted']
        ]),
        animations: ['elevation_sweep', 'azimuth_rotation', 'stow_position'],
        lodLevels: [
          { distance: 0, materialQuality: 'high' },
          { distance: 150, materialQuality: 'medium' },
          { distance: 800, materialQuality: 'low', geometrySimplification: 0.4 }
        ]
      },
      {
        modelId: 'lattice_tower_30m',
        name: '30-Meter Lattice Tower',
        category: 'infrastructure',
        proceduralConfig: {
          type: 'lattice_tower',
          parameters: {
            height: 30,
            baseWidth: 4,
            topWidth: 1.5,
            sections: 6,
            crossBracing: true,
            lightingSystem: true,
            antennaPoints: 3,
            structuralRating: 'commercial'
          },
          detailLevel: 'high'
        },
        scale: new THREE.Vector3(1, 1, 1),
        defaultPosition: new THREE.Vector3(-100, 0, 100),
        defaultRotation: new THREE.Euler(0, 0, 0),
        materialOverrides: new Map([
          ['steel_frame', 'antenna_steel'],
          ['bolts_hardware', 'metal_painted'],
          ['warning_lights', 'led_indicator']
        ]),
        lodLevels: [
          { distance: 0, materialQuality: 'high' },
          { distance: 300, materialQuality: 'medium', geometrySimplification: 0.3 },
          { distance: 1500, materialQuality: 'low', geometrySimplification: 0.7 }
        ]
      },
      {
        modelId: 'security_perimeter',
        name: 'Security Fence Perimeter',
        category: 'infrastructure',
        proceduralConfig: {
          type: 'fence_perimeter',
          parameters: {
            perimeter: [
              [-200, -200], [200, -200], [200, 200], [-200, 200]
            ],
            height: 3.0,
            fenceType: 'chain_link',
            posts: true,
            barbedWire: true,
            gates: 2,
            securityLighting: true
          },
          detailLevel: 'medium'
        },
        scale: new THREE.Vector3(1, 1, 1),
        defaultPosition: new THREE.Vector3(0, 0, 0),
        defaultRotation: new THREE.Euler(0, 0, 0),
        materialOverrides: new Map([
          ['fence_material', 'chain_link_fence'],
          ['post_material', 'metal_painted'],
          ['gate_material', 'metal_painted']
        ])
      }
    ];

    configs.forEach(config => {
      this.modelConfigs.set(config.modelId, config);
    });
  }

  private createProceduralModels(): void {
    this.modelConfigs.forEach((config, modelId) => {
      if (config.proceduralConfig) {
        const model = this.generateProceduralModel(config);
        if (model) {
          this.proceduralModels.set(modelId, model);
          this.modelCache.set(modelId, model);
        }
      }
    });
  }

  private generateProceduralModel(config: ModelConfig): THREE.Group | null {
    if (!config.proceduralConfig) return null;

    const { type, parameters, detailLevel } = config.proceduralConfig;
    
    switch (type) {
      case 'parabolic_dish':
        return this.createProceduralParabolicDish(parameters, detailLevel);
      case 'lattice_tower':
        return this.createProceduralLatticeTower(parameters, detailLevel);
      case 'building_complex':
        return this.createProceduralBuilding(parameters, detailLevel);
      case 'fence_perimeter':
        return this.createProceduralFence(parameters, detailLevel);
      default:
        console.warn(`Unknown procedural model type: ${type}`);
        return null;
    }
  }

  private createProceduralParabolicDish(params: any, detailLevel: string): THREE.Group {
    const dishGroup = new THREE.Group();
    
    // Determine detail level
    const segments = detailLevel === 'ultra' ? 64 : detailLevel === 'high' ? 32 : 16;
    const rings = Math.floor(segments / 2);
    
    // Main reflector surface
    const dishGeometry = new THREE.SphereGeometry(
      params.diameter / 2,
      segments,
      rings,
      0, Math.PI * 2,
      0, Math.PI / 2
    );
    
    // Apply parabolic profile
    const positionAttribute = dishGeometry.attributes.position;
    if (positionAttribute instanceof THREE.BufferAttribute) {
      for (let i = 0; i < positionAttribute.count; i++) {
        const x = positionAttribute.getX(i);
        const z = positionAttribute.getZ(i);
        const r = Math.sqrt(x * x + z * z);
        const y = (r * r) / (4 * params.focalLength); // Parabolic equation
        positionAttribute.setY(i, -y);
      }
      positionAttribute.needsUpdate = true;
    }
    dishGeometry.computeVertexNormals();
    
    const dishMaterial = this.materialSystem.createMaterial('antenna_aluminum');
    const dish = new THREE.Mesh(dishGeometry, dishMaterial);
    dishGroup.add(dish);
    
    // Feed horn at focus
    const feedGeometry = new THREE.ConeGeometry(0.1, 0.4, 12);
    const feedMaterial = this.materialSystem.createMaterial('antenna_steel');
    const feed = new THREE.Mesh(feedGeometry, feedMaterial);
    feed.position.set(0, params.focalLength, 0);
    feed.rotation.x = Math.PI;
    dishGroup.add(feed);
    
    // Support struts
    const strutCount = detailLevel === 'high' || detailLevel === 'ultra' ? 6 : 4;
    for (let i = 0; i < strutCount; i++) {
      const angle = (i / strutCount) * Math.PI * 2;
      const strutGeometry = new THREE.CylinderGeometry(0.02, 0.02, params.focalLength);
      const strut = new THREE.Mesh(strutGeometry, feedMaterial);
      
      const radius = params.diameter * 0.3;
      strut.position.set(
        Math.cos(angle) * radius,
        params.focalLength / 2,
        Math.sin(angle) * radius
      );
      strut.rotation.z = angle + Math.PI / 2;
      strut.rotation.x = Math.atan2(params.focalLength, radius);
      
      dishGroup.add(strut);
    }
    
    // Pedestal
    const pedestalGeometry = new THREE.CylinderGeometry(0.3, 0.3, params.pedestalHeight);
    const pedestalMaterial = this.materialSystem.createMaterial('concrete_smooth');
    const pedestal = new THREE.Mesh(pedestalGeometry, pedestalMaterial);
    pedestal.position.y = -params.pedestalHeight / 2;
    dishGroup.add(pedestal);
    
    // Az/El mount
    const mountGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.6);
    const mountMaterial = this.materialSystem.createMaterial('metal_painted');
    const mount = new THREE.Mesh(mountGeometry, mountMaterial);
    mount.position.y = 0.3;
    dishGroup.add(mount);
    
    dishGroup.name = 'procedural_parabolic_dish';
    return dishGroup;
  }

  private createProceduralLatticeTower(params: any, detailLevel: string): THREE.Group {
    const towerGroup = new THREE.Group();
    
    const sectionHeight = params.height / params.sections;
    const steelMaterial = this.materialSystem.createMaterial('antenna_steel');
    
    for (let section = 0; section < params.sections; section++) {
      const sectionY = section * sectionHeight;
      const widthRatio = 1 - (section / params.sections);
      const sectionWidth = params.baseWidth * widthRatio + params.topWidth * (1 - widthRatio);
      
      // Vertical legs
      const legPositions = [
        [-sectionWidth/2, -sectionWidth/2],
        [sectionWidth/2, -sectionWidth/2],
        [sectionWidth/2, sectionWidth/2],
        [-sectionWidth/2, sectionWidth/2]
      ];
      
      legPositions.forEach(([x, z]) => {
        const legGeometry = new THREE.CylinderGeometry(0.05, 0.05, sectionHeight);
        const leg = new THREE.Mesh(legGeometry, steelMaterial);
        leg.position.set(x, sectionY + sectionHeight/2, z);
        towerGroup.add(leg);
      });
      
      // Horizontal bracing
      if (params.crossBracing) {
        const braceY = sectionY + sectionHeight * 0.3;
        
        // Cross braces
        for (let i = 0; i < 4; i++) {
          const [x1, z1] = legPositions[i];
          const [x2, z2] = legPositions[(i + 1) % 4];
          
          const braceLength = Math.sqrt((x2-x1)**2 + (z2-z1)**2);
          const braceGeometry = new THREE.CylinderGeometry(0.02, 0.02, braceLength);
          const brace = new THREE.Mesh(braceGeometry, steelMaterial);
          
          brace.position.set((x1+x2)/2, braceY, (z1+z2)/2);
          brace.rotation.y = Math.atan2(z2-z1, x2-x1);
          brace.rotation.z = Math.PI / 2;
          
          towerGroup.add(brace);
        }
      }
    }
    
    // Warning lights
    if (params.lightingSystem) {
      const lightMaterial = this.materialSystem.createMaterial('led_indicator');
      const lightGeometry = new THREE.SphereGeometry(0.1, 8, 8);
      
      // Top light
      const topLight = new THREE.Mesh(lightGeometry, lightMaterial);
      topLight.position.set(0, params.height + 0.5, 0);
      towerGroup.add(topLight);
      
      // Mid-level lights
      for (let i = 1; i < params.sections; i += 2) {
        const lightHeight = (i / params.sections) * params.height;
        const light = new THREE.Mesh(lightGeometry, lightMaterial);
        light.position.set(params.baseWidth / 2, lightHeight, 0);
        towerGroup.add(light);
      }
    }
    
    towerGroup.name = 'procedural_lattice_tower';
    return towerGroup;
  }

  private createProceduralBuilding(params: any, detailLevel: string): THREE.Group {
    const buildingGroup = new THREE.Group();
    
    // Main structure
    const buildingGeometry = new THREE.BoxGeometry(params.width, params.height, params.length);
    const wallMaterial = this.materialSystem.createMaterial('concrete_smooth');
    const building = new THREE.Mesh(buildingGeometry, wallMaterial);
    building.position.y = params.height / 2;
    buildingGroup.add(building);
    
    // Windows (if detail level allows)
    if (detailLevel === 'high' || detailLevel === 'ultra') {
      const windowMaterial = this.materialSystem.createMaterial('glass_reflective');
      const windowWidth = 2;
      const windowHeight = 1.5;
      const windowSpacing = 3;
      
      // Front and back windows
      for (let floor = 0; floor < params.floors; floor++) {
        const floorY = (floor + 0.5) * (params.height / params.floors);
        
        for (let i = 0; i < Math.floor(params.width / windowSpacing); i++) {
          const windowX = -params.width/2 + windowSpacing/2 + i * windowSpacing;
          
          // Front windows
          const frontWindow = new THREE.Mesh(
            new THREE.PlaneGeometry(windowWidth, windowHeight),
            windowMaterial
          );
          frontWindow.position.set(windowX, floorY, params.length/2 + 0.01);
          buildingGroup.add(frontWindow);
          
          // Back windows
          const backWindow = new THREE.Mesh(
            new THREE.PlaneGeometry(windowWidth, windowHeight),
            windowMaterial
          );
          backWindow.position.set(windowX, floorY, -params.length/2 - 0.01);
          backWindow.rotation.y = Math.PI;
          buildingGroup.add(backWindow);
        }
      }
    }
    
    // Roof details
    if (params.hvacUnits) {
      const hvacMaterial = this.materialSystem.createMaterial('metal_painted');
      
      for (let i = 0; i < 3; i++) {
        const hvacGeometry = new THREE.BoxGeometry(3, 1.5, 2);
        const hvac = new THREE.Mesh(hvacGeometry, hvacMaterial);
        hvac.position.set(
          -params.width/3 + i * params.width/3,
          params.height + 0.75,
          0
        );
        buildingGroup.add(hvac);
      }
    }
    
    // Entrance doors
    const doorMaterial = this.materialSystem.createMaterial('metal_painted');
    for (let i = 0; i < params.entrances; i++) {
      const doorX = -params.width/4 + i * params.width/2;
      const door = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 2.5, 0.1),
        doorMaterial
      );
      door.position.set(doorX, 1.25, params.length/2 + 0.05);
      buildingGroup.add(door);
    }
    
    buildingGroup.name = 'procedural_building';
    return buildingGroup;
  }

  private createProceduralFence(params: any, detailLevel: string): THREE.Group {
    const fenceGroup = new THREE.Group();
    
    const fenceMaterial = this.materialSystem.createMaterial('chain_link_fence');
    const postMaterial = this.materialSystem.createMaterial('metal_painted');
    
    const perimeter = params.perimeter;
    
    for (let i = 0; i < perimeter.length; i++) {
      const start = perimeter[i];
      const end = perimeter[(i + 1) % perimeter.length];
      
      const segmentLength = Math.sqrt(
        (end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2
      );
      const segmentAngle = Math.atan2(end[1] - start[1], end[0] - start[0]);
      
      // Fence panels
      const panelCount = Math.ceil(segmentLength / 8); // 8m panels
      for (let p = 0; p < panelCount; p++) {
        const panelX = start[0] + (p / panelCount) * (end[0] - start[0]);
        const panelZ = start[1] + (p / panelCount) * (end[1] - start[1]);
        
        const panel = new THREE.Mesh(
          new THREE.PlaneGeometry(8, params.height),
          fenceMaterial
        );
        panel.position.set(panelX, params.height/2, panelZ);
        panel.rotation.y = segmentAngle;
        fenceGroup.add(panel);
      }
      
      // Posts
      if (params.posts) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.05, params.height + 0.5),
          postMaterial
        );
        post.position.set(start[0], (params.height + 0.5)/2, start[1]);
        fenceGroup.add(post);
      }
    }
    
    fenceGroup.name = 'procedural_fence';
    return fenceGroup;
  }

  public async loadModel(modelId: string): Promise<{ model: THREE.Group; clips: THREE.AnimationClip[] } | null> {
    const config = this.modelConfigs.get(modelId);
    if (!config) {
      console.error(`Model config not found: ${modelId}`);
      return null;
    }

    // Check cache first
    if (this.modelCache.has(modelId)) {
      return {
        model: this.modelCache.get(modelId)!.clone(),
        clips: [] // Cached models don't have clips
      };
    }

    // Load from file or use procedural
    if (config.filePath) {
      try {
        const gltf = await this.gltfLoader.loadAsync(config.filePath);
        const model = gltf.scene;
        const clips = gltf.animations || [];
        
        // Apply material overrides
        this.applyMaterialOverrides(model, config);
        
        // Cache the model
        this.modelCache.set(modelId, model);
        
        return {
          model: model.clone(),
          clips: clips
        };
      } catch (error) {
        console.error(`Failed to load model ${modelId}:`, error);
        return null;
      }
    } else if (config.proceduralConfig) {
      // Use cached procedural model
      const model = this.proceduralModels.get(modelId);
      return model ? {
        model: model.clone(),
        clips: []
      } : null;
    }

    return null;
  }

  private applyMaterialOverrides(model: THREE.Group, config: ModelConfig): void {
    if (!config.materialOverrides) return;

    model.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const materialName = child.material.name || child.name;
        const overrideName = config.materialOverrides!.get(materialName);
        
        if (overrideName) {
          const newMaterial = this.materialSystem.createMaterial(overrideName);
          child.material = newMaterial;
        }
      }
    });
  }

  public async createInstance(
    modelId: string,
    instanceId: string,
    position: THREE.Vector3,
    rotation: THREE.Euler = new THREE.Euler(0, 0, 0),
    scale: THREE.Vector3 = new THREE.Vector3(1, 1, 1)
  ): Promise<ModelInstance | null> {
    const config = this.modelConfigs.get(modelId);
    if (!config) return null;

    const loadResult = await this.loadModel(modelId);
    if (!loadResult) return null;

    const { model: mesh, clips } = loadResult;

    // Apply transformations
    mesh.position.copy(position);
    mesh.rotation.copy(rotation);
    mesh.scale.copy(scale);

    // Set up animations if available
    let animationMixer: THREE.AnimationMixer | null = null;
    if (clips.length > 0 || (config.animations && config.animations.length > 0)) {
      animationMixer = new THREE.AnimationMixer(mesh);
      this.animationMixers.push(animationMixer);
    }

    // Create instance
    const instance: ModelInstance = {
      instanceId,
      modelConfig: config,
      mesh,
      position: position.clone(),
      rotation: rotation.clone(),
      scale: scale.clone(),
      animations: animationMixer,
      animationClips: clips,
      lodLevel: 0,
      materialVariant: 'base',
      interactionEnabled: true
    };

    this.modelInstances.set(instanceId, instance);
    this.scene.add(mesh);

    return instance;
  }

  public removeInstance(instanceId: string): void {
    const instance = this.modelInstances.get(instanceId);
    if (instance) {
      this.scene.remove(instance.mesh);
      
      if (instance.animations) {
        const index = this.animationMixers.indexOf(instance.animations);
        if (index > -1) {
          this.animationMixers.splice(index, 1);
        }
      }
      
      this.modelInstances.delete(instanceId);
    }
  }

  public updateLOD(): void {
    const cameraPosition = this.camera.position;

    this.modelInstances.forEach(instance => {
      const distance = cameraPosition.distanceTo(instance.position);
      const config = instance.modelConfig;
      
      if (config.lodLevels) {
        let newLodLevel = 0;
        
        for (let i = config.lodLevels.length - 1; i >= 0; i--) {
          if (distance >= config.lodLevels[i].distance) {
            newLodLevel = i;
            break;
          }
        }
        
        if (newLodLevel !== instance.lodLevel) {
          instance.lodLevel = newLodLevel;
          this.applyLODLevel(instance, newLodLevel);
        }
      }
      
      // Hide models beyond max render distance
      instance.mesh.visible = distance < this.maxRenderDistance;
    });
  }

  private applyLODLevel(instance: ModelInstance, lodLevel: number): void {
    const lodConfig = instance.modelConfig.lodLevels?.[lodLevel];
    if (!lodConfig) return;

    // Apply material quality changes
    instance.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const materialName = child.material.name;
        const baseMaterialName = materialName.split('_')[0];
        
        // Get appropriate quality material
        const qualityMaterial = this.materialSystem.createMaterial(
          baseMaterialName,
          'base' // Could vary based on LOD
        );
        
        child.material = qualityMaterial;
      }
    });
  }

  public playAnimation(instanceId: string, animationName: string, loop: boolean = true): void {
    const instance = this.modelInstances.get(instanceId);
    if (instance?.animations && instance.animationClips.length > 0) {
      // Find the animation clip by name
      const clip = THREE.AnimationClip.findByName(instance.animationClips, animationName);
      if (clip) {
        const action = instance.animations.clipAction(clip);
        action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
        action.play();
      }
    }
  }

  public stopAnimation(instanceId: string, animationName?: string): void {
    const instance = this.modelInstances.get(instanceId);
    if (instance?.animations) {
      if (animationName && instance.animationClips.length > 0) {
        // Find the animation clip by name
        const clip = THREE.AnimationClip.findByName(instance.animationClips, animationName);
        if (clip) {
          const action = instance.animations.clipAction(clip);
          action.stop();
        }
      } else {
        instance.animations.stopAllAction();
      }
    }
  }

  public update(deltaTime: number): void {
    // Update animations
    const delta = this.clock.getDelta();
    this.animationMixers.forEach(mixer => {
      mixer.update(delta);
    });

    // Update LOD system
    this.updateLOD();

    // Update performance metrics
    this.updatePerformanceMetrics();
  }

  private updatePerformanceMetrics(): void {
    let modelsRendered = 0;
    let trianglesRendered = 0;

    this.modelInstances.forEach(instance => {
      if (instance.mesh.visible) {
        modelsRendered++;
        
        instance.mesh.traverse((child) => {
          if (child instanceof THREE.Mesh && child.geometry) {
            const geometry = child.geometry;
            if (geometry.index) {
              trianglesRendered += geometry.index.count / 3;
            } else {
              trianglesRendered += geometry.attributes.position.count / 3;
            }
          }
        });
      }
    });

    this.performanceMetrics.modelsRendered = modelsRendered;
    this.performanceMetrics.trianglesRendered = trianglesRendered;
  }

  public getPerformanceMetrics() {
    return { ...this.performanceMetrics };
  }

  public getModelConfigs(): Map<string, ModelConfig> {
    return new Map(this.modelConfigs);
  }

  public getInstance(instanceId: string): ModelInstance | undefined {
    return this.modelInstances.get(instanceId);
  }

  public getAllInstances(): ModelInstance[] {
    return Array.from(this.modelInstances.values());
  }

  public dispose(): void {
    // Remove all instances
    this.modelInstances.forEach((instance, id) => {
      this.removeInstance(id);
    });

    // Dispose cached models
    this.modelCache.forEach(model => {
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => mat.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    });

    // Dispose loaders
    this.dracoLoader.dispose();

    console.log('EnhancedModelSystem disposed');
  }
}