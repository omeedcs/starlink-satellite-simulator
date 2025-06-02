import * as THREE from 'three';

// Define region boundary coordinates using real-world country shapes
interface RegionBoundary {
  name: string;
  color: THREE.Color;
  opacity: number;
  boundaries: {
    lat: number;
    lon: number;
  }[];
  // Additional properties for regulatory constraints
  regulatoryConstraints: {
    noTransmission: boolean;
    noOverflight: boolean;
    limitedFrequency: boolean;
    frequencyLimits?: [number, number][]; // MHz ranges
  };
}

export class DeniedRegion {
  private object: THREE.Group;
  private regions: Map<string, THREE.Mesh>;
  private regionData: Map<string, RegionBoundary>;
  
  // Earth radius should match the Earth model scale
  private earthRadius: number;
  private projectionHeight: number;
  
  constructor(earthRadius: number) {
    this.object = new THREE.Group();
    this.regions = new Map();
    this.regionData = new Map();
    this.earthRadius = earthRadius;
    this.projectionHeight = earthRadius * 0.01; // Slightly above Earth surface
    
    // Pre-define some known denied regions with actual geographic coordinates
    this.initializeKnownRegions();
  }
  
  public getObject(): THREE.Group {
    return this.object;
  }
  
  // Add a predefined region based on name
  public addPredefinedRegion(name: string): void {
    if (name.toLowerCase() === "iran") {
      this.addIranRegion();
    } else if (name.toLowerCase() === "north korea") {
      this.addNorthKoreaRegion();
    } else if (name.toLowerCase() === "custom") {
      // For demo, a custom region could be added via UI
      this.addCustomRegion();
    }
  }
  
  // Initialize known denied regions
  private initializeKnownRegions(): void {
    // Pre-load data but don't visualize yet
    this.prepareIranRegionData();
    this.prepareNorthKoreaRegionData();
    this.prepareCustomRegionData();
  }
  
  // Create and add the Iran region visualization
  private addIranRegion(): void {
    const regionData = this.regionData.get("iran");
    if (!regionData) return;
    
    this.createRegionMesh(regionData);
  }
  
  // Create and add the North Korea region visualization
  private addNorthKoreaRegion(): void {
    const regionData = this.regionData.get("north korea");
    if (!regionData) return;
    
    this.createRegionMesh(regionData);
  }
  
  // Create and add a custom region visualization
  private addCustomRegion(): void {
    const regionData = this.regionData.get("custom");
    if (!regionData) return;
    
    this.createRegionMesh(regionData);
  }
  
  // Prepare Iran region boundary data with simplified polygon
  private prepareIranRegionData(): void {
    // Simplified Iran boundary polygon (real coordinates)
    const iranBoundaries = [
      { lat: 39.782, lon: 44.774 },  // Northwestern corner
      { lat: 37.974, lon: 48.584 },  // Northern border with Azerbaijan
      { lat: 37.650, lon: 54.800 },  // Northeastern border
      { lat: 36.585, lon: 61.210 },  // Eastern border with Turkmenistan
      { lat: 31.785, lon: 61.816 },  // Eastern border with Afghanistan
      { lat: 29.284, lon: 60.580 },  // Southeastern border with Pakistan
      { lat: 25.380, lon: 58.220 },  // Southern coast (Strait of Hormuz)
      { lat: 27.190, lon: 56.270 },  // Southern coast
      { lat: 28.900, lon: 50.830 },  // Persian Gulf coast
      { lat: 29.975, lon: 48.567 },  // Southwestern border with Iraq
      { lat: 33.746, lon: 45.420 },  // Western border with Iraq
      { lat: 37.480, lon: 44.140 },  // Northwestern border with Turkey
    ];
    
    const iranRegion: RegionBoundary = {
      name: "Iran",
      color: new THREE.Color(0xff3030),
      opacity: 0.5,
      boundaries: iranBoundaries,
      regulatoryConstraints: {
        noTransmission: true,
        noOverflight: false,
        limitedFrequency: true,
        frequencyLimits: [[10700, 12700], [17700, 20200]] // Ku and Ka band ranges in MHz
      }
    };
    
    this.regionData.set("iran", iranRegion);
  }
  
  // Prepare North Korea region boundary data
  private prepareNorthKoreaRegionData(): void {
    // Simplified North Korea boundary polygon (real coordinates)
    const nkBoundaries = [
      { lat: 42.450, lon: 130.640 },  // Northeastern border with Russia
      { lat: 43.385, lon: 130.670 },  // Northern border with China
      { lat: 42.985, lon: 128.445 },  // Northwestern border
      { lat: 41.584, lon: 126.440 },  // Western border with China
      { lat: 40.100, lon: 124.390 },  // Southwestern coast
      { lat: 38.680, lon: 125.080 },  // Southern border (DMZ)
      { lat: 38.300, lon: 127.260 },  // Southern border (DMZ)
      { lat: 38.610, lon: 128.360 },  // Southeastern coast
      { lat: 40.590, lon: 129.580 },  // Eastern coast
      { lat: 41.740, lon: 129.950 },  // Northeastern coast
    ];
    
    const nkRegion: RegionBoundary = {
      name: "North Korea",
      color: new THREE.Color(0xff0000),
      opacity: 0.6,
      boundaries: nkBoundaries,
      regulatoryConstraints: {
        noTransmission: true,
        noOverflight: true,
        limitedFrequency: true,
        frequencyLimits: []  // All frequencies restricted
      }
    };
    
    this.regionData.set("north korea", nkRegion);
  }
  
