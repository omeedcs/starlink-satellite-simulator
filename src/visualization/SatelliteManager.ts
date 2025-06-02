import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { Satellite } from '../types/Satellite';
import { Earth } from './Earth';
import { DeniedRegion } from './DeniedRegion';
import { DynamicRoutingController } from './DynamicRoutingController';
import { TleParser, TleData } from './TleParser';

export class SatelliteManager {
  private object: THREE.Group;
  private satellites: Map<string, Satellite> = new Map();
  private satelliteMeshes: Map<string, THREE.Object3D> = new Map();
  private connectionLines: Map<string, THREE.Line> = new Map();
  private beamCones: Map<string, THREE.Group> = new Map();
  private activeBeams: Map<string, number[]> = new Map();
  private performanceMode: boolean = false;
  private visibilityDistance: number = 50000;
  private earth?: Earth;
  private clock: THREE.Clock;
  private groundStationPositions: Map<string, THREE.Vector3> = new Map();
  
  private beamMaterial: THREE.MeshBasicMaterial;
  private connectionMaterial: THREE.LineBasicMaterial;
  
  private deniedRegion?: DeniedRegion;
  private routingController?: DynamicRoutingController;
  private showDynamicRouting: boolean = false;
  private activeDeniedRegions: string[] = [];
  
  // GLB model loading
  private gltfLoader: GLTFLoader;
  private satelliteModel: THREE.Group | null = null;
  private modelLoaded: boolean = false;
  private pendingSatellites: Array<{id: string, position: THREE.Vector3, shellIndex: number}> = [];
  
  constructor(initialSatellites?: Map<string, Satellite>) {
    this.object = new THREE.Group();
    this.satellites = new Map();
    this.satelliteMeshes = new Map();
    this.beamCones = new Map();
    this.connectionLines = new Map();
    this.groundStationPositions = new Map();
    this.clock = new THREE.Clock();
    
    this.connectionMaterial = new THREE.LineBasicMaterial({
      color: 0xff4444, // Red laser color
      transparent: true,
      opacity: 0.6,
      linewidth: 2
    });
    
    this.beamMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    
    // Initialize GLTF loader
    this.gltfLoader = new GLTFLoader();
    this.loadSatelliteModel();
    
    if (initialSatellites) {
      this.satellites = new Map(initialSatellites);
    }
    
    this.performanceMode = false;
  }

  public getObject(): THREE.Group {
    return this.object;
  }

  private loadSatelliteModel(): void {
    console.log('Loading Starlink satellite model...');
    this.gltfLoader.load(
      '/models/starlink-satellite.glb',
      (gltf) => {
        console.log('Starlink satellite model loaded successfully');
        this.satelliteModel = gltf.scene.clone();
        this.modelLoaded = true;
        
        // Scale the model appropriately for our simulation
        this.satelliteModel.scale.set(12, 12, 12); // Larger scale for high-res model visibility
        
        // Process any pending satellites
        this.processPendingSatellites();
      },
      (progress) => {
        console.log('Loading progress:', (progress.loaded / progress.total * 100) + '%');
      },
      (error) => {
        console.error('Error loading satellite model:', error);
        console.error('Full error details:', error);
        // Fallback to creating simple box geometry
        this.satelliteModel = null;
        this.modelLoaded = true;
        this.processPendingSatellites();
      }
    );
  }

  private processPendingSatellites(): void {
    console.log(`Processing ${this.pendingSatellites.length} pending satellites`);
    this.pendingSatellites.forEach(satellite => {
      this.createSatelliteMeshFromModel(satellite.id, satellite.position, satellite.shellIndex);
    });
    this.pendingSatellites = [];
  }

  public addSatellite(satellite: Satellite): void {
    console.log(`SatelliteManager.addSatellite: Adding ${satellite.id} at position`, satellite.position);
    this.satellites.set(satellite.id, satellite);
    
    if (this.modelLoaded) {
      this.createSatelliteMeshFromModel(satellite.id, satellite.position, 0);
    } else {
      // Queue for later processing when model is loaded
      this.pendingSatellites.push({id: satellite.id, position: satellite.position, shellIndex: 0});
    }
    
    console.log(`SatelliteManager: Created mesh for ${satellite.id}, total satellites: ${this.satellites.size}`);
  }

