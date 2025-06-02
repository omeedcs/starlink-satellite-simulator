import * as THREE from 'three';
import { AntennaConfiguration, AntennaGainPattern } from './AntennaGainProfiles';

export interface SlewingConstraints {
  maxAzimuthRate: number; // degrees/second
  maxElevationRate: number; // degrees/second
  maxAzimuthAcceleration: number; // degrees/second²
  maxElevationAcceleration: number; // degrees/second²
  azimuthLimits: { min: number; max: number }; // degrees
  elevationLimits: { min: number; max: number }; // degrees
  slipRingLimits?: { minWrap: number; maxWrap: number }; // degrees for cable wrap
}

export interface SlewingCommand {
  commandId: string;
  targetAzimuth: number; // degrees
  targetElevation: number; // degrees
  priority: 'emergency' | 'high' | 'normal' | 'low';
  maxDuration: number; // seconds
  accuracyRequirement: number; // degrees
  issueTime: number; // timestamp
}

export interface SlewingTrajectory {
  startTime: number;
  endTime: number;
  startPosition: { azimuth: number; elevation: number };
  endPosition: { azimuth: number; elevation: number };
  azimuthTrajectory: {
    phases: Array<{
      type: 'acceleration' | 'constant_velocity' | 'deceleration';
      startTime: number;
      duration: number;
      startVelocity: number;
      endVelocity: number;
      acceleration: number;
    }>;
  };
  elevationTrajectory: {
    phases: Array<{
      type: 'acceleration' | 'constant_velocity' | 'deceleration';
      startTime: number;
      duration: number;
      startVelocity: number;
      endVelocity: number;
      acceleration: number;
    }>;
  };
}

export interface HandoffEvent {
  eventId: string;
  fromSatelliteId: string;
  toSatelliteId: string;
  initiationTime: number;
  completionTime?: number;
  handoffType: 'seamless' | 'break-before-make' | 'make-before-break';
  status: 'planned' | 'in_progress' | 'completed' | 'failed';
  reason: 'elevation_limit' | 'link_quality' | 'constellation_geometry' | 'regulatory';
  fromPosition: { azimuth: number; elevation: number };
  toPosition: { azimuth: number; elevation: number };
  acquisitionDelay: number; // seconds
  dataLossTime: number; // seconds
}

export interface AntennaState {
  antennaId: string;
  timestamp: number;
  position: { azimuth: number; elevation: number };
  velocity: { azimuth: number; elevation: number }; // degrees/second
  acceleration: { azimuth: number; elevation: number }; // degrees/second²
  isTracking: boolean;
  trackedSatelliteId?: string;
  slewingCommand?: SlewingCommand;
  trajectory?: SlewingTrajectory;
  handoffEvent?: HandoffEvent;
  status: 'idle' | 'slewing' | 'tracking' | 'acquiring' | 'fault';
  faultCodes: string[];
}

export class AntennaSlewingController {
  private antennaStates: Map<string, AntennaState> = new Map();
  private slewingConstraints: Map<string, SlewingConstraints> = new Map();
  private activeCommands: Map<string, SlewingCommand> = new Map();
  private commandQueue: SlewingCommand[] = [];
  private handoffHistory: HandoffEvent[] = [];
  
  // Performance tracking
  private pointingErrors: Map<string, number[]> = new Map();
  private slewingMetrics: Map<string, {
    averageSlewTime: number;
    peakVelocity: number;
    trackingAccuracy: number;
    handoffSuccessRate: number;
  }> = new Map();
  
  // Real-time simulation
  private lastUpdateTime: number = 0;
  private deltaTimeAccumulator: number = 0;
  private simulationTimeStep: number = 0.1; // seconds
  
  constructor() {
    this.initializeDefaultConstraints();
    console.log('AntennaSlewingController initialized');
  }

