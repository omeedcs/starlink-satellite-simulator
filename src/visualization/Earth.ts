import * as THREE from 'three';

export class Earth {
  private earthMesh: THREE.Mesh;
  private cloudsMesh: THREE.Mesh;
  private radius: number = 6371; // Earth radius in km
  private earthRotationSpeed: number = 0.0002; // Reduced to avoid glitchiness
  private cloudsRotationSpeed: number = 0.0007; // Reduced to avoid glitchiness
  private lastTime: number = 0; // Keep track of last update time
  private satelliteDataLoaded: boolean = false;
  private actualSatellitePositions: Array<{id: string, position: THREE.Vector3}> = [];

  constructor() {
    // Create Earth geometry with sizing similar to reference implementation
    const earthGeometry = new THREE.SphereGeometry(this.radius, 64, 64);
    
    // Load Earth texture - using the night map for better visual impact
    const textureLoader = new THREE.TextureLoader();
    
    console.log('Loading Earth textures...');
    
    // Load the night earth texture
    const earthTexture = textureLoader.load(
      './src/assets/8k_earth_nightmap.jpg',
      (texture) => {
        console.log('Earth night texture loaded successfully');
        // Let the texture wrap properly
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
      },
      undefined,
      (error) => {
        console.error('Failed to load Earth night texture:', error);
        // Create a fallback texture
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 512;
        const context = canvas.getContext('2d');
        if (context) {
          // Dark background for night map
          context.fillStyle = '#000033'; // Dark blue
          context.fillRect(0, 0, canvas.width, canvas.height);
          
          // Add some city lights
          context.fillStyle = '#FFFF99'; // Light yellow
          
          // North America
          this.drawCityLights(context, 250, 150, 100);
          
          // Europe
          this.drawCityLights(context, 480, 150, 70);
          
          // Asia
          this.drawCityLights(context, 650, 200, 120);
          
          // Australia
          this.drawCityLights(context, 750, 350, 40);
        }
      }
    );
    
    // Simplify Earth material to reduce rendering issues
    const earthMaterial = new THREE.MeshPhongMaterial({
      map: earthTexture,
      shininess: 5,
      emissive: new THREE.Color(0x111111), // Subtle city lights glow
      emissiveIntensity: 0.2,
      specular: new THREE.Color(0x333333), // Subtle ocean reflection
    });
    
    // Create Earth mesh
    this.earthMesh = new THREE.Mesh(earthGeometry, earthMaterial);
    
    // Create significantly larger clouds sphere for better opacity control and realism
    const cloudsGeometry = new THREE.SphereGeometry(this.radius * 1.06, 48, 48);
    
    // Load cloud texture
    const cloudsTexture = textureLoader.load(
      './src/assets/8k_earth_clouds.jpg',
      (texture) => {
        console.log('Clouds texture loaded successfully');
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
      },
      undefined,
      (error) => {
        console.error('Failed to load clouds texture:', error);
      }
    );
    
    // Create clouds material with enhanced transparency for realism
    const cloudsMaterial = new THREE.MeshPhongMaterial({
      map: cloudsTexture,
      transparent: true,
      opacity: 0.35, // More subtle opacity for realistic cloud effect
      depthWrite: false, // Prevent z-fighting
      side: THREE.DoubleSide, // Render both sides for better appearance
      shininess: 2, // Very slight shine for cloud highlights
      specular: new THREE.Color(0xFFFFFF), // Subtle specular highlights
      alphaTest: 0.1, // Helps with transparency artifacts
    });
    
    // Create clouds mesh as a separate sphere
    this.cloudsMesh = new THREE.Mesh(cloudsGeometry, cloudsMaterial);
    
    // Begin loading NOAA satellite data
    this.loadActualSatellitePositions();
  }
  