  public removeSatellite(id: string): void {
    this.satellites.delete(id);
    const mesh = this.satelliteMeshes.get(id);
    if (mesh) {
      this.object.remove(mesh);
      this.satelliteMeshes.delete(id);
    }
  }

  public getSatellites(): Map<string, Satellite> {
    return this.satellites;
  }

  public getAllSatellites(): Map<string, Satellite> {
    return this.satellites;
  }

  public getSatellite(id: string): Satellite | undefined {
    return this.satellites.get(id);
  }

  public updateSatellitePositionById(id: string, position: THREE.Vector3): void {
    this.updateSatellitePosition(id, position);
  }

  public setPerformanceMode(enabled: boolean): void {
    this.performanceMode = enabled;
  }

  public setVisible(visible: boolean): void {
    this.object.visible = visible;
  }

  public updateSatellitePosition(id: string, position: THREE.Vector3): void {
    const satellite = this.satellites.get(id);
    if (!satellite) return;
    
    satellite.position.copy(position);
    
    const mesh = this.satelliteMeshes.get(id);
    if (mesh) {
      mesh.position.copy(position);
      mesh.lookAt(new THREE.Vector3(0, 0, 0));
      mesh.visible = true;
      
      const distanceFromOrigin = position.length();
      const scale = Math.max(1.0, 5.0 - distanceFromOrigin / 5000);
      mesh.scale.set(scale, scale, scale);
    }
  }

  public clearConnections(satelliteId: string): void {
    const keysToRemove: string[] = [];
    
    this.connectionLines.forEach((line, key) => {
      if (key.includes(satelliteId)) {
        this.object.remove(line);
        keysToRemove.push(key);
      }
    });
    
    keysToRemove.forEach(key => {
      this.connectionLines.delete(key);
    });
  }

  public addConnection(fromId: string, toId: string): void {
    this.createConnectionLine(fromId, toId);
    
    if (this.showDynamicRouting && this.routingController) {
      this.routingController.addConnection(fromId, toId, 'satellite-to-satellite');
    }
  }

  public setEarth(earth: Earth): void {
    this.earth = earth;
    
    if (earth && earth.getRadius) {
      this.deniedRegion = new DeniedRegion(earth.getRadius());
      this.routingController = new DynamicRoutingController(earth.getRadius());
      this.object.add(this.deniedRegion.getObject());
      this.object.add(this.routingController.getObject());
    }
  }

  public enableDynamicRouting(enable: boolean = true): void {
    this.showDynamicRouting = enable;
    
    if (enable && this.routingController) {
      this.initializeRoutingController();
    }
  }

  public addDeniedRegion(regionName: string): void {
    if (!this.deniedRegion || !this.routingController) return;
    
    if (!this.activeDeniedRegions.includes(regionName)) {
      this.activeDeniedRegions.push(regionName);
    }
    
    this.deniedRegion.addPredefinedRegion(regionName);
    
    if (this.showDynamicRouting) {
      this.routingController.initialize(this.activeDeniedRegions);
    }
  }

  private initializeRoutingController(): void {
    if (!this.routingController || !this.earth) return;
    
    this.routingController.initialize(this.activeDeniedRegions);
    
    this.satellites.forEach((satellite, id) => {
      const position = satellite.position;
      const earthRadius = this.earth!.getRadius();
      
      const latitude = Math.asin(position.y / position.length()) * (180 / Math.PI);
      const longitude = Math.atan2(position.z, position.x) * (180 / Math.PI);
      const altitude = (position.length() - earthRadius) / 1000;
      
      this.routingController!.addSatellite(satellite, satellite.position, latitude, longitude, altitude);
    });
    
    this.groundStationPositions.forEach((position, id) => {
      if (!this.earth || !this.routingController) return;
      
      const earthRadius = this.earth.getRadius();
      const surfacePoint = position.clone().normalize().multiplyScalar(earthRadius);
      
      const latitude = Math.asin(surfacePoint.y / earthRadius) * (180 / Math.PI);
      const longitude = Math.atan2(surfacePoint.z, surfacePoint.x) * (180 / Math.PI);
      
      this.routingController.addGroundStation(id, position, latitude, longitude);
    });
  }

