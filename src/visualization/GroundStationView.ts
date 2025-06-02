import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { Earth } from './Earth';
import { GroundStationData } from '../models/GroundStationNetwork';

// Constants for coordinate system calculations
const J2000_EPOCH = new Date('2000-01-01T12:00:00Z');

export class GroundStationView {
  private scene: THREE.Scene;
  private earth: Earth;
  private groundStation: GroundStationData | null = null;
  private horizonMesh: THREE.Mesh;
  private skyDome: THREE.Mesh;
  private compass: THREE.Group;
  private satLabels: Map<string, THREE.Sprite> = new Map();
  private inFirstPersonMode: boolean = false;

  constructor(scene: THREE.Scene, earth: Earth) {
    this.scene = scene;
    this.earth = earth;
    
    // Create much larger horizon plane to extend to the actual horizon
    const horizonGeometry = new THREE.CircleGeometry(50000, 64);
    const horizonMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x1a1a1a, 
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.horizonMesh = new THREE.Mesh(horizonGeometry, horizonMaterial);
    this.horizonMesh.rotation.x = -Math.PI / 2; // Make it horizontal
    this.horizonMesh.visible = false;
    this.scene.add(this.horizonMesh);
    
    // Create larger sky dome that extends well into space
    const skyGeometry = new THREE.SphereGeometry(45000, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2);
    const skyMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x0a1a3f,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    });
    this.skyDome = new THREE.Mesh(skyGeometry, skyMaterial);
    this.skyDome.visible = false;
    this.scene.add(this.skyDome);
    
    // Create compass directions
    this.compass = this.createCompass();
    this.compass.visible = false;
    this.scene.add(this.compass);
  }
  
  // Create cardinal direction markers (N, E, S, W)
  private createCompass(): THREE.Group {
    const group = new THREE.Group();
    const radius = 44000; // Much larger to match sky dome
    const height = 1000;
    
    const directions = [
      { label: 'N', angle: 0, color: 0xff0000 },
      { label: 'E', angle: Math.PI / 2, color: 0xffff00 },
      { label: 'S', angle: Math.PI, color: 0xff0000 },
      { label: 'W', angle: Math.PI * 1.5, color: 0xffff00 }
    ];
    
    directions.forEach(dir => {
      // Create direction marker
      const geometry = new THREE.BoxGeometry(100, height, 100);
      const material = new THREE.MeshBasicMaterial({ color: dir.color });
      const marker = new THREE.Mesh(geometry, material);
      
      // Position at edge of horizon
      marker.position.x = Math.sin(dir.angle) * radius;
      marker.position.z = Math.cos(dir.angle) * radius;
      marker.position.y = height / 2;
      
      // Create text sprite for label
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.font = 'Bold 96px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(dir.label, 128, 128);
      }
      
      const texture = new THREE.CanvasTexture(canvas);
      const spriteMaterial = new THREE.SpriteMaterial({ 
        map: texture,
        transparent: true,
        depthWrite: false
      });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.scale.set(500, 500, 1);
      sprite.position.set(
        Math.sin(dir.angle) * (radius - 100),
        height + 400,
        Math.cos(dir.angle) * (radius - 100)
      );
      
      group.add(marker);
      group.add(sprite);
    });
    
    return group;
  }
  
  public setGroundStation(groundStation: GroundStationData | null): void {
    this.groundStation = groundStation;
    
    if (groundStation && this.inFirstPersonMode) {
      this.updateViewPosition();
    } else {
      this.hideFirstPersonView();
    }
  }
  
  public toggleFirstPersonMode(camera: THREE.PerspectiveCamera, controls: OrbitControls): void {
    this.inFirstPersonMode = !this.inFirstPersonMode;
    
    if (this.inFirstPersonMode && this.groundStation) {
      // Adjust camera settings for first-person view
      camera.fov = 75; // Wider FOV for more immersive first-person experience
      camera.near = 0.01; // Much closer near plane for ground-level view
      camera.far = 100000; // Far enough to see satellites
      camera.updateProjectionMatrix();
      
      // Store original camera parameters to restore later
      this.updateViewPosition(camera, controls);
      this.showFirstPersonView();
    } else {
      // Restore camera settings for global view
      camera.fov = 45;
      camera.near = 0.1;
      camera.far = 100000;
      camera.updateProjectionMatrix();
      
      this.hideFirstPersonView();
    }
  }
  
  public isInFirstPersonMode(): boolean {
    return this.inFirstPersonMode;
  }
  
  private updateViewPosition(camera?: THREE.PerspectiveCamera, controls?: OrbitControls): void {
    if (!this.groundStation) return;
    
    const { latitude, longitude } = this.groundStation.position;
    // Position camera at eye level above ground station (2m height)
    const stationPosition = this.earth.latLongToVector3(latitude, longitude, 2);
    
    if (camera && controls) {
      // Calculate up vector (radial from center of Earth)
      const up = stationPosition.clone().normalize();
      
      // Position camera at the ground station eye level
      camera.position.copy(stationPosition);
      
      // Calculate proper local coordinate system
      const northPole = new THREE.Vector3(0, 1, 0);
      const east = new THREE.Vector3().crossVectors(up, northPole).normalize();
      const north = new THREE.Vector3().crossVectors(east, up).normalize();
      
      // Set camera to look toward the horizon at 0 degrees elevation (straight ahead)
      const lookAtPoint = stationPosition.clone().add(north.multiplyScalar(10000));
      
      // Set proper camera orientation
      camera.up.copy(up);
      camera.lookAt(lookAtPoint);
      camera.updateMatrixWorld();
      
      // Update controls with proper settings for first-person view
      controls.target.copy(lookAtPoint);
      controls.enableRotate = true;
      controls.enableZoom = false;
      controls.enablePan = false;
      controls.minPolarAngle = 0;
      controls.maxPolarAngle = Math.PI / 2; // Only look up to zenith
      controls.update();
    }
    
    // Update horizon position and orientation
    this.horizonMesh.position.copy(stationPosition);
    this.skyDome.position.copy(stationPosition);
    this.compass.position.copy(stationPosition);
    
    // Orient horizon plane perpendicular to the radial vector
    const up = stationPosition.clone().normalize();
    const northPole = new THREE.Vector3(0, 1, 0);
    const east = new THREE.Vector3().crossVectors(up, northPole).normalize();
    const north = new THREE.Vector3().crossVectors(east, up).normalize();
    
    this.horizonMesh.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(east, up, north)
    );
    
    this.skyDome.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(east, up, north)
    );
    
    this.compass.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(east, up, north)
    );
  }
  
  public updateSatelliteVisibility(
    satellitePositions: Array<{ id: string, position: THREE.Vector3 }>,
    camera: THREE.PerspectiveCamera
  ): void {
    if (!this.inFirstPersonMode || !this.groundStation) return;
    
    // Get ground station position at eye level
    const { latitude, longitude } = this.groundStation.position;
    const stationPosition = this.earth.latLongToVector3(latitude, longitude, 2);
    
    // Update or create labels for satellites
    satellitePositions.forEach(sat => {
      // Convert from ECI to station-relative position for visualization
      const relativePos = this.eciToLocalHorizon(sat.position, stationPosition);
      
      // Check if satellite is above horizon (elevation > 5 degrees for realistic view)
      const elevation = this.calculateElevation(relativePos);
      const azimuth = this.calculateAzimuth(relativePos);
      
      // Enhanced visibility check accounting for RF obstructions and antenna constraints
      const minElevation = 5 * (Math.PI / 180); // 5 degrees minimum for most dishes
      const isVisible = this.checkSatelliteVisibility(elevation, azimuth, relativePos);
      
      if (elevation > minElevation && isVisible) {
        let sprite = this.satLabels.get(sat.id);
        if (!sprite) {
          // Create new sprite for this satellite
          sprite = this.createSatelliteLabel(sat.id, elevation, azimuth);
          this.satLabels.set(sat.id, sprite);
          this.scene.add(sprite);
        }
        
        // Position satellite realistically in the atmosphere/space
        // Use actual distance for very close satellites, but clamp for visual purposes
        const actualDistance = relativePos.length();
        const visualDistance = Math.min(actualDistance, 42000); // Clamp to sky dome size
        
        // Calculate position on sky dome or at actual distance if closer
        const satPosInSky = new THREE.Vector3(
          Math.sin(azimuth) * Math.cos(elevation) * visualDistance,
          Math.sin(elevation) * visualDistance,
          Math.cos(azimuth) * Math.cos(elevation) * visualDistance
        );
        
        sprite.position.copy(stationPosition.clone().add(satPosInSky));
        
        // Scale satellite based on distance and elevation for realism
        const distance = relativePos.length();
        const scaleFactor = Math.max(0.5, Math.min(2.0, 1000000 / distance));
        sprite.scale.set(scaleFactor * 500, scaleFactor * 500, 1);
        
        // Update satellite info for antenna tracking
        this.updateSatelliteTrackingInfo(sprite, elevation, azimuth, distance);
        
        sprite.visible = true;
      } else {
        // Hide if below horizon or blocked
        const sprite = this.satLabels.get(sat.id);
        if (sprite) {
          sprite.visible = false;
        }
      }
    });
  }
  
  // Check satellite visibility accounting for RF obstructions and antenna constraints
  private checkSatelliteVisibility(elevation: number, azimuth: number, relativePos: THREE.Vector3): boolean {
    // Simulate RF view mask obstructions (trees, buildings, fences, etc.)
    // In reality this would come from site survey data and FCC compliance database
    
    // Example: simulate some blocked azimuth ranges (buildings, trees, towers)
    const blockedRanges = [
      { azStart: 45 * (Math.PI / 180), azEnd: 75 * (Math.PI / 180), reason: 'building' },
      { azStart: 180 * (Math.PI / 180), azEnd: 200 * (Math.PI / 180), reason: 'tower' },
      { azStart: 270 * (Math.PI / 180), azEnd: 290 * (Math.PI / 180), reason: 'trees' }
    ];
    
    // Check if satellite is in a blocked azimuth range
    for (const range of blockedRanges) {
      if (azimuth >= range.azStart && azimuth <= range.azEnd) {
        return false; // Blocked by obstruction
      }
    }
    
    // Simulate antenna slewing constraints (dish can't track too fast)
    // Different antenna types have different constraints
    const antennaType = this.getAntennaTypeForStation();
    
    switch (antennaType) {
      case 'phased-array':
        // Phased arrays can track instantly but have FoV limits
        return elevation < 85 * (Math.PI / 180); // Can't track zenith well
        
      case 'parabolic':
        // Dish antennas have slewing rate limits
        return this.checkDishSlewing(elevation, azimuth);
        
      case 'helical':
        // Helical antennas good for LEO but limited range
        return elevation > 10 * (Math.PI / 180) && elevation < 80 * (Math.PI / 180);
        
      default:
        return true;
    }
  }
  
  // Get antenna type for current ground station (simplified)
  private getAntennaTypeForStation(): string {
    if (!this.groundStation) return 'parabolic';
    
    // In reality this would come from ground station configuration
    const antennaTypes = ['phased-array', 'parabolic', 'helical'];
    const hash = this.groundStation.id.charCodeAt(0) % antennaTypes.length;
    return antennaTypes[hash];
  }
  
  // Check if dish antenna can slew to track satellite
  private checkDishSlewing(elevation: number, azimuth: number): boolean {
    // Simplified slewing check - in reality this would track previous position
    // and calculate if slewing rate is within antenna capabilities
    
    // Most dishes can handle reasonable slewing but struggle with fast-moving LEO sats
    const maxSlewRate = 5 * (Math.PI / 180); // 5 degrees per second typical
    
    // For now, just check if satellite is in trackable range
    return elevation > 5 * (Math.PI / 180) && elevation < 85 * (Math.PI / 180);
  }
  
  // Update satellite tracking information for antenna systems
  private updateSatelliteTrackingInfo(sprite: THREE.Sprite, elevation: number, azimuth: number, distance: number): void {
    // Calculate signal strength based on elevation and distance
    const elevationDeg = elevation * (180 / Math.PI);
    const distanceKm = distance / 1000;
    
    // Higher elevation = better signal (less atmosphere)
    const elevationFactor = Math.sin(elevation);
    
    // Closer satellites = stronger signal
    const distanceFactor = 1 / (distanceKm / 550); // Normalize to 550km (Starlink altitude)
    
    // Calculate signal quality (simplified)
    const signalQuality = Math.min(1.0, elevationFactor * distanceFactor);
    
    // Color code satellite based on signal quality and antenna throughput
    const material = sprite.material as THREE.SpriteMaterial;
    if (signalQuality > 0.8) {
      material.color.set(0x00ff00); // Green for excellent signal
    } else if (signalQuality > 0.5) {
      material.color.set(0xffff00); // Yellow for good signal
    } else {
      material.color.set(0xff8800); // Orange for marginal signal
    }
    
    // Store tracking data for antenna pointing systems
    (sprite as any).trackingData = {
      elevation: elevationDeg,
      azimuth: azimuth * (180 / Math.PI),
      distance: distanceKm,
      signalQuality: signalQuality,
      antennaType: this.getAntennaTypeForStation()
    };
  }

  private createSatelliteLabel(id: string, elevation?: number, azimuth?: number): THREE.Sprite {
    // Create text canvas with enhanced info
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Set text properties
      ctx.fillStyle = '#00FFFF';
      ctx.font = 'Bold 28px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Draw satellite ID
      ctx.fillText(id, 256, 80);
      
      // Draw elevation/azimuth if provided
      if (elevation !== undefined && azimuth !== undefined) {
        ctx.font = '20px Arial';
        ctx.fillStyle = '#AAFFAA';
        const elevDeg = (elevation * 180 / Math.PI).toFixed(1);
        const azDeg = (azimuth * 180 / Math.PI).toFixed(1);
        ctx.fillText(`El: ${elevDeg}°`, 128, 140);
        ctx.fillText(`Az: ${azDeg}°`, 384, 140);
      }
      
      // Add satellite icon (larger, more visible)
      ctx.fillStyle = '#00FFFF';
      ctx.beginPath();
      ctx.arc(256, 180, 15, 0, Math.PI * 2);
      ctx.fill();
      
      // Add signal strength indicator (will be updated later)
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(256, 180, 25, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      sizeAttenuation: true
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(800, 400, 1);
    
    return sprite;
  }
  
  // Convert ECI (Earth-Centered Inertial) coordinates to local horizon coordinates
  private eciToLocalHorizon(eciPos: THREE.Vector3, stationPos: THREE.Vector3): THREE.Vector3 {
    // Calculate relative vector from station to satellite
    const relativeVector = new THREE.Vector3().subVectors(eciPos, stationPos);
    
    // Get station position unit vector (up direction)
    const up = stationPos.clone().normalize();
    
    // Calculate east and north directions for the station
    const northPole = new THREE.Vector3(0, 1, 0);
    const east = new THREE.Vector3().crossVectors(up, northPole).normalize();
    const north = new THREE.Vector3().crossVectors(east, up).normalize();
    
    // Project the relative vector onto the local coordinate system
    const localX = relativeVector.dot(east);    // East component
    const localY = relativeVector.dot(up);      // Up component
    const localZ = relativeVector.dot(north);   // North component
    
    return new THREE.Vector3(localX, localY, localZ);
  }
  
  // Calculate elevation angle from local horizon coordinates
  private calculateElevation(localPos: THREE.Vector3): number {
    const horizontalDist = Math.sqrt(localPos.x * localPos.x + localPos.z * localPos.z);
    return Math.atan2(localPos.y, horizontalDist);
  }
  
  // Calculate azimuth angle from local horizon coordinates (0=North, PI/2=East)
  private calculateAzimuth(localPos: THREE.Vector3): number {
    return Math.atan2(localPos.x, localPos.z);
  }
  
  private showFirstPersonView(): void {
    this.horizonMesh.visible = true;
    this.skyDome.visible = true;
    this.compass.visible = true;
    
    // Show satellite labels
    this.satLabels.forEach(sprite => {
      sprite.visible = true;
    });
  }
  
  private hideFirstPersonView(): void {
    this.inFirstPersonMode = false;
    this.horizonMesh.visible = false;
    this.skyDome.visible = false;
    this.compass.visible = false;
    
    // Hide all satellite labels
    this.satLabels.forEach(sprite => {
      sprite.visible = false;
    });
  }
  
  // Add atmospheric scattering effect for realism
  private addAtmosphericEffects(): void {
    // Create atmospheric glow around horizon
    const atmosphereGeometry = new THREE.SphereGeometry(44500, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const atmosphereMaterial = new THREE.MeshBasicMaterial({
      color: 0x6699ff,
      transparent: true,
      opacity: 0.15,
      side: THREE.BackSide,
      depthWrite: false
    });
    
    const atmosphereMesh = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    atmosphereMesh.visible = false;
    
    // Add to scene if not already added
    if (!this.scene.getObjectByName('atmosphere')) {
      atmosphereMesh.name = 'atmosphere';
      this.scene.add(atmosphereMesh);
    }
  }
  
  // Clean up resources
  public dispose(): void {
    this.scene.remove(this.horizonMesh);
    this.scene.remove(this.skyDome);
    this.scene.remove(this.compass);
    
    // Remove all satellite labels
    this.satLabels.forEach(sprite => {
      this.scene.remove(sprite);
    });
    this.satLabels.clear();
  }
}