  private initializeDefaultConstraints(): void {
    // Typical constraints for different antenna types
    const parabolicConstraints: SlewingConstraints = {
      maxAzimuthRate: 5.0, // degrees/second
      maxElevationRate: 5.0,
      maxAzimuthAcceleration: 2.0, // degrees/second²
      maxElevationAcceleration: 2.0,
      azimuthLimits: { min: -270, max: 270 }, // ±270° wrap
      elevationLimits: { min: 5, max: 90 }, // 5° minimum elevation
      slipRingLimits: { minWrap: -360, maxWrap: 360 }
    };

    const phasedArrayConstraints: SlewingConstraints = {
      maxAzimuthRate: 180.0, // Electronic steering - very fast
      maxElevationRate: 180.0,
      maxAzimuthAcceleration: 1000.0,
      maxElevationAcceleration: 1000.0,
      azimuthLimits: { min: -60, max: 60 }, // Limited scan range
      elevationLimits: { min: 20, max: 90 }
    };

    this.slewingConstraints.set('parabolic', parabolicConstraints);
    this.slewingConstraints.set('phased-array', phasedArrayConstraints);
  }

  public registerAntenna(
    antennaId: string,
    antennaType: string,
    initialPosition: { azimuth: number; elevation: number },
    customConstraints?: Partial<SlewingConstraints>
  ): void {
    // Get base constraints for antenna type
    const baseConstraints = this.slewingConstraints.get(antennaType) || 
                           this.slewingConstraints.get('parabolic')!;
    
    // Apply custom constraints if provided
    const constraints: SlewingConstraints = {
      ...baseConstraints,
      ...customConstraints
    };

    this.slewingConstraints.set(antennaId, constraints);

    // Initialize antenna state
    const state: AntennaState = {
      antennaId,
      timestamp: Date.now(),
      position: { ...initialPosition },
      velocity: { azimuth: 0, elevation: 0 },
      acceleration: { azimuth: 0, elevation: 0 },
      isTracking: false,
      status: 'idle',
      faultCodes: []
    };

    this.antennaStates.set(antennaId, state);
    this.pointingErrors.set(antennaId, []);

    console.log(`Registered antenna ${antennaId} with ${antennaType} constraints`);
  }

  public commandSlew(
    antennaId: string,
    targetAzimuth: number,
    targetElevation: number,
    priority: SlewingCommand['priority'] = 'normal',
    accuracyRequirement: number = 0.1
  ): string {
    const commandId = `cmd_${antennaId}_${Date.now()}`;
    
    const command: SlewingCommand = {
      commandId,
      targetAzimuth,
      targetElevation,
      priority,
      maxDuration: 60, // seconds
      accuracyRequirement,
      issueTime: Date.now()
    };

    // Check if antenna exists
    const state = this.antennaStates.get(antennaId);
    if (!state) {
      console.error(`Antenna ${antennaId} not registered`);
      return '';
    }

    // Validate target position
    const constraints = this.slewingConstraints.get(antennaId)!;
    if (!this.validateTargetPosition(targetAzimuth, targetElevation, constraints)) {
      console.error(`Target position outside constraints for antenna ${antennaId}`);
      return '';
    }

    // Add to command queue (sorted by priority)
    this.insertCommandByPriority(command);
    
    // Process command if antenna is available
    if (state.status === 'idle' || priority === 'emergency') {
      this.processNextCommand(antennaId);
    }

    return commandId;
  }

  private insertCommandByPriority(command: SlewingCommand): void {
    const priorityOrder = { 'emergency': 0, 'high': 1, 'normal': 2, 'low': 3 };
    const commandPriority = priorityOrder[command.priority];
    
    let insertIndex = this.commandQueue.length;
    for (let i = 0; i < this.commandQueue.length; i++) {
      if (priorityOrder[this.commandQueue[i].priority] > commandPriority) {
        insertIndex = i;
        break;
      }
    }
    
    this.commandQueue.splice(insertIndex, 0, command);
  }

