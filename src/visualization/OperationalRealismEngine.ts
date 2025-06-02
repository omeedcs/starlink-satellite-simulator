import * as THREE from 'three';
import { RFOcclusionEngine, AntennaViewMask } from './RFOcclusionEngine';
import { RegulationEngine, RegulationCompliance } from './RegulationEngine';
import { AntennaGainProfiles, AntennaConfiguration, LinkBudgetCalculation } from './AntennaGainProfiles';
import { AntennaSlewingController, AntennaState, HandoffEvent } from './AntennaSlewingController';
import { RFBeamVisualizer, BeamVisualizationConfig, LinkQualityMetrics } from './RFBeamVisualizer';
import { LinkStatusUI, LinkStatusDisplay } from './LinkStatusUI';

export interface OperationalScenario {
  scenarioId: string;
  name: string;
  description: string;
  duration: number; // seconds
  groundStations: Array<{
    id: string;
    position: { latitude: number; longitude: number };
    antennas: Array<{
      id: string;
      type: string;
      frequencyBand: string;
    }>;
  }>;
  satellites: Array<{
    id: string;
    orbitalElements: any;
    frequencyPlan: string[];
  }>;
  environmentalConditions: {
    weather: {
      rain: number; // mm/hr
      wind: number; // km/hr
      temperature: number; // °C
      humidity: number; // %
    };
    rf: {
      interference: number; // dB
      atmosphericLoss: number; // dB
      ionosphericActivity: number; // SFU
    };
  };
  regulations: {
    region: string;
    frequencyCoordination: boolean;
    powerLimits: boolean;
    elevationMasks: boolean;
  };
}

export interface SystemPerformanceMetrics {
  timestamp: number;
  totalActiveLinks: number;
  averageLinkMargin: number;
  averageDataRate: number; // Mbps
  handoffRate: number; // per minute
  regulatoryViolations: number;
  rfOcclusionRate: number; // percentage
  antennaUtilization: number; // percentage
  systemAvailability: number; // percentage
  meanTimeToHandoff: number; // seconds
}

export class OperationalRealismEngine {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  
  // Core subsystems
  private rfOcclusion: RFOcclusionEngine;
  private regulation: RegulationEngine;
  private antennaGains: AntennaGainProfiles;
  private antennaSlewing: AntennaSlewingController;
  private beamVisualizer: RFBeamVisualizer;
  private linkStatusUI: LinkStatusUI;
  
  // System state
  private activeScenario: OperationalScenario | null = null;
  private systemMetrics: SystemPerformanceMetrics;
  private isRunning: boolean = false;
  private lastUpdateTime: number = 0;
  private updateFrequency: number = 10; // Hz
  
  // Performance monitoring
  private performanceHistory: SystemPerformanceMetrics[] = [];
  private maxHistoryLength: number = 3600; // 1 hour at 1Hz
  
