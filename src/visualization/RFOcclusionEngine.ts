import * as THREE from 'three';

export interface OcclusionCheckResult {
  satelliteId: string;
  isVisible: boolean;
  obstructions: Array<{
    type: 'terrain' | 'building' | 'structure' | 'regulatory';
    distance: number;
    intersectionPoint: THREE.Vector3;
    normal: THREE.Vector3;
  }>;
  azimuth: number;
  elevation: number;
  range: number;
  signalAttenuation: number; // dB loss due to obstructions
}

export interface AntennaViewMask {
  antennaId: string;
  groundStationId: string;
  visibleSatellites: Set<string>;
  occludedSatellites: Map<string, OcclusionCheckResult>;
  lastUpdateTime: number;
  angularResolution: number; // degrees
}

export interface RFEnvironmentMesh {
  mesh: THREE.Mesh;
  type: 'terrain' | 'building' | 'structure' | 'regulatory';
  material: 'concrete' | 'metal' | 'wood' | 'earth' | 'water';
  attenuationDb: number; // Signal loss per meter
  isRFOpaque: boolean;
}

export class RFOcclusionEngine {
  private raycaster: THREE.Raycaster;
  private environmentMeshes: RFEnvironmentMesh[] = [];
  private viewMaskCache: Map<string, AntennaViewMask> = new Map();
  private angularResolution: number = 1.0; // degrees
  private maxRayDistance: number = 2000000; // 2000 km max range
  private cacheTimeout: number = 1000; // ms
  
  // Performance optimization
  private raycastPool: THREE.Raycaster[] = [];
  private maxPoolSize: number = 20;
  private debugMode: boolean = false;
  
  constructor(angularResolution: number = 1.0, debugMode: boolean = false) {
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = this.maxRayDistance;
    this.angularResolution = angularResolution;
    this.debugMode = debugMode;
    
    // Pre-allocate raycaster pool for performance
    for (let i = 0; i < this.maxPoolSize; i++) {
      const pooledRaycaster = new THREE.Raycaster();
      pooledRaycaster.far = this.maxRayDistance;
      this.raycastPool.push(pooledRaycaster);
    }
    
    console.log(`RF Occlusion Engine initialized with ${angularResolution}° angular resolution`);
  }

  public addEnvironmentMesh(mesh: THREE.Mesh, config: Omit<RFEnvironmentMesh, 'mesh'>): void {
    const rfMesh: RFEnvironmentMesh = {
      mesh,
      ...config
    };
    
    this.environmentMeshes.push(rfMesh);
    
    if (this.debugMode) {
      console.log(`Added RF environment mesh: ${config.type} (${config.material}), attenuation: ${config.attenuationDb}dB`);
    }
  }

  public removeEnvironmentMesh(mesh: THREE.Mesh): void {
    this.environmentMeshes = this.environmentMeshes.filter(rfMesh => rfMesh.mesh !== mesh);
  }

  public performOcclusionCheck(
    antennaPosition: THREE.Vector3,
    antennaId: string,
    groundStationId: string,
    satellitePositions: Array<{ id: string; position: THREE.Vector3 }>
  ): AntennaViewMask {
    const maskKey = `${groundStationId}_${antennaId}`;
    const currentTime = Date.now();
    
    // Check cache validity
    const cachedMask = this.viewMaskCache.get(maskKey);
    if (cachedMask && (currentTime - cachedMask.lastUpdateTime) < this.cacheTimeout) {
      return cachedMask;
    }
    
    const viewMask: AntennaViewMask = {
      antennaId,
      groundStationId,
      visibleSatellites: new Set(),
      occludedSatellites: new Map(),
      lastUpdateTime: currentTime,
      angularResolution: this.angularResolution
    };
    
    // Process each satellite
    satellitePositions.forEach(satellite => {
      const occlusionResult = this.checkSatelliteOcclusion(antennaPosition, satellite);
      
      if (occlusionResult.isVisible) {
        viewMask.visibleSatellites.add(satellite.id);
      } else {
        viewMask.occludedSatellites.set(satellite.id, occlusionResult);
      }
    });
    
    // Cache the result
    this.viewMaskCache.set(maskKey, viewMask);
    
    if (this.debugMode) {
      console.log(`Occlusion check: ${viewMask.visibleSatellites.size} visible, ${viewMask.occludedSatellites.size} occluded`);
    }
    
    return viewMask;
  }

