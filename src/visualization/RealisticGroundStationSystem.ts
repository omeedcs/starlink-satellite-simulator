import * as THREE from 'three';

export interface GroundStationRealism {
  enablePBRMaterials: boolean;
  enableEnvironmentalProps: boolean;
  enableWeathering: boolean;
  enableSSAO: boolean;
  weatheringIntensity: number;
  timeOfDay: number; // 0-1 for proper lighting
}

export interface MaterialSet {
  concrete: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  gravel: THREE.MeshStandardMaterial;
  equipment: THREE.MeshStandardMaterial;
  cables: THREE.MeshStandardMaterial;
  signage: THREE.MeshStandardMaterial;
}

export class RealisticGroundStationSystem {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  
  private materials!: MaterialSet;
  private config: GroundStationRealism;
  
  // Environmental objects
  private environmentalProps: THREE.Group = new THREE.Group();
  private decalSystem: THREE.Group = new THREE.Group();
  
  // Post-processing for realism
  private ssaoPass: any = null;
  private groundPlane: THREE.Mesh | null = null;
  
  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    
    this.config = {
      enablePBRMaterials: true,
      enableEnvironmentalProps: true,
      enableWeathering: true,
      enableSSAO: true,
      weatheringIntensity: 0.6,
      timeOfDay: 0.5
    };
    
    this.createPBRMaterials();
    this.createGroundSurface();
    this.addEnvironmentalProps();
    this.setupPostProcessing();
    
