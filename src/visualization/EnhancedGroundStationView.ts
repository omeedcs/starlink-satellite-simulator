import * as THREE from 'three';
import { GroundStationData } from '../models/GroundStationNetwork';
import { TerrainSystem, TerrainConfig } from './TerrainSystem';
import { FirstPersonControls, FirstPersonConfig } from './FirstPersonControls';
import { GroundStationInfrastructure, InfrastructureConfig, AntennaConfig } from './GroundStationInfrastructure';
import { TimeOfDayLighting, TimeOfDayConfig } from './TimeOfDayLighting';

export interface GroundStationEnvironmentConfig {
  terrainSize: number;
  terrainResolution: number;
  elevationScale: number;
  enableWeatherEffects: boolean;
  enableSignalBeams: boolean;
  timeScale: number;
}

export class EnhancedGroundStationView {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private groundStation: GroundStationData | null = null;
  
  // High-fidelity systems
  private terrain: TerrainSystem | null = null;
  private firstPersonControls: FirstPersonControls | null = null;
  private infrastructure: GroundStationInfrastructure | null = null;
  private lighting: TimeOfDayLighting | null = null;
  
  // Environment
  private environmentGroup: THREE.Group;
  private weatherEffects: THREE.Group;
  private signalVisualization: Map<string, THREE.Mesh> = new Map();
  
  // State
  private isActive: boolean = false;
  private config: GroundStationEnvironmentConfig;
  
  // UI Elements
  private infoPanel!: HTMLElement;
  private timePanel!: HTMLElement;
  
  constructor(
    scene: THREE.Scene, 
    camera: THREE.PerspectiveCamera, 
    renderer: THREE.WebGLRenderer,
    config?: Partial<GroundStationEnvironmentConfig>
  ) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    
    this.config = {
      terrainSize: 1000, // 1km x 1km terrain
      terrainResolution: 512,
      elevationScale: 50,
      enableWeatherEffects: true,
      enableSignalBeams: true,
      timeScale: 60, // 1 hour per minute
      ...config
    };
    
    this.environmentGroup = new THREE.Group();
    this.weatherEffects = new THREE.Group();
    this.scene.add(this.environmentGroup);
    this.scene.add(this.weatherEffects);
    
    this.createUI();
    
    console.log('Enhanced Ground Station View initialized');
  }

  public async activateWalkableView(groundStation: GroundStationData): Promise<void> {
    if (this.isActive) {
      await this.deactivateWalkableView();
    }
    
    console.log(`🚶 Activating walkable view for ${groundStation.name}`);
    this.groundStation = groundStation;
    this.isActive = true;
    
    // Create terrain system centered on ground station
    await this.createTerrain();
    
    // Build realistic infrastructure
    await this.createInfrastructure();
    
    // Setup basic lighting (disabled complex lighting for stability)
    // this.createLighting();
    
    // Initialize first-person controls
    this.createFirstPersonControls();
    
    // Add environmental effects (disabled for stability)
    // if (this.config.enableWeatherEffects) {
    //   this.createWeatherEffects();
    // }
    
    // Position camera at ground station entrance
    this.positionCameraAtEntrance();
    
    // Show UI
    this.showUI();
    
    console.log('✅ Walkable ground station environment ready');
  }

  private async createTerrain(): Promise<void> {
    if (!this.groundStation) return;
    
    console.log('🌍 Creating high-fidelity terrain...');
    
    const terrainConfig: TerrainConfig = {
      centerLat: this.groundStation.position.latitude,
      centerLon: this.groundStation.position.longitude,
      size: this.config.terrainSize,
      resolution: this.config.terrainResolution,
      elevationScale: this.config.elevationScale
    };
    
    this.terrain = new TerrainSystem(terrainConfig);
    this.environmentGroup.add(this.terrain.getMesh());
    
    // Add access road to ground station
    this.terrain.addRoad(-400, -400, 0, 0, 8); // Road from edge to center
    
    console.log('✅ Terrain system created');
  }

  private async createInfrastructure(): Promise<void> {
    if (!this.groundStation) return;
    
    console.log('🏗️ Building realistic ground station infrastructure...');
    
    // Define antenna configurations based on ground station type
    const antennas: AntennaConfig[] = this.generateAntennaConfiguration();
    
    const infrastructureConfig: InfrastructureConfig = {
      position: new THREE.Vector3(0, 0, 0), // Center of terrain
      orientation: 0,
      antennas: antennas,
      includeBuildingsAndUtilities: true
    };
    
    this.infrastructure = new GroundStationInfrastructure(infrastructureConfig);
    this.environmentGroup.add(this.infrastructure.getGroup());
    
    console.log('✅ Infrastructure built with', antennas.length, 'antennas');
  }

  private generateAntennaConfiguration(): AntennaConfig[] {
    const antennas: AntennaConfig[] = [];
    
    // Just one main antenna for simplicity
    antennas.push({
      type: 'parabolic',
      position: new THREE.Vector3(0, 0, 30),
      rotation: new THREE.Euler(0, 0, 0),
      scale: 1.0,
      trackingEnabled: false // Disable tracking for stability
    });
    
    return antennas;
  }

  private createLighting(): void {
    if (!this.groundStation) return;
    
    console.log('☀️ Setting up realistic time-of-day lighting...');
    
    const lightingConfig: TimeOfDayConfig = {
      latitude: this.groundStation.position.latitude,
      longitude: this.groundStation.position.longitude,
      elevation: 0,
      timeZone: this.getTimezoneFromCoordinates(this.groundStation.position),
      date: new Date(),
      timeScale: this.config.timeScale,
      atmospheric: {
        turbidity: 2.0,
        visibility: 50.0,
        humidity: 0.6,
        pressure: 1013.25,
        temperature: 15.0
      }
    };
    
    this.lighting = new TimeOfDayLighting(this.scene, lightingConfig, this.renderer);
    
    console.log('✅ Lighting system configured');
  }

  private createFirstPersonControls(): void {
    console.log('🎮 Setting up first-person controls...');
    
    const controlsConfig: FirstPersonConfig = {
      moveSpeed: 4.0, // More realistic walking speed
      lookSpeed: 0.0008, // Further reduced mouse sensitivity
      walkHeight: 1.8, // 1.8m eye height
      jumpHeight: 1.5, // Lower jump height for realism
      gravity: 9.81
    };
    
    this.firstPersonControls = new FirstPersonControls(
      this.camera, 
      this.renderer.domElement, 
      controlsConfig
    );
    
    // Connect terrain for height following
    if (this.terrain) {
      this.firstPersonControls.setTerrain(this.terrain);
    }
    
    // Set up events
    this.firstPersonControls.setOnLock(() => {
      console.log('👤 First-person mode activated');
      this.updateInfoPanel('First-person mode active - WASD to move, mouse to look');
    });
    
    this.firstPersonControls.setOnUnlock(() => {
      console.log('👤 First-person mode deactivated');
      this.updateInfoPanel('Click to re-enter first-person mode');
    });
    
    console.log('✅ First-person controls ready');
  }

  private createWeatherEffects(): void {
    console.log('🌦️ Adding environmental weather effects...');
    
    // Atmospheric haze
    this.createAtmosphericHaze();
    
    // Optional: Wind effects on vegetation
    this.createWindEffects();
    
    // Optional: Particle systems for rain/snow (disabled by default)
    // this.createPrecipitation();
    
    console.log('✅ Weather effects added');
  }

  private createAtmosphericHaze(): void {
    const hazeGeometry = new THREE.SphereGeometry(800, 16, 8);
    const hazeMaterial = new THREE.MeshBasicMaterial({
      color: 0xaabbcc,
      transparent: true,
      opacity: 0.1,
      side: THREE.BackSide,
      fog: false
    });
    
    const haze = new THREE.Mesh(hazeGeometry, hazeMaterial);
    this.weatherEffects.add(haze);
  }

  private createWindEffects(): void {
    // Add subtle animation to vegetation/flags
    // This would animate any vegetation meshes with wind sway
    // Implementation depends on specific vegetation models
  }

  private positionCameraAtEntrance(): void {
    if (!this.groundStation) return;
    
    // Position camera at a reasonable entrance point
    const entrancePosition = new THREE.Vector3(0, 2, -50);
    
    // Get terrain elevation at entrance
    if (this.terrain) {
      const groundHeight = this.terrain.getElevationAt(entrancePosition.x, entrancePosition.z);
      entrancePosition.y = Math.max(groundHeight + 1.8, 2); // Eye height above ground, minimum 2m
    }
    
    // Set camera position directly (before first-person controls take over)
    this.camera.position.copy(entrancePosition);
    this.camera.rotation.set(0, 0, 0); // Reset rotation
    this.camera.up.set(0, 1, 0); // Ensure up is Y-axis
    
    // Look towards the facility center
    this.camera.lookAt(new THREE.Vector3(0, entrancePosition.y, 0));
    
    if (this.firstPersonControls) {
      this.firstPersonControls.setPosition(
        entrancePosition.x,
        entrancePosition.y,
        entrancePosition.z
      );
    }
    
    console.log('📍 Camera positioned at facility entrance:', entrancePosition);
  }

  private createUI(): void {
    // Info panel
    this.infoPanel = document.createElement('div');
    this.infoPanel.style.position = 'absolute';
    this.infoPanel.style.top = '20px';
    this.infoPanel.style.left = '20px';
    this.infoPanel.style.padding = '15px';
    this.infoPanel.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    this.infoPanel.style.color = 'white';
    this.infoPanel.style.fontFamily = 'Arial, sans-serif';
    this.infoPanel.style.fontSize = '14px';
    this.infoPanel.style.borderRadius = '8px';
    this.infoPanel.style.maxWidth = '300px';
    this.infoPanel.style.zIndex = '1000';
    this.infoPanel.style.display = 'none';
    
    // Time panel
    this.timePanel = document.createElement('div');
    this.timePanel.style.position = 'absolute';
    this.timePanel.style.top = '20px';
    this.timePanel.style.right = '20px';
    this.timePanel.style.padding = '10px';
    this.timePanel.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    this.timePanel.style.color = 'white';
    this.timePanel.style.fontFamily = 'Arial, sans-serif';
    this.timePanel.style.fontSize = '12px';
    this.timePanel.style.borderRadius = '8px';
    this.timePanel.style.zIndex = '1000';
    this.timePanel.style.display = 'none';
    
    document.body.appendChild(this.infoPanel);
    document.body.appendChild(this.timePanel);
  }

  private showUI(): void {
    if (!this.groundStation) return;
    
    this.infoPanel.style.display = 'block';
    this.timePanel.style.display = 'block';
    
    this.infoPanel.innerHTML = `
      <h3>🛰️ ${this.groundStation.name}</h3>
      <p><strong>Location:</strong> ${this.groundStation.position.latitude.toFixed(4)}°, ${this.groundStation.position.longitude.toFixed(4)}°</p>
      <p><strong>Status:</strong> ${this.groundStation.status}</p>
      <p><strong>Bandwidth:</strong> ${this.groundStation.bandwidth} Mbps</p>
      <p><strong>Connected Satellites:</strong> ${this.groundStation.connections.satellites.length}</p>
      <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #444;">
        <p style="margin: 0; font-style: italic;">Click to enter first-person mode and walk around the facility</p>
      </div>
    `;
  }

  private hideUI(): void {
    this.infoPanel.style.display = 'none';
    this.timePanel.style.display = 'none';
  }

  private updateInfoPanel(message: string): void {
    if (this.infoPanel && this.groundStation) {
      const messageDiv = this.infoPanel.querySelector('div') || document.createElement('div');
      messageDiv.innerHTML = `<p style="margin: 0; font-style: italic; color: #88ff88;">${message}</p>`;
      
      if (!this.infoPanel.contains(messageDiv)) {
        this.infoPanel.appendChild(messageDiv);
      }
    }
  }

  private getTimezoneFromCoordinates(position: { latitude: number; longitude: number }): number {
    // Simplified timezone estimation based on longitude
    // In production, use a proper timezone API or library
    return Math.round(position.longitude / 15);
  }

  public update(deltaTime: number): void {
    if (!this.isActive) return;
    
    // Update first-person controls
    if (this.firstPersonControls) {
      this.firstPersonControls.update(deltaTime);
    }
    
    // Update lighting system
    if (this.lighting) {
      this.lighting.update(deltaTime);
      
      // Update time panel
      const timeInfo = this.lighting.getCurrentTimeInfo();
      if (this.timePanel) {
        this.timePanel.innerHTML = `
          <div><strong>⏰ ${timeInfo.time}</strong></div>
          <div>☀️ Sun: ${timeInfo.sunElevation.toFixed(1)}°</div>
          <div>🌅 ${timeInfo.phase}</div>
        `;
      }
    }
    
    // Update satellite tracking if enabled
    this.updateSatelliteTracking();
    
    // Update signal beam visualization
    if (this.config.enableSignalBeams) {
      this.updateSignalBeams();
    }
  }

  private updateSatelliteTracking(): void {
    // This would integrate with the main satellite system to track visible satellites
    // and animate antenna pointing accordingly
    // Implementation depends on integration with SatelliteManager
  }

  private updateSignalBeams(): void {
    // Animate signal beams between antennas and satellites
    // This would show the communication links visually
  }

  public updateSatelliteVisibility(
    satellitePositions: Array<{ id: string, position: THREE.Vector3 }>
  ): void {
    if (!this.isActive || !this.infrastructure) return;
    
    // For each visible satellite, point the appropriate antenna
    satellitePositions.forEach((sat, index) => {
      if (index < 3) { // Only track with first 3 antennas
        const antennaId = `antenna_${index}`;
        
        // Calculate azimuth and elevation to satellite
        const satDirection = sat.position.clone().normalize();
        const azimuth = Math.atan2(satDirection.x, satDirection.z);
        const elevation = Math.asin(satDirection.y);
        
        // Update antenna tracking
        if (this.infrastructure) {
          this.infrastructure.trackSatellite(antennaId, azimuth, elevation);
          
          // Show signal beam if enabled
          if (this.config.enableSignalBeams) {
            this.infrastructure.setSignalBeamVisible(antennaId, true);
          }
        }
      }
    });
  }

  public async deactivateWalkableView(): Promise<void> {
    if (!this.isActive) return;
    
    console.log('🚶 Deactivating walkable ground station view');
    
    this.isActive = false;
    this.groundStation = null;
    
    // Dispose of systems
    if (this.firstPersonControls) {
      this.firstPersonControls.dispose();
      this.firstPersonControls = null;
    }
    
    if (this.terrain) {
      this.terrain.dispose();
      this.terrain = null;
    }
    
    if (this.infrastructure) {
      this.infrastructure.dispose();
      this.infrastructure = null;
    }
    
    if (this.lighting) {
      this.lighting.dispose();
      this.lighting = null;
    }
    
    // Clear environment
    this.environmentGroup.clear();
    this.weatherEffects.clear();
    
    // Hide UI
    this.hideUI();
    
    console.log('✅ Walkable view deactivated');
  }

  public isWalkableViewActive(): boolean {
    return this.isActive;
  }

  public getCurrentGroundStation(): GroundStationData | null {
    return this.groundStation;
  }

  // Control methods for external integration
  public setTimeScale(scale: number): void {
    this.config.timeScale = scale;
    if (this.lighting) {
      this.lighting.setTimeScale(scale);
    }
  }

  public setTime(date: Date): void {
    if (this.lighting) {
      this.lighting.setTime(date);
    }
  }

  public toggleWeatherEffects(enabled: boolean): void {
    this.config.enableWeatherEffects = enabled;
    this.weatherEffects.visible = enabled;
  }

  public toggleSignalBeams(enabled: boolean): void {
    this.config.enableSignalBeams = enabled;
    // Update all signal beam visibility
    if (this.infrastructure) {
      for (let i = 0; i < 5; i++) {
        this.infrastructure.setSignalBeamVisible(`antenna_${i}`, enabled);
      }
    }
  }

  public dispose(): void {
    this.deactivateWalkableView();
    
    // Remove UI elements
    if (this.infoPanel && this.infoPanel.parentNode) {
      this.infoPanel.parentNode.removeChild(this.infoPanel);
    }
    if (this.timePanel && this.timePanel.parentNode) {
      this.timePanel.parentNode.removeChild(this.timePanel);
    }
    
    // Remove from scene
    this.scene.remove(this.environmentGroup);
    this.scene.remove(this.weatherEffects);
    
    console.log('Enhanced Ground Station View disposed');
  }
}