  public update(deltaTime: number): void {
    this.satellites.forEach((satellite, id) => {
      satellite.position.add(satellite.velocity.clone().multiplyScalar(deltaTime));
      
      const mesh = this.satelliteMeshes.get(id);
      if (mesh) {
        mesh.position.copy(satellite.position);
        mesh.lookAt(new THREE.Vector3(0, 0, 0));
      }
      
      if (this.showDynamicRouting && this.routingController && this.earth) {
        const earthRadius = this.earth.getRadius();
        const position = satellite.position;
        
        const latitude = Math.asin(position.y / position.length()) * (180 / Math.PI);
        const longitude = Math.atan2(position.z, position.x) * (180 / Math.PI);
        const altitude = (position.length() - earthRadius) / 1000;
        
        this.routingController.updateSatellitePosition(id, satellite.position, latitude, longitude, altitude);
      }
    });
    
    if (!this.performanceMode || Math.floor(this.clock.getElapsedTime() * 2) % 2 === 0) {
      this.updateConnectionLines();
    }
    
    if (this.showDynamicRouting && this.routingController) {
      if (!this.performanceMode || Math.floor(this.clock.getElapsedTime() * 2) % 2 === 0) {
        this.updateRoutingConnections();
      }
    }
    
    if (!this.performanceMode) {
      const satelliteArray = Array.from(this.satellites.entries());
      const updateCount = Math.min(10, satelliteArray.length);
      const startIndex = Math.floor(this.clock.getElapsedTime() * 5) % satelliteArray.length;
      
      for (let i = 0; i < updateCount; i++) {
        const index = (startIndex + i) % satelliteArray.length;
        const [id, satellite] = satelliteArray[index];
        this.updateActiveBeams(satellite, id);
      }
    }
    
    const rotationSpeed = this.performanceMode ? 0.1 : 0.2;
    this.satelliteMeshes.forEach((mesh) => {
      mesh.rotation.y += deltaTime * rotationSpeed;
    });
  }

  public addGroundStationConnection(satelliteId: string, groundStationId: string, position: THREE.Vector3): void {
    this.groundStationPositions.set(groundStationId, position);
    
    const satellite = this.satellites.get(satelliteId);
    if (satellite && satellite.connections) {
      if (!satellite.connections.groundStations.includes(groundStationId)) {
        satellite.connections.groundStations.push(groundStationId);
      }
    }
    
    if (this.showDynamicRouting && this.routingController && this.earth) {
      const earthRadius = this.earth.getRadius();
      const surfacePoint = position.clone().normalize().multiplyScalar(earthRadius);
      
      const latitude = Math.asin(surfacePoint.y / earthRadius) * (180 / Math.PI);
      const longitude = Math.atan2(surfacePoint.z, surfacePoint.x) * (180 / Math.PI);
      
      this.routingController.addGroundStation(groundStationId, position, latitude, longitude);
      this.routingController.addConnection(satelliteId, groundStationId, 'satellite-to-ground');
    }
  }

  private updateConnectionLines(): void {
    // Update connection line positions between satellites
    const maxUpdatesPerFrame = 50;
    let updateCount = 0;
    
    for (const [connectionId, line] of this.connectionLines.entries()) {
      if (updateCount >= maxUpdatesPerFrame) break;
      
      const [fromId, toId] = connectionId.split('_');
      const fromSat = this.satellites.get(fromId);
      const toSat = this.satellites.get(toId);
      
      if (fromSat && toSat) {
        const positions = new Float32Array([
          fromSat.position.x, fromSat.position.y, fromSat.position.z,
          toSat.position.x, toSat.position.y, toSat.position.z
        ]);
        
        const geometry = line.geometry as THREE.BufferGeometry;
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.attributes.position.needsUpdate = true;
        
        updateCount++;
      }
    }
  }

  private updateRoutingConnections(): void {
    if (this.routingController) {
      this.routingController.updateVisualization();
    }
  }

