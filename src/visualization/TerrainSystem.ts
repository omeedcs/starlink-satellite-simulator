import * as THREE from 'three';

export interface TerrainConfig {
  centerLat: number;
  centerLon: number;
  size: number; // Size in meters
  resolution: number; // Heightmap resolution (e.g., 256, 512, 1024)
  elevationScale: number; // Vertical scale multiplier
}

export class TerrainSystem {
  private mesh: THREE.Mesh;
  private geometry: THREE.PlaneGeometry;
  private material: THREE.MeshStandardMaterial;
  private heightData: Float32Array;
  private config: TerrainConfig;
  private textureLoader: THREE.TextureLoader;

  constructor(config: TerrainConfig) {
    this.config = config;
    this.textureLoader = new THREE.TextureLoader();
    
    // Create geometry with high resolution for detailed displacement
    this.geometry = new THREE.PlaneGeometry(
      config.size, 
      config.size, 
      config.resolution - 1, 
      config.resolution - 1
    );
    
    // Initialize height data array
    this.heightData = new Float32Array(config.resolution * config.resolution);
    
    // Create PBR material with placeholder textures
    this.material = new THREE.MeshStandardMaterial({
      color: 0x8B7355, // Earth tone base color
      roughness: 0.8,
      metalness: 0.0,
      side: THREE.DoubleSide
    });
    
    // Create mesh
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.rotation.x = -Math.PI / 2; // Make horizontal
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    
    // Initialize with procedural heightmap
    this.generateProceduralHeightmap();
    this.loadTerrainTextures();
  }

  // Generate procedural heightmap when real elevation data isn't available
  private generateProceduralHeightmap(): void {
    const { resolution, elevationScale } = this.config;
    
    console.log('Generating procedural terrain heightmap...');
    
    // Generate noise-based terrain
    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const index = y * resolution + x;
        
        // Normalize coordinates
        const nx = (x / resolution) * 2 - 1;
        const ny = (y / resolution) * 2 - 1;
        
        // Multiple octaves of noise for realistic terrain
        let height = 0;
        height += this.noise(nx * 4, ny * 4) * 0.5;
        height += this.noise(nx * 8, ny * 8) * 0.25;
        height += this.noise(nx * 16, ny * 16) * 0.125;
        height += this.noise(nx * 32, ny * 32) * 0.0625;
        
        // Add some rolling hills bias
        const distance = Math.sqrt(nx * nx + ny * ny);
        height += Math.cos(distance * Math.PI) * 0.2;
        
        // Apply elevation scale and add base level
        this.heightData[index] = height * elevationScale + 10; // Base 10m elevation
      }
    }
    
    this.applyHeightmapToGeometry();
  }

  // Simple noise function for procedural generation
  private noise(x: number, y: number): number {
    // Simple hash-based noise
    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return (n - Math.floor(n)) * 2 - 1;
  }

  // Apply heightmap data to geometry vertices
  private applyHeightmapToGeometry(): void {
    const { resolution } = this.config;
    const positions = this.geometry.attributes.position;
    
    for (let i = 0; i < positions.count; i++) {
      const x = Math.floor(i % resolution);
      const y = Math.floor(i / resolution);
      const height = this.heightData[y * resolution + x];
      
      (positions as THREE.BufferAttribute).setZ(i, height);
    }
    
    positions.needsUpdate = true;
    this.geometry.computeVertexNormals(); // Recalculate normals for proper lighting
    
    console.log('Applied heightmap to terrain geometry');
  }

  // Load real-world terrain textures
  private async loadTerrainTextures(): Promise<void> {
    console.log('Loading high-fidelity terrain textures...');
    
    try {
      // Create texture URLs for different terrain types
      // These would be replaced with actual Quixel or high-quality texture URLs
      const baseTextures = {
        grass: this.createGrassTexture(),
        dirt: this.createDirtTexture(),
        concrete: this.createConcreteTexture(),
        asphalt: this.createAsphaltTexture()
      };
      
      // Create blend map for different terrain types
      const blendMap = this.createTerrainBlendMap();
      
      // Apply mixed texturing
      this.material.map = baseTextures.grass;
      this.material.normalMap = this.createNormalMap();
      this.material.roughnessMap = this.createRoughnessMap();
      this.material.aoMap = this.createAOMap();
      
      this.material.needsUpdate = true;
      
      console.log('Terrain textures loaded successfully');
      
    } catch (error) {
      console.warn('Failed to load terrain textures, using procedural fallback:', error);
      this.createProceduralTextures();
    }
  }

  // Create procedural grass texture
  private createGrassTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    
    // Create grass base color
    const gradient = ctx.createLinearGradient(0, 0, 512, 512);
    gradient.addColorStop(0, '#4a5c3a');
    gradient.addColorStop(0.5, '#3d4f2f');
    gradient.addColorStop(1, '#5a6b4a');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 512);
    
    // Add grass texture detail
    for (let i = 0; i < 1000; i++) {
      ctx.strokeStyle = `rgba(${40 + Math.random() * 40}, ${60 + Math.random() * 40}, ${30 + Math.random() * 20}, 0.3)`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(Math.random() * 512, Math.random() * 512);
      ctx.lineTo(Math.random() * 512, Math.random() * 512);
      ctx.stroke();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(16, 16);
    return texture;
  }

  // Create procedural dirt texture
  private createDirtTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    
    // Brown earth tones
    ctx.fillStyle = '#8B7355';
    ctx.fillRect(0, 0, 512, 512);
    
    // Add variation
    for (let i = 0; i < 500; i++) {
      const brightness = 0.8 + Math.random() * 0.4;
      ctx.fillStyle = `rgba(${Math.floor(139 * brightness)}, ${Math.floor(115 * brightness)}, ${Math.floor(85 * brightness)}, 0.5)`;
      ctx.beginPath();
      ctx.arc(Math.random() * 512, Math.random() * 512, Math.random() * 10, 0, Math.PI * 2);
      ctx.fill();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 8);
    return texture;
  }

  // Create procedural concrete texture for station pads
  private createConcreteTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    
    // Light gray concrete base
    ctx.fillStyle = '#C8C8C8';
    ctx.fillRect(0, 0, 512, 512);
    
    // Add concrete texture with aggregate
    for (let i = 0; i < 2000; i++) {
      const gray = 180 + Math.random() * 60;
      ctx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
      ctx.beginPath();
      ctx.arc(Math.random() * 512, Math.random() * 512, Math.random() * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Add subtle cracks
    for (let i = 0; i < 20; i++) {
      ctx.strokeStyle = 'rgba(100, 100, 100, 0.3)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(Math.random() * 512, Math.random() * 512);
      ctx.quadraticCurveTo(
        Math.random() * 512, Math.random() * 512,
        Math.random() * 512, Math.random() * 512
      );
      ctx.stroke();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);
    return texture;
  }

  // Create procedural asphalt texture for roads
  private createAsphaltTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    
    // Dark asphalt base
    ctx.fillStyle = '#3A3A3A';
    ctx.fillRect(0, 0, 512, 512);
    
    // Add asphalt aggregate texture
    for (let i = 0; i < 3000; i++) {
      const brightness = 40 + Math.random() * 40;
      ctx.fillStyle = `rgb(${brightness}, ${brightness}, ${brightness})`;
      ctx.beginPath();
      ctx.arc(Math.random() * 512, Math.random() * 512, Math.random() * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(6, 6);
    return texture;
  }

  // Create blend map for terrain mixing
  private createTerrainBlendMap(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = this.config.resolution;
    canvas.height = this.config.resolution;
    const ctx = canvas.getContext('2d')!;
    
    // Create zones: center is concrete pad, surrounded by dirt, then grass
    const centerX = this.config.resolution / 2;
    const centerY = this.config.resolution / 2;
    
    for (let y = 0; y < this.config.resolution; y++) {
      for (let x = 0; x < this.config.resolution; x++) {
        const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
        const normalizedDistance = distance / (this.config.resolution / 2);
        
        if (normalizedDistance < 0.3) {
          // Concrete pad area
          ctx.fillStyle = 'rgb(255, 0, 0)'; // Red channel for concrete
        } else if (normalizedDistance < 0.6) {
          // Dirt transition
          ctx.fillStyle = 'rgb(0, 255, 0)'; // Green channel for dirt
        } else {
          // Grass outer area
          ctx.fillStyle = 'rgb(0, 0, 255)'; // Blue channel for grass
        }
        
        ctx.fillRect(x, y, 1, 1);
      }
    }
    
    return new THREE.CanvasTexture(canvas);
  }

  // Create normal map for surface detail
  private createNormalMap(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    
    // Base normal color (pointing up)
    ctx.fillStyle = 'rgb(128, 128, 255)';
    ctx.fillRect(0, 0, 512, 512);
    
    // Add surface variation
    for (let i = 0; i < 1000; i++) {
      const r = 120 + Math.random() * 16;
      const g = 120 + Math.random() * 16;
      const b = 240 + Math.random() * 15;
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.beginPath();
      ctx.arc(Math.random() * 512, Math.random() * 512, Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(16, 16);
    return texture;
  }

  // Create roughness map
  private createRoughnessMap(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    
    // Variable roughness across surface
    const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
    gradient.addColorStop(0, 'rgb(100, 100, 100)'); // Smoother in center (concrete)
    gradient.addColorStop(0.5, 'rgb(150, 150, 150)'); // Medium roughness (dirt)
    gradient.addColorStop(1, 'rgb(200, 200, 200)'); // Rougher at edges (grass)
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 512);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  // Create ambient occlusion map
  private createAOMap(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    
    // Base AO
    ctx.fillStyle = 'rgb(240, 240, 240)';
    ctx.fillRect(0, 0, 512, 512);
    
    // Add shadow detail
    for (let i = 0; i < 200; i++) {
      const darkness = 150 + Math.random() * 50;
      ctx.fillStyle = `rgb(${darkness}, ${darkness}, ${darkness})`;
      ctx.beginPath();
      ctx.arc(Math.random() * 512, Math.random() * 512, Math.random() * 20, 0, Math.PI * 2);
      ctx.fill();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 8);
    return texture;
  }

  // Fallback procedural textures
  private createProceduralTextures(): void {
    console.log('Creating procedural texture fallbacks...');
    
    // Simple procedural material
    this.material.color.setHex(0x8B7355);
    this.material.roughness = 0.8;
    this.material.metalness = 0.0;
  }

  // Get terrain elevation at world coordinates
  public getElevationAt(worldX: number, worldZ: number): number {
    const { size, resolution } = this.config;
    
    // Convert world coordinates to heightmap coordinates
    const u = (worldX + size / 2) / size;
    const v = (worldZ + size / 2) / size;
    
    // Clamp to terrain bounds
    if (u < 0 || u > 1 || v < 0 || v > 1) {
      return 0; // Outside terrain
    }
    
    // Bilinear interpolation
    const x = u * (resolution - 1);
    const y = v * (resolution - 1);
    
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, resolution - 1);
    const y1 = Math.min(y0 + 1, resolution - 1);
    
    const fx = x - x0;
    const fy = y - y0;
    
    const h00 = this.heightData[y0 * resolution + x0];
    const h10 = this.heightData[y0 * resolution + x1];
    const h01 = this.heightData[y1 * resolution + x0];
    const h11 = this.heightData[y1 * resolution + x1];
    
    const h0 = h00 * (1 - fx) + h10 * fx;
    const h1 = h01 * (1 - fx) + h11 * fx;
    
    return h0 * (1 - fy) + h1 * fy;
  }

  // Add road from center to edge
  public addRoad(fromX: number, fromZ: number, toX: number, toZ: number, width: number = 6): void {
    console.log('Adding road to terrain...');
    
    // This would modify the terrain to add a road
    // For now, we'll add a separate road mesh
    const roadGeometry = new THREE.PlaneGeometry(
      Math.sqrt((toX - fromX) ** 2 + (toZ - fromZ) ** 2),
      width
    );
    
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x3A3A3A,
      roughness: 0.9,
      metalness: 0.0
    });
    
    const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial);
    roadMesh.rotation.x = -Math.PI / 2;
    roadMesh.position.set((fromX + toX) / 2, 0.1, (fromZ + toZ) / 2);
    roadMesh.rotation.z = Math.atan2(toZ - fromZ, toX - fromX);
    roadMesh.receiveShadow = true;
    
    this.mesh.add(roadMesh);
  }

  public getMesh(): THREE.Mesh {
    return this.mesh;
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    
    if (this.material.map) this.material.map.dispose();
    if (this.material.normalMap) this.material.normalMap.dispose();
    if (this.material.roughnessMap) this.material.roughnessMap.dispose();
    if (this.material.aoMap) this.material.aoMap.dispose();
  }
}