    console.log('RealisticGroundStationSystem initialized - SpaceX site realism active');
  }

  private createPBRMaterials(): void {
    const textureLoader = new THREE.TextureLoader();
    
    // Create procedural textures since we don't have actual texture files
    this.materials = {
      // Weathered concrete with seams and bolts
      concrete: new THREE.MeshStandardMaterial({
        color: 0xb8b8b8,
        roughness: 0.9,
        metalness: 0.0,
        normalScale: new THREE.Vector2(1.2, 1.2),
        envMapIntensity: 0.3
      }),
      
      // Metallic equipment plating
      metal: new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        roughness: 0.3,
        metalness: 0.8,
        envMapIntensity: 1.0
      }),
      
      // Gravel and aggregate
      gravel: new THREE.MeshStandardMaterial({
        color: 0x9a8a7a,
        roughness: 1.0,
        metalness: 0.0,
        envMapIntensity: 0.1
      }),
      
      // Electronic equipment
      equipment: new THREE.MeshStandardMaterial({
        color: 0x2a2a2a,
        roughness: 0.7,
        metalness: 0.2,
        emissive: 0x001122,
        emissiveIntensity: 0.1
      }),
      
      // Cables and conduits
      cables: new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        roughness: 0.8,
        metalness: 0.1
      }),
      
      // Warning signs and markings
      signage: new THREE.MeshStandardMaterial({
        color: 0xff6b35,
        roughness: 0.6,
        metalness: 0.0,
        emissive: 0x331100,
        emissiveIntensity: 0.2
      })
    };
    
    // Add procedural weathering and surface details
    this.addWeatheringEffects();
    
    console.log('PBR materials created with weathering effects');
  }

  private addWeatheringEffects(): void {
    // Add subtle weathering variations to materials
    Object.values(this.materials).forEach(material => {
      // Randomize roughness slightly for surface variation
      const baseRoughness = material.roughness;
      material.roughness = baseRoughness + (Math.random() - 0.5) * 0.1;
      
      // Add subtle color variation for weathering
      const color = material.color.clone();
      const weatherFactor = this.config.weatheringIntensity;
      color.multiplyScalar(0.9 + Math.random() * 0.2 * weatherFactor);
      material.color.copy(color);
    });
  }

  private createGroundSurface(): void {
    // Create realistic ground plane with proper materials
    const groundGeometry = new THREE.PlaneGeometry(1000, 1000, 64, 64);
    
    // Add height variation for realistic surface
    const positions = groundGeometry.attributes.position as THREE.Float32BufferAttribute;
    for (let i = 0; i < positions.count; i++) {
      const height = (Math.random() - 0.5) * 0.5; // Subtle height variation
      positions.setZ(i, height);
    }
    positions.needsUpdate = true;
    groundGeometry.computeVertexNormals();
    
    this.groundPlane = new THREE.Mesh(groundGeometry, this.materials.concrete);
    this.groundPlane.rotation.x = -Math.PI / 2;
    this.groundPlane.receiveShadow = true;
    this.groundPlane.position.y = -0.5;
    
    this.scene.add(this.groundPlane);
    
    // Add gravel patches
    this.addGravelPatches();
    
    console.log('Realistic ground surface created');
  }

  private addGravelPatches(): void {
    for (let i = 0; i < 15; i++) {
      const patchGeometry = new THREE.CircleGeometry(Math.random() * 20 + 10, 16);
      const patch = new THREE.Mesh(patchGeometry, this.materials.gravel);
      
      patch.rotation.x = -Math.PI / 2;
      patch.position.x = (Math.random() - 0.5) * 800;
      patch.position.z = (Math.random() - 0.5) * 800;
      patch.position.y = 0.01; // Slightly above ground to prevent z-fighting
      
      this.scene.add(patch);
    }
  }

  private addEnvironmentalProps(): void {
    this.environmentalProps.name = 'EnvironmentalProps';
    
    // RF Hazard Signs
    this.addRFHazardSigns();
    
    // Cable Management
    this.addCableRuns();
    
    // Equipment Racks and Containers
    this.addEquipmentRacks();
    
    // Maintenance Infrastructure
    this.addMaintenanceProps();
    
    // Weathering Elements
    this.addWeatheringElements();
    
    this.scene.add(this.environmentalProps);
    
    console.log('Environmental props added for SpaceX site realism');
  }

  private addRFHazardSigns(): void {
    const signPositions = [
      { x: -50, y: 2, z: -50 },
      { x: 50, y: 2, z: -50 },
      { x: -50, y: 2, z: 50 },
      { x: 50, y: 2, z: 50 },
      { x: 0, y: 2, z: -80 },
      { x: 0, y: 2, z: 80 }
    ];
    
    signPositions.forEach(pos => {
      // Sign post
      const postGeometry = new THREE.CylinderGeometry(0.1, 0.1, 3);
      const post = new THREE.Mesh(postGeometry, this.materials.metal);
      post.position.set(pos.x, pos.y, pos.z);
      post.castShadow = true;
      
      // Warning sign
      const signGeometry = new THREE.PlaneGeometry(2, 1.5);
      const sign = new THREE.Mesh(signGeometry, this.materials.signage);
      sign.position.set(pos.x, pos.y + 1, pos.z);
      sign.castShadow = true;
      
      this.environmentalProps.add(post);
      this.environmentalProps.add(sign);
    });
  }

  private addCableRuns(): void {
    // Underground cable conduits and surface cable runs
    for (let i = 0; i < 20; i++) {
      const cableGeometry = new THREE.CylinderGeometry(0.05, 0.05, Math.random() * 50 + 20);
      const cable = new THREE.Mesh(cableGeometry, this.materials.cables);
      
      // Random cable routing
      cable.position.x = (Math.random() - 0.5) * 200;
      cable.position.y = 0.1;
      cable.position.z = (Math.random() - 0.5) * 200;
      cable.rotation.z = Math.random() * Math.PI;
      cable.castShadow = true;
      
      this.environmentalProps.add(cable);
    }
    
    // Cable junction boxes
    for (let i = 0; i < 8; i++) {
      const boxGeometry = new THREE.BoxGeometry(1, 0.5, 1);
      const box = new THREE.Mesh(boxGeometry, this.materials.equipment);
      
      box.position.x = (Math.random() - 0.5) * 150;
      box.position.y = 0.25;
      box.position.z = (Math.random() - 0.5) * 150;
      box.castShadow = true;
      
      this.environmentalProps.add(box);
    }
  }

  private addEquipmentRacks(): void {
    // Outdoor equipment enclosures
    const rackPositions = [
      { x: -30, z: -30 },
      { x: 30, z: -30 },
      { x: -30, z: 30 },
      { x: 30, z: 30 }
    ];
    
    rackPositions.forEach(pos => {
      // Main enclosure
      const rackGeometry = new THREE.BoxGeometry(3, 4, 2);
      const rack = new THREE.Mesh(rackGeometry, this.materials.equipment);
      rack.position.set(pos.x, 2, pos.z);
      rack.castShadow = true;
      
      // Cooling vents
      for (let i = 0; i < 4; i++) {
        const ventGeometry = new THREE.PlaneGeometry(0.8, 0.2);
        const vent = new THREE.Mesh(ventGeometry, this.materials.metal);
        vent.position.set(pos.x + 1.6, 2 + (i - 1.5) * 0.5, pos.z);
        vent.rotation.y = Math.PI / 2;
        
        this.environmentalProps.add(vent);
      }
      
      // Status lights
      const lightGeometry = new THREE.SphereGeometry(0.05);
      const lightMaterial = new THREE.MeshStandardMaterial({
        color: Math.random() > 0.5 ? 0x00ff00 : 0xff0000,
        emissive: Math.random() > 0.5 ? 0x004400 : 0x440000,
        emissiveIntensity: 0.5
      });
      const light = new THREE.Mesh(lightGeometry, lightMaterial);
      light.position.set(pos.x + 1.6, 3.5, pos.z);
      
      this.environmentalProps.add(rack);
      this.environmentalProps.add(light);
    });
  }

  private addMaintenanceProps(): void {
    // Maintenance cart
    const cartGeometry = new THREE.BoxGeometry(2, 1, 3);
    const cart = new THREE.Mesh(cartGeometry, this.materials.metal);
    cart.position.set(-60, 0.5, -20);
    cart.castShadow = true;
    
    // Tool boxes
    const toolBoxGeometry = new THREE.BoxGeometry(1, 0.5, 0.5);
    const toolBox = new THREE.Mesh(toolBoxGeometry, this.materials.equipment);
    toolBox.position.set(-60, 1.25, -20);
    toolBox.castShadow = true;
    
    // Ladder access
    const ladderGeometry = new THREE.BoxGeometry(0.1, 8, 0.1);
    const ladder = new THREE.Mesh(ladderGeometry, this.materials.metal);
    ladder.position.set(0, 4, -25);
    ladder.castShadow = true;
    
    this.environmentalProps.add(cart);
    this.environmentalProps.add(toolBox);
    this.environmentalProps.add(ladder);
  }

  private addWeatheringElements(): void {
    // Oil stains and puddles (as decals)
    this.addMeshDecals();
    
    // Rust and weathering marks on metal surfaces
    this.addWeatheringMarks();
  }

  private addMeshDecals(): void {
    // Puddle decals
    for (let i = 0; i < 10; i++) {
      const puddleGeometry = new THREE.CircleGeometry(Math.random() * 3 + 1, 12);
      const puddleMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        roughness: 0.1,
        metalness: 0.0,
        transparent: true,
        opacity: 0.8
      });
      
      const puddle = new THREE.Mesh(puddleGeometry, puddleMaterial);
      puddle.rotation.x = -Math.PI / 2;
      puddle.position.x = (Math.random() - 0.5) * 100;
      puddle.position.z = (Math.random() - 0.5) * 100;
      puddle.position.y = 0.02;
      
      this.decalSystem.add(puddle);
    }
    
    // Oil stains
    for (let i = 0; i < 5; i++) {
      const stainGeometry = new THREE.CircleGeometry(Math.random() * 2 + 0.5, 8);
      const stainMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a1a0a,
        roughness: 0.9,
        metalness: 0.0,
        transparent: true,
        opacity: 0.6
      });
      
      const stain = new THREE.Mesh(stainGeometry, stainMaterial);
      stain.rotation.x = -Math.PI / 2;
      stain.position.x = (Math.random() - 0.5) * 80;
      stain.position.z = (Math.random() - 0.5) * 80;
      stain.position.y = 0.03;
      
      this.decalSystem.add(stain);
    }
    
    this.scene.add(this.decalSystem);
  }

  private addWeatheringMarks(): void {
    // Add dirt and rust to existing metal objects
    this.environmentalProps.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material === this.materials.metal) {
        // Add random rust spots
        if (Math.random() > 0.7) {
          const rustMaterial = this.materials.metal.clone();
          rustMaterial.color.setHex(0x8b4513);
          rustMaterial.roughness = 0.9;
          
          // Apply to random faces
          object.material = rustMaterial;
        }
      }
    });
  }

  private setupPostProcessing(): void {
    if (this.config.enableSSAO) {
      // Note: In a real implementation, this would use THREE.js post-processing
      // For now, we'll enhance the ambient lighting to simulate SSAO
      this.enhanceAmbientOcclusion();
    }
  }

  private enhanceAmbientOcclusion(): void {
    // Add contact shadows and enhanced ambient occlusion effect
    const aoMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.3,
      depthWrite: false
    });
    
    // Add shadow planes under major objects
    this.environmentalProps.traverse((object) => {
      if (object instanceof THREE.Mesh && object.position.y > 0.5) {
        const shadowGeometry = new THREE.PlaneGeometry(
          object.scale.x * 2,
          object.scale.z * 2
        );
        const shadowPlane = new THREE.Mesh(shadowGeometry, aoMaterial);
        
        shadowPlane.rotation.x = -Math.PI / 2;
        shadowPlane.position.copy(object.position);
        shadowPlane.position.y = 0.01;
        shadowPlane.renderOrder = 1;
        
        this.scene.add(shadowPlane);
      }
    });
  }

  public updateTimeOfDay(timeOfDay: number): void {
    this.config.timeOfDay = timeOfDay;
    
    // Adjust material properties based on time of day
    const dayFactor = Math.sin(timeOfDay * Math.PI);
    
    // Update emissive materials for equipment lights
    Object.values(this.materials).forEach(material => {
      if (material.emissive && material.emissive.getHex() > 0) {
        material.emissiveIntensity = (1 - dayFactor) * 0.5;
      }
    });
    
    // Update puddle reflectivity
    this.decalSystem.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material.roughness < 0.5) {
        (object.material as THREE.MeshStandardMaterial).envMapIntensity = dayFactor;
      }
    });
  }

  public setWeatheringIntensity(intensity: number): void {
    this.config.weatheringIntensity = Math.max(0, Math.min(1, intensity));
    
    // Update weathering effects
    this.decalSystem.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        (object.material as THREE.Material).opacity = 
          (object.material as any).opacity * this.config.weatheringIntensity;
      }
    });
  }

  public enableRealisticEffects(enabled: boolean): void {
    this.environmentalProps.visible = enabled;
    this.decalSystem.visible = enabled;
    
    if (this.groundPlane) {
      this.groundPlane.material = enabled ? this.materials.concrete : 
        new THREE.MeshLambertMaterial({ color: 0x666666 });
    }
  }

  public addCustomProp(geometry: THREE.BufferGeometry, position: THREE.Vector3, material?: THREE.Material): void {
    const prop = new THREE.Mesh(
      geometry, 
      material || this.materials.equipment
    );
    prop.position.copy(position);
    prop.castShadow = true;
    prop.receiveShadow = true;
    
    this.environmentalProps.add(prop);
  }

  public dispose(): void {
    // Dispose all materials
    Object.values(this.materials).forEach(material => material.dispose());
    
    // Remove from scene
    this.scene.remove(this.environmentalProps);
    this.scene.remove(this.decalSystem);
    if (this.groundPlane) this.scene.remove(this.groundPlane);
    
    console.log('RealisticGroundStationSystem disposed');
  }
}