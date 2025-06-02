import * as THREE from 'three';

export interface SatelliteVisualConfig {
  satelliteId: string;
  modelScale: number;
  modelColor: THREE.Color;
  trailLength: number; // Number of trail points
  trailOpacity: number;
  labelVisible: boolean;
  labelDistance: number; // Max distance to show label
  blinkRate: number; // Hz for status LED
  iconSize: number; // Pixel size for distant view
}

export interface OrbitTrajectory {
  satelliteId: string;
  positions: THREE.Vector3[];
  timestamps: number[];
  currentIndex: number;
  period: number; // Orbital period in seconds
  lastUpdate: number;
}

export interface SatelliteStatus {
  id: string;
  active: boolean;
  linking: boolean;
  health: 'good' | 'degraded' | 'failed';
  signalStrength: number; // 0-1
  elevation: number; // degrees from observer
  azimuth: number; // degrees from observer
  range: number; // km from observer
  velocity: THREE.Vector3; // km/s
}

export interface VisibilityData {
  satelliteId: string;
  isVisible: boolean;
  elevation: number;
  azimuth: number;
  range: number;
  magnitude: number; // Visual magnitude
  nextPass?: {
    aos: number; // Acquisition of signal timestamp
    los: number; // Loss of signal timestamp
    maxElevation: number;
  };
}

export class SatelliteOverlaySystem {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private observerPosition: THREE.Vector3;
  
  // Satellite visual elements
  private satelliteModels: Map<string, THREE.Group> = new Map();
  private satelliteTrails: Map<string, THREE.Line> = new Map();
  private satelliteLabels: Map<string, THREE.Sprite> = new Map();
  private satelliteIcons: Map<string, THREE.Sprite> = new Map();
  
  // Orbital mechanics
  private trajectories: Map<string, OrbitTrajectory> = new Map();
  private visibilityCache: Map<string, VisibilityData> = new Map();
  
  // Time management
  private simulationTime: number = Date.now();
  private timeScale: number = 1; // Real-time multiplier
  private lastUpdateTime: number = 0;
  private updateFrequency: number = 30; // Hz
  
  // Visual configuration
  private globalConfig: {
    showTrails: boolean;
    showLabels: boolean;
    maxVisibleSatellites: number;
    fadeDistance: number; // km
    iconThreshold: number; // distance to switch to icons
    atmosphericExtinction: boolean;
  } = {
    showTrails: true,
    showLabels: true,
    maxVisibleSatellites: 100,
    fadeDistance: 5000, // 5000 km
    iconThreshold: 2000, // 2000 km
    atmosphericExtinction: true
  };
  