  // Active tracking
  private activeLinkBudgets: Map<string, LinkBudgetCalculation> = new Map();
  private activeBeams: Map<string, string> = new Map(); // antennaId -> beamId
  private handoffQueue: HandoffEvent[] = [];
  
  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
    linkStatusContainer: string
  ) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    
    // Initialize subsystems
    this.rfOcclusion = new RFOcclusionEngine(1.0, false); // 1° resolution, debug off
    this.regulation = new RegulationEngine(scene);
    this.antennaGains = new AntennaGainProfiles();
    this.antennaSlewing = new AntennaSlewingController();
    this.beamVisualizer = new RFBeamVisualizer(scene);
    this.linkStatusUI = new LinkStatusUI(linkStatusContainer);
    
    // Initialize system metrics
    this.systemMetrics = this.initializeMetrics();
    
    console.log('OperationalRealismEngine initialized with all subsystems');
  }

  private initializeMetrics(): SystemPerformanceMetrics {
    return {
      timestamp: Date.now(),
      totalActiveLinks: 0,
      averageLinkMargin: 0,
      averageDataRate: 0,
      handoffRate: 0,
      regulatoryViolations: 0,
      rfOcclusionRate: 0,
      antennaUtilization: 0,
      systemAvailability: 0,
      meanTimeToHandoff: 0
    };
  }

  public async loadScenario(scenario: OperationalScenario): Promise<void> {
    console.log(`Loading operational scenario: ${scenario.name}`);
    
    this.activeScenario = scenario;
    
    // Setup ground stations and antennas
    for (const gs of scenario.groundStations) {
      for (const antenna of gs.antennas) {
        // Register antenna with slewing controller
        this.antennaSlewing.registerAntenna(
          antenna.id,
          antenna.type,
          { azimuth: 0, elevation: 90 } // Start pointing up
        );
        
        // Create link status display
        const linkDisplay: LinkStatusDisplay = {
          containerId: 'link-status-ui',
          antennaId: antenna.id,
          groundStationId: gs.id,
          position: { x: 0, y: 0 },
          size: { width: 320, height: 240 },
          showDetails: true,
          updateRate: 5
        };
        
        this.linkStatusUI.createLinkDisplay(linkDisplay);
      }
      
      // Add ground station position to RF occlusion environment
      // This would integrate with terrain/building meshes
    }
    
    // Load regulatory rules for the region
    if (scenario.regulations.region === 'US') {
      // FCC rules already loaded by default
    } else {
      // Load regional regulations via API
      console.log(`Loading regulations for region: ${scenario.regulations.region}`);
    }
    
    console.log(`Scenario loaded: ${scenario.groundStations.length} ground stations, ${scenario.satellites.length} satellites`);
  }

  public startSimulation(): void {
    if (!this.activeScenario) {
      console.error('No scenario loaded');
      return;
    }
    
    this.isRunning = true;
    this.lastUpdateTime = Date.now();
    
    console.log('Operational realism simulation started');
  }

  public stopSimulation(): void {
    this.isRunning = false;
    console.log('Operational realism simulation stopped');
  }

  public update(deltaTime: number): void {
    if (!this.isRunning || !this.activeScenario) return;
    
    const currentTime = Date.now();
    const timeSinceLastUpdate = currentTime - this.lastUpdateTime;
    
    // Update at specified frequency
    if (timeSinceLastUpdate >= 1000 / this.updateFrequency) {
      this.performFullSystemUpdate(deltaTime);
      this.lastUpdateTime = currentTime;
    }
    
    // Always update beam visualization for smooth animation
    this.beamVisualizer.update(deltaTime);
    this.antennaSlewing.update(deltaTime);
  }

  private performFullSystemUpdate(deltaTime: number): void {
    // Get current satellite positions (would come from SatelliteNetwork)
    const satellitePositions = this.getCurrentSatellitePositions();
    
    // Update each ground station
    for (const gs of this.activeScenario!.groundStations) {
      for (const antenna of gs.antennas) {
        this.updateAntennaOperations(
          antenna.id,
          gs.id,
          gs.position,
          antenna.frequencyBand,
          satellitePositions
        );
      }
    }
    
    // Process handoff queue
    this.processHandoffQueue();
    
    // Update system metrics
    this.updateSystemMetrics();
    
    // Check for regulatory compliance
    this.performComplianceCheck();
  }

  private updateAntennaOperations(
    antennaId: string,
    groundStationId: string,
    gsPosition: { latitude: number; longitude: number },
    frequencyBand: string,
    satellitePositions: Array<{ id: string; position: THREE.Vector3 }>
  ): void {
    // Get antenna position in 3D space
    const antennaPosition = this.calculateAntennaPosition(gsPosition);
    
    // Perform RF occlusion check
    const viewMask = this.rfOcclusion.performOcclusionCheck(
      antennaPosition,
      antennaId,
      groundStationId,
      satellitePositions
    );
    
    // Find best satellite based on link budget and visibility
    const bestSatellite = this.findOptimalSatellite(
      antennaId,
      antennaPosition,
      viewMask,
      frequencyBand
    );
    
    if (bestSatellite) {
      this.establishOrMaintainLink(
        antennaId,
        groundStationId,
        gsPosition,
        bestSatellite,
        frequencyBand,
        antennaPosition
      );
    } else {
      this.handleNoSatelliteAvailable(antennaId);
    }
  }

  private findOptimalSatellite(
    antennaId: string,
    antennaPosition: THREE.Vector3,
    viewMask: AntennaViewMask,
    frequencyBand: string
  ): { id: string; position: THREE.Vector3; linkBudget: LinkBudgetCalculation } | null {
    let bestSatellite = null;
    let bestLinkMargin = -Infinity;
    
    for (const satelliteId of viewMask.visibleSatellites) {
      const satellitePos = this.getSatellitePosition(satelliteId);
      if (!satellitePos) continue;
      
      // Calculate link budget
      const linkBudget = this.antennaGains.calculateLinkBudget(
        antennaId,
        satelliteId,
        satellitePos,
        antennaPosition,
        this.getFrequencyForBand(frequencyBand),
        50 // 50 dBW transmit power
      );
      
      if (linkBudget.linkMargin > bestLinkMargin) {
        bestLinkMargin = linkBudget.linkMargin;
        bestSatellite = {
          id: satelliteId,
          position: satellitePos,
          linkBudget
        };
      }
    }
    
    return bestSatellite;
  }

  private establishOrMaintainLink(
    antennaId: string,
    groundStationId: string,
    gsPosition: { latitude: number; longitude: number },
    satellite: { id: string; position: THREE.Vector3; linkBudget: LinkBudgetCalculation },
    frequencyBand: string,
    antennaPosition: THREE.Vector3
  ): void {
    const antennaState = this.antennaSlewing.getAntennaState(antennaId);
    if (!antennaState) return;
    
    // Check if we need to handoff to a different satellite
    if (antennaState.trackedSatelliteId && 
        antennaState.trackedSatelliteId !== satellite.id &&
        satellite.linkBudget.linkMargin > 3) { // 3dB handoff threshold
      
      this.initiateHandoff(antennaId, antennaState.trackedSatelliteId, satellite);
      return;
    }
    
    // Calculate required pointing angles
    const direction = satellite.position.clone().sub(antennaPosition).normalize();
    const azimuth = Math.atan2(direction.x, direction.z) * 180 / Math.PI;
    const elevation = Math.asin(direction.y) * 180 / Math.PI;
    
    // Check regulatory compliance
    const compliance = this.regulation.checkCompliance(
      groundStationId,
      antennaId,
      gsPosition,
      frequencyBand,
      elevation,
      azimuth,
      satellite.linkBudget.receivedPower + 30 // Convert to EIRP estimate
    );
    
    if (!compliance.isCompliant) {
      console.warn(`Regulatory violation for antenna ${antennaId}:`, compliance.violatedRules);
      this.systemMetrics.regulatoryViolations++;
      return;
    }
    
    // Command antenna to track satellite
    if (!antennaState.isTracking || 
        Math.abs(antennaState.position.azimuth - azimuth) > 1 ||
        Math.abs(antennaState.position.elevation - elevation) > 1) {
      
      this.antennaSlewing.commandSlew(antennaId, azimuth, elevation, 'normal', 0.1);
    }
    
    // Create or update RF beam visualization
    this.updateBeamVisualization(
      antennaId,
      antennaPosition,
      satellite.position,
      satellite.linkBudget,
      frequencyBand
    );
    
    // Update link status UI
    const linkMetrics = this.calculateLinkMetrics(satellite.linkBudget);
    antennaState.trackedSatelliteId = satellite.id;
    antennaState.isTracking = true;
    
    this.linkStatusUI.updateLinkStatus(antennaId, linkMetrics, antennaState, satellite.linkBudget);
    
    // Store link budget for metrics
    this.activeLinkBudgets.set(antennaId, satellite.linkBudget);
  }

  private initiateHandoff(
    antennaId: string,
    fromSatelliteId: string,
    toSatellite: { id: string; position: THREE.Vector3; linkBudget: LinkBudgetCalculation }
  ): void {
    const antennaPosition = this.getAntennaPosition(antennaId);
    if (!antennaPosition) return;
    
    const direction = toSatellite.position.clone().sub(antennaPosition).normalize();
    const azimuth = Math.atan2(direction.x, direction.z) * 180 / Math.PI;
    const elevation = Math.asin(direction.y) * 180 / Math.PI;
    
    const handoffId = this.antennaSlewing.initiateHandoff(
      antennaId,
      fromSatelliteId,
      toSatellite.id,
      { azimuth, elevation },
      'make-before-break'
    );
    
    console.log(`Handoff initiated: ${fromSatelliteId} → ${toSatellite.id} for antenna ${antennaId}`);
  }

  private updateBeamVisualization(
    antennaId: string,
    antennaPosition: THREE.Vector3,
    satellitePosition: THREE.Vector3,
    linkBudget: LinkBudgetCalculation,
    frequencyBand: string
  ): void {
    const beamId = this.activeBeams.get(antennaId);
    
    const beamConfig: BeamVisualizationConfig = {
      beamId: beamId || `beam_${antennaId}`,
      antennaPosition,
      targetPosition: satellitePosition,
      frequency: linkBudget.frequency,
      power: linkBudget.receivedPower + 30, // Estimate EIRP
      beamwidth: 1.2, // degrees
      polarization: 'rhcp',
      modulation: {
        type: this.selectOptimalModulation(linkBudget.linkMargin),
        symbolRate: 50e6,
        carrierFrequency: linkBudget.frequency,
        bandwidth: 36,
        spectralEfficiency: 4,
        requiredSNR: 10
      },
      linkQuality: {
        snr: linkBudget.snr,
        ber: Math.pow(10, -6 - linkBudget.linkMargin), // Simplified BER calculation
        rssi: linkBudget.receivedPower - 30,
        codewordErrorRate: 0.001,
        frameErrorRate: 0.0001,
        linkMargin: linkBudget.linkMargin,
        adaptiveModulation: true,
        currentModulation: this.selectOptimalModulation(linkBudget.linkMargin)
      },
      visualProperties: {
        showModulationPattern: true,
        showFresnelZones: false,
        showPowerDensity: true,
        animationSpeed: 1.0,
        colorScheme: 'quality'
      }
    };
    
    if (beamId) {
      this.beamVisualizer.updateBeam(beamId, beamConfig);
    } else {
      const newBeamId = this.beamVisualizer.createBeam(beamConfig);
      this.activeBeams.set(antennaId, newBeamId);
    }
  }

  private selectOptimalModulation(linkMargin: number): 'QPSK' | 'QAM16' | 'QAM64' | 'QAM256' | 'OFDM' {
    if (linkMargin > 15) return 'QAM256';
    if (linkMargin > 10) return 'QAM64';
    if (linkMargin > 6) return 'QAM16';
    return 'QPSK';
  }

  private calculateLinkMetrics(linkBudget: LinkBudgetCalculation): LinkQualityMetrics {
    return {
      snr: linkBudget.snr,
      ber: Math.pow(10, -6 - linkBudget.linkMargin),
      rssi: linkBudget.receivedPower - 30,
      codewordErrorRate: 0.001,
      frameErrorRate: 0.0001,
      linkMargin: linkBudget.linkMargin,
      adaptiveModulation: true,
      currentModulation: this.selectOptimalModulation(linkBudget.linkMargin)
    };
  }

  private handleNoSatelliteAvailable(antennaId: string): void {
    const antennaState = this.antennaSlewing.getAntennaState(antennaId);
    if (antennaState) {
      antennaState.isTracking = false;
      antennaState.trackedSatelliteId = undefined;
    }
    
    // Remove beam visualization
    const beamId = this.activeBeams.get(antennaId);
    if (beamId) {
      this.beamVisualizer.removeBeam(beamId);
      this.activeBeams.delete(antennaId);
    }
    
    this.activeLinkBudgets.delete(antennaId);
  }

  private updateSystemMetrics(): void {
    const currentTime = Date.now();
    const activeLinks = this.activeLinkBudgets.size;
    
    let totalLinkMargin = 0;
    let totalDataRate = 0;
    
    this.activeLinkBudgets.forEach(linkBudget => {
      totalLinkMargin += linkBudget.linkMargin;
      
      // Estimate data rate based on link quality
      const modulation = this.selectOptimalModulation(linkBudget.linkMargin);
      const spectralEfficiency = { QPSK: 2, QAM16: 4, QAM64: 6, QAM256: 8, OFDM: 5 }[modulation];
      totalDataRate += spectralEfficiency * 36 * 0.8; // 36 MHz, 80% coding rate
    });
    
    this.systemMetrics = {
      timestamp: currentTime,
      totalActiveLinks: activeLinks,
      averageLinkMargin: activeLinks > 0 ? totalLinkMargin / activeLinks : 0,
      averageDataRate: activeLinks > 0 ? totalDataRate / activeLinks : 0,
      handoffRate: this.calculateHandoffRate(),
      regulatoryViolations: this.systemMetrics.regulatoryViolations,
      rfOcclusionRate: this.calculateOcclusionRate(),
      antennaUtilization: this.calculateAntennaUtilization(),
      systemAvailability: this.calculateSystemAvailability(),
      meanTimeToHandoff: this.calculateMeanTimeToHandoff()
    };
    
    // Store in history
    this.performanceHistory.push(this.systemMetrics);
    if (this.performanceHistory.length > this.maxHistoryLength) {
      this.performanceHistory.shift();
    }
  }

  private calculateHandoffRate(): number {
    // Count handoffs in the last minute
    const oneMinuteAgo = Date.now() - 60000;
    const recentHandoffs = this.antennaSlewing.getHandoffHistory()
      .filter(h => h.initiationTime > oneMinuteAgo);
    return recentHandoffs.length;
  }

  private calculateOcclusionRate(): number {
    const stats = this.rfOcclusion.getOcclusionStatistics();
    return stats.averageOccludedSatellites / 
           (stats.averageVisibleSatellites + stats.averageOccludedSatellites) * 100;
  }

  private calculateAntennaUtilization(): number {
    const totalAntennas = this.activeScenario?.groundStations
      .reduce((sum, gs) => sum + gs.antennas.length, 0) || 1;
    return (this.activeLinkBudgets.size / totalAntennas) * 100;
  }

  private calculateSystemAvailability(): number {
    // Simplified availability calculation
    const targetLinks = this.activeScenario?.groundStations
      .reduce((sum, gs) => sum + gs.antennas.length, 0) || 1;
    return (this.activeLinkBudgets.size / targetLinks) * 100;
  }

  private calculateMeanTimeToHandoff(): number {
    const handoffs = this.antennaSlewing.getHandoffHistory();
    if (handoffs.length === 0) return 0;
    
    const completedHandoffs = handoffs.filter(h => h.completionTime);
    if (completedHandoffs.length === 0) return 0;
    
    const totalTime = completedHandoffs.reduce((sum, h) => 
      sum + (h.completionTime! - h.initiationTime), 0);
    return totalTime / completedHandoffs.length / 1000; // Convert to seconds
  }

  private processHandoffQueue(): void {
    // Process any pending handoffs
    // This would integrate with the antenna slewing controller
  }

  private performComplianceCheck(): void {
    // Perform periodic regulatory compliance checks
    // This would check all active links against current regulations
  }

  // Helper methods for integration
  private getCurrentSatellitePositions(): Array<{ id: string; position: THREE.Vector3 }> {
    // This would integrate with SatelliteNetwork to get real positions
    // For now, return empty array
    return [];
  }

  private calculateAntennaPosition(gsPosition: { latitude: number; longitude: number }): THREE.Vector3 {
    // Convert lat/lon to 3D position
    const earthRadius = 6371000; // meters
    const lat = gsPosition.latitude * Math.PI / 180;
    const lon = gsPosition.longitude * Math.PI / 180;
    
    return new THREE.Vector3(
      earthRadius * Math.cos(lat) * Math.sin(lon),
      earthRadius * Math.sin(lat),
      earthRadius * Math.cos(lat) * Math.cos(lon)
    );
  }

  private getSatellitePosition(satelliteId: string): THREE.Vector3 | null {
    // This would integrate with SatelliteNetwork
    return null;
  }

  private getAntennaPosition(antennaId: string): THREE.Vector3 | null {
    // This would get antenna position from configuration
    return null;
  }

  private getFrequencyForBand(band: string): number {
    const frequencies = {
      'C': 6000,
      'Ku': 14000,
      'Ka': 20000
    };
    return frequencies[band as keyof typeof frequencies] || 14000;
  }

  public getSystemMetrics(): SystemPerformanceMetrics {
    return { ...this.systemMetrics };
  }

  public getPerformanceHistory(): SystemPerformanceMetrics[] {
    return [...this.performanceHistory];
  }

  public exportScenarioReport(): string {
    const report = {
      scenario: this.activeScenario?.name,
      duration: Date.now() - (this.performanceHistory[0]?.timestamp || Date.now()),
      metrics: this.systemMetrics,
      history: this.performanceHistory,
      handoffEvents: this.antennaSlewing.getHandoffHistory(),
      beamStatistics: this.beamVisualizer.getBeamStatistics(),
      regulationSummary: this.regulation.getRegulationSummary(),
      occlusionStatistics: this.rfOcclusion.getOcclusionStatistics()
    };
    
    return JSON.stringify(report, null, 2);
  }

  public dispose(): void {
    this.stopSimulation();
    
    // Dispose all subsystems
    this.rfOcclusion.dispose();
    this.regulation.dispose();
    this.antennaGains.dispose();
    this.antennaSlewing.dispose();
    this.beamVisualizer.dispose();
    this.linkStatusUI.dispose();
    
    // Clear state
    this.activeLinkBudgets.clear();
    this.activeBeams.clear();
    this.handoffQueue = [];
    this.performanceHistory = [];
    
    console.log('OperationalRealismEngine disposed');
  }
}