# 🚶 Walkable Ground Station User Guide

## Overview
The Enhanced Ground Station View provides a high-fidelity, walkable environment where you can explore a realistic Starlink ground station from a first-person perspective.

## How to Access

1. **Select a Ground Station**: Click on any ground station in the global satellite view
2. **Enter Walkable Mode**: Click the "Toggle First-Person View" button in the Ground Station Controls panel
3. **Start Walking**: Click anywhere on the screen to activate pointer lock and begin walking

## Controls

### Movement
- **WASD Keys**: Walk forward, left, backward, right
- **Mouse**: Look around (360° view)
- **Shift**: Run (2x speed)
- **Space**: Jump
- **ESC**: Exit first-person mode

### Camera
- **Mouse Movement**: Free-look camera (after clicking to activate)
- **Scroll**: No zoom (realistic first-person perspective)

## Features

### 🏗️ Realistic Infrastructure
- **Antenna Systems**: Multiple parabolic dishes, phased arrays, helical antennas
- **Control Building**: Equipment racks, servers, LED status indicators
- **Utilities**: Power transformers, backup generators, fuel tanks
- **Security**: Perimeter fencing, access gates, parking areas
- **Roads**: Paved access roads connecting facilities

### 🌍 High-Fidelity Environment
- **Terrain**: Procedural heightmaps with realistic elevation
- **Materials**: PBR (Physically Based Rendering) with proper roughness/metalness
- **Textures**: Concrete, metal, grass, asphalt with normal maps
- **Collision**: Walk on terrain with realistic height following

### ☀️ Dynamic Lighting
- **Time of Day**: Real-time sun/moon positioning based on coordinates
- **Weather**: Atmospheric scattering, haze effects
- **Shadows**: High-quality shadow mapping
- **Sky**: Realistic sky dome with stars and atmospheric effects

### 📡 Live Operations
- **Satellite Tracking**: Watch antennas automatically point at passing satellites
- **Signal Beams**: Visual representation of active communication links
- **Real-time Data**: Live facility status, bandwidth, connected satellites
- **Time Controls**: Speed up time to see lighting changes (60x normal speed)

## Interface Elements

### Information Panel (Top Left)
- Ground station name and coordinates
- Operational status and bandwidth
- Connected satellite count
- Movement instructions

### Time Panel (Top Right)
- Current time (accelerated)
- Sun elevation angle
- Lighting phase (Day/Night/Twilight)

## Technical Details

### Performance Optimizations
- **Terrain LOD**: 512x512 heightmap resolution
- **Texture Streaming**: Efficient PBR material loading
- **Culling**: Automatic frustum and distance culling
- **Adaptive Quality**: Performance monitoring with quality adjustment

### Realism Features
- **Accurate Coordinates**: Real ground station locations
- **Proper Scale**: 1:1 scale terrain and infrastructure
- **Physics**: Gravity, collision detection, terrain following
- **Environmental**: Weather effects, atmospheric rendering

## Tips for Best Experience

1. **Movement**: Use WASD for smooth navigation, mouse for looking around
2. **Exploration**: Walk around the perimeter to see all antenna types
3. **Observation**: Stand near antennas to watch satellite tracking
4. **Time**: Let time pass to see lighting changes and day/night cycle
5. **Exit**: Press ESC anytime to return to global satellite view

## Troubleshooting

### Performance Issues
- The system automatically adjusts quality based on framerate
- Complex antenna models may impact performance on lower-end hardware
- Time acceleration can be reduced if needed

### Controls Not Working
- Ensure pointer lock is activated (click on screen)
- Check browser permissions for pointer lock
- Use ESC to exit and re-enter if needed

### Visual Issues
- Allow textures time to load on first visit
- Lighting may take a moment to initialize properly
- Refresh page if materials appear incorrect

## Integration Notes

The walkable ground station seamlessly integrates with:
- Global satellite tracking system
- Real-time network simulation
- Ground station operational status
- Time-synchronized lighting and positioning

Exit at any time to return to the global view while maintaining simulation state.