  private checkSatelliteOcclusion(
    antennaPosition: THREE.Vector3,
    satellite: { id: string; position: THREE.Vector3 }
  ): OcclusionCheckResult {
    const direction = satellite.position.clone().sub(antennaPosition).normalize();
    const range = antennaPosition.distanceTo(satellite.position);
    
    // Calculate spherical coordinates
    const azimuth = Math.atan2(direction.x, direction.z) * 180 / Math.PI;
    const elevation = Math.asin(direction.y) * 180 / Math.PI;
    
    // Get raycaster from pool
    const raycaster = this.getRaycaster();
    raycaster.set(antennaPosition, direction);
    
    const obstructions: OcclusionCheckResult['obstructions'] = [];
    let totalAttenuation = 0;
    let isVisible = true;
    
    // Check for intersections with environment meshes
    for (const rfMesh of this.environmentMeshes) {
      const intersections = raycaster.intersectObject(rfMesh.mesh, true);
      
      for (const intersection of intersections) {
        // Only consider intersections that are closer than the satellite
        if (intersection.distance < range) {
          obstructions.push({
            type: rfMesh.type,
            distance: intersection.distance,
            intersectionPoint: intersection.point,
            normal: intersection.face?.normal || new THREE.Vector3(0, 1, 0)
          });
          
          // Calculate signal attenuation based on material properties
          const pathLengthThroughMaterial = this.calculatePathLength(
            intersection,
            direction,
            rfMesh.mesh
          );
          
          totalAttenuation += rfMesh.attenuationDb * pathLengthThroughMaterial;
          
          // If material is RF opaque, mark as not visible
          if (rfMesh.isRFOpaque) {
            isVisible = false;
          }
        }
      }
    }
    
    // Return raycaster to pool
    this.returnRaycaster(raycaster);
    
    // Consider link blocked if attenuation is too high
    if (totalAttenuation > 20) { // 20dB threshold
      isVisible = false;
    }
    
    return {
      satelliteId: satellite.id,
      isVisible,
      obstructions,
      azimuth,
      elevation,
      range,
      signalAttenuation: totalAttenuation
    };
  }

  private calculatePathLength(
    intersection: THREE.Intersection,
    direction: THREE.Vector3,
    mesh: THREE.Mesh
  ): number {
    // Simplified path length calculation
    // In practice, this would trace the ray through the mesh to find exit point
    const geometry = mesh.geometry;
    
    if (geometry instanceof THREE.BoxGeometry) {
      // For box geometry, estimate based on bounding box
      const bbox = new THREE.Box3().setFromObject(mesh);
      const size = bbox.getSize(new THREE.Vector3());
      return Math.min(size.x, size.y, size.z) * 0.5; // Approximate path length
    }
    
    // Default estimation for other geometries
    return 1.0; // meters
  }

  public performSweepOcclusion(
    antennaPosition: THREE.Vector3,
    antennaId: string,
    groundStationId: string,
    elevationRange: { min: number; max: number },
    azimuthRange: { min: number; max: number }
  ): Map<string, number> {
    // Sweep occlusion check across angular ranges
    const occlusionMap = new Map<string, number>(); // azimuth_elevation -> attenuation
    
    for (let az = azimuthRange.min; az <= azimuthRange.max; az += this.angularResolution) {
      for (let el = elevationRange.min; el <= elevationRange.max; el += this.angularResolution) {
        // Convert spherical to Cartesian
        const azRad = az * Math.PI / 180;
        const elRad = el * Math.PI / 180;
        
        const direction = new THREE.Vector3(
          Math.sin(azRad) * Math.cos(elRad),
          Math.sin(elRad),
          Math.cos(azRad) * Math.cos(elRad)
        );
        
        // Cast ray in this direction
        const raycaster = this.getRaycaster();
        raycaster.set(antennaPosition, direction);
        
        let totalAttenuation = 0;
        
        for (const rfMesh of this.environmentMeshes) {
          const intersections = raycaster.intersectObject(rfMesh.mesh, true);
          
          if (intersections.length > 0) {
            const pathLength = this.calculatePathLength(intersections[0], direction, rfMesh.mesh);
            totalAttenuation += rfMesh.attenuationDb * pathLength;
          }
        }
        
        this.returnRaycaster(raycaster);
        
        const key = `${az.toFixed(1)}_${el.toFixed(1)}`;
        occlusionMap.set(key, totalAttenuation);
      }
    }
    
    return occlusionMap;
  }

  private getRaycaster(): THREE.Raycaster {
    return this.raycastPool.pop() || new THREE.Raycaster();
  }

  private returnRaycaster(raycaster: THREE.Raycaster): void {
    if (this.raycastPool.length < this.maxPoolSize) {
      this.raycastPool.push(raycaster);
    }
  }

  public getViewMask(antennaId: string, groundStationId: string): AntennaViewMask | null {
    const maskKey = `${groundStationId}_${antennaId}`;
    return this.viewMaskCache.get(maskKey) || null;
  }

  public clearCache(): void {
    this.viewMaskCache.clear();
  }

  public setAngularResolution(resolution: number): void {
    this.angularResolution = resolution;
    this.clearCache(); // Clear cache when resolution changes
  }

  public setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  public getOcclusionStatistics(): {
    totalEnvironmentMeshes: number;
    cachedViewMasks: number;
    averageVisibleSatellites: number;
    averageOccludedSatellites: number;
  } {
    let totalVisible = 0;
    let totalOccluded = 0;
    let maskCount = 0;
    
    this.viewMaskCache.forEach(mask => {
      totalVisible += mask.visibleSatellites.size;
      totalOccluded += mask.occludedSatellites.size;
      maskCount++;
    });
    
    return {
      totalEnvironmentMeshes: this.environmentMeshes.length,
      cachedViewMasks: this.viewMaskCache.size,
      averageVisibleSatellites: maskCount > 0 ? totalVisible / maskCount : 0,
      averageOccludedSatellites: maskCount > 0 ? totalOccluded / maskCount : 0
    };
  }

  public dispose(): void {
    this.clearCache();
    this.environmentMeshes = [];
    this.raycastPool = [];
  }
}