  // Prepare a custom region (for demo purposes)
  private prepareCustomRegionData(): void {
    // Custom circular region around an area of interest
    const centerLat = 35.0;
    const centerLon = -115.0;
    const radiusDegrees = 5.0;
    const points = 32;
    
    const customBoundaries = [];
    for (let i = 0; i < points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const lat = centerLat + Math.sin(angle) * radiusDegrees;
      const lon = centerLon + Math.cos(angle) * radiusDegrees;
      customBoundaries.push({ lat, lon });
    }
    
    const customRegion: RegionBoundary = {
      name: "Custom",
      color: new THREE.Color(0x00ffff),
      opacity: 0.4,
      boundaries: customBoundaries,
      regulatoryConstraints: {
        noTransmission: false,
        noOverflight: false,
        limitedFrequency: true,
        frequencyLimits: [[14000, 14500]]  // Example frequency range
      }
    };
    
    this.regionData.set("custom", customRegion);
  }
  
  // Create a 3D mesh for a region boundary
  private createRegionMesh(region: RegionBoundary): void {
    // Create a shape from the boundary points
    const shape = new THREE.Shape();
    
    // Convert geographic coordinates to 3D positions
    const points3D: THREE.Vector3[] = [];
    
    region.boundaries.forEach((coord, index) => {
      // Convert lat/lon to cartesian coordinates
      const phi = (90 - coord.lat) * (Math.PI / 180);
      const theta = (coord.lon + 180) * (Math.PI / 180);
      
      // Calculate position on Earth's surface
      const x = -(this.earthRadius + this.projectionHeight) * Math.sin(phi) * Math.cos(theta);
      const y = (this.earthRadius + this.projectionHeight) * Math.cos(phi);
      const z = (this.earthRadius + this.projectionHeight) * Math.sin(phi) * Math.sin(theta);
      
      points3D.push(new THREE.Vector3(x, y, z));
      
      // For the 2D shape, we'll use a simplified projection
      if (index === 0) {
        shape.moveTo(coord.lon, coord.lat);
      } else {
        shape.lineTo(coord.lon, coord.lat);
      }
    });
    
    // Close the shape
    shape.closePath();
    
    // Create geometry from points
    const geometry = new THREE.BufferGeometry();
    
    // Create a triangulated surface from the 3D points
    // This is a simplified approach - for a production app, you'd use a proper
    // spherical triangulation algorithm to project onto the Earth
    const vertices: number[] = [];
    const triangles: number[] = [];
    
    // Add center point (average of all points)
    const center = new THREE.Vector3();
    points3D.forEach(p => center.add(p));
    center.divideScalar(points3D.length);
    center.normalize().multiplyScalar(this.earthRadius + this.projectionHeight);
    
    // Add center as first vertex
    vertices.push(center.x, center.y, center.z);
    
    // Add all boundary points
    points3D.forEach(p => {
      vertices.push(p.x, p.y, p.z);
    });
    
    // Create triangles from center to each edge
    for (let i = 0; i < points3D.length; i++) {
      const i1 = i + 1;
      const i2 = (i + 1) % points3D.length + 1;
      
      // Triangle: center, current point, next point
      triangles.push(0, i1, i2);
    }
    
    // Set geometry attributes
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(triangles);
    geometry.computeVertexNormals();
    
    // Create material
    const material = new THREE.MeshBasicMaterial({
      color: region.color,
      transparent: true,
      opacity: region.opacity,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    
    // Create mesh
    const mesh = new THREE.Mesh(geometry, material);
    
    // Add to scene
    this.regions.set(region.name.toLowerCase(), mesh);
    this.object.add(mesh);
  }
  
  // Check if a point (in lat/lon) is within a denied region
  public isPointInDeniedRegion(lat: number, lon: number): { inRegion: boolean, regionName?: string } {
    // For each region, check if point is inside
    for (const [name, region] of this.regionData.entries()) {
      if (this.isPointInPolygon(lat, lon, region.boundaries)) {
        return { inRegion: true, regionName: name };
      }
    }
    
    return { inRegion: false };
  }
  
  // Check if a line between two points crosses any denied region
  public doesLineCrossDeniedRegion(lat1: number, lon1: number, lat2: number, lon2: number): { crosses: boolean, regionName?: string } {
    // Sample points along the line
    const steps = 20;
    
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const lat = lat1 + t * (lat2 - lat1);
      const lon = lon1 + t * (lon2 - lon1);
      
      const check = this.isPointInDeniedRegion(lat, lon);
      if (check.inRegion) {
        return { crosses: true, regionName: check.regionName };
      }
    }
    
    return { crosses: false };
  }
  
  // Helper method to check if a point is inside a polygon
  private isPointInPolygon(lat: number, lon: number, polygon: { lat: number, lon: number }[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lon, yi = polygon[i].lat;
      const xj = polygon[j].lon, yj = polygon[j].lat;
      
      const intersect = ((yi > lat) !== (yj > lat))
        && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    
    return inside;
  }
  
  // Get regulatory constraints for a specific region
  public getRegionConstraints(regionName: string): { 
    noTransmission: boolean, 
    noOverflight: boolean,
    limitedFrequency: boolean,
    frequencyLimits?: [number, number][]
  } | null {
    const region = this.regionData.get(regionName.toLowerCase());
    
    if (region) {
      return region.regulatoryConstraints;
    }
    
    return null;
  }
}