  public getMesh(): THREE.Group {
    // Create a group to hold both the Earth and clouds
    const group = new THREE.Group();
    
    // Use just one light source to avoid conflicts
    const ambientLight = new THREE.AmbientLight(0xFFFFFF, 0.5);
    group.add(ambientLight);
    
    // Position clouds separately to avoid z-fighting
    this.cloudsMesh.renderOrder = 1; // Ensure clouds render after Earth
    
    // Add Earth and clouds to the group
    group.add(this.earthMesh);
    group.add(this.cloudsMesh);
    
    return group;
  }
  
  public update(deltaTime: number): void {
    const currentTime = Date.now();
    if (this.lastTime === 0) {
      this.lastTime = currentTime;
      return;
    }
    
    // Calculate real delta time to smooth motion
    const realDelta = Math.min(currentTime - this.lastTime, 50); // Cap at 50ms to avoid large jumps
    this.lastTime = currentTime;
    
    // Use smoothed delta time for rotation
    this.earthMesh.rotation.y += this.earthRotationSpeed * realDelta;
    this.cloudsMesh.rotation.y += this.cloudsRotationSpeed * realDelta;
  }
  
  // Helper method to draw city lights for the fallback night texture
  private drawCityLights(context: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number): void {
    // Draw clusters of small dots to represent city lights
    for (let i = 0; i < 200; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * radius;
      const x = centerX + Math.cos(angle) * distance;
      const y = centerY + Math.sin(angle) * distance;
      
      const size = Math.random() * 2 + 0.5;
      context.beginPath();
      context.arc(x, y, size, 0, Math.PI * 2);
      context.fill();
    }
  }

  // Convert latitude and longitude to 3D position
  public latLongToVector3(latitude: number, longitude: number, altitude: number = 0): THREE.Vector3 {
    // Convert latitude and longitude from degrees to radians
    const phi = (90 - latitude) * (Math.PI / 180);
    const theta = (longitude + 180) * (Math.PI / 180);
    
    // Calculate position
    const x = -Math.sin(phi) * Math.cos(theta) * (this.radius + altitude);
    const y = Math.cos(phi) * (this.radius + altitude);
    const z = Math.sin(phi) * Math.sin(theta) * (this.radius + altitude);
    
    return new THREE.Vector3(x, y, z);
  }
  
  // Load actual satellite positions from NOAA light obstruction mask data
  private loadActualSatellitePositions(): void {
    // In a real implementation, this would fetch data from NOAA's API
    // For demonstration purposes, we'll simulate loading data
    console.log('Loading actual satellite positions from NOAA light obstruction mask data...');
    
    // Simulate API fetch with setTimeout
    setTimeout(() => {
      // This is where you would parse NOAA's light obstruction mask data
      // to determine actual satellite positions
      
      // For demonstration, we'll create some sample data
      // In production, this would come from the NOAA API
      const sampleSatellites = [
        { id: 'noaa_1', lat: 45.2, lng: -122.5, alt: 750 },
        { id: 'noaa_2', lat: 32.8, lng: 56.7, alt: 720 },
        { id: 'noaa_3', lat: -15.3, lng: 100.2, alt: 810 },
        { id: 'noaa_4', lat: 67.9, lng: -45.1, alt: 680 },
        { id: 'noaa_5', lat: -35.6, lng: 155.8, alt: 750 }
      ];
      
      // Convert to Vector3 positions
      this.actualSatellitePositions = sampleSatellites.map(sat => ({
        id: sat.id,
        position: this.latLongToVector3(sat.lat, sat.lng, sat.alt)
      }));
      
      this.satelliteDataLoaded = true;
      console.log(`Loaded ${this.actualSatellitePositions.length} satellite positions from NOAA data`);
    }, 2000); // Simulate 2-second loading time
  }
  
  // Get actual satellite positions (only returns data if loaded)
  public getActualSatellitePositions(): Array<{id: string, position: THREE.Vector3}> {
    return this.satelliteDataLoaded ? this.actualSatellitePositions : [];
  }
  
  // Get Earth radius in kilometers
  public getRadius(): number {
    return this.radius;
  }
}
