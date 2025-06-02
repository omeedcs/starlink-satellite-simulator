import * as THREE from 'three';

export interface Satellite {
  id: string;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  orbitalParameters: {
    altitude: number;
    inclination: number;
    eccentricity: number;
    argumentOfPeriapsis: number;
    longitudeOfAscendingNode: number;
    meanAnomaly: number;
  };
  connections: {
    satellites: string[];
    groundStations: string[];
  };
  beams: number; // Number of beams this satellite can project
  timeSlots: { duration: number, allocation: string }[]; // Time slots for beam allocation
  status: string;
  type: string;
}
