import * as THREE from 'three';

export interface PBRMaterialConfig {
  name: string;
  baseColor: THREE.Color | string;
  metallic: number; // 0-1
  roughness: number; // 0-1
  normalScale: number; // Normal map intensity
  emissive?: THREE.Color | string;
  emissiveIntensity?: number;
  envMapIntensity?: number;
  textures?: {
    diffuse?: string;
    normal?: string;
    roughness?: string;
    metallic?: string;
    ao?: string; // Ambient occlusion
    emissive?: string;
    displacement?: string;
  };
  repeatU?: number;
  repeatV?: number;
  transparent?: boolean;
  opacity?: number;
}

export interface MaterialVariant {
  base: PBRMaterialConfig;
  weathered?: Partial<PBRMaterialConfig>;
  worn?: Partial<PBRMaterialConfig>;
  new?: Partial<PBRMaterialConfig>;
}

export class PBRMaterialSystem {
  private materials: Map<string, THREE.MeshStandardMaterial> = new Map();
  private textureCache: Map<string, THREE.Texture> = new Map();
  private materialConfigs: Map<string, MaterialVariant> = new Map();
  private textureLoader: THREE.TextureLoader;
  
  // Environment mapping
  private envMap: THREE.CubeTexture | null = null;
  private pmremGenerator: THREE.PMREMGenerator;
  
  // Quality settings
  private useHighQuality: boolean = true;
  private anisotropy: number = 16;

  constructor(renderer: THREE.WebGLRenderer) {
    this.textureLoader = new THREE.TextureLoader();
    this.pmremGenerator = new THREE.PMREMGenerator(renderer);
    this.anisotropy = renderer.capabilities.getMaxAnisotropy();
    
    this.initializeStandardMaterials();
    this.generateProceduralTextures();
    
    console.log('PBRMaterialSystem initialized with high-quality materials');
  }

  private initializeStandardMaterials(): void {
    // Define realistic material configurations for ground station assets
    
    // Antenna materials
    this.materialConfigs.set('antenna_aluminum', {
      base: {
        name: 'Antenna Aluminum',
        baseColor: new THREE.Color(0xc0c0c0),
        metallic: 0.9,
        roughness: 0.15,
        normalScale: 1.0,
        envMapIntensity: 1.0
      },
      weathered: {
        roughness: 0.35,
        baseColor: new THREE.Color(0xa8a8a8),
        metallic: 0.7
      }
    });

    this.materialConfigs.set('antenna_steel', {
      base: {
        name: 'Antenna Steel',
        baseColor: new THREE.Color(0x8a8a8a),
        metallic: 0.8,
        roughness: 0.25,
        normalScale: 1.2,
        envMapIntensity: 0.8
      }
    });

    this.materialConfigs.set('radome_fiberglass', {
      base: {
        name: 'Radome Fiberglass',
        baseColor: new THREE.Color(0xf5f5f5),
        metallic: 0.0,
        roughness: 0.4,
        normalScale: 0.8,
        envMapIntensity: 0.3
      }
    });

    // Building materials
    this.materialConfigs.set('concrete_smooth', {
      base: {
        name: 'Smooth Concrete',
        baseColor: new THREE.Color(0xd0d0d0),
        metallic: 0.0,
        roughness: 0.8,
        normalScale: 1.5,
        envMapIntensity: 0.1
      },
      weathered: {
        roughness: 0.9,
        baseColor: new THREE.Color(0xb8b8b8)
      }
    });

    this.materialConfigs.set('concrete_textured', {
      base: {
        name: 'Textured Concrete',
        baseColor: new THREE.Color(0xc8c8c8),
        metallic: 0.0,
        roughness: 0.9,
        normalScale: 2.0,
        envMapIntensity: 0.05
      }
    });

    this.materialConfigs.set('metal_painted', {
      base: {
        name: 'Painted Metal',
        baseColor: new THREE.Color(0x2c5aa0),
        metallic: 0.1,
        roughness: 0.3,
        normalScale: 1.0,
        envMapIntensity: 0.4
      },
      weathered: {
        roughness: 0.6,
        metallic: 0.3,
        baseColor: new THREE.Color(0x1e3f70)
      }
    });

    // Infrastructure materials
    this.materialConfigs.set('asphalt', {
      base: {
        name: 'Asphalt',
        baseColor: new THREE.Color(0x404040),
        metallic: 0.0,
        roughness: 0.95,
        normalScale: 1.8,
        envMapIntensity: 0.0,
        repeatU: 4,
        repeatV: 4
      }
    });

    this.materialConfigs.set('chain_link_fence', {
      base: {
        name: 'Chain Link Fence',
        baseColor: new THREE.Color(0x888888),
        metallic: 0.6,
        roughness: 0.4,
        normalScale: 1.0,
        envMapIntensity: 0.5,
        transparent: true,
        opacity: 0.8
      }
    });

    this.materialConfigs.set('grass', {
      base: {
        name: 'Grass',
        baseColor: new THREE.Color(0x4a6741),
        metallic: 0.0,
        roughness: 0.9,
        normalScale: 1.2,
        envMapIntensity: 0.1,
        repeatU: 8,
        repeatV: 8
      }
    });

    this.materialConfigs.set('dirt', {
      base: {
        name: 'Dirt',
        baseColor: new THREE.Color(0x8b7355),
        metallic: 0.0,
        roughness: 0.95,
        normalScale: 2.0,
        envMapIntensity: 0.05,
        repeatU: 6,
        repeatV: 6
      }
    });

    // Electronic/equipment materials
    this.materialConfigs.set('plastic_black', {
      base: {
        name: 'Black Plastic',
        baseColor: new THREE.Color(0x1a1a1a),
        metallic: 0.0,
        roughness: 0.6,
        normalScale: 0.5,
        envMapIntensity: 0.2
      }
    });

    this.materialConfigs.set('led_indicator', {
      base: {
        name: 'LED Indicator',
        baseColor: new THREE.Color(0x00ff00),
        metallic: 0.0,
        roughness: 0.1,
        normalScale: 0.0,
        emissive: new THREE.Color(0x004400),
        emissiveIntensity: 0.5,
        envMapIntensity: 0.0
      }
    });

    this.materialConfigs.set('copper_pipe', {
      base: {
        name: 'Copper Pipe',
        baseColor: new THREE.Color(0xb87333),
        metallic: 0.9,
        roughness: 0.2,
        normalScale: 0.8,
        envMapIntensity: 1.0
      },
      weathered: {
        baseColor: new THREE.Color(0x4a7c59), // Patina
        metallic: 0.3,
        roughness: 0.7
      }
    });

    this.materialConfigs.set('glass_reflective', {
      base: {
        name: 'Reflective Glass',
        baseColor: new THREE.Color(0xccddff),
        metallic: 0.0,
        roughness: 0.05,
        normalScale: 0.1,
        envMapIntensity: 1.0,
        transparent: true,
        opacity: 0.3
      }
    });
  }

  private generateProceduralTextures(): void {
    // Generate normal maps procedurally for materials that don't have texture files
    this.generateNormalMap('concrete_normal', 512, 'concrete');
    this.generateNormalMap('metal_normal', 512, 'brushed_metal');
    this.generateNormalMap('asphalt_normal', 512, 'rough_surface');
    this.generateNormalMap('grass_normal', 256, 'organic');
    
    // Generate roughness maps
    this.generateRoughnessMap('metal_roughness', 512, 'brushed');
    this.generateRoughnessMap('concrete_roughness', 512, 'smooth_concrete');
    
    // Generate AO maps
    this.generateAOMap('generic_ao', 256);
  }

  private generateNormalMap(name: string, size: number, type: string): THREE.DataTexture {
    const data = new Uint8Array(size * size * 4);
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const index = (y * size + x) * 4;
        
        let normalX = 0;
        let normalY = 0;
        let normalZ = 1;
        
        switch (type) {
          case 'concrete':
            // Rough concrete texture
            normalX = (Math.random() - 0.5) * 0.4;
            normalY = (Math.random() - 0.5) * 0.4;
            normalZ = Math.sqrt(1 - normalX * normalX - normalY * normalY);
            break;
            
          case 'brushed_metal':
            // Brushed metal pattern
            normalX = Math.sin(y * 0.2) * 0.3;
            normalY = (Math.random() - 0.5) * 0.1;
            normalZ = Math.sqrt(1 - normalX * normalX - normalY * normalY);
            break;
            
          case 'rough_surface':
            // Rough asphalt-like surface
            const noise = this.noise(x * 0.05, y * 0.05);
            normalX = noise * 0.5;
            normalY = this.noise(x * 0.03, y * 0.07) * 0.5;
            normalZ = Math.sqrt(Math.max(0, 1 - normalX * normalX - normalY * normalY));
            break;
            
          case 'organic':
            // Organic grass-like normal
            normalX = Math.sin(x * 0.1) * Math.cos(y * 0.15) * 0.3;
            normalY = Math.cos(x * 0.12) * Math.sin(y * 0.08) * 0.3;
            normalZ = Math.sqrt(1 - normalX * normalX - normalY * normalY);
            break;
        }
        
        // Convert from [-1,1] to [0,255]
        data[index] = ((normalX + 1) * 0.5) * 255;     // R
        data[index + 1] = ((normalY + 1) * 0.5) * 255; // G
        data[index + 2] = ((normalZ + 1) * 0.5) * 255; // B
        data[index + 3] = 255;                          // A
      }
    }
    
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.needsUpdate = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = this.anisotropy;
    
    this.textureCache.set(name, texture);
    return texture;
  }

  private generateRoughnessMap(name: string, size: number, type: string): THREE.DataTexture {
    const data = new Uint8Array(size * size);
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const index = y * size + x;
        let roughness = 0.5;
        
        switch (type) {
          case 'brushed':
            roughness = 0.2 + Math.sin(y * 0.1) * 0.1;
            break;
          case 'smooth_concrete':
            roughness = 0.7 + this.noise(x * 0.02, y * 0.02) * 0.2;
            break;
        }
        
        data[index] = roughness * 255;
      }
    }
    
    const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat);
    texture.needsUpdate = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = this.anisotropy;
    
    this.textureCache.set(name, texture);
    return texture;
  }

  private generateAOMap(name: string, size: number): THREE.DataTexture {
    const data = new Uint8Array(size * size);
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const index = y * size + x;
        
        // Simple AO pattern - darker at edges
        const centerX = size / 2;
        const centerY = size / 2;
        const distFromCenter = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
        const maxDist = size / 2;
        const ao = 0.4 + 0.6 * (1 - Math.min(distFromCenter / maxDist, 1));
        
        data[index] = ao * 255;
      }
    }
    
    const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat);
    texture.needsUpdate = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    
    this.textureCache.set(name, texture);
    return texture;
  }

  private noise(x: number, y: number): number {
    // Simple 2D noise function
    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return n - Math.floor(n);
  }

  public createMaterial(
    configName: string, 
    variant: 'base' | 'weathered' | 'worn' | 'new' = 'base',
    customOverrides?: Partial<PBRMaterialConfig>
  ): THREE.MeshStandardMaterial {
    
    const materialConfig = this.materialConfigs.get(configName);
    if (!materialConfig) {
      console.warn(`Material config not found: ${configName}`);
      return this.createFallbackMaterial();
    }

    // Merge base config with variant and overrides
    const config = {
      ...materialConfig.base,
      ...(variant !== 'base' ? materialConfig[variant] || {} : {}),
      ...customOverrides
    };

    const material = new THREE.MeshStandardMaterial({
      name: config.name,
      color: typeof config.baseColor === 'string' ? 
        new THREE.Color(config.baseColor) : config.baseColor,
      metalness: config.metallic,
      roughness: config.roughness,
      envMapIntensity: config.envMapIntensity || 1.0,
      transparent: config.transparent || false,
      opacity: config.opacity || 1.0
    });

    // Set emissive properties
    if (config.emissive) {
      material.emissive = typeof config.emissive === 'string' ? 
        new THREE.Color(config.emissive) : config.emissive;
      material.emissiveIntensity = config.emissiveIntensity || 1.0;
    }

    // Apply textures
    if (config.textures) {
      this.applyTextures(material, config);
    } else {
      // Use procedural textures based on material type
      this.applyProceduralTextures(material, configName, config);
    }

    // Set texture repeat
    if (config.repeatU || config.repeatV) {
      const repeatU = config.repeatU || 1;
      const repeatV = config.repeatV || 1;
      
      if (material.map) {
        material.map.repeat.set(repeatU, repeatV);
      }
      if (material.normalMap) {
        material.normalMap.repeat.set(repeatU, repeatV);
      }
      if (material.roughnessMap) {
        material.roughnessMap.repeat.set(repeatU, repeatV);
      }
      if (material.aoMap) {
        material.aoMap.repeat.set(repeatU, repeatV);
      }
    }

    // Set environment map if available
    if (this.envMap && config.envMapIntensity && config.envMapIntensity > 0) {
      material.envMap = this.envMap;
      material.envMapIntensity = config.envMapIntensity;
    }

    // Set normal map intensity
    if (material.normalMap && config.normalScale) {
      material.normalScale = new THREE.Vector2(config.normalScale, config.normalScale);
    }

    const materialKey = `${configName}_${variant}`;
    this.materials.set(materialKey, material);
    
    return material;
  }

  private applyTextures(material: THREE.MeshStandardMaterial, config: PBRMaterialConfig): void {
    if (!config.textures) return;

    const { textures } = config;

    if (textures.diffuse) {
      material.map = this.loadTexture(textures.diffuse);
    }

    if (textures.normal) {
      material.normalMap = this.loadTexture(textures.normal);
    }

    if (textures.roughness) {
      material.roughnessMap = this.loadTexture(textures.roughness);
    }

    if (textures.metallic) {
      material.metalnessMap = this.loadTexture(textures.metallic);
    }

    if (textures.ao) {
      material.aoMap = this.loadTexture(textures.ao);
      material.aoMapIntensity = 1.0;
    }

    if (textures.emissive) {
      material.emissiveMap = this.loadTexture(textures.emissive);
    }

    if (textures.displacement) {
      material.displacementMap = this.loadTexture(textures.displacement);
      material.displacementScale = 0.1;
    }
  }

  private applyProceduralTextures(
    material: THREE.MeshStandardMaterial, 
    configName: string, 
    config: PBRMaterialConfig
  ): void {
    // Apply appropriate procedural textures based on material type
    if (configName.includes('concrete')) {
      material.normalMap = this.textureCache.get('concrete_normal') || null;
      material.roughnessMap = this.textureCache.get('concrete_roughness') || null;
      material.aoMap = this.textureCache.get('generic_ao') || null;
    } else if (configName.includes('metal') || configName.includes('antenna')) {
      material.normalMap = this.textureCache.get('metal_normal') || null;
      material.roughnessMap = this.textureCache.get('metal_roughness') || null;
    } else if (configName.includes('asphalt')) {
      material.normalMap = this.textureCache.get('asphalt_normal') || null;
    } else if (configName.includes('grass')) {
      material.normalMap = this.textureCache.get('grass_normal') || null;
    }

    // Set normal scale if normal map is applied
    if (material.normalMap && config.normalScale) {
      material.normalScale = new THREE.Vector2(config.normalScale, config.normalScale);
    }
  }

  private loadTexture(path: string): THREE.Texture {
    if (this.textureCache.has(path)) {
      return this.textureCache.get(path)!;
    }

    const texture = this.textureLoader.load(path);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = this.anisotropy;
    
    // Apply encoding for proper color space
    texture.encoding = THREE.sRGBEncoding;
    
    this.textureCache.set(path, texture);
    return texture;
  }

  private createFallbackMaterial(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: 0x808080,
      metalness: 0.0,
      roughness: 0.8
    });
  }

  public setEnvironmentMap(envMap: THREE.CubeTexture): void {
    this.envMap = envMap;
    
    // Update all existing materials with environment map
    this.materials.forEach(material => {
      if (material.envMapIntensity && material.envMapIntensity > 0) {
        material.envMap = envMap;
        material.needsUpdate = true;
      }
    });
  }

  public updateMaterialQuality(useHighQuality: boolean): void {
    this.useHighQuality = useHighQuality;
    
    // Regenerate textures with appropriate quality
    if (useHighQuality) {
      this.generateProceduralTextures();
    } else {
      // Generate lower resolution textures for performance
      this.generateNormalMap('concrete_normal', 256, 'concrete');
      this.generateNormalMap('metal_normal', 256, 'brushed_metal');
      this.generateNormalMap('asphalt_normal', 128, 'rough_surface');
    }
  }

  public getMaterial(configName: string, variant: 'base' | 'weathered' | 'worn' | 'new' = 'base'): THREE.MeshStandardMaterial | null {
    const materialKey = `${configName}_${variant}`;
    return this.materials.get(materialKey) || null;
  }

  public createMaterialSet(materialNames: string[]): Map<string, THREE.MeshStandardMaterial> {
    const materialSet = new Map<string, THREE.MeshStandardMaterial>();
    
    materialNames.forEach(name => {
      const material = this.createMaterial(name);
      materialSet.set(name, material);
    });
    
    return materialSet;
  }

  public dispose(): void {
    // Dispose all materials
    this.materials.forEach(material => {
      material.dispose();
    });
    this.materials.clear();

    // Dispose all textures
    this.textureCache.forEach(texture => {
      texture.dispose();
    });
    this.textureCache.clear();

    // Dispose environment map
    if (this.envMap) {
      this.envMap.dispose();
    }

    console.log('PBRMaterialSystem disposed');
  }
}