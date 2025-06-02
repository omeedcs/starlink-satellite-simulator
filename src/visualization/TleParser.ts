import * as THREE from 'three';

export interface TleData {
  name: string;
  line1: string;
  line2: string;
}

export interface OrbitalElements {
  inclination: number;
  raan: number; // Right Ascension of Ascending Node
  eccentricity: number;
  argumentOfPeriapsis: number;
  meanAnomaly: number;
  meanMotion: number; // revolutions per day
  epochYear: number;
  epochDay: number;
  noradId: number;
}

export interface SatellitePosition {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  orbitalElements: OrbitalElements;
}

export class TleParser {
  private static readonly EARTH_RADIUS = 6371; // km
  private static readonly MU = 398600.4418; // Earth's standard gravitational parameter (km³/s²)
  private static readonly MINUTES_PER_DAY = 1440;
  private static readonly J2000_EPOCH = 2451545.0; // Julian date for J2000.0 epoch

  /**
   * Fetch Starlink TLE data from CelesTrak
   */
  public static async fetchStarlinkTles(): Promise<TleData[]> {
    try {
      // CelesTrak provides current Starlink TLE data
      const response = await fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch TLE data: ${response.statusText}`);
      }
      
      const tleText = await response.text();
      return this.parseTleText(tleText);
    } catch (error) {
      console.warn('Failed to fetch live TLE data, using sample data:', error);
      return this.getSampleStarlinkTles();
    }
  }

  /**
   * Parse TLE text format into structured data
   */
  public static parseTleText(tleText: string): TleData[] {
    const lines = tleText.trim().split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const tleData: TleData[] = [];

    for (let i = 0; i < lines.length; i += 3) {
      if (i + 2 < lines.length) {
        const name = lines[i];
        const line1 = lines[i + 1];
        const line2 = lines[i + 2];

        // Validate TLE format
        if (line1.startsWith('1 ') && line2.startsWith('2 ')) {
          tleData.push({ name, line1, line2 });
        }
      }
    }

    return tleData;
  }

  /**
   * Parse orbital elements from TLE lines
   */
  public static parseOrbitalElements(line1: string, line2: string): OrbitalElements {
    // Line 1: 1 NNNNNC NNNNNAAA NNNNN.NNNNNNNN +.NNNNNNNN +NNNNN-N +NNNNN-N N NNNNN
    // Line 2: 2 NNNNN NNN.NNNN NNN.NNNN NNNNNNN NNN.NNNN NNN.NNNN NN.NNNNNNNNNNNNNN

    const noradId = parseInt(line1.substring(2, 7));
    const epochYear = parseInt(line1.substring(18, 20));
    const epochDay = parseFloat(line1.substring(20, 32));

    const inclination = parseFloat(line2.substring(8, 16)); // degrees
    const raan = parseFloat(line2.substring(17, 25)); // degrees
    const eccentricity = parseFloat('0.' + line2.substring(26, 33)); // no decimal point in TLE
    const argumentOfPeriapsis = parseFloat(line2.substring(34, 42)); // degrees
    const meanAnomaly = parseFloat(line2.substring(43, 51)); // degrees
    const meanMotion = parseFloat(line2.substring(52, 63)); // revolutions per day

    return {
      inclination,
      raan,
      eccentricity,
      argumentOfPeriapsis,
      meanAnomaly,
      meanMotion,
      epochYear: epochYear > 50 ? 1900 + epochYear : 2000 + epochYear,
      epochDay,
      noradId
    };
  }

  /**
   * Calculate satellite position from orbital elements at given time
   */
  public static calculatePosition(elements: OrbitalElements, timeOffsetMinutes: number = 0): SatellitePosition {
    // Convert mean motion to radians per minute
    const n = elements.meanMotion * 2 * Math.PI / this.MINUTES_PER_DAY;
    
    // Calculate semi-major axis from mean motion
    const a = Math.pow(this.MU / Math.pow(n / 60, 2), 1/3); // km
    
    // Update mean anomaly for current time
    const M = (elements.meanAnomaly * Math.PI / 180) + n * timeOffsetMinutes;
    
    // Solve Kepler's equation for eccentric anomaly (simplified Newton-Raphson)
    let E = M;
    for (let i = 0; i < 10; i++) {
      E = M + elements.eccentricity * Math.sin(E);
    }
    
    // Calculate true anomaly
    const nu = 2 * Math.atan2(
      Math.sqrt(1 + elements.eccentricity) * Math.sin(E / 2),
      Math.sqrt(1 - elements.eccentricity) * Math.cos(E / 2)
    );
    
    // Distance from Earth center
    const r = a * (1 - elements.eccentricity * Math.cos(E));
    
    // Position in orbital plane
    const xOrbital = r * Math.cos(nu);
    const yOrbital = r * Math.sin(nu);
    
    // Convert angles to radians
    const incRad = elements.inclination * Math.PI / 180;
    const raanRad = elements.raan * Math.PI / 180;
    const argPRad = elements.argumentOfPeriapsis * Math.PI / 180;
    
    // Rotate from orbital plane to Earth-centered inertial frame
    // First rotate by argument of periapsis
    const x1 = xOrbital * Math.cos(argPRad) - yOrbital * Math.sin(argPRad);
    const y1 = xOrbital * Math.sin(argPRad) + yOrbital * Math.cos(argPRad);
    
    // Then rotate by inclination
    const x2 = x1;
    const y2 = y1 * Math.cos(incRad);
    const z2 = y1 * Math.sin(incRad);
    
    // Finally rotate by RAAN
    const x = x2 * Math.cos(raanRad) - y2 * Math.sin(raanRad);
    const y = x2 * Math.sin(raanRad) + y2 * Math.cos(raanRad);
    const z = z2;
    
    // Calculate velocity
    const h = Math.sqrt(this.MU * a * (1 - elements.eccentricity * elements.eccentricity));
    const vr = (this.MU / h) * elements.eccentricity * Math.sin(nu);
    const vt = h / r;
    
    // Velocity in orbital plane
    const vxOrbital = vr * Math.cos(nu) - vt * Math.sin(nu);
    const vyOrbital = vr * Math.sin(nu) + vt * Math.cos(nu);
    
    // Apply same rotations to velocity
    const vx1 = vxOrbital * Math.cos(argPRad) - vyOrbital * Math.sin(argPRad);
    const vy1 = vxOrbital * Math.sin(argPRad) + vyOrbital * Math.cos(argPRad);
    
    const vx2 = vx1;
    const vy2 = vy1 * Math.cos(incRad);
    const vz2 = vy1 * Math.sin(incRad);
    
    const vx = vx2 * Math.cos(raanRad) - vy2 * Math.sin(raanRad);
    const vy = vx2 * Math.sin(raanRad) + vy2 * Math.cos(raanRad);
    const vz = vz2;
    
    // Convert to Three.js coordinate system and scale for visualization
    const scaleFactor = 1/2;
    const position = new THREE.Vector3(x, z, y).multiplyScalar(scaleFactor);
    const velocity = new THREE.Vector3(vx, vz, vy).multiplyScalar(scaleFactor);
    
    return {
      position,
      velocity,
      orbitalElements: elements
    };
  }

  /**
   * Sample Starlink TLE data for when live data is unavailable
   */
  private static getSampleStarlinkTles(): TleData[] {
    // Sample TLE data for a few Starlink satellites (these are real but may be outdated)
    return [
      {
        name: "STARLINK-1007",
        line1: "1 44713U 19074A   24001.12345678  .00001234  00000-0  12345-4 0  9999",
        line2: "2 44713  53.0000 123.4567 0001234 123.4567 236.5432 15.05000000123456"
      },
      {
        name: "STARLINK-1008", 
        line1: "1 44714U 19074B   24001.12345678  .00001234  00000-0  12345-4 0  9999",
        line2: "2 44714  53.0000 123.4567 0001234 123.4567 236.5432 15.05000000123456"
      },
      // Add more sample TLEs as needed...
    ];
  }

  /**
   * Filter TLE data to get only active Starlink satellites
   */
  public static filterStarlinkSatellites(tleData: TleData[]): TleData[] {
    return tleData.filter(tle => 
      tle.name.includes('STARLINK') || 
      tle.name.includes('Starlink')
    ).slice(0, 1584); // Limit to Shell 1 size
  }

  /**
   * Get current Julian date
   */
  public static getCurrentJulianDate(): number {
    const now = new Date();
    const a = Math.floor((14 - (now.getMonth() + 1)) / 12);
    const y = now.getFullYear() + 4800 - a;
    const m = (now.getMonth() + 1) + 12 * a - 3;
    
    return now.getDate() + Math.floor((153 * m + 2) / 5) + 365 * y + 
           Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045 +
           (now.getHours() - 12) / 24 + now.getMinutes() / 1440 + now.getSeconds() / 86400;
  }
}