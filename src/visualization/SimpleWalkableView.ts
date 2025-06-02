import * as THREE from 'three';
import { GroundStationData } from '../models/GroundStationNetwork';

export class SimpleWalkableView {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private isActive: boolean = false;
  
  // Environment
  private groundPlane!: THREE.Mesh;
  private antennaGroup!: THREE.Group;
  private building!: THREE.Mesh;
  
  // Controls
  private keys: { [key: string]: boolean } = {};
  private mouseX: number = 0;
  private mouseY: number = 0;
  private isPointerLocked: boolean = false;
  
  // Movement - smoother settings
  private moveSpeed: number = 5; // Slower, more realistic
  private lookSpeed: number = 0.001; // Reduced mouse sensitivity
  private cameraHeight: number = 1.7;
  private damping: number = 0.1; // Add movement damping
  private velocity: THREE.Vector3 = new THREE.Vector3();
  
  // Info UI
  private infoDiv!: HTMLElement;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    
    this.createEnvironment();
    this.setupControls();
    this.createInfoUI();
  }

  private createEnvironment(): void {
    // Simple ground plane
    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x7d7d7d });
    this.groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
    this.groundPlane.rotation.x = -Math.PI / 2;
    this.groundPlane.receiveShadow = true;
    
    // Simple antenna (dish)
    this.antennaGroup = new THREE.Group();
    
    // Dish
    const dishGeometry = new THREE.SphereGeometry(4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const dishMaterial = new THREE.MeshLambertMaterial({ color: 0xdddddd });
    const dish = new THREE.Mesh(dishGeometry, dishMaterial);
    dish.position.y = 6;
    dish.castShadow = true;
    this.antennaGroup.add(dish);
    
    // Support post
    const postGeometry = new THREE.CylinderGeometry(0.2, 0.2, 6);
    const postMaterial = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const post = new THREE.Mesh(postGeometry, postMaterial);
    post.position.y = 3;
    post.castShadow = true;
    this.antennaGroup.add(post);
    
    this.antennaGroup.position.set(0, 0, 20);
    
    // Simple building
    const buildingGeometry = new THREE.BoxGeometry(10, 4, 6);
    const buildingMaterial = new THREE.MeshLambertMaterial({ color: 0x8b7355 });
    this.building = new THREE.Mesh(buildingGeometry, buildingMaterial);
    this.building.position.set(-15, 2, 0);
    this.building.castShadow = true;
    this.building.receiveShadow = true;
    
    // Properly balanced lighting for first-person view
    const ambientLight = new THREE.AmbientLight(0x404040, 0.3); // Reduced intensity
    this.scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6); // Reduced intensity
    directionalLight.position.set(50, 50, 50);
    directionalLight.castShadow = false; // Disable shadows for performance
    this.scene.add(directionalLight);
  }

  private setupControls(): void {
    // Keyboard events
    document.addEventListener('keydown', (event) => {
      if (!this.isActive) return;
      this.keys[event.code] = true;
      
      if (event.code === 'Escape') {
        this.exitView();
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

  private createInfoUI(): void {
    this.infoDiv = document.createElement('div');
    this.infoDiv.style.position = 'absolute';
    this.infoDiv.style.top = '20px';
    this.infoDiv.style.left = '20px';
    this.infoDiv.style.color = 'white';
    this.infoDiv.style.fontFamily = 'monospace';
    this.infoDiv.style.fontSize = '14px';
    this.infoDiv.style.backgroundColor = 'rgba(0,0,0,0.7)';
    this.infoDiv.style.padding = '10px';
    this.infoDiv.style.borderRadius = '5px';
    this.infoDiv.style.zIndex = '1000';
    this.infoDiv.style.display = 'none';
    document.body.appendChild(this.infoDiv);
  }

  private updateInfoUI(): void {
    if (!this.isActive) return;
    
    if (this.isPointerLocked) {
      this.infoDiv.innerHTML = `
        <div>🚶 Walking Mode Active</div>
        <div>WASD: Move | Mouse: Look</div>
        <div>ESC: Exit</div>
      `;
    } else {
      this.infoDiv.innerHTML = `
        <div>🖱️ Click to Start Walking</div>
        <div>ESC: Exit to Global View</div>
      `;
    }
  }

  public async activateView(groundStation: GroundStationData): Promise<void> {
    console.log('Activating simple walkable view for:', groundStation.name);
    
    this.isActive = true;
    
    // Add environment to scene
    this.scene.add(this.groundPlane);
    this.scene.add(this.antennaGroup);
    this.scene.add(this.building);
    
    // Position camera with better settings
    this.camera.position.set(0, this.cameraHeight, -30);
    this.camera.rotation.set(0, 0, 0);
    this.camera.fov = 75; // Better FOV for first-person
    this.camera.near = 0.1; // Much closer near plane
    this.camera.far = 1000; // Reasonable far plane for ground view
    this.camera.updateProjectionMatrix();
    this.mouseX = 0;
    this.mouseY = 0;
    
    // Show UI with detailed ground station info
    this.infoDiv.style.display = 'block';
    this.showGroundStationInfo(groundStation);
    this.updateInfoUI();
    
    console.log('Simple walkable view activated');
  }

  private showGroundStationInfo(groundStation: GroundStationData): void {
    const detailsDiv = document.createElement('div');
    detailsDiv.style.position = 'absolute';
    detailsDiv.style.top = '20px';
    detailsDiv.style.right = '20px';
    detailsDiv.style.padding = '15px';
    detailsDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    detailsDiv.style.color = 'white';
    detailsDiv.style.fontFamily = 'monospace';
    detailsDiv.style.fontSize = '12px';
    detailsDiv.style.borderRadius = '5px';
    detailsDiv.style.zIndex = '1000';
    detailsDiv.style.maxWidth = '300px';
    
    detailsDiv.innerHTML = `
      <h3>🛰️ ${groundStation.name}</h3>
      <div><strong>Location:</strong> ${groundStation.position.latitude.toFixed(4)}°, ${groundStation.position.longitude.toFixed(4)}°</div>
      ${groundStation.country ? `<div><strong>Country:</strong> ${groundStation.country}</div>` : ''}
      <div><strong>Status:</strong> ${groundStation.operationalStatus || groundStation.status}</div>
      ${groundStation.backhaul ? `<div><strong>Bandwidth:</strong> ${groundStation.backhaul.bandwidthGbps} Gbps</div>` : ''}
      ${groundStation.backhaul ? `<div><strong>Latency:</strong> ${groundStation.backhaul.latencyMs}ms</div>` : ''}
      ${groundStation.backhaul?.provider ? `<div><strong>Provider:</strong> ${groundStation.backhaul.provider}</div>` : ''}
      ${groundStation.antennaTypes ? `<div><strong>Antennas:</strong> ${groundStation.antennaTypes.join(', ')}</div>` : ''}
      ${groundStation.regulatoryFiling ? `<div><strong>Filing:</strong> ${groundStation.regulatoryFiling}</div>` : ''}
      <div style="margin-top: 10px;">
        <div><strong>Connected Satellites:</strong> ${groundStation.connections.satellites.length}</div>
      </div>
    `;
    
    document.body.appendChild(detailsDiv);
  }

  public async exitView(): Promise<void> {
    console.log('Exiting simple walkable view');
    
    this.isActive = false;
    this.isPointerLocked = false;
    
    // Remove environment from scene
    this.scene.remove(this.groundPlane);
    this.scene.remove(this.antennaGroup);
    this.scene.remove(this.building);
    
    // Hide UI
    this.infoDiv.style.display = 'none';
    
    // Exit pointer lock
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    
    // Reset camera
    this.camera.position.set(0, 0, 20000);
    this.camera.rotation.set(0, 0, 0);
    
    console.log('Simple walkable view exited');
  }

  public update(deltaTime: number): void {
    if (!this.isActive) return;
    
    // Smooth camera rotation from mouse with proper clamping
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = -this.mouseX;
    this.camera.rotation.x = Math.max(-Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1, -this.mouseY));
    
    // Smooth movement with damping
    const moveVector = new THREE.Vector3();
    
    if (this.keys['KeyW']) moveVector.z -= 1;
    if (this.keys['KeyS']) moveVector.z += 1;
    if (this.keys['KeyA']) moveVector.x -= 1;
    if (this.keys['KeyD']) moveVector.x += 1;
    
    if (moveVector.length() > 0) {
      moveVector.normalize();
      
      // Apply camera rotation to movement direction
      const forward = new THREE.Vector3(0, 0, -1);
      const right = new THREE.Vector3(1, 0, 0);
      
      forward.applyQuaternion(this.camera.quaternion);
      right.applyQuaternion(this.camera.quaternion);
      
      // Remove Y component for ground-based movement
      forward.y = 0;
      right.y = 0;
      forward.normalize();
      right.normalize();
      
      // Calculate target velocity
      const targetVelocity = new THREE.Vector3();
      targetVelocity.addScaledVector(right, moveVector.x);
      targetVelocity.addScaledVector(forward, moveVector.z);
      targetVelocity.multiplyScalar(this.moveSpeed);
      
      // Apply damping for smooth movement
      this.velocity.lerp(targetVelocity, this.damping);
    } else {
      // Apply friction when no input
      this.velocity.multiplyScalar(0.9);
    }
    
    // Apply movement
    const movement = this.velocity.clone().multiplyScalar(deltaTime);
    this.camera.position.add(movement);
    this.camera.position.y = this.cameraHeight; // Keep at eye level
    
    // Smoother boundary check with gradual slowdown
    const boundary = 90;
    if (Math.abs(this.camera.position.x) > boundary) {
      this.camera.position.x = Math.sign(this.camera.position.x) * boundary;
      this.velocity.x *= -0.5; // Bounce back with reduced velocity
    }
    if (Math.abs(this.camera.position.z) > boundary) {
      this.camera.position.z = Math.sign(this.camera.position.z) * boundary;
      this.velocity.z *= -0.5; // Bounce back with reduced velocity
    }
  }

  public isViewActive(): boolean {
    return this.isActive;
  }

  public dispose(): void {
    // Remove UI
    if (this.infoDiv && this.infoDiv.parentNode) {
      this.infoDiv.parentNode.removeChild(this.infoDiv);
    }
    
    // Remove environment
    if (this.isActive) {
      this.exitView();
    }
    
    // Clean up geometries and materials
    this.groundPlane?.geometry.dispose();
    (this.groundPlane?.material as THREE.Material)?.dispose();
    
    this.antennaGroup?.children.forEach(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
    
    this.building?.geometry.dispose();
    (this.building?.material as THREE.Material)?.dispose();
  }
}