import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

export interface AntennaConfig {
  type: 'phased-array' | 'parabolic' | 'helical';
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: number;
  trackingEnabled: boolean;
}

export interface InfrastructureConfig {
  position: THREE.Vector3;
  orientation: number; // Rotation around Y axis
  antennas: AntennaConfig[];
  includeBuildingsAndUtilities: boolean;
}

export class GroundStationInfrastructure {
  private group: THREE.Group;
  private gltfLoader: GLTFLoader;
  private textureLoader: THREE.TextureLoader;
  private antennas: Map<string, THREE.Group> = new Map();
  private buildings: THREE.Group;
  private utilities: THREE.Group;
  private signalBeams: Map<string, THREE.Mesh> = new Map();
  private config: InfrastructureConfig;

  // PBR Materials
  private materials: {
    concrete: THREE.MeshStandardMaterial;
    metal: THREE.MeshStandardMaterial;
    antenna: THREE.MeshStandardMaterial;
    glass: THREE.MeshPhysicalMaterial;
    cable: THREE.MeshStandardMaterial;
  };

  constructor(config: InfrastructureConfig) {
    this.config = config;
    this.group = new THREE.Group();
    this.buildings = new THREE.Group();
    this.utilities = new THREE.Group();
    this.gltfLoader = new GLTFLoader();
    this.textureLoader = new THREE.TextureLoader();

    // Initialize PBR materials
    this.materials = this.createPBRMaterials();

    // Set position and orientation
    this.group.position.copy(config.position);
    this.group.rotation.y = config.orientation;

    this.group.add(this.buildings);
    this.group.add(this.utilities);

    // Build infrastructure
    this.buildAntennas();
    if (config.includeBuildingsAndUtilities) {
      this.buildControlBuilding();
      this.buildUtilityInfrastructure();
      this.buildSecurityFencing();
      this.buildParkingAndRoads();
    }

    console.log('GroundStationInfrastructure created with', config.antennas.length, 'antennas');
  }

  private createPBRMaterials(): any {
    console.log('Creating high-fidelity PBR materials...');

    return {
      concrete: new THREE.MeshStandardMaterial({
        color: 0xC8C8C8,
        roughness: 0.9,
        metalness: 0.0,
        normalMap: this.createConcreteNormalMap(),
        aoMap: this.createConcreteAOMap(),
        roughnessMap: this.createConcreteRoughnessMap()
      }),

      metal: new THREE.MeshStandardMaterial({
        color: 0xB0B0B0,
        roughness: 0.2,
        metalness: 0.9,
        normalMap: this.createMetalNormalMap(),
        roughnessMap: this.createMetalRoughnessMap()
      }),

      antenna: new THREE.MeshStandardMaterial({
        color: 0xE0E0E0,
        roughness: 0.3,
        metalness: 0.8,
        envMapIntensity: 1.0
      }),

      glass: new THREE.MeshPhysicalMaterial({
        color: 0x88CCFF,
        metalness: 0.0,
        roughness: 0.0,
        transmission: 0.9,
        transparent: true,
        opacity: 0.8,
        ior: 1.5,
        clearcoat: 1.0,
        clearcoatRoughness: 0.0
      }),

      cable: new THREE.MeshStandardMaterial({
        color: 0x1A1A1A,
        roughness: 0.7,
        metalness: 0.1
      })
    };
  }

  private buildAntennas(): void {
    console.log('Building high-fidelity antenna systems...');

    this.config.antennas.forEach((antennaConfig, index) => {
      const antennaGroup = new THREE.Group();
      antennaGroup.position.copy(antennaConfig.position);
      antennaGroup.rotation.copy(antennaConfig.rotation);
      antennaGroup.scale.setScalar(antennaConfig.scale);

      // Create antenna based on type
      switch (antennaConfig.type) {
        case 'phased-array':
          this.createPhasedArrayAntenna(antennaGroup);
          break;
        case 'parabolic':
          this.createParabolicAntenna(antennaGroup);
          break;
        case 'helical':
          this.createHelicalAntenna(antennaGroup);
          break;
      }

      // Add foundation and mounting
      this.addAntennaFoundation(antennaGroup);
      this.addCableManagement(antennaGroup);

      const antennaId = `antenna_${index}`;
      this.antennas.set(antennaId, antennaGroup);
      this.group.add(antennaGroup);

      // Add signal beam visualization
      if (antennaConfig.trackingEnabled) {
        this.createSignalBeam(antennaId, antennaGroup);
      }
    });
  }

  private createPhasedArrayAntenna(parent: THREE.Group): void {
    // Main phased array panel
    const panelGeometry = new THREE.BoxGeometry(3, 3, 0.2);
    const panelMesh = new THREE.Mesh(panelGeometry, this.materials.antenna);
    panelMesh.position.y = 4;
    panelMesh.castShadow = true;
    panelMesh.receiveShadow = true;
    parent.add(panelMesh);

    // Array elements (32x32 grid)
    const elementGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.05, 8);
    const elementMaterial = this.materials.metal;

    for (let x = 0; x < 32; x++) {
      for (let y = 0; y < 32; y++) {
        const element = new THREE.Mesh(elementGeometry, elementMaterial);
        element.position.set(
          (x - 15.5) * 0.09,
          4.15,
          (y - 15.5) * 0.09
        );
        element.castShadow = true;
        parent.add(element);
      }
    }

    // Support structure
    const supportGeometry = new THREE.BoxGeometry(0.3, 4, 0.3);
    const supportMesh = new THREE.Mesh(supportGeometry, this.materials.metal);
    supportMesh.position.y = 2;
    supportMesh.castShadow = true;
    parent.add(supportMesh);

    // Electronics housing
    const housingGeometry = new THREE.BoxGeometry(1.5, 0.8, 1);
    const housingMesh = new THREE.Mesh(housingGeometry, this.materials.metal);
    housingMesh.position.set(0, 0.4, -2);
    housingMesh.castShadow = true;
    parent.add(housingMesh);
  }

  private createParabolicAntenna(parent: THREE.Group): void {
    // Main dish (using sphere geometry as fallback for parabolic shape)
    const dishGeometry = new THREE.SphereGeometry(2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);

    const dishMesh = new THREE.Mesh(dishGeometry, this.materials.antenna);
    dishMesh.position.y = 3;
    dishMesh.rotation.x = Math.PI; // Face upward
    dishMesh.castShadow = true;
    dishMesh.receiveShadow = true;
    parent.add(dishMesh);

    // Feed horn at focal point
    const feedGeometry = new THREE.ConeGeometry(0.15, 0.6, 8);
    const feedMesh = new THREE.Mesh(feedGeometry, this.materials.metal);
    feedMesh.position.set(0, 3.5, 0);
    feedMesh.rotation.x = Math.PI;
    feedMesh.castShadow = true;
    parent.add(feedMesh);

    // Support arms
    const armGeometry = new THREE.CylinderGeometry(0.05, 0.05, 2, 8);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Mesh(armGeometry, this.materials.metal);
      const angle = (i / 4) * Math.PI * 2;
      arm.position.set(
        Math.cos(angle) * 1.5,
        2.5,
        Math.sin(angle) * 1.5
      );
      arm.rotation.z = Math.cos(angle) * 0.3;
      arm.rotation.x = Math.sin(angle) * 0.3;
      arm.castShadow = true;
      parent.add(arm);
    }

    // Mounting pedestal
    const pedestalGeometry = new THREE.CylinderGeometry(0.8, 1.2, 3, 16);
    const pedestalMesh = new THREE.Mesh(pedestalGeometry, this.materials.concrete);
    pedestalMesh.position.y = 1.5;
    pedestalMesh.castShadow = true;
    parent.add(pedestalMesh);

    // Azimuth and elevation motors
    const motorGeometry = new THREE.BoxGeometry(0.6, 0.3, 0.8);
    const azMotor = new THREE.Mesh(motorGeometry, this.materials.metal);
    azMotor.position.set(0, 3.2, 0);
    azMotor.castShadow = true;
    parent.add(azMotor);
  }

  private createHelicalAntenna(parent: THREE.Group): void {
    // Helical coil
    const coilPoints: THREE.Vector3[] = [];
    const turns = 8;
    const radius = 0.3;
    const height = 2;
    
    for (let i = 0; i <= turns * 32; i++) {
      const t = i / 32;
      const angle = t * Math.PI * 2;
      const y = (t / turns) * height;
      
      coilPoints.push(new THREE.Vector3(
        Math.cos(angle) * radius,
        y + 1,
        Math.sin(angle) * radius
      ));
    }

    const coilGeometry = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(coilPoints),
      100,
      0.02,
      8
    );
    const coilMesh = new THREE.Mesh(coilGeometry, this.materials.metal);
    coilMesh.castShadow = true;
    parent.add(coilMesh);

    // Ground plane reflector
    const reflectorGeometry = new THREE.CircleGeometry(1, 32);
    const reflectorMesh = new THREE.Mesh(reflectorGeometry, this.materials.antenna);
    reflectorMesh.rotation.x = -Math.PI / 2;
    reflectorMesh.position.y = 0.05;
    reflectorMesh.receiveShadow = true;
    parent.add(reflectorMesh);

    // Support mast
    const mastGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1, 8);
    const mastMesh = new THREE.Mesh(mastGeometry, this.materials.metal);
    mastMesh.position.y = 0.5;
    mastMesh.castShadow = true;
    parent.add(mastMesh);
  }

  private addAntennaFoundation(parent: THREE.Group): void {
    // Concrete foundation pad
    const foundationGeometry = new THREE.CylinderGeometry(3, 3.5, 0.5, 16);
    const foundationMesh = new THREE.Mesh(foundationGeometry, this.materials.concrete);
    foundationMesh.position.y = -0.25;
    foundationMesh.receiveShadow = true;
    parent.add(foundationMesh);

    // Rebar detail
    const rebarGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.6, 8);
    for (let i = 0; i < 12; i++) {
      const rebar = new THREE.Mesh(rebarGeometry, this.materials.metal);
      const angle = (i / 12) * Math.PI * 2;
      rebar.position.set(
        Math.cos(angle) * 2.5,
        0,
        Math.sin(angle) * 2.5
      );
      parent.add(rebar);
    }
  }

  private addCableManagement(parent: THREE.Group): void {
    // Cable conduits
    const conduitGeometry = new THREE.CylinderGeometry(0.1, 0.1, 2, 8);
    
    for (let i = 0; i < 3; i++) {
      const conduit = new THREE.Mesh(conduitGeometry, this.materials.cable);
      conduit.position.set(
        (i - 1) * 0.5,
        1,
        -3
      );
      conduit.castShadow = true;
      parent.add(conduit);
    }

    // Underground cable entry
    const entryGeometry = new THREE.BoxGeometry(1, 0.3, 0.5);
    const entryMesh = new THREE.Mesh(entryGeometry, this.materials.concrete);
    entryMesh.position.set(0, -0.1, -3.5);
    entryMesh.receiveShadow = true;
    parent.add(entryMesh);
  }

  private buildControlBuilding(): void {
    console.log('Building control facility...');

    // Main control building
    const buildingGeometry = new THREE.BoxGeometry(12, 4, 8);
    const buildingMesh = new THREE.Mesh(buildingGeometry, this.materials.concrete);
    buildingMesh.position.set(-15, 2, 0);
    buildingMesh.castShadow = true;
    buildingMesh.receiveShadow = true;
    this.buildings.add(buildingMesh);

    // Roof
    const roofGeometry = new THREE.BoxGeometry(12.5, 0.3, 8.5);
    const roofMesh = new THREE.Mesh(roofGeometry, this.materials.metal);
    roofMesh.position.set(-15, 4.15, 0);
    roofMesh.castShadow = true;
    this.buildings.add(roofMesh);

    // Windows
    const windowGeometry = new THREE.BoxGeometry(1.5, 1.2, 0.1);
    for (let i = 0; i < 6; i++) {
      const window = new THREE.Mesh(windowGeometry, this.materials.glass);
      window.position.set(-15 + (i - 2.5) * 2, 2.5, 4.05);
      this.buildings.add(window);
    }

    // Main door
    const doorGeometry = new THREE.BoxGeometry(1.2, 2.2, 0.1);
    const doorMaterial = new THREE.MeshStandardMaterial({
      color: 0x8B4513,
      roughness: 0.8,
      metalness: 0.0
    });
    const door = new THREE.Mesh(doorGeometry, doorMaterial);
    door.position.set(-15, 1.1, 4.05);
    this.buildings.add(door);

    // Equipment racks visible through windows
    this.addEquipmentRacks();
  }

  private addEquipmentRacks(): void {
    // Server/equipment racks inside building
    const rackGeometry = new THREE.BoxGeometry(0.6, 2, 1);
    const rackMaterial = new THREE.MeshStandardMaterial({
      color: 0x1A1A1A,
      roughness: 0.3,
      metalness: 0.8
    });

    for (let i = 0; i < 4; i++) {
      const rack = new THREE.Mesh(rackGeometry, rackMaterial);
      rack.position.set(-17 + i * 1.5, 1, -2);
      this.buildings.add(rack);

      // Add LED status lights
      const ledGeometry = new THREE.SphereGeometry(0.05, 8, 8);
      const ledMaterial = new THREE.MeshStandardMaterial({
        color: 0x00FF00,
        emissive: 0x004400
      });
      
      for (let j = 0; j < 3; j++) {
        const led = new THREE.Mesh(ledGeometry, ledMaterial);
        led.position.set(-17 + i * 1.5, 1.5 + j * 0.3, -1.45);
        this.buildings.add(led);
      }
    }
  }

  private buildUtilityInfrastructure(): void {
    console.log('Building utility infrastructure...');

    // Power transformer
    const transformerGeometry = new THREE.BoxGeometry(3, 2.5, 2);
    const transformerMesh = new THREE.Mesh(transformerGeometry, this.materials.metal);
    transformerMesh.position.set(-25, 1.25, 8);
    transformerMesh.castShadow = true;
    this.utilities.add(transformerMesh);

    // Cooling fins
    for (let i = 0; i < 8; i++) {
      const finGeometry = new THREE.BoxGeometry(0.1, 2, 1.5);
      const fin = new THREE.Mesh(finGeometry, this.materials.metal);
      fin.position.set(-25 + (i - 3.5) * 0.3, 1.25, 7);
      this.utilities.add(fin);
    }

    // Backup generator
    const generatorGeometry = new THREE.BoxGeometry(4, 2, 2.5);
    const generatorMesh = new THREE.Mesh(generatorGeometry, this.materials.metal);
    generatorMesh.position.set(-30, 1, 0);
    generatorMesh.castShadow = true;
    this.utilities.add(generatorMesh);

    // Exhaust stack
    const exhaustGeometry = new THREE.CylinderGeometry(0.3, 0.3, 5, 8);
    const exhaustMesh = new THREE.Mesh(exhaustGeometry, this.materials.metal);
    exhaustMesh.position.set(-30, 4.5, 0);
    exhaustMesh.castShadow = true;
    this.utilities.add(exhaustMesh);

    // Fuel tank
    const tankGeometry = new THREE.CylinderGeometry(1.5, 1.5, 3, 16);
    const tankMesh = new THREE.Mesh(tankGeometry, this.materials.metal);
    tankMesh.position.set(-35, 1.5, 5);
    tankMesh.rotation.z = Math.PI / 2;
    tankMesh.castShadow = true;
    this.utilities.add(tankMesh);
  }

  private buildSecurityFencing(): void {
    console.log('Installing security perimeter...');

    // Chain link fence posts
    const postGeometry = new THREE.CylinderGeometry(0.1, 0.1, 3, 8);
    const postMaterial = this.materials.metal;

    // Fence perimeter (50m x 50m)
    const fenceSize = 50;
    const postSpacing = 5;
    
    for (let side = 0; side < 4; side++) {
      for (let i = 0; i <= fenceSize / postSpacing; i++) {
        const post = new THREE.Mesh(postGeometry, postMaterial);
        
        switch (side) {
          case 0: // North
            post.position.set(-fenceSize/2 + i * postSpacing, 1.5, fenceSize/2);
            break;
          case 1: // East
            post.position.set(fenceSize/2, 1.5, fenceSize/2 - i * postSpacing);
            break;
          case 2: // South
            post.position.set(fenceSize/2 - i * postSpacing, 1.5, -fenceSize/2);
            break;
          case 3: // West
            post.position.set(-fenceSize/2, 1.5, -fenceSize/2 + i * postSpacing);
            break;
        }
        
        post.castShadow = true;
        this.utilities.add(post);
      }
    }

    // Gate
    const gateGeometry = new THREE.BoxGeometry(8, 3, 0.1);
    const gateMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 0.5,
      metalness: 0.8,
      transparent: true,
      opacity: 0.7
    });
    const gate = new THREE.Mesh(gateGeometry, gateMaterial);
    gate.position.set(-fenceSize/2, 1.5, 0);
    gate.castShadow = true;
    this.utilities.add(gate);
  }

  private buildParkingAndRoads(): void {
    console.log('Adding parking and access roads...');

    // Parking lot
    const parkingGeometry = new THREE.BoxGeometry(20, 0.1, 15);
    const parkingMaterial = new THREE.MeshStandardMaterial({
      color: 0x3A3A3A,
      roughness: 0.9,
      metalness: 0.0
    });
    const parking = new THREE.Mesh(parkingGeometry, parkingMaterial);
    parking.position.set(-30, 0.05, -15);
    parking.receiveShadow = true;
    this.utilities.add(parking);

    // Parking lines
    const lineGeometry = new THREE.BoxGeometry(0.2, 0.02, 15);
    const lineMaterial = new THREE.MeshStandardMaterial({
      color: 0xFFFFFF,
      roughness: 0.8
    });
    
    for (let i = 0; i < 4; i++) {
      const line = new THREE.Mesh(lineGeometry, lineMaterial);
      line.position.set(-35 + i * 5, 0.11, -15);
      this.utilities.add(line);
    }

    // Access road
    const roadGeometry = new THREE.BoxGeometry(6, 0.1, 60);
    const road = new THREE.Mesh(roadGeometry, parkingMaterial);
    road.position.set(-15, 0.05, -25);
    road.receiveShadow = true;
    this.utilities.add(road);
  }

  private createSignalBeam(antennaId: string, antenna: THREE.Group): void {
    // Create a cone representing the signal beam
    const beamGeometry = new THREE.ConeGeometry(10, 50, 16, 1, true);
    const beamMaterial = new THREE.MeshBasicMaterial({
      color: 0x00AAFF,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    
    const beam = new THREE.Mesh(beamGeometry, beamMaterial);
    beam.position.copy(antenna.position);
    beam.position.y += 5; // Above antenna
    beam.rotation.x = Math.PI; // Point upward
    beam.visible = false; // Hidden by default
    
    this.signalBeams.set(antennaId, beam);
    this.group.add(beam);
  }

  // Show/hide signal beams for specific antenna
  public setSignalBeamVisible(antennaId: string, visible: boolean): void {
    const beam = this.signalBeams.get(antennaId);
    if (beam) {
      beam.visible = visible;
    }
  }

  // Animate antenna tracking
  public trackSatellite(antennaId: string, azimuth: number, elevation: number): void {
    const antenna = this.antennas.get(antennaId);
    if (!antenna) return;

    // Smooth tracking animation
    antenna.rotation.y = azimuth;
    antenna.rotation.x = elevation;

    // Update signal beam direction
    const beam = this.signalBeams.get(antennaId);
    if (beam) {
      beam.rotation.y = azimuth;
      beam.rotation.x = elevation - Math.PI / 2; // Adjust for cone orientation
    }
  }

  // Texture creation methods for PBR materials
  private createConcreteNormalMap(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    
    // Base normal
    ctx.fillStyle = 'rgb(128, 128, 255)';
    ctx.fillRect(0, 0, 512, 512);
    
    // Add concrete surface variation
    for (let i = 0; i < 500; i++) {
      const size = 2 + Math.random() * 4;
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const intensity = 120 + Math.random() * 16;
      
      ctx.fillStyle = `rgb(${intensity}, ${intensity}, 255)`;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);
    return texture;
  }

  private createConcreteAOMap(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    
    ctx.fillStyle = 'rgb(220, 220, 220)';
    ctx.fillRect(0, 0, 512, 512);
    
    // Add subtle shadowing
    for (let i = 0; i < 100; i++) {
      const darkness = 180 + Math.random() * 40;
      ctx.fillStyle = `rgb(${darkness}, ${darkness}, ${darkness})`;
      ctx.beginPath();
      ctx.arc(Math.random() * 512, Math.random() * 512, Math.random() * 30, 0, Math.PI * 2);
      ctx.fill();
    }
    
    return new THREE.CanvasTexture(canvas);
  }

  private createConcreteRoughnessMap(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    
    const gradient = ctx.createLinearGradient(0, 0, 512, 512);
    gradient.addColorStop(0, 'rgb(200, 200, 200)');
    gradient.addColorStop(1, 'rgb(240, 240, 240)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 512);
    
    return new THREE.CanvasTexture(canvas);
  }

  private createMetalNormalMap(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    
    ctx.fillStyle = 'rgb(128, 128, 255)';
    ctx.fillRect(0, 0, 256, 256);
    
    // Brushed metal pattern
    for (let y = 0; y < 256; y += 2) {
      const intensity = 125 + Math.random() * 6;
      ctx.fillStyle = `rgb(${intensity}, 128, 255)`;
      ctx.fillRect(0, y, 256, 1);
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    return texture;
  }

  private createMetalRoughnessMap(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    
    ctx.fillStyle = 'rgb(50, 50, 50)'; // Low roughness for shiny metal
    ctx.fillRect(0, 0, 256, 256);
    
    return new THREE.CanvasTexture(canvas);
  }

  public getGroup(): THREE.Group {
    return this.group;
  }

  public dispose(): void {
    // Dispose of materials
    Object.values(this.materials).forEach(material => {
      material.dispose();
      if (material.map) material.map.dispose();
      if (material.normalMap) material.normalMap.dispose();
      if (material.roughnessMap) material.roughnessMap.dispose();
      if (material.aoMap) material.aoMap.dispose();
    });

    // Dispose of geometries and meshes
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach(mat => mat.dispose());
          } else {
            object.material.dispose();
          }
        }
      }
    });

    console.log('GroundStationInfrastructure disposed');
  }
}