  private updateActiveBeams(satellite: Satellite, satelliteId: string): void {
    const beamGroup = this.beamCones.get(satelliteId);
    if (!beamGroup) return;
    
    const activeBeamIndices: number[] = [];
    
    const beams: THREE.Mesh[] = [];
    beamGroup.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh) {
        beams.push(child);
      }
    });
    
    beams.forEach(beam => {
      beam.visible = false;
    });
    
    const numActiveBeams = 2 + Math.floor(Math.random() * 3);
    
    for (let i = 0; i < numActiveBeams; i++) {
      const beamIndex = Math.floor(Math.random() * beams.length);
      const beam = beams[beamIndex];
      
      if (activeBeamIndices.includes(beamIndex)) continue;
      
      const beamMaterial = beam.material as THREE.MeshBasicMaterial;
      beamMaterial.color.set(0x88ffff);
      
      const pulseRate = 0.5 + (i * 0.2);
      const pulseFactor = 0.2 + 0.15 * Math.sin(this.clock.getElapsedTime() * pulseRate);
      beamMaterial.opacity = pulseFactor;
      
      beam.visible = true;
      
      activeBeamIndices.push(beamIndex);
    }
    
    this.activeBeams.set(satelliteId, activeBeamIndices);
  }

  public async initializeConstellation(useTleData: boolean = false): Promise<void> {
    if (useTleData) {
      await this.initializeConstellationFromTle();
    } else {
      this.initializeConstellationCalculated();
    }
  }

  /**
   * Initialize constellation using real TLE data
   */
  public async initializeConstellationFromTle(): Promise<void> {
    console.log('🛰️ Fetching real Starlink TLE data...');
    
    try {
      const tleData = await TleParser.fetchStarlinkTles();
      const starlinkTles = TleParser.filterStarlinkSatellites(tleData);
      
      console.log(`📡 Found ${starlinkTles.length} Starlink satellites in TLE data`);
      
      let satelliteCount = 0;
      const currentTime = new Date();
      
      for (const tle of starlinkTles) {
        try {
          const orbitalElements = TleParser.parseOrbitalElements(tle.line1, tle.line2);
          const satPosition = TleParser.calculatePosition(orbitalElements, 0);
          
          // Generate ID from NORAD ID
          const id = `starlink-${orbitalElements.noradId}`;
          
          const satellite: Satellite = {
            id,
            position: satPosition.position.clone(),
            velocity: satPosition.velocity.clone(),
            orbitalParameters: {
              altitude: satPosition.position.length() * 2 - 6371, // Calculate altitude from position
              inclination: orbitalElements.inclination,
              eccentricity: orbitalElements.eccentricity,
              argumentOfPeriapsis: orbitalElements.argumentOfPeriapsis,
              longitudeOfAscendingNode: orbitalElements.raan,
              meanAnomaly: orbitalElements.meanAnomaly
            },
            connections: {
              satellites: [],
              groundStations: []
            },
            beams: 16,
            timeSlots: [],
            status: 'active',
            type: 'v1.5'
          };
          
          this.satellites.set(id, satellite);
          this.createSatelliteMeshFromModel(id, satPosition.position, 0);
          
          satelliteCount++;
          
          if (satelliteCount % 50 === 0) {
            console.log(`📍 Positioned ${satelliteCount}/${starlinkTles.length} satellites from TLE data...`);
          }
          
        } catch (error) {
          console.warn(`Failed to process TLE for ${tle.name}:`, error);
        }
      }
      
      console.log(`✅ Created constellation from real TLE data: ${satelliteCount} satellites`);
      console.log(`🔗 Setting up laser inter-satellite links...`);
      
      // Setup laser links (this will be more sparse with real data)
      this.setupInterSatelliteLinksFromTle();
      
    } catch (error) {
      console.error('Failed to load TLE data, falling back to calculated constellation:', error);
      this.initializeConstellationCalculated();
    }
  }

  /**
   * Initialize constellation using calculated orbital positions (original method)
   */
  public initializeConstellationCalculated(): void {
    console.log('Initializing Starlink Shell 1 constellation (calculated)...');
    
    // Real Starlink Shell 1 configuration
    const shell = {
      altitude: 550,        // km
      inclination: 53,      // degrees
      planes: 72,           // orbital planes
      satellitesPerPlane: 22 // satellites per plane = 1,584 total
    };
    
    let satelliteCount = 0;
    const earthRadius = 6371; // km
    const orbitRadius = earthRadius + shell.altitude;
    const scaleFactor = 1/2; // Scale down for visualization
    
    console.log(`Creating ${shell.planes} orbital planes with ${shell.satellitesPerPlane} satellites each...`);
    
    for (let planeIndex = 0; planeIndex < shell.planes; planeIndex++) {
      // Calculate RAAN (Right Ascension of Ascending Node) for this plane
      // Planes are evenly distributed around Earth
      const raan = (planeIndex * 360 / shell.planes) % 360; // degrees
      const raanRad = raan * (Math.PI / 180);
      
      for (let satIndex = 0; satIndex < shell.satellitesPerPlane; satIndex++) {
        // Calculate mean anomaly for satellite position in orbit
        // Satellites in each plane are evenly spaced
        const meanAnomaly = (satIndex * 360 / shell.satellitesPerPlane) % 360; // degrees
        const meanAnomalyRad = meanAnomaly * (Math.PI / 180);
        
        // Calculate position using orbital mechanics
        // For circular orbits, eccentric anomaly ≈ mean anomaly
        const trueAnomalyRad = meanAnomalyRad; // Simplified for circular orbit
        
        // Position in orbital plane
        const xOrbital = orbitRadius * Math.cos(trueAnomalyRad);
        const yOrbital = orbitRadius * Math.sin(trueAnomalyRad);
        const zOrbital = 0;
        
        // Transform from orbital plane to Earth-centered inertial coordinates
        const inclinationRad = shell.inclination * (Math.PI / 180);
        
        // Apply inclination rotation (around x-axis)
        const x1 = xOrbital;
        const y1 = yOrbital * Math.cos(inclinationRad) - zOrbital * Math.sin(inclinationRad);
        const z1 = yOrbital * Math.sin(inclinationRad) + zOrbital * Math.cos(inclinationRad);
        
        // Apply RAAN rotation (around z-axis)
        const x = x1 * Math.cos(raanRad) - y1 * Math.sin(raanRad);
        const y = x1 * Math.sin(raanRad) + y1 * Math.cos(raanRad);
        const z = z1;
        
        // Create position vector (scaled for visualization)
        const position = new THREE.Vector3(x, z, y).multiplyScalar(scaleFactor);
        
        // Calculate orbital velocity for circular orbit
        const orbitalSpeed = Math.sqrt(398600.4418 / orbitRadius); // km/s
        const velocityDirection = new THREE.Vector3(-Math.sin(trueAnomalyRad), Math.cos(trueAnomalyRad), 0);
        
        // Apply same rotations to velocity vector
        const v1 = new THREE.Vector3(
          velocityDirection.x,
          velocityDirection.y * Math.cos(inclinationRad),
          velocityDirection.y * Math.sin(inclinationRad)
        );
        
        const velocity = new THREE.Vector3(
          v1.x * Math.cos(raanRad) - v1.y * Math.sin(raanRad),
          v1.z,
          v1.x * Math.sin(raanRad) + v1.y * Math.cos(raanRad)
        ).multiplyScalar(orbitalSpeed * scaleFactor);
        
        const id = `starlink-${planeIndex.toString().padStart(2, '0')}-${satIndex.toString().padStart(2, '0')}`;
        
        const satellite: Satellite = {
          id,
          position: position.clone(),
          velocity: velocity.clone(),
          orbitalParameters: {
            altitude: shell.altitude,
            inclination: shell.inclination,
            eccentricity: 0.0001, // Nearly circular
            argumentOfPeriapsis: 0,
            longitudeOfAscendingNode: raan,
            meanAnomaly: meanAnomaly
          },
          connections: {
            satellites: [],
            groundStations: []
          },
          beams: 16, // Modern Starlink satellites have ~16 beams
          timeSlots: [],
          status: 'active',
          type: 'v1.5' // Current generation Starlink satellites
        };
        
        this.satellites.set(id, satellite);
        this.createSatelliteMeshFromModel(id, position, 0);
        
        satelliteCount++;
        
        // Log progress every 100 satellites
        if (satelliteCount % 100 === 0) {
          console.log(`Created ${satelliteCount}/${shell.planes * shell.satellitesPerPlane} satellites...`);
        }
      }
    }
    
    console.log(`✅ Created complete Starlink Shell 1: ${satelliteCount} satellites in ${shell.planes} planes`);
    console.log(`📊 Configuration: ${shell.altitude}km altitude, ${shell.inclination}° inclination`);
    
    // Setup realistic laser inter-satellite links
    this.setupInterSatelliteLinks();
  }

  /**
   * Setup laser links for satellites positioned from TLE data
   * This uses a different algorithm since satellites may not be in perfect grid
   */
  private setupInterSatelliteLinksFromTle(): void {
    console.log('Setting up laser links for TLE-based constellation...');
    
    const satelliteArray = Array.from(this.satellites.values());
    let totalLinks = 0;
    
    // For each satellite, connect to nearest neighbors
    for (const satellite of satelliteArray) {
      const connections = [];
      
      // Find closest satellites within laser range (~2000km)
      const distances = satelliteArray
        .filter(other => other.id !== satellite.id)
        .map(other => ({
          satellite: other,
          distance: satellite.position.distanceTo(other.position)
        }))
        .filter(entry => entry.distance < 2000) // Laser range limit
        .sort((a, b) => a.distance - b.distance);
      
      // Connect to 4 closest satellites (typical for Starlink)
      const maxConnections = 4;
      for (let i = 0; i < Math.min(maxConnections, distances.length); i++) {
        const target = distances[i].satellite;
        
        // Avoid duplicate connections
        if (!satellite.connections.satellites.includes(target.id) &&
            !target.connections.satellites.includes(satellite.id)) {
          
          satellite.connections.satellites.push(target.id);
          target.connections.satellites.push(satellite.id);
          this.createConnectionLine(satellite.id, target.id);
          totalLinks++;
        }
      }
    }
    
    console.log(`✅ Created ${totalLinks} laser inter-satellite links from TLE data`);
  }

  private createSatelliteMeshFromModel(id: string, position: THREE.Vector3, shellIndex: number): void {
    console.log(`Creating satellite mesh from model for ${id} at position:`, position, `distance from origin: ${position.length()}`);
    
    let group: THREE.Group;
    
    if (this.satelliteModel) {
      // Clone the loaded GLB model
      group = this.satelliteModel.clone();
      
      // Scale and ensure visibility
      group.scale.set(5, 5, 5);
      
      // Ensure all materials are visible and properly configured
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.visible = true;
          child.castShadow = false;
          child.receiveShadow = false;
          
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(mat => {
                if (mat instanceof THREE.MeshBasicMaterial || mat instanceof THREE.MeshStandardMaterial) {
                  mat.needsUpdate = true;
                  // Ensure it's not transparent accidentally
                  if (mat.transparent && mat.opacity < 0.1) {
                    mat.opacity = 1.0;
                    mat.transparent = false;
                  }
                }
              });
            } else {
              const mat = child.material as THREE.Material;
              mat.needsUpdate = true;
              if ((mat as any).transparent && (mat as any).opacity < 0.1) {
                (mat as any).opacity = 1.0;
                (mat as any).transparent = false;
              }
            }
          }
        }
      });
      
      console.log(`GLB model cloned for ${id}, children count:`, group.children.length);
    } else {
      // Fallback to simple geometry
      console.log(`Using fallback geometry for ${id}`);
      group = this.createSimpleSatelliteMesh();
    }
    
    group.position.copy(position);
    group.lookAt(new THREE.Vector3(0, 0, 0));
    
    // Ensure visibility
    group.visible = true;
    
    this.object.add(group);
    this.satelliteMeshes.set(id, group);
    
    console.log(`Created and added satellite mesh for ${id}, group children: ${group.children.length}, object children: ${this.object.children.length}`);
    
    this.createBeamCones(id, group);
  }

  private createSimpleSatelliteMesh(): THREE.Group {
    // Create a much more reasonably sized satellite mesh
    const satelliteGeometry = new THREE.BoxGeometry(20, 4, 10); // Reasonable size
    const satelliteMaterial = new THREE.MeshBasicMaterial({
      color: 0xCCCCCC, // Light gray instead of harsh white
      transparent: false,
      wireframe: false
    });
    
    const solarPanelGeometry = new THREE.BoxGeometry(30, 1, 8);
    const solarPanelMaterial = new THREE.MeshBasicMaterial({
      color: 0x004080, // Darker blue instead of neon cyan
      transparent: false,
      wireframe: false
    });
    
    const group = new THREE.Group();
    
    const satelliteBody = new THREE.Mesh(satelliteGeometry, satelliteMaterial);
    group.add(satelliteBody);
    
    const leftPanel = new THREE.Mesh(solarPanelGeometry, solarPanelMaterial);
    leftPanel.position.set(-15, 0, 0);
    group.add(leftPanel);
    
    const rightPanel = new THREE.Mesh(solarPanelGeometry, solarPanelMaterial);
    rightPanel.position.set(15, 0, 0);
    group.add(rightPanel);
    
    return group;
  }

  private createSatelliteMesh(id: string, position: THREE.Vector3, shellIndex: number): void {
    console.log(`Creating satellite mesh for ${id} at position:`, position, `distance from origin: ${position.length()}`);
    
    const satelliteGeometry = new THREE.BoxGeometry(4, 0.8, 2);
    const satelliteMaterial = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      transparent: false,
      wireframe: false
    });
    
    const solarPanelGeometry = new THREE.BoxGeometry(5, 0.1, 1.5);
    const solarPanelMaterial = new THREE.MeshBasicMaterial({
      color: 0x00FFFF,
      transparent: false,
      wireframe: false
    });
    
    const group = new THREE.Group();
    
    const satelliteBody = new THREE.Mesh(satelliteGeometry, satelliteMaterial);
    group.add(satelliteBody);
    
    const leftPanel = new THREE.Mesh(solarPanelGeometry, solarPanelMaterial);
    leftPanel.position.set(-2.5, 0, 0);
    group.add(leftPanel);
    
    const rightPanel = new THREE.Mesh(solarPanelGeometry, solarPanelMaterial);
    rightPanel.position.set(2.5, 0, 0);
    group.add(rightPanel);
    
    group.position.copy(position);
    group.lookAt(new THREE.Vector3(0, 0, 0));
    
    // Ensure visibility
    group.visible = true;
    satelliteBody.visible = true;
    leftPanel.visible = true;
    rightPanel.visible = true;
    
    this.object.add(group);
    this.satelliteMeshes.set(id, group);
    
    console.log(`Created and added satellite mesh for ${id}, group children: ${group.children.length}, object children: ${this.object.children.length}`);
    
    this.createBeamCones(id, group);
  }

  private createBeamCones(id: string, satelliteMesh: THREE.Group): void {
    const beamGroup = new THREE.Group();
    const numBeams = 8;
    
    for (let i = 0; i < numBeams; i++) {
      const beamGeometry = new THREE.ConeGeometry(0.3, 1.5, 8);
      const beamMaterial = this.beamMaterial.clone();
      const beam = new THREE.Mesh(beamGeometry, beamMaterial);
      
      const angle = (i / numBeams) * Math.PI * 2;
      beam.position.set(
        Math.cos(angle) * 0.5,
        -1,
        Math.sin(angle) * 0.5
      );
      
      beam.lookAt(
        Math.cos(angle) * 2,
        -3,
        Math.sin(angle) * 2
      );
      
      beamGroup.add(beam);
      beam.visible = false;
    }
    
    satelliteMesh.add(beamGroup);
    this.beamCones.set(id, beamGroup);
  }

  private setupInterSatelliteLinks(): void {
    console.log('Setting up laser inter-satellite links...');
    
    // Starlink satellites have 4 laser terminals and can connect to:
    // 1. Next/previous satellite in same orbital plane (2 connections)
    // 2. Satellites in adjacent orbital planes (2 connections)
    
    const planes = 72;
    const satellitesPerPlane = 22;
    let totalLinks = 0;
    
    // Parse satellite IDs to get plane and position info
    const satellitesByPlane = new Map<number, Satellite[]>();
    
    this.satellites.forEach((satellite) => {
      const idParts = satellite.id.split('-');
      if (idParts.length >= 3) {
        const planeIndex = parseInt(idParts[1]);
        const satIndex = parseInt(idParts[2]);
        
        if (!satellitesByPlane.has(planeIndex)) {
          satellitesByPlane.set(planeIndex, []);
        }
        satellitesByPlane.get(planeIndex)!.push(satellite);
      }
    });
    
    // Sort satellites in each plane by their index
    satellitesByPlane.forEach((satellites) => {
      satellites.sort((a, b) => {
        const aIndex = parseInt(a.id.split('-')[2]);
        const bIndex = parseInt(b.id.split('-')[2]);
        return aIndex - bIndex;
      });
    });
    
    console.log(`Organizing ${this.satellites.size} satellites into ${satellitesByPlane.size} planes...`);
    
    // Create intra-plane connections (along-track)
    satellitesByPlane.forEach((satellites, planeIndex) => {
      for (let i = 0; i < satellites.length; i++) {
        const currentSat = satellites[i];
        
        // Connect to next satellite in same plane (circular)
        const nextIndex = (i + 1) % satellites.length;
        const nextSat = satellites[nextIndex];
        
        // Bidirectional connection
        if (!currentSat.connections.satellites.includes(nextSat.id)) {
          currentSat.connections.satellites.push(nextSat.id);
          nextSat.connections.satellites.push(currentSat.id);
          this.createConnectionLine(currentSat.id, nextSat.id);
          totalLinks++;
        }
      }
    });
    
    // Create inter-plane connections (cross-track)
    // Each satellite connects to satellites in adjacent planes
    satellitesByPlane.forEach((satellites, planeIndex) => {
      // Calculate adjacent plane indices
      const leftPlaneIndex = (planeIndex - 1 + planes) % planes;
      const rightPlaneIndex = (planeIndex + 1) % planes;
      
      const leftPlane = satellitesByPlane.get(leftPlaneIndex);
      const rightPlane = satellitesByPlane.get(rightPlaneIndex);
      
      if (!leftPlane || !rightPlane) return;
      
      satellites.forEach((currentSat, satIndex) => {
        // Connect to corresponding satellite in left adjacent plane
        if (satIndex < leftPlane.length) {
          const leftSat = leftPlane[satIndex];
          const distance = currentSat.position.distanceTo(leftSat.position);
          
          // Only connect if satellites are reasonably close (laser range ~1000km)
          if (distance < 2000 && !currentSat.connections.satellites.includes(leftSat.id)) {
            currentSat.connections.satellites.push(leftSat.id);
            leftSat.connections.satellites.push(currentSat.id);
            this.createConnectionLine(currentSat.id, leftSat.id);
            totalLinks++;
          }
        }
        
        // Connect to corresponding satellite in right adjacent plane
        if (satIndex < rightPlane.length) {
          const rightSat = rightPlane[satIndex];
          const distance = currentSat.position.distanceTo(rightSat.position);
          
          // Only connect if satellites are reasonably close (laser range ~1000km)
          if (distance < 2000 && !currentSat.connections.satellites.includes(rightSat.id)) {
            currentSat.connections.satellites.push(rightSat.id);
            rightSat.connections.satellites.push(currentSat.id);
            this.createConnectionLine(currentSat.id, rightSat.id);
            totalLinks++;
          }
        }
      });
    });
    
    console.log(`✅ Created ${totalLinks} laser inter-satellite links`);
    console.log(`📡 Each satellite has ~${Math.round(totalLinks * 2 / this.satellites.size)} connections on average`);
    
    // Log connection statistics
    let connectionCounts = new Map<number, number>();
    this.satellites.forEach((satellite) => {
      const count = satellite.connections.satellites.length;
      connectionCounts.set(count, (connectionCounts.get(count) || 0) + 1);
    });
    
    console.log('📊 Connection distribution:');
    connectionCounts.forEach((count, connections) => {
      console.log(`  ${connections} connections: ${count} satellites`);
    });
  }

  private createConnectionLine(fromId: string, toId: string): void {
    const fromSat = this.satellites.get(fromId);
    const toSat = this.satellites.get(toId);
    
    if (!fromSat || !toSat) return;
    
    const geometry = new THREE.BufferGeometry().setFromPoints([
      fromSat.position,
      toSat.position
    ]);
    
    const line = new THREE.Line(geometry, this.connectionMaterial);
    this.object.add(line);
    
    const connectionId = `${fromId}_${toId}`;
    this.connectionLines.set(connectionId, line);
  }

  public getRoutingController(): DynamicRoutingController | undefined {
    return this.routingController;
  }

  public dispose(): void {
    this.satelliteMeshes.forEach((mesh) => {
      this.object.remove(mesh);
      if (mesh instanceof THREE.Mesh) {
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(material => material.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      }
    });
    
    this.connectionLines.forEach((line) => {
      this.object.remove(line);
      if (line.geometry) line.geometry.dispose();
      if (line.material) {
        if (Array.isArray(line.material)) {
          line.material.forEach(material => material.dispose());
        } else {
          line.material.dispose();
        }
      }
    });
    
    this.beamCones.forEach((beamGroup) => {
      this.object.remove(beamGroup);
      beamGroup.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(material => material.dispose());
            } else {
              child.material.dispose();
            }
          }
        }
      });
    });
    
    if (this.beamMaterial) this.beamMaterial.dispose();
    if (this.connectionMaterial) this.connectionMaterial.dispose();
    
    this.satellites.clear();
    this.satelliteMeshes.clear();
    this.beamCones.clear();
    this.connectionLines.clear();
    this.activeBeams.clear();
    this.groundStationPositions.clear();
  }
}