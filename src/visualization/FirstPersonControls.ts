import * as THREE from 'three';
import { TerrainSystem } from './TerrainSystem';

export interface FirstPersonConfig {
  moveSpeed: number;
  lookSpeed: number;
  walkHeight: number;
  jumpHeight: number;
  gravity: number;
}

export class FirstPersonControls {
  private camera: THREE.PerspectiveCamera;
  private terrain: TerrainSystem | null = null;
  private config: FirstPersonConfig;
  
  // Movement state
  private velocity: THREE.Vector3 = new THREE.Vector3();
  private direction: THREE.Vector3 = new THREE.Vector3();
  private forward: boolean = false;
  private backward: boolean = false;
  private left: boolean = false;
  private right: boolean = false;
  private isJumping: boolean = false;
  private canJump: boolean = true;
  
  // Mouse/pointer lock
  private isLocked: boolean = false;
  private euler: THREE.Euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private PI_2: number = Math.PI / 2;
  
  // DOM elements
  private domElement: HTMLElement;
  private blocker!: HTMLElement;
  private instructions!: HTMLElement;
  
  // Events
  private onLock: () => void = () => {};
  private onUnlock: () => void = () => {};

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement, config?: Partial<FirstPersonConfig>) {
    this.camera = camera;
    this.domElement = domElement;
    
    this.config = {
      moveSpeed: 5.0, // Much slower for better control
      lookSpeed: 0.001, // Reduced mouse sensitivity  
      walkHeight: 1.8, // meters
      jumpHeight: 4.0, // Reduced jump height
      gravity: 9.81, // Realistic gravity
      ...config
    };
    
    // Create pointer lock UI
    this.createPointerLockUI();
    
    // Set up event listeners
    this.setupEventListeners();
    
    console.log('FirstPersonControls initialized');
  }

  private createPointerLockUI(): void {
    // Create blocker overlay
    this.blocker = document.createElement('div');
    this.blocker.style.position = 'absolute';
    this.blocker.style.top = '0';
    this.blocker.style.left = '0';
    this.blocker.style.width = '100%';
    this.blocker.style.height = '100%';
    this.blocker.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    this.blocker.style.zIndex = '1000';
    this.blocker.style.cursor = 'pointer';
    
    // Create instructions
    this.instructions = document.createElement('div');
    this.instructions.style.position = 'absolute';
    this.instructions.style.top = '50%';
    this.instructions.style.left = '50%';
    this.instructions.style.transform = 'translate(-50%, -50%)';
    this.instructions.style.color = 'white';
    this.instructions.style.fontFamily = 'Arial, sans-serif';
    this.instructions.style.fontSize = '18px';
    this.instructions.style.textAlign = 'center';
    this.instructions.style.padding = '20px';
    this.instructions.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    this.instructions.style.borderRadius = '10px';
    this.instructions.innerHTML = `
      <h2>🚶 First-Person Ground Station View</h2>
      <p><strong>Click to start walking around</strong></p>
      <div style="text-align: left; margin-top: 20px;">
        <p>🖱️ <strong>Mouse:</strong> Look around</p>
        <p>⌨️ <strong>WASD:</strong> Move forward/left/back/right</p>
        <p>🏃 <strong>Shift:</strong> Run faster</p>
        <p>🦘 <strong>Space:</strong> Jump</p>
        <p>🔓 <strong>ESC:</strong> Exit first-person mode</p>
      </div>
      <p style="margin-top: 20px; font-size: 14px; opacity: 0.8;">
        Walk around the ground station to see antennas, infrastructure,<br>
        and observe satellite tracking from ground level.
      </p>
    `;
    
    this.blocker.appendChild(this.instructions);
    this.domElement.appendChild(this.blocker);
    
    // Click to enable pointer lock
    this.blocker.addEventListener('click', () => {
      this.lock();
    });
  }

  private setupEventListeners(): void {
    // Pointer lock events
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('pointerlockerror', this.onPointerLockError);
    
    // Keyboard events
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    
    // Mouse movement
    document.addEventListener('mousemove', this.onMouseMove);
  }

  private onPointerLockChange = (): void => {
    if (document.pointerLockElement === this.domElement) {
      this.isLocked = true;
      this.blocker.style.display = 'none';
      this.onLock();
      console.log('Pointer locked - first-person mode active');
    } else {
      this.isLocked = false;
      this.blocker.style.display = 'block';
      this.onUnlock();
      console.log('Pointer unlocked - first-person mode inactive');
    }
  };

  private onPointerLockError = (): void => {
    console.error('Pointer lock failed');
    this.instructions.innerHTML = `
      <h2>❌ Pointer Lock Error</h2>
      <p>Unable to enable first-person controls.</p>
      <p>Please ensure your browser supports pointer lock.</p>
    `;
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.isLocked) return;
    
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW':
        this.forward = true;
        break;
      case 'ArrowLeft':
      case 'KeyA':
        this.left = true;
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.backward = true;
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.right = true;
        break;
      case 'Space':
        if (this.canJump) {
          this.velocity.y = this.config.jumpHeight;
          this.isJumping = true;
          this.canJump = false;
        }
        event.preventDefault();
        break;
      case 'Escape':
        this.unlock();
        break;
    }
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    if (!this.isLocked) return;
    
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW':
        this.forward = false;
        break;
      case 'ArrowLeft':
      case 'KeyA':
        this.left = false;
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.backward = false;
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.right = false;
        break;
    }
  };

  private onMouseMove = (event: MouseEvent): void => {
    if (!this.isLocked) return;
    
    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;
    
    this.euler.setFromQuaternion(this.camera.quaternion);
    
    this.euler.y -= movementX * this.config.lookSpeed;
    this.euler.x -= movementY * this.config.lookSpeed;
    
    // Clamp vertical look angle
    this.euler.x = Math.max(-this.PI_2, Math.min(this.PI_2, this.euler.x));
    
    this.camera.quaternion.setFromEuler(this.euler);
  };

  public setTerrain(terrain: TerrainSystem): void {
    this.terrain = terrain;
    console.log('Terrain system connected to first-person controls');
  }

  public lock(): void {
    this.domElement.requestPointerLock();
  }

  public unlock(): void {
    document.exitPointerLock();
  }

  public isActive(): boolean {
    return this.isLocked;
  }

  public setPosition(x: number, y: number, z: number): void {
    this.camera.position.set(x, y, z);
    this.camera.rotation.set(0, 0, 0);
    this.camera.up.set(0, 1, 0);
    this.velocity.set(0, 0, 0);
    this.euler.set(0, 0, 0);
  }

  public update(deltaTime: number): void {
    if (!this.isLocked) return;
    
    const delta = Math.min(deltaTime, 0.1); // Cap deltaTime to prevent large jumps
    
    // Check for running (shift key) - simplified for now
    const isRunning = false; // Disable running for stability
    const moveSpeed = this.config.moveSpeed * (isRunning ? 2 : 1);
    
    // Reset direction
    this.direction.set(0, 0, 0);
    
    // Calculate movement direction
    if (this.forward) this.direction.z -= 1;
    if (this.backward) this.direction.z += 1;
    if (this.left) this.direction.x -= 1;
    if (this.right) this.direction.x += 1;
    
    // Normalize diagonal movement
    if (this.direction.length() > 0) {
      this.direction.normalize();
    }
    
    // Apply camera orientation to movement direction
    const forward = new THREE.Vector3(0, 0, -1);
    const right = new THREE.Vector3(1, 0, 0);
    
    forward.applyQuaternion(this.camera.quaternion);
    right.applyQuaternion(this.camera.quaternion);
    
    // Remove Y component for ground movement
    forward.y = 0;
    right.y = 0;
    forward.normalize();
    right.normalize();
    
    // Calculate target velocity
    const targetVelocity = new THREE.Vector3();
    targetVelocity.addScaledVector(right, this.direction.x);
    targetVelocity.addScaledVector(forward, this.direction.z);
    targetVelocity.multiplyScalar(moveSpeed);
    
    // Apply smooth acceleration/deceleration
    const acceleration = 20.0; // m/s²
    const deceleration = 15.0; // m/s²
    
    if (this.direction.length() > 0) {
      // Accelerate towards target
      this.velocity.x += (targetVelocity.x - this.velocity.x) * Math.min(acceleration * delta, 1.0);
      this.velocity.z += (targetVelocity.z - this.velocity.z) * Math.min(acceleration * delta, 1.0);
    } else {
      // Decelerate to stop
      this.velocity.x *= Math.max(0, 1 - deceleration * delta);
      this.velocity.z *= Math.max(0, 1 - deceleration * delta);
    }
    
    // Apply gravity
    if (this.isJumping || !this.canJump) {
      this.velocity.y -= this.config.gravity * delta;
    }
    
    // Update position
    const movement = this.velocity.clone().multiplyScalar(delta);
    this.camera.position.add(movement);
    
    // Ground collision and terrain following
    this.handleGroundCollision();
    
    // Update jumping state
    if (this.isJumping && this.velocity.y <= 0 && this.canJump) {
      this.isJumping = false;
    }
  }

  private isKeyPressed(code: string): boolean {
    // Simple check for shift keys (could be enhanced)
    return false; // Simplified for now
  }

  private handleGroundCollision(): void {
    if (!this.terrain) {
      // Simple ground plane at y = 0
      if (this.camera.position.y <= this.config.walkHeight) {
        this.camera.position.y = this.config.walkHeight;
        this.velocity.y = 0;
        this.canJump = true;
        this.isJumping = false;
      }
      return;
    }
    
    // Get terrain elevation at current position
    const groundHeight = this.terrain.getElevationAt(
      this.camera.position.x,
      this.camera.position.z
    );
    
    const targetHeight = groundHeight + this.config.walkHeight;
    
    // Check if we're on or below ground
    if (this.camera.position.y <= targetHeight) {
      this.camera.position.y = targetHeight;
      this.velocity.y = 0;
      this.canJump = true;
      this.isJumping = false;
    }
  }

  // Event callbacks
  public setOnLock(callback: () => void): void {
    this.onLock = callback;
  }

  public setOnUnlock(callback: () => void): void {
    this.onUnlock = callback;
  }

  public dispose(): void {
    // Remove event listeners
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('pointerlockerror', this.onPointerLockError);
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    
    // Remove UI elements
    if (this.blocker && this.blocker.parentNode) {
      this.blocker.parentNode.removeChild(this.blocker);
    }
    
    // Unlock if currently locked
    if (this.isLocked) {
      this.unlock();
    }
    
    console.log('FirstPersonControls disposed');
  }
}