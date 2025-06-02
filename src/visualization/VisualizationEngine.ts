import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { SatelliteNetwork } from '../models/SatelliteNetwork';
import { GroundStationNetwork } from '../models/GroundStationNetwork';
import { Earth } from './Earth';
import { SatelliteManager } from './SatelliteManager';
import { GroundStationManager } from './GroundStationManager';
import { DataFlowManager } from './DataFlowManager';
import { GroundStationView } from './GroundStationView';
import { EnhancedGroundStationView } from './EnhancedGroundStationView';
import { SimpleWalkableView } from './SimpleWalkableView';
import { EnhancedVisualizationIntegration } from './EnhancedVisualizationIntegration';
import { PhysicalSkySystem } from './PhysicalSkySystem';
import { TimeOfDayLighting } from './TimeOfDayLighting';
import { AtmosphericScatteringSystem } from './AtmosphericScatteringSystem';
import { EnhancedSatelliteSystem } from './EnhancedSatelliteSystem';
import { VolumetricBeamSystem } from './VolumetricBeamSystem';
import { RealisticGroundStationSystem } from './RealisticGroundStationSystem';
import { HDRSatelliteRenderer } from './HDRSatelliteRenderer';
import { RealisticRFBeamSystem } from './RealisticRFBeamSystem';

export class VisualizationEngine {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private earth: Earth;
  private satelliteManager: SatelliteManager;
  private groundStationManager: GroundStationManager;
  private dataFlowManager: DataFlowManager;
  private groundStationView: GroundStationView;
  private enhancedGroundStationView: EnhancedGroundStationView;
  private simpleWalkableView: SimpleWalkableView;
  private enhancedVisualizationIntegration: EnhancedVisualizationIntegration;
  
  // Enhanced systems
  private physicalSkySystem!: PhysicalSkySystem;
  private timeOfDayLighting!: TimeOfDayLighting;
  private atmosphericScattering!: AtmosphericScatteringSystem;
  private enhancedSatelliteSystem!: EnhancedSatelliteSystem;
  private volumetricBeamSystem!: VolumetricBeamSystem;
  
  // Realistic systems for true-to-life experience
  private realisticGroundStation!: RealisticGroundStationSystem;
  private hdrSatelliteRenderer!: HDRSatelliteRenderer;
  private realisticRFBeams!: RealisticRFBeamSystem;
  
  private animationFrameId: number | null = null;
  private clock: THREE.Clock;
  private simulationSpeed: number = 1;
  private isPaused: boolean = false;
  private satelliteNetwork: SatelliteNetwork | null = null;
  private groundStationNetwork: GroundStationNetwork | null = null;
  private lastUpdateTime: number = 0;
  private originalCameraPosition: THREE.Vector3 | null = null;
  private originalControlsTarget: THREE.Vector3 | null = null;
  private activeGroundStationId: string | null = null;
  private frameCount: number = 0;
  private currentFps: number = 60;
  private lastFpsUpdateTime: number = 0;
  private isLowPerformanceMode: boolean = true; // Default to performance mode
  private updateInterval: number = 1; // Update every frame by default