  private processNextCommand(antennaId: string): void {
    const commandIndex = this.commandQueue.findIndex(cmd => 
      cmd.commandId.includes(antennaId)
    );
    
    if (commandIndex === -1) return;
    
    const command = this.commandQueue.splice(commandIndex, 1)[0];
    const state = this.antennaStates.get(antennaId)!;
    const constraints = this.slewingConstraints.get(antennaId)!;

    // Generate optimal trajectory
    const trajectory = this.generateOptimalTrajectory(
      state.position,
      { azimuth: command.targetAzimuth, elevation: command.targetElevation },
      constraints
    );

    // Update antenna state
    state.slewingCommand = command;
    state.trajectory = trajectory;
    state.status = 'slewing';
    state.timestamp = Date.now();

    this.activeCommands.set(command.commandId, command);
    
    console.log(`Started slewing antenna ${antennaId} to (${command.targetAzimuth}°, ${command.targetElevation}°)`);
  }

  private generateOptimalTrajectory(
    start: { azimuth: number; elevation: number },
    target: { azimuth: number; elevation: number },
    constraints: SlewingConstraints
  ): SlewingTrajectory {
    const startTime = Date.now();
    
    // Calculate required angular motion
    const azimuthDelta = this.calculateShortestAngularPath(start.azimuth, target.azimuth);
    const elevationDelta = target.elevation - start.elevation;
    
    // Generate time-optimal trajectory for each axis
    const azimuthTrajectory = this.generateAxisTrajectory(
      azimuthDelta,
      constraints.maxAzimuthRate,
      constraints.maxAzimuthAcceleration
    );
    
    const elevationTrajectory = this.generateAxisTrajectory(
      elevationDelta,
      constraints.maxElevationRate,
      constraints.maxElevationAcceleration
    );
    
    // Use the longer trajectory time
    const totalTime = Math.max(
      azimuthTrajectory.phases.reduce((sum, phase) => sum + phase.duration, 0),
      elevationTrajectory.phases.reduce((sum, phase) => sum + phase.duration, 0)
    );

    return {
      startTime,
      endTime: startTime + totalTime * 1000, // Convert to milliseconds
      startPosition: { ...start },
      endPosition: { ...target },
      azimuthTrajectory,
      elevationTrajectory
    };
  }

  private calculateShortestAngularPath(start: number, target: number): number {
    let delta = target - start;
    
    // Normalize to [-180, 180] for shortest path
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    
    return delta;
  }

  private generateAxisTrajectory(
    totalAngle: number,
    maxVelocity: number,
    maxAcceleration: number
  ): SlewingTrajectory['azimuthTrajectory'] {
    const phases: SlewingTrajectory['azimuthTrajectory']['phases'] = [];
    
    const absAngle = Math.abs(totalAngle);
    const direction = Math.sign(totalAngle);
    
    // Time to reach max velocity
    const accelTime = maxVelocity / maxAcceleration;
    const accelDistance = 0.5 * maxAcceleration * accelTime * accelTime;
    
    let currentTime = 0;
    
    if (2 * accelDistance >= absAngle) {
      // Triangular profile (no constant velocity phase)
      const finalTime = Math.sqrt(2 * absAngle / maxAcceleration);
      const peakVelocity = maxAcceleration * finalTime;
      
      // Acceleration phase
      phases.push({
        type: 'acceleration',
        startTime: currentTime,
        duration: finalTime / 2,
        startVelocity: 0,
        endVelocity: peakVelocity * direction,
        acceleration: maxAcceleration * direction
      });
      
      // Deceleration phase
      phases.push({
        type: 'deceleration',
        startTime: currentTime + finalTime / 2,
        duration: finalTime / 2,
        startVelocity: peakVelocity * direction,
        endVelocity: 0,
        acceleration: -maxAcceleration * direction
      });
    } else {
      // Trapezoidal profile
      const constantVelDistance = absAngle - 2 * accelDistance;
      const constantVelTime = constantVelDistance / maxVelocity;
      
      // Acceleration phase
      phases.push({
        type: 'acceleration',
        startTime: currentTime,
        duration: accelTime,
        startVelocity: 0,
        endVelocity: maxVelocity * direction,
        acceleration: maxAcceleration * direction
      });
      currentTime += accelTime;
      
      // Constant velocity phase
      phases.push({
        type: 'constant_velocity',
        startTime: currentTime,
        duration: constantVelTime,
        startVelocity: maxVelocity * direction,
        endVelocity: maxVelocity * direction,
        acceleration: 0
      });
      currentTime += constantVelTime;
      
      // Deceleration phase
      phases.push({
        type: 'deceleration',
        startTime: currentTime,
        duration: accelTime,
        startVelocity: maxVelocity * direction,
        endVelocity: 0,
        acceleration: -maxAcceleration * direction
      });
    }
    
    return { phases };
  }