  // Performance optimization
  private frustum: THREE.Frustum = new THREE.Frustum();
  private modelLOD: Map<string, THREE.LOD> = new Map();
  private updateCounter: number = 0;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, observerPosition: THREE.Vector3) {
    this.scene = scene;
    this.camera = camera;
    this.observerPosition = observerPosition.clone();
    
    this.initializeSatelliteModels();
    this.setupPerformanceOptimization();
    
    console.log('SatelliteOverlaySystem initialized');
  }

  private initializeSatelliteModels(): void {
    // Create base satellite model - realistic Starlink v1.5 design
    this.createStarlinkSatelliteModel();
    
    // Create icon sprites for distant view
    this.createSatelliteIcons();
    
    // Initialize trail materials
    this.createTrailMaterials();
  }

  private createStarlinkSatelliteModel(): void {
    const satelliteGroup = new THREE.Group();
    
    // Main body (bus)
    const bodyGeometry = new THREE.BoxGeometry(1.15, 0.27, 5.2); // Realistic Starlink dimensions
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x2c2c2c,
      metalness: 0.8,
      roughness: 0.3
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    satelliteGroup.add(body);
    
    // Solar panels
    const panelGeometry = new THREE.BoxGeometry(2.8, 0.02, 8.1);
    const panelMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      metalness: 0.1,
      roughness: 0.9,
      emissive: new THREE.Color(0x000044),
      emissiveIntensity: 0.1
    });
    
    const panel1 = new THREE.Mesh(panelGeometry, panelMaterial);
    panel1.position.set(-1.5, 0, 0);
    satelliteGroup.add(panel1);
    
    const panel2 = new THREE.Mesh(panelGeometry, panelMaterial);
    panel2.position.set(1.5, 0, 0);
    satelliteGroup.add(panel2);
    
    // Phased array antennas
    const antennaGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 16);
    const antennaMaterial = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      metalness: 0.9,
      roughness: 0.1
    });
    
    // User terminal antenna (Earth-facing)
    const userAntenna = new THREE.Mesh(antennaGeometry, antennaMaterial);
    userAntenna.position.set(0, -0.2, 1);
    userAntenna.rotation.x = Math.PI / 2;
    satelliteGroup.add(userAntenna);
    
    // Gateway antenna (various orientations)
    const gatewayAntenna = new THREE.Mesh(antennaGeometry, antennaMaterial);
    gatewayAntenna.position.set(0, 0.2, -1);
    gatewayAntenna.rotation.x = -Math.PI / 2;
    satelliteGroup.add(gatewayAntenna);
    
    // Inter-satellite link antennas
    const islAntennaGeometry = new THREE.ConeGeometry(0.1, 0.3, 8);
    const islMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      metalness: 0.8,
      roughness: 0.2,
      emissive: new THREE.Color(0x332200),
      emissiveIntensity: 0.3
    });
    
    const islAntenna1 = new THREE.Mesh(islAntennaGeometry, islMaterial);
    islAntenna1.position.set(0, 0, 2.5);
    satelliteGroup.add(islAntenna1);
    
    const islAntenna2 = new THREE.Mesh(islAntennaGeometry, islMaterial);
    islAntenna2.position.set(0, 0, -2.5);
    islAntenna2.rotation.x = Math.PI;
    satelliteGroup.add(islAntenna2);
    
    // Status LEDs
    const ledGeometry = new THREE.SphereGeometry(0.02, 8, 8);
    const ledMaterial = new THREE.MeshStandardMaterial({
      color: 0x00ff00,
      emissive: new THREE.Color(0x004400),
      emissiveIntensity: 1.0
    });
    
    const statusLed = new THREE.Mesh(ledGeometry, ledMaterial);
    statusLed.position.set(0.5, 0.15, 2);
    satelliteGroup.add(statusLed);
    
    // Scale to appropriate size (actual Starlink satellites are quite small)
    satelliteGroup.scale.setScalar(3); // 3x scale for visibility
    
    // Store as template
    this.scene.add(satelliteGroup);
    satelliteGroup.visible = false;
    satelliteGroup.name = 'starlink_template';
  }

  private createSatelliteIcons(): void {
    // Create different icon types for various satellite states
    const iconCanvas = document.createElement('canvas');
    iconCanvas.width = 32;
    iconCanvas.height = 32;
    const ctx = iconCanvas.getContext('2d')!;
    
    // Active satellite icon
    ctx.clearRect(0, 0, 32, 32);
    ctx.fillStyle = '#00ff00';
    ctx.beginPath();
    ctx.arc(16, 16, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    const activeTexture = new THREE.CanvasTexture(iconCanvas);
    const activeMaterial = new THREE.SpriteMaterial({ 
      map: activeTexture,
      transparent: true
    });
    
    // Store template sprites
    this.scene.add(new THREE.Sprite(activeMaterial));
  }

  private createTrailMaterials(): void {
    // Create materials for orbital trails
    const trailMaterial = new THREE.LineBasicMaterial({
      color: 0x00aaff,
      transparent: true,
      opacity: 0.6,
      linewidth: 2
    });
    
    // Store for later use
  }

  private setupPerformanceOptimization(): void {
    // Set up LOD system for satellite models
    // Detailed model for close distances, simplified for far distances
  }

  public addSatellite(satelliteId: string, config: SatelliteVisualConfig): void {
    // Clone the template satellite model
    const template = this.scene.getObjectByName('starlink_template') as THREE.Group;
    if (!template) {
      console.error('Satellite template not found');
      return;
    }
    
    const satelliteModel = template.clone();
    satelliteModel.visible = true;
    satelliteModel.name = `satellite_${satelliteId}`;
    satelliteModel.scale.setScalar(config.modelScale);
    
    // Apply color customization
    satelliteModel.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        if (child.material.color) {
          child.material = child.material.clone();
          child.material.color.multiplyScalar(0.7).add(config.modelColor.clone().multiplyScalar(0.3));
        }
      }
    });
    
    this.scene.add(satelliteModel);
    this.satelliteModels.set(satelliteId, satelliteModel);
    
    // Create trail
    if (this.globalConfig.showTrails) {
      this.createSatelliteTrail(satelliteId, config);
    }
    
    // Create label
    if (this.globalConfig.showLabels) {
      this.createSatelliteLabel(satelliteId, config);
    }
    
    console.log(`Added satellite ${satelliteId} to overlay`);
  }

  private createSatelliteTrail(satelliteId: string, config: SatelliteVisualConfig): void {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < config.trailLength; i++) {
      points.push(new THREE.Vector3());
    }
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: config.modelColor,
      transparent: true,
      opacity: config.trailOpacity,
      linewidth: 2
    });
    
    const trail = new THREE.Line(geometry, material);
    trail.visible = this.globalConfig.showTrails;
    
    this.scene.add(trail);
    this.satelliteTrails.set(satelliteId, trail);
  }

  private createSatelliteLabel(satelliteId: string, config: SatelliteVisualConfig): void {
    // Create text sprite for satellite label
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(satelliteId, canvas.width / 2, 20);
    
    ctx.fillStyle = '#00ff00';
    ctx.font = '12px Arial';
    ctx.fillText('ACTIVE', canvas.width / 2, 40);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true
    });
    
    const label = new THREE.Sprite(material);
    label.scale.set(20, 5, 1);
    label.visible = this.globalConfig.showLabels;
    
    this.scene.add(label);
    this.satelliteLabels.set(satelliteId, label);
  }

  public setSatelliteTrajectory(satelliteId: string, positions: THREE.Vector3[], timestamps: number[]): void {
    const trajectory: OrbitTrajectory = {
      satelliteId,
      positions: [...positions],
      timestamps: [...timestamps],
      currentIndex: 0,
      period: timestamps[timestamps.length - 1] - timestamps[0],
      lastUpdate: Date.now()
    };
    
    this.trajectories.set(satelliteId, trajectory);
  }

  public updateSatelliteStatus(satelliteId: string, status: SatelliteStatus): void {
    const model = this.satelliteModels.get(satelliteId);
    if (!model) return;
    
    // Update visual appearance based on status
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.material instanceof THREE.MeshStandardMaterial) {
          // Update status LED color
          if (child.material.emissive) {
            switch (status.health) {
              case 'good':
                child.material.emissive.setHex(0x004400);
                break;
              case 'degraded':
                child.material.emissive.setHex(0x444400);
                break;
              case 'failed':
                child.material.emissive.setHex(0x440000);
                break;
            }
          }
        }
      }
    });
    
    // Update label information
    const label = this.satelliteLabels.get(satelliteId);
    if (label) {
      this.updateLabelText(satelliteId, status);
    }
    
    // Store visibility data
    const visibility: VisibilityData = {
      satelliteId,
      isVisible: status.elevation > 0,
      elevation: status.elevation,
      azimuth: status.azimuth,
      range: status.range,
      magnitude: this.calculateVisualMagnitude(status.range, status.elevation)
    };
    
    this.visibilityCache.set(satelliteId, visibility);
  }

  private updateLabelText(satelliteId: string, status: SatelliteStatus): void {
    const label = this.satelliteLabels.get(satelliteId);
    if (!label) return;
    
    // Recreate label canvas with updated information
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 80;
    const ctx = canvas.getContext('2d')!;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(satelliteId, canvas.width / 2, 18);
    
    // Status color
    const statusColor = status.health === 'good' ? '#00ff00' : 
                       status.health === 'degraded' ? '#ffff00' : '#ff0000';
    ctx.fillStyle = statusColor;
    ctx.font = '12px Arial';
    ctx.fillText(status.health.toUpperCase(), canvas.width / 2, 35);
    
    // Range and elevation
    ctx.fillStyle = '#cccccc';
    ctx.font = '10px Arial';
    ctx.fillText(`${status.range.toFixed(0)}km`, canvas.width / 2, 50);
    ctx.fillText(`${status.elevation.toFixed(1)}°`, canvas.width / 2, 65);
    
    const texture = new THREE.CanvasTexture(canvas);
    if (label.material instanceof THREE.SpriteMaterial) {
      label.material.map = texture;
      label.material.needsUpdate = true;
    }
  }

  private calculateVisualMagnitude(range: number, elevation: number): number {
    // Simplified visual magnitude calculation for satellites
    // Based on range and sun angle (elevation as approximation)
    const baseMagnitude = 4.0; // Typical satellite magnitude
    const rangeFactor = Math.log10(range / 400) * 2; // Dimmer with distance
    const elevationFactor = (90 - elevation) / 90 * 2; // Dimmer near horizon
    
    return baseMagnitude + rangeFactor + elevationFactor;
  }

  public setTimeScale(scale: number): void {
    this.timeScale = scale;
    console.log(`Satellite overlay time scale set to ${scale}x`);
  }

  public setSimulationTime(timestamp: number): void {
    this.simulationTime = timestamp;
  }

  public update(deltaTime: number): void {
    const currentTime = Date.now();
    
    // Update simulation time with time scale
    this.simulationTime += deltaTime * 1000 * this.timeScale;
    
    // Update at specified frequency
    this.updateCounter++;
    if (this.updateCounter % Math.floor(60 / this.updateFrequency) !== 0) return;
    
    // Update camera frustum for culling
    this.frustum.setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(
        this.camera.projectionMatrix,
        this.camera.matrixWorldInverse
      )
    );
    
    // Update all satellites
    this.updateSatellitePositions();
    this.updateVisibility();
    this.updateTrails();
    this.updateLabels();
    
    this.lastUpdateTime = currentTime;
  }

  private updateSatellitePositions(): void {
    this.trajectories.forEach((trajectory, satelliteId) => {
      const model = this.satelliteModels.get(satelliteId);
      if (!model) return;
      
      // Interpolate position based on simulation time
      const position = this.interpolateOrbitPosition(trajectory, this.simulationTime);
      if (position) {
        model.position.copy(position);
        
        // Orient satellite properly (solar panels toward sun, antennas toward Earth)
        this.orientSatellite(model, position);
      }
    });
  }

  private interpolateOrbitPosition(trajectory: OrbitTrajectory, time: number): THREE.Vector3 | null {
    if (trajectory.positions.length === 0) return null;
    
    // Normalize time to trajectory period
    const normalizedTime = (time - trajectory.timestamps[0]) % trajectory.period;
    const timeOffset = normalizedTime + trajectory.timestamps[0];
    
    // Find surrounding time points
    let index = 0;
    for (let i = 0; i < trajectory.timestamps.length - 1; i++) {
      if (trajectory.timestamps[i] <= timeOffset && timeOffset <= trajectory.timestamps[i + 1]) {
        index = i;
        break;
      }
    }
    
    // Linear interpolation between points
    const t1 = trajectory.timestamps[index];
    const t2 = trajectory.timestamps[index + 1] || trajectory.timestamps[index];
    const factor = t2 > t1 ? (timeOffset - t1) / (t2 - t1) : 0;
    
    const p1 = trajectory.positions[index];
    const p2 = trajectory.positions[index + 1] || trajectory.positions[index];
    
    return new THREE.Vector3().lerpVectors(p1, p2, factor);
  }

  private orientSatellite(model: THREE.Group, position: THREE.Vector3): void {
    // Point satellite toward Earth (nadir pointing)
    const earthDirection = new THREE.Vector3(0, 0, 0).sub(position).normalize();
    model.lookAt(earthDirection);
    
    // Add some rotation for realistic attitude
    model.rotateX(Math.PI / 2); // Align with satellite body axis
  }

  private updateVisibility(): void {
    this.visibilityCache.forEach((visibility, satelliteId) => {
      const model = this.satelliteModels.get(satelliteId);
      if (!model) return;
      
      // Check if satellite is above horizon
      const isAboveHorizon = visibility.elevation > 0;
      
      // Check if in camera frustum
      const inFrustum = this.frustum.containsPoint(model.position);
      
      // Apply atmospheric extinction
      let opacity = 1.0;
      if (this.globalConfig.atmosphericExtinction && visibility.elevation < 30) {
        // Reduce opacity near horizon due to atmospheric effects
        opacity = Math.max(0.1, visibility.elevation / 30);
      }
      
      // Distance-based LOD
      const distance = this.observerPosition.distanceTo(model.position);
      const useIcon = distance > this.globalConfig.iconThreshold;
      
      // Update visibility
      model.visible = isAboveHorizon && inFrustum && 
                     this.visibilityCache.size <= this.globalConfig.maxVisibleSatellites;
      
      // Update opacity
      model.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.Material) {
          child.material.transparent = true;
          child.material.opacity = opacity;
        }
      });
      
      // Update label visibility and distance scaling
      const label = this.satelliteLabels.get(satelliteId);
      if (label) {
        const labelDistance = this.camera.position.distanceTo(model.position);
        label.visible = model.visible && labelDistance < 1000 && this.globalConfig.showLabels;
        
        if (label.visible) {
          label.position.copy(model.position);
          label.position.y += 10; // Offset above satellite
          
          // Scale based on distance
          const scale = Math.max(0.5, Math.min(2.0, 1000 / labelDistance));
          label.scale.set(20 * scale, 5 * scale, 1);
        }
      }
    });
  }

  private updateTrails(): void {
    if (!this.globalConfig.showTrails) return;
    
    this.satelliteTrails.forEach((trail, satelliteId) => {
      const trajectory = this.trajectories.get(satelliteId);
      if (!trajectory) return;
      
      // Update trail points with recent positions
      const trailLength = 50; // Number of trail points
      const points: THREE.Vector3[] = [];
      
      for (let i = 0; i < trailLength; i++) {
        const timeOffset = this.simulationTime - (i * 10000); // 10 seconds between points
        const position = this.interpolateOrbitPosition(trajectory, timeOffset);
        if (position) {
          points.push(position);
        }
      }
      
      if (points.length > 1) {
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        trail.geometry = geometry;
        trail.visible = true;
      }
    });
  }

  private updateLabels(): void {
    // Labels are updated in updateVisibility method
  }

  public setObserverPosition(position: THREE.Vector3): void {
    this.observerPosition.copy(position);
  }

  public getVisibleSatellites(): VisibilityData[] {
    return Array.from(this.visibilityCache.values()).filter(v => v.isVisible);
  }

  public getSatellitePosition(satelliteId: string): THREE.Vector3 | null {
    const model = this.satelliteModels.get(satelliteId);
    return model ? model.position.clone() : null;
  }

  public setGlobalConfig(config: Partial<typeof this.globalConfig>): void {
    Object.assign(this.globalConfig, config);
    
    // Apply configuration changes
    this.satelliteTrails.forEach(trail => {
      trail.visible = this.globalConfig.showTrails;
    });
    
    this.satelliteLabels.forEach(label => {
      label.visible = this.globalConfig.showLabels;
    });
  }

  public removeSatellite(satelliteId: string): void {
    // Remove model
    const model = this.satelliteModels.get(satelliteId);
    if (model) {
      this.scene.remove(model);
      this.satelliteModels.delete(satelliteId);
    }
    
    // Remove trail
    const trail = this.satelliteTrails.get(satelliteId);
    if (trail) {
      this.scene.remove(trail);
      this.satelliteTrails.delete(satelliteId);
    }
    
    // Remove label
    const label = this.satelliteLabels.get(satelliteId);
    if (label) {
      this.scene.remove(label);
      this.satelliteLabels.delete(satelliteId);
    }
    
    // Remove trajectory
    this.trajectories.delete(satelliteId);
    this.visibilityCache.delete(satelliteId);
  }

  public dispose(): void {
    // Remove all satellites
    Array.from(this.satelliteModels.keys()).forEach(id => {
      this.removeSatellite(id);
    });
    
    // Remove template
    const template = this.scene.getObjectByName('starlink_template');
    if (template) {
      this.scene.remove(template);
    }
    
    console.log('SatelliteOverlaySystem disposed');
  }
}