  constructor(container: HTMLElement) {
    this.container = container;
    this.clock = new THREE.Clock();
    
    // Initialize scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    
    // Debug flag for troubleshooting
    console.log("VisualizationEngine constructor");
    
    // Initialize camera with better settings for visibility
    this.camera = new THREE.PerspectiveCamera(
      60, // Wider field of view
      container.clientWidth / container.clientHeight, // Aspect ratio
      10, // Much closer near clipping plane
      100000 // Far clipping plane
    );
    this.camera.position.set(0, 0, 12000); // Position camera closer to Earth for better satellite visibility
    
    // Initialize renderer with performance-optimized settings
    this.renderer = new THREE.WebGLRenderer({ 
      antialias: false, // Disable antialiasing for better performance
      powerPreference: 'high-performance',
      precision: 'mediump', // Use medium precision for better performance
      alpha: false,
      logarithmicDepthBuffer: false // Disable for better performance
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1)); // Limit pixel ratio for performance
    
    // Configure for proper lighting and performance
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.shadowMap.enabled = false; // Disable shadows for performance
    this.renderer.physicallyCorrectLights = false; // Disable for performance
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; // Better tone mapping
    this.renderer.toneMappingExposure = 0.8; // Reduced exposure to prevent overexposure
    
    container.appendChild(this.renderer.domElement);
    
    // Initialize controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 6500; // Minimum zoom distance
    this.controls.maxDistance = 50000; // Maximum zoom distance
    
    // Setup balanced lighting for performance and quality
    const ambientLight = new THREE.AmbientLight(0x404040, 0.2); // Reduced ambient
    this.scene.add(ambientLight);
    
    // Single directional light (no shadows for performance)
    const sunLight = new THREE.DirectionalLight(0xffffff, 0.6); // Reduced intensity
    sunLight.position.set(1, 1, 0.5);
    sunLight.castShadow = false; // Disable shadows for performance
    this.scene.add(sunLight);
    
    // Initialize Earth
    this.earth = new Earth();
    this.scene.add(this.earth.getMesh());
    
    // Initialize FPS monitoring
    this.lastFpsUpdateTime = this.clock.getElapsedTime();
    
    // Initialize satellite manager with high fidelity settings
    this.satelliteManager = new SatelliteManager();
    this.satelliteManager.setEarth(this.earth);
    this.satelliteManager.setPerformanceMode(false); // Disable performance mode for high fidelity
    const satelliteObj = this.satelliteManager.getObject();
    satelliteObj.visible = true;
    satelliteObj.castShadow = true; // Enable shadows for satellites
    this.scene.add(satelliteObj);
    
    // Enable dynamic routing to ensure satellite meshes are created
    this.satelliteManager.enableDynamicRouting(true);
    
    // Initialize ground station manager
    this.groundStationManager = new GroundStationManager();
    this.groundStationManager.setEarth(this.earth);
    this.scene.add(this.groundStationManager.getObject());
    
    // Initialize data flow manager
    this.dataFlowManager = new DataFlowManager(
      this.satelliteManager,
      this.groundStationManager
    );
    this.scene.add(this.dataFlowManager.getObject());
    
    // Initialize ground station view
    this.groundStationView = new GroundStationView(this.scene, this.earth);
    
    // Initialize enhanced walkable ground station view
    this.enhancedGroundStationView = new EnhancedGroundStationView(
      this.scene,
      this.camera,
      this.renderer,
      {
        terrainSize: 500, // Smaller terrain for better performance
        terrainResolution: 256, // Lower resolution for better performance
        elevationScale: 10, // Flatter terrain
        enableWeatherEffects: false, // Disable weather for stability
        enableSignalBeams: false, // Disable signal beams for stability  
        timeScale: 1 // Normal time for stability
      }
    );
    
    // Initialize simple walkable view as stable alternative
    this.simpleWalkableView = new SimpleWalkableView(this.scene, this.camera, this.renderer);
    
    // Initialize enhanced visualization integration
    this.enhancedVisualizationIntegration = new EnhancedVisualizationIntegration(this.scene, this.camera, this.renderer);
    
    // Initialize enhanced systems (disabled by default for performance)
    // this.initializeEnhancedSystems();
    
    // Handle window resize
    window.addEventListener('resize', this.handleResize);
  }

  private initializeEnhancedSystems(): void {
    console.log('Initializing enhanced photorealistic systems...');
    
    // Initialize physical sky system
    this.physicalSkySystem = new PhysicalSkySystem(this.scene, this.renderer, this.camera);
    
    // Initialize time-based lighting with default location (can be updated later)
    const timeConfig = {
      latitude: 40.7128,  // New York coordinates as default
      longitude: -74.0060,
      elevation: 10,
      timeZone: -5,
      date: new Date(),
      timeScale: 1.0,
      atmospheric: {
        turbidity: 2.0,
        visibility: 50.0,
        humidity: 0.6,
        pressure: 1013.25,
        temperature: 15.0
      }
    };
    this.timeOfDayLighting = new TimeOfDayLighting(this.scene, timeConfig, this.renderer);
    
    // Initialize atmospheric scattering
    this.atmosphericScattering = new AtmosphericScatteringSystem(this.scene, this.renderer, this.camera);
    
    // Initialize enhanced satellite system
    this.enhancedSatelliteSystem = new EnhancedSatelliteSystem(this.scene, this.camera);
    
    // Initialize volumetric beam system
    this.volumetricBeamSystem = new VolumetricBeamSystem(this.scene, this.camera);
    
    // Initialize realistic systems for SpaceX-level realism
    this.realisticGroundStation = new RealisticGroundStationSystem(this.scene, this.camera, this.renderer);
    this.hdrSatelliteRenderer = new HDRSatelliteRenderer(this.scene, this.camera, this.renderer);
    this.realisticRFBeams = new RealisticRFBeamSystem(this.scene, this.camera);
    
    // Hide original Earth for enhanced sky
    this.earth.getMesh().visible = false;
    
    console.log('Enhanced photorealistic systems initialized');
  }
  
  public setSatelliteNetwork(network: SatelliteNetwork): void {
    this.satelliteNetwork = network;
    
    // Set up event listeners
    network.on('update', () => {
      this.updateVisualization();
    });
    
    network.on('packetCreated', (packet) => {
      this.dataFlowManager.addPacket(packet);
    });
    
    network.on('packetRouted', (packet, fromId, toId) => {
      this.dataFlowManager.updatePacket(packet);
    });
    
    network.on('packetDelivered', (packet) => {
      this.dataFlowManager.removePacket(packet.id);
    });
    
    network.on('packetDropped', (packet) => {
      this.dataFlowManager.removePacket(packet.id);
    });

    // Initialize satellites in the visualization from the network
    this.initializeSatellitesFromNetwork();
    
    // Ensure initial visualization of existing satellites and connections
    this.updateVisualization();
  }
  
  // Initialize satellites in SatelliteManager from SatelliteNetwork
  private initializeSatellitesFromNetwork(): void {
    if (!this.satelliteNetwork) return;
    
    console.log('Initializing satellites from network...');
    const satellites = this.satelliteNetwork.getAllSatellites();
    console.log(`Found ${satellites.length} satellites in network`);
    
    satellites.forEach((satellite, index) => {
      // Convert from SatelliteNetwork format to SatelliteManager format
      // Apply a scale factor to make satellites more visible if needed
      const scaleFactor = 1.0; // Keep realistic scale for now
      const position = new THREE.Vector3(
        satellite.position.x * scaleFactor, 
        satellite.position.y * scaleFactor, 
        satellite.position.z * scaleFactor
      );
      const velocity = new THREE.Vector3(satellite.velocity.x, satellite.velocity.y, satellite.velocity.z);
      
      // Debug log for first few satellites
      if (index < 3) {
        console.log(`Satellite ${satellite.id} original position:`, satellite.position);
        console.log(`Satellite ${satellite.id} distance from origin:`, position.length());
        console.log(`Satellite ${satellite.id} orbital altitude:`, satellite.orbitalParameters.altitude);
      }
      
      const satelliteForManager = {
        id: satellite.id,
        position: position,
        velocity: velocity,
        orbitalParameters: satellite.orbitalParameters,
        connections: satellite.connections,
        beams: satellite.beams,
        timeSlots: satellite.timeSlots.map(slot => ({ duration: slot.duration, allocation: slot.allocation })),
        status: satellite.status,
        type: satellite.type
      };
      
      // Add satellite to manager
      this.satelliteManager.addSatellite(satelliteForManager);
      if (index < 3) {
        console.log(`Added satellite ${satellite.id} to manager at position:`, position);
      }
    });
    
    console.log(`Initialized ${satellites.length} satellites in visualization`);
    console.log(`Earth radius for reference: ${this.earth.getRadius()}`);
    console.log(`Camera position: ${this.camera.position.x}, ${this.camera.position.y}, ${this.camera.position.z}`);
  }

  public setGroundStationNetwork(network: GroundStationNetwork): void {
    this.groundStationNetwork = network;
    
    // Set up event listeners
    network.on('update', () => {
      this.updateGroundStationVisualization();
    });
    
    network.on('connectionAdded', (groundStationId, satelliteId) => {
      this.groundStationManager.connectToSatellite(groundStationId, satelliteId);
    });
    
    network.on('connectionRemoved', (groundStationId, satelliteId) => {
      this.groundStationManager.disconnectFromSatellite(groundStationId, satelliteId);
    });
    
    network.on('statusChanged', (groundStationId, status) => {
      const groundStation = this.groundStationManager.getGroundStation(groundStationId);
      if (groundStation) {
        groundStation.status = status;
      }
    });

    // Ensure initial visualization of existing ground stations
    this.updateGroundStationVisualization();
  }
  
  public start(): void {
    if (!this.animationFrameId) {
      this.clock.start();
      this.lastUpdateTime = 0;
      
      // Force immediate complete update of all satellites before starting animation
      this.forceFullVisualizationUpdate();
      
      this.animate();
    }
  }
  
  public stop(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
  
  // Force a complete update of all satellites and connections
  private forceFullVisualizationUpdate(): void {
    console.log('Forcing full visualization update...');
    if (!this.satelliteNetwork) return;
    
    // Process ALL satellites in one go to ensure everything is rendered
    const satellites = this.satelliteNetwork.getAllSatellites();
    console.log(`Updating all ${satellites.length} satellites`);
    
    satellites.forEach(satellite => {
      // Update position
      const position = new THREE.Vector3(satellite.position.x, satellite.position.y, satellite.position.z);
      this.satelliteManager.updateSatellitePositionById(satellite.id, position);
      
      // Clear and rebuild ALL connections
      this.satelliteManager.clearConnections(satellite.id);
      
      // Add ALL satellite connections
      satellite.connections.satellites.forEach(connectedId => {
        this.satelliteManager.addConnection(satellite.id, connectedId);
      });
      
      // Add ALL ground station connections
      satellite.connections.groundStations.forEach(groundStationId => {
        const groundStation = this.groundStationManager.getGroundStation(groundStationId);
        if (groundStation) {
          const position = this.earth.latLongToVector3(
            groundStation.position.latitude,
            groundStation.position.longitude,
            10 // Slight elevation above surface
          );
          this.satelliteManager.addGroundStationConnection(satellite.id, groundStationId, position);
        }
      });
    });
    
    // Force a render to make sure everything appears
    this.renderer.render(this.scene, this.camera);
    console.log('Full visualization update complete');
  }
  
  public dispose(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    
    // Remove event listeners
    window.removeEventListener('resize', this.handleResize);
    
    // Dispose of components
    this.groundStationView.dispose();
    this.enhancedGroundStationView.dispose();
    this.simpleWalkableView.dispose();
    this.enhancedVisualizationIntegration.dispose();
    this.satelliteManager.dispose();
    this.groundStationManager.dispose();
    this.dataFlowManager.dispose();
    
    // Dispose enhanced systems (if initialized)
    if (this.physicalSkySystem) this.physicalSkySystem.dispose();
    if (this.timeOfDayLighting) this.timeOfDayLighting.dispose();
    if (this.atmosphericScattering) this.atmosphericScattering.dispose();
    if (this.enhancedSatelliteSystem) this.enhancedSatelliteSystem.dispose();
    if (this.volumetricBeamSystem) this.volumetricBeamSystem.dispose();
    
    // Dispose realistic systems (if initialized)
    if (this.realisticGroundStation) this.realisticGroundStation.dispose();
    if (this.hdrSatelliteRenderer) this.hdrSatelliteRenderer.dispose();
    if (this.realisticRFBeams) this.realisticRFBeams.dispose();
    
    // Dispose of Earth
    if (this.earth) {
      this.scene.remove(this.earth.getMesh());
    }
    
    // Dispose of renderer
    this.container.removeChild(this.renderer.domElement);
    this.renderer.dispose();
    
    // Dispose of controls
    this.controls.dispose();
    
    // Clear references
    this.scene = null as any;
    this.camera = null as any;
  }
  
  public setSimulationSpeed(speed: number): void {
    this.simulationSpeed = speed;
    
    // Adjust update interval based on simulation speed
    if (speed > 5) {
      this.updateInterval = Math.max(1, Math.floor(10 / this.currentFps * speed));
    } else {
      this.updateInterval = this.isLowPerformanceMode ? 3 : 1;
    }
  }
  
  public setPaused(paused: boolean): void {
    this.isPaused = paused;
    if (paused) {
      this.clock.stop();
    } else {
      this.clock.start();
    }
  }
  
  public setVisibility(type: 'satellites' | 'groundStations' | 'dataFlow', visible: boolean): void {
    switch (type) {
      case 'satellites':
        this.satelliteManager.setVisible(visible);
        break;
      case 'groundStations':
        this.groundStationManager.setVisible(visible);
        break;
      case 'dataFlow':
        this.dataFlowManager.setVisible(visible);
        break;
    }
  }
  
  public focusOnGroundStation(id: string, toggleFirstPerson: boolean = false): void {
    const groundStation = this.groundStationNetwork?.getGroundStation(id);
    if (groundStation) {
      this.activeGroundStationId = id;
      
      if (toggleFirstPerson) {
        // Check if enhanced walkable view is active
        if (this.enhancedVisualizationIntegration.isViewActive()) {
          // Deactivate enhanced view and return to global
          this.exitEnhancedWalkableView();
        } else {
          // Activate enhanced walkable view for premium experience
          this.activateEnhancedWalkableView(groundStation);
        }
      } else {
        // Just focus on the ground station in global view
        const position = this.earth.latLongToVector3(
          groundStation.position.latitude,
          groundStation.position.longitude,
          500 // Elevation above surface
        );
        
        // Animate camera to position
        const startPosition = this.camera.position.clone();
        const endPosition = position.clone().multiplyScalar(1.5); // Move camera back a bit
        
        const duration = 1000; // ms
        const startTime = Date.now();
        
        const animateCamera = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / duration, 1);
          
          // Ease function (ease-out)
          const t = 1 - Math.pow(1 - progress, 3);
          
          // Interpolate position
          this.camera.position.lerpVectors(startPosition, endPosition, t);
          
          // Look at ground station
          this.camera.lookAt(position);
          
          if (progress < 1) {
            requestAnimationFrame(animateCamera);
          } else {
            // Set controls target to ground station
            this.controls.target.copy(position);
          }
        };
        
        animateCamera();
      }
    }
  }
  
  private async activateEnhancedWalkableView(groundStation: any): Promise<void> {
    console.log('🚀 Activating enhanced walkable ground station view...');
    
    // Store current camera state
    this.originalCameraPosition = this.camera.position.clone();
    this.originalControlsTarget = this.controls.target.clone();
    
    // Disable orbit controls to prevent conflicts
    this.controls.enabled = false;
    
    // Hide Earth and other elements for cleaner ground view
    this.earth.getMesh().visible = false;
    this.satelliteManager.getObject().visible = false; // Hide satellites initially for clean ground view
    this.groundStationManager.getObject().visible = false; // Hide original ground station markers
    
    // Activate enhanced walkable view
    await this.enhancedVisualizationIntegration.activateView(groundStation);
    
    console.log('✅ Enhanced walkable ground station view activated');
  }

  private async activateSimpleWalkableView(groundStation: any): Promise<void> {
    console.log('🚶 Activating simple walkable ground station view...');
    
    // Store current camera state
    this.originalCameraPosition = this.camera.position.clone();
    this.originalControlsTarget = this.controls.target.clone();
    
    // Disable orbit controls to prevent conflicts
    this.controls.enabled = false;
    
    // Hide Earth and other elements for cleaner ground view
    this.earth.getMesh().visible = false;
    this.satelliteManager.getObject().visible = false; // Hide satellites initially for clean ground view
    this.groundStationManager.getObject().visible = false; // Hide original ground station markers
    
    // Activate simple walkable view
    await this.simpleWalkableView.activateView(groundStation);
    
    console.log('✅ Simple walkable ground station view activated');
  }
  
  private async exitEnhancedWalkableView(): Promise<void> {
    console.log('🚀 Exiting enhanced walkable ground station view...');
    
    // Deactivate enhanced walkable view
    await this.enhancedVisualizationIntegration.exitView();
    
    // Re-enable orbit controls
    this.controls.enabled = true;
    
    // Restore visibility
    this.earth.getMesh().visible = true;
    this.satelliteManager.getObject().visible = true;
    this.groundStationManager.getObject().visible = true;
    
    // Restore camera position smoothly
    if (this.originalCameraPosition && this.originalControlsTarget) {
      this.camera.position.copy(this.originalCameraPosition);
      this.controls.target.copy(this.originalControlsTarget);
      this.controls.update();
    } else {
      // Fallback to default global view
      this.camera.position.set(0, 0, 20000);
      this.controls.target.set(0, 0, 0);
      this.controls.update();
    }
    
    this.activeGroundStationId = null;
    console.log('✅ Returned to global view');
  }

  private async exitSimpleWalkableView(): Promise<void> {
    console.log('🚶 Exiting simple walkable ground station view...');
    
    // Deactivate simple walkable view
    await this.simpleWalkableView.exitView();
    
    // Re-enable orbit controls
    this.controls.enabled = true;
    
    // Restore visibility
    this.earth.getMesh().visible = true;
    this.satelliteManager.getObject().visible = true;
    this.groundStationManager.getObject().visible = true;
    
    // Restore camera position smoothly
    if (this.originalCameraPosition && this.originalControlsTarget) {
      this.camera.position.copy(this.originalCameraPosition);
      this.controls.target.copy(this.originalControlsTarget);
      this.controls.update();
    } else {
      // Fallback to default global view
      this.camera.position.set(0, 0, 20000);
      this.controls.target.set(0, 0, 0);
      this.controls.update();
    }
    
    this.activeGroundStationId = null;
    console.log('✅ Returned to global view');
  }
  
  public exitFirstPersonView(): void {
    if (this.groundStationView.isInFirstPersonMode()) {
      // Toggle back to global view
      this.groundStationView.toggleFirstPersonMode(this.camera, this.controls);
      
      // Restore camera controls for global view
      this.controls.enableRotate = true;
      this.controls.enableZoom = true;
      this.controls.enablePan = true;
      this.controls.minPolarAngle = 0;
      this.controls.maxPolarAngle = Math.PI;
      this.controls.minDistance = 6500;
      this.controls.maxDistance = 50000;
      
      // Restore original camera position and target if available
      if (this.originalCameraPosition && this.originalControlsTarget) {
        // Smoothly animate back to original position
        const startPos = this.camera.position.clone();
        const startTarget = this.controls.target.clone();
        const duration = 1500; // ms
        const startTime = Date.now();
        
        const animateReturn = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / duration, 1);
          
          // Ease function (ease-out)
          const t = 1 - Math.pow(1 - progress, 3);
          
          // Interpolate position and target
          this.camera.position.lerpVectors(startPos, this.originalCameraPosition!, t);
          this.controls.target.lerpVectors(startTarget, this.originalControlsTarget!, t);
          
          if (progress < 1) {
            requestAnimationFrame(animateReturn);
          } else {
            this.controls.update();
          }
        };
        
        animateReturn();
      } else {
        // Fallback to default global view position
        this.camera.position.set(0, 0, 20000);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
      }
      
      // Show Earth again and force a redraw
      this.earth.getMesh().visible = true;
      
      // Ensure satellites remain visible
      this.satelliteManager.getObject().visible = true;
      
      // Make routing controller visible if it exists
      const routingController = this.satelliteManager.getRoutingController();
      if (routingController) {
        routingController.getObject().visible = true;
      }
      
      // Force an update to ensure all satellites are visible
      if (this.satelliteNetwork) {
        this.updateVisualization();
      }
      
      this.activeGroundStationId = null;
    }
  }
  
  public toggleGroundStationView(id: string): void {
    this.focusOnGroundStation(id, true);
  }
  
  // Performance monitoring variables are now declared at the top of the class
  
  private animate = (): void => {
    this.animationFrameId = requestAnimationFrame(this.animate);
    
    // Update controls
    this.controls.update();
    
    // Get elapsed time
    const currentTime = this.clock.getElapsedTime();
    const deltaTime = (currentTime - this.lastUpdateTime) * this.simulationSpeed;
    this.lastUpdateTime = currentTime;
    
    // FPS monitoring
    this.frameCount++;
    if (currentTime - this.lastFpsUpdateTime >= 1.0) { // Update FPS every second
      this.currentFps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsUpdateTime = currentTime;
      
      // Auto-adjust performance mode based on FPS (more aggressive)
      if (this.currentFps < 30) {
        this.isLowPerformanceMode = true;
        this.satelliteManager.setPerformanceMode(true);
        this.updateInterval = 5; // Update visualization much less frequently
      } else if (this.currentFps > 50) {
        this.isLowPerformanceMode = false;
        this.satelliteManager.setPerformanceMode(false);
        this.updateInterval = 2; // Still limit updates for performance
      }
    }
    
    if (!this.isPaused) {
      // Update Earth rotation
      this.earth.update(deltaTime);
      
      // Update satellite network
      if (this.satelliteNetwork) {
        this.satelliteNetwork.update(deltaTime);
      }
      
      // Update ground station network
      if (this.groundStationNetwork) {
        this.groundStationNetwork.update(deltaTime);
      }
      
      // Only update visualization components on certain frames based on performance
      if (this.frameCount % this.updateInterval === 0) {
        // Update visualization components
        this.updateVisualization();
        this.updateGroundStationVisualization();
      }
      
      // Always update satellites for smooth movement
      this.satelliteManager.update(deltaTime);
      
      // Update enhanced walkable view if active
      if (this.enhancedVisualizationIntegration.isViewActive()) {
        this.enhancedVisualizationIntegration.update(deltaTime);
        
        // Update satellite positions for enhanced view
        if (this.satelliteNetwork && (!this.isLowPerformanceMode || this.frameCount % 2 === 0)) {
          const satellites = this.satelliteNetwork.getAllSatellites();
          const satellitePositions = satellites.map(sat => ({
            id: sat.id,
            position: new THREE.Vector3(sat.position.x, sat.position.y, sat.position.z)
          }));
          
          this.enhancedVisualizationIntegration.updateSatellitePositions(satellitePositions);
        }
      }
      
      // Update simple walkable view if active
      if (this.simpleWalkableView.isViewActive()) {
        this.simpleWalkableView.update(deltaTime);
      }
      
      // Update enhanced systems (if enabled)
      if (this.physicalSkySystem) {
        this.updateEnhancedSystems(deltaTime);
      }
      
      // Update enhanced ground station view if active
      if (this.enhancedGroundStationView.isWalkableViewActive()) {
        this.enhancedGroundStationView.update(deltaTime);
        
        // Update satellite tracking for enhanced view
        if (this.satelliteNetwork && (!this.isLowPerformanceMode || this.frameCount % 2 === 0)) {
          const satellites = this.satelliteNetwork.getAllSatellites();
          const satellitePositions = satellites.map(sat => ({
            id: sat.id,
            position: new THREE.Vector3(sat.position.x, sat.position.y, sat.position.z)
          }));
          
          this.enhancedGroundStationView.updateSatelliteVisibility(satellitePositions);
        }
      }
      
      // Update ground station first-person view if active - but less frequently in low performance mode
      if (this.groundStationView.isInFirstPersonMode() && this.satelliteNetwork && 
          (!this.isLowPerformanceMode || this.frameCount % 2 === 0)) {
        // Get all satellite positions for visibility calculation
        const satellites = this.satelliteNetwork.getAllSatellites();
        const satellitePositions = satellites.map(sat => ({
          id: sat.id,
          position: new THREE.Vector3(sat.position.x, sat.position.y, sat.position.z)
        }));
        
        // Update satellite visibility from ground station perspective
        this.groundStationView.updateSatelliteVisibility(satellitePositions, this.camera);
      }
    }
    
    // Render scene
    this.renderer.render(this.scene, this.camera);
  };

  private updateEnhancedSystems(deltaTime: number): void {
    // Update time-based lighting
    this.timeOfDayLighting.update(deltaTime);
    
    // Get current solar position for other systems
    const solarPosition = this.timeOfDayLighting.getSolarPosition();
    const sunVector = new THREE.Vector3(
      Math.cos(solarPosition.elevation) * Math.sin(solarPosition.azimuth),
      Math.sin(solarPosition.elevation),
      Math.cos(solarPosition.elevation) * Math.cos(solarPosition.azimuth)
    ).multiplyScalar(100000);
    
    // Update sky system with sun position
    this.physicalSkySystem.setLocation(40.7128, -74.0060); // Default coordinates
    this.physicalSkySystem.setTime(new Date());
    this.physicalSkySystem.update(deltaTime);
    
    // Update atmospheric scattering
    this.atmosphericScattering.updateSunPosition(sunVector);
    this.atmosphericScattering.update(deltaTime);
    
    // Update enhanced satellite system
    this.enhancedSatelliteSystem.setSunPosition(sunVector);
    this.enhancedSatelliteSystem.update(deltaTime);
    
    // Update volumetric beams
    this.volumetricBeamSystem.update(deltaTime);
    
    // Update realistic systems
    this.realisticGroundStation.updateTimeOfDay(solarPosition.elevation / (Math.PI / 2));
    this.hdrSatelliteRenderer.updateHDRExposure(solarPosition.elevation);
    this.realisticRFBeams.update(deltaTime);
    
    // Sync satellite data between systems
    this.syncSatelliteData();
    this.syncRealisticSatelliteData();
  }

  public enableEnhancedVisualization(): void {
    console.log('🚀 Enabling enhanced photorealistic systems...');
    if (!this.physicalSkySystem) {
      this.initializeEnhancedSystems();
    }
  }

  public disableEnhancedVisualization(): void {
    console.log('⚡ Disabling enhanced systems for performance...');
    if (this.physicalSkySystem) {
      this.physicalSkySystem.dispose();
      this.timeOfDayLighting.dispose();
      this.atmosphericScattering.dispose();
      this.enhancedSatelliteSystem.dispose();
      this.volumetricBeamSystem.dispose();
      
      // Clear references
      this.physicalSkySystem = null as any;
      this.timeOfDayLighting = null as any;
      this.atmosphericScattering = null as any;
      this.enhancedSatelliteSystem = null as any;
      this.volumetricBeamSystem = null as any;
      
      // Restore Earth visibility
      this.earth.getMesh().visible = true;
    }
  }

  private syncSatelliteData(): void {
    if (!this.satelliteNetwork) return;
    
    // Get satellites from network and update enhanced satellite system
    const satellites = this.satelliteNetwork.getAllSatellites();
    
    satellites.forEach(satellite => {
      const enhancedSatelliteData = {
        id: satellite.id,
        position: new THREE.Vector3(satellite.position.x, satellite.position.y, satellite.position.z),
        velocity: new THREE.Vector3(satellite.velocity.x, satellite.velocity.y, satellite.velocity.z),
        attitude: new THREE.Quaternion(), // Would be calculated from orbital mechanics
        type: satellite.type,
        size: 3.0, // Default size in meters
        albedo: 0.3, // Default albedo
        solarPanelArea: 20.0 // Default solar panel area in m²
      };
      
      this.enhancedSatelliteSystem.updateSatellitePosition(
        satellite.id, 
        enhancedSatelliteData.position,
        enhancedSatelliteData.attitude
      );
      
      // Create volumetric beams for satellite connections
      satellite.connections.satellites.forEach(connectedId => {
        const connectedSatellite = this.satelliteNetwork!.getSatellite(connectedId);
        if (connectedSatellite) {
          const beamId = `${satellite.id}-${connectedId}`;
          const beamConfig = {
            sourcePosition: enhancedSatelliteData.position,
            targetPosition: new THREE.Vector3(
              connectedSatellite.position.x,
              connectedSatellite.position.y,
              connectedSatellite.position.z
            ),
            beamWidth: 2.0, // degrees
            eirp: 50.0, // dBW
            frequency: 60.0, // GHz
            linkQuality: Math.random() * 0.5 + 0.5, // 0.5-1.0
            beamType: 'crosslink' as const
          };
          
          // Only create beam if it doesn't exist
          try {
            this.volumetricBeamSystem.updateBeam(beamId, beamConfig);
          } catch {
            this.volumetricBeamSystem.createBeam(beamId, beamConfig);
          }
        }
      });
    });
  }

  private syncRealisticSatelliteData(): void {
    if (!this.satelliteNetwork) return;
    
    const satellites = this.satelliteNetwork.getAllSatellites();
    const solarPosition = this.timeOfDayLighting.getSolarPosition();
    
    satellites.forEach(satellite => {
      const satellitePos = new THREE.Vector3(satellite.position.x, satellite.position.y, satellite.position.z);
      const observerPos = this.camera.position;
      const sunPos = new THREE.Vector3(
        Math.cos(solarPosition.elevation) * Math.sin(solarPosition.azimuth),
        Math.sin(solarPosition.elevation),
        Math.cos(solarPosition.elevation) * Math.cos(solarPosition.azimuth)
      ).multiplyScalar(100000);
      
      // Calculate realistic satellite visibility
      const visibility = this.hdrSatelliteRenderer.calculateSatelliteVisibility(
        satellitePos,
        observerPos,
        sunPos,
        solarPosition.elevation,
        0.3 // Default albedo
      );
      
      // Update HDR satellite rendering
      this.hdrSatelliteRenderer.updateSatellite(satellite.id, satellitePos, visibility);
      
      // Create realistic RF beams for satellite connections
      satellite.connections.satellites.forEach(connectedId => {
        const connectedSat = this.satelliteNetwork!.getSatellite(connectedId);
        if (connectedSat) {
          const beamId = `realistic_${satellite.id}-${connectedId}`;
          const targetPos = new THREE.Vector3(
            connectedSat.position.x,
            connectedSat.position.y,
            connectedSat.position.z
          );
          
          const beamConfig = {
            sourcePosition: satellitePos,
            targetPosition: targetPos,
            frequency: 60.0, // Ka-band for inter-satellite links
            eirp: 47.0, // dBW - realistic for Starlink
            beamwidth: 0.5, // degrees - narrow beam for space links
            polarization: 'circular' as const,
            modulation: '16APSK' as const,
            linkMargin: 15.0, // dB
            isActive: true,
            isAcquiring: Math.random() < 0.1 // 10% chance of acquisition mode
          };
          
          try {
            this.realisticRFBeams.updateBeam(beamId, beamConfig);
          } catch {
            this.realisticRFBeams.createBeam(beamId, beamConfig);
          }
        }
      });
      
      // Create ground station beams
      satellite.connections.groundStations.forEach(gsId => {
        const groundStation = this.groundStationManager.getGroundStation(gsId);
        if (groundStation) {
          const beamId = `gs_${satellite.id}-${gsId}`;
          const gsPos = this.earth.latLongToVector3(
            groundStation.position.latitude,
            groundStation.position.longitude,
            50 // Antenna height
          );
          
          const gsBeamConfig = {
            sourcePosition: gsPos,
            targetPosition: satellitePos,
            frequency: 14.0, // Ku-band uplink
            eirp: 65.0, // dBW - high power ground terminal
            beamwidth: 1.2, // degrees - ground station beam
            polarization: 'linear' as const,
            modulation: 'QPSK' as const,
            linkMargin: 8.0, // dB
            isActive: true,
            isAcquiring: false
          };
          
          try {
            this.realisticRFBeams.updateBeam(beamId, gsBeamConfig);
          } catch {
            this.realisticRFBeams.createBeam(beamId, gsBeamConfig);
          }
        }
      });
    });
  }
  
  private updateVisualization(): void {
    if (!this.satelliteNetwork) return;
    
    // Update satellite positions - process only a subset of satellites per frame for better performance
    const satellites = this.satelliteNetwork.getAllSatellites();
    const satelliteCount = satellites.length;
    
    // Significantly reduce satellites processed per frame
    const maxSatellitesToProcess = this.isLowPerformanceMode ? 20 : 40;
    
    // Process a rotating subset of satellites each frame to eventually update all
    const frameMultiplier = this.frameCount % 5 === 0 ? 2 : 1; // Change subset every 5 frames
    const startIdx = Math.floor(this.frameCount * frameMultiplier) % satelliteCount;
    
    for (let i = 0; i < maxSatellitesToProcess; i++) {
      const idx = (startIdx + i) % satelliteCount;
      const satellite = satellites[idx];
      
      // Convert Position to THREE.Vector3
      const position = new THREE.Vector3(satellite.position.x, satellite.position.y, satellite.position.z);
      this.satelliteManager.updateSatellitePositionById(satellite.id, position);
      
      // Update connections more frequently - reduced from i % 5 to i % 3
      if (i % 3 === 0) {
        // Clear existing connections
        this.satelliteManager.clearConnections(satellite.id);
        
        // Increased max connections from 2 to 4 for better visualization
        const maxConnections = Math.min(4, satellite.connections.satellites.length);
        for (let j = 0; j < maxConnections; j++) {
          const connectedId = satellite.connections.satellites[j];
          this.satelliteManager.addConnection(satellite.id, connectedId);
        }
        
        // Process ALL ground station connections for each satellite (removed i % 10 filter)
        if (satellite.connections.groundStations.length > 0) {
          // Process all ground station connections, not just the first one
          for (let k = 0; k < satellite.connections.groundStations.length; k++) {
            const groundStationId = satellite.connections.groundStations[k];
            const groundStation = this.groundStationManager.getGroundStation(groundStationId);
            if (groundStation) {
              // Calculate position on Earth's surface using Earth's latLongToVector3 method
              const position = this.earth.latLongToVector3(
                groundStation.position.latitude,
                groundStation.position.longitude,
                10 // Slight elevation above surface
              );
              this.satelliteManager.addGroundStationConnection(satellite.id, groundStationId, position);
            }
          }
        }
      }
    }
  }
  
  private updateGroundStationVisualization(): void {
    if (!this.groundStationNetwork) return;
    
    // Update ground station data
    const groundStations = this.groundStationNetwork.getAllGroundStations();
    groundStations.forEach(groundStation => {
      this.groundStationManager.updateGroundStation(groundStation);
    });
  }
  
  private handleResize = (): void => {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };
}