  public update(deltaTime: number): void {
    this.deltaTimeAccumulator += deltaTime;
    
    // Update at fixed time steps for numerical stability
    while (this.deltaTimeAccumulator >= this.simulationTimeStep) {
      this.updateAntennaStates(this.simulationTimeStep);
      this.deltaTimeAccumulator -= this.simulationTimeStep;
    }
  }

  private updateAntennaStates(deltaTime: number): void {
    const currentTime = Date.now();
    
    for (const [antennaId, state] of this.antennaStates) {
      if (state.status === 'slewing' && state.trajectory && state.slewingCommand) {
        this.updateSlewingState(antennaId, state, currentTime, deltaTime);
      } else if (state.status === 'tracking' && state.trackedSatelliteId) {
        this.updateTrackingState(antennaId, state, currentTime, deltaTime);
      }
    }
  }

  private updateSlewingState(
    antennaId: string,
    state: AntennaState,
    currentTime: number,
    deltaTime: number
  ): void {
    const trajectory = state.trajectory!;
    const elapsedTime = (currentTime - trajectory.startTime) / 1000; // Convert to seconds
    
    // Calculate current position and velocity
    const azimuthState = this.evaluateTrajectoryAtTime(
      trajectory.azimuthTrajectory,
      elapsedTime
    );
    const elevationState = this.evaluateTrajectoryAtTime(
      trajectory.elevationTrajectory,
      elapsedTime
    );
    
    // Update antenna state
    state.position.azimuth = trajectory.startPosition.azimuth + azimuthState.position;
    state.position.elevation = trajectory.startPosition.elevation + elevationState.position;
    state.velocity.azimuth = azimuthState.velocity;
    state.velocity.elevation = elevationState.velocity;
    state.acceleration.azimuth = azimuthState.acceleration;
    state.acceleration.elevation = elevationState.acceleration;
    state.timestamp = currentTime;
    
    // Check if slewing is complete
    if (currentTime >= trajectory.endTime) {
      this.completeSlewCommand(antennaId, state);
    }
  }

  private evaluateTrajectoryAtTime(
    trajectory: SlewingTrajectory['azimuthTrajectory'],
    time: number
  ): { position: number; velocity: number; acceleration: number } {
    let cumulativeTime = 0;
    let cumulativePosition = 0;
    
    for (const phase of trajectory.phases) {
      if (time <= cumulativeTime + phase.duration) {
        // Current phase
        const phaseTime = time - cumulativeTime;
        const position = cumulativePosition + 
          phase.startVelocity * phaseTime + 
          0.5 * phase.acceleration * phaseTime * phaseTime;
        const velocity = phase.startVelocity + phase.acceleration * phaseTime;
        
        return {
          position,
          velocity,
          acceleration: phase.acceleration
        };
      }
      
      // Move to next phase
      cumulativeTime += phase.duration;
      cumulativePosition += phase.startVelocity * phase.duration + 
        0.5 * phase.acceleration * phase.duration * phase.duration;
    }
    
    // Past end of trajectory
    const lastPhase = trajectory.phases[trajectory.phases.length - 1];
    return {
      position: cumulativePosition,
      velocity: lastPhase.endVelocity,
      acceleration: 0
    };
  }

  private completeSlewCommand(antennaId: string, state: AntennaState): void {
    const command = state.slewingCommand!;
    
    // Calculate pointing error
    const azimuthError = Math.abs(state.position.azimuth - command.targetAzimuth);
    const elevationError = Math.abs(state.position.elevation - command.targetElevation);
    const totalError = Math.sqrt(azimuthError * azimuthError + elevationError * elevationError);
    
    // Record pointing error
    const errors = this.pointingErrors.get(antennaId)!;
    errors.push(totalError);
    if (errors.length > 1000) errors.shift(); // Keep last 1000 measurements
    
    // Check if accuracy requirement is met
    if (totalError <= command.accuracyRequirement) {
      console.log(`Antenna ${antennaId} slew completed successfully, error: ${totalError.toFixed(3)}°`);
      state.status = 'idle';
    } else {
      console.warn(`Antenna ${antennaId} slew completed with excessive error: ${totalError.toFixed(3)}°`);
      state.status = 'fault';
      state.faultCodes.push('POINTING_ERROR_EXCESSIVE');
    }
    
    // Clean up
    state.slewingCommand = undefined;
    state.trajectory = undefined;
    state.velocity = { azimuth: 0, elevation: 0 };
    state.acceleration = { azimuth: 0, elevation: 0 };
    
    this.activeCommands.delete(command.commandId);
    
    // Process next command if available
    this.processNextCommand(antennaId);
  }

  private updateTrackingState(
    antennaId: string,
    state: AntennaState,
    currentTime: number,
    deltaTime: number
  ): void {
    // This would integrate with satellite position prediction
    // For now, just maintain current position
    state.timestamp = currentTime;
  }

  public initiateHandoff(
    antennaId: string,
    fromSatelliteId: string,
    toSatelliteId: string,
    toPosition: { azimuth: number; elevation: number },
    handoffType: HandoffEvent['handoffType'] = 'make-before-break'
  ): string {
    const eventId = `handoff_${antennaId}_${Date.now()}`;
    const state = this.antennaStates.get(antennaId);
    
    if (!state) {
      console.error(`Antenna ${antennaId} not found`);
      return '';
    }
    
    const handoffEvent: HandoffEvent = {
      eventId,
      fromSatelliteId,
      toSatelliteId,
      initiationTime: Date.now(),
      handoffType,
      status: 'planned',
      reason: 'constellation_geometry',
      fromPosition: { ...state.position },
      toPosition,
      acquisitionDelay: 0,
      dataLossTime: 0
    };
    
    state.handoffEvent = handoffEvent;
    
    // Command slew to new satellite
    this.commandSlew(antennaId, toPosition.azimuth, toPosition.elevation, 'high', 0.05);
    
    this.handoffHistory.push(handoffEvent);
    
    console.log(`Initiated handoff for antenna ${antennaId}: ${fromSatelliteId} → ${toSatelliteId}`);
    
    return eventId;
  }

  private validateTargetPosition(
    azimuth: number,
    elevation: number,
    constraints: SlewingConstraints
  ): boolean {
    return azimuth >= constraints.azimuthLimits.min &&
           azimuth <= constraints.azimuthLimits.max &&
           elevation >= constraints.elevationLimits.min &&
           elevation <= constraints.elevationLimits.max;
  }

  public getAntennaState(antennaId: string): AntennaState | null {
    return this.antennaStates.get(antennaId) || null;
  }

  public getPointingAccuracy(antennaId: string): number {
    const errors = this.pointingErrors.get(antennaId);
    if (!errors || errors.length === 0) return 0;
    
    const sum = errors.reduce((acc, error) => acc + error, 0);
    return sum / errors.length;
  }

  public getSlewingMetrics(antennaId: string): { averageSlewTime: number; peakVelocity: number; trackingAccuracy: number; handoffSuccessRate: number } {
    return this.slewingMetrics.get(antennaId) || {
      averageSlewTime: 0,
      peakVelocity: 0,
      trackingAccuracy: 0,
      handoffSuccessRate: 0
    };
  }

  public getHandoffHistory(): HandoffEvent[] {
    return [...this.handoffHistory];
  }

  public clearFaults(antennaId: string): void {
    const state = this.antennaStates.get(antennaId);
    if (state) {
      state.faultCodes = [];
      if (state.status === 'fault') {
        state.status = 'idle';
      }
    }
  }

  public dispose(): void {
    this.antennaStates.clear();
    this.activeCommands.clear();
    this.commandQueue = [];
    this.pointingErrors.clear();
    this.slewingMetrics.clear();
    this.handoffHistory = [];
  }
}