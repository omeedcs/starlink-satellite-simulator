import React, { useEffect, useState } from 'react';
import { SatelliteNetwork } from '../models/SatelliteNetwork';
import { GroundStationNetwork } from '../models/GroundStationNetwork';
import { VisualizationEngine } from '../visualization/VisualizationEngine';
import { GroundStationPanel } from './GroundStationPanel';

interface SimulationProps {
  containerRef: React.RefObject<HTMLDivElement>;
}

export const Simulation: React.FC<SimulationProps> = ({ containerRef }) => {
  const [satelliteNetwork, setSatelliteNetwork] = useState<SatelliteNetwork | null>(null);
  const [groundStationNetwork, setGroundStationNetwork] = useState<GroundStationNetwork | null>(null);
  const [visualizationEngine, setVisualizationEngine] = useState<VisualizationEngine | null>(null);
  const [simulationSpeed, setSimulationSpeed] = useState<number>(1);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [selectedGroundStationId, setSelectedGroundStationId] = useState<string | null>(null);
  const [enhancedVisualsEnabled, setEnhancedVisualsEnabled] = useState<boolean>(false);

  // Initialize simulation
  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize networks
    const satNetwork = new SatelliteNetwork();
    const gsNetwork = new GroundStationNetwork();
    
    // Initialize visualization engine
    const visEngine = new VisualizationEngine(containerRef.current);
    
    // Connect networks to visualization
    visEngine.setSatelliteNetwork(satNetwork);
    visEngine.setGroundStationNetwork(gsNetwork);
    
    // Start the animation loop
    visEngine.start();
    
    // Store references
    setSatelliteNetwork(satNetwork);
    setGroundStationNetwork(gsNetwork);
    setVisualizationEngine(visEngine);
    
    // Clean up on unmount
    return () => {
      visEngine.dispose();
    };
  }, [containerRef]);

  // Handle simulation speed change
  const handleSpeedChange = (speed: number) => {
    setSimulationSpeed(speed);
    if (visualizationEngine) {
      visualizationEngine.setSimulationSpeed(speed);
    }
  };

  // Handle pause/resume
  const handlePauseToggle = () => {
    const newPausedState = !isPaused;
    setIsPaused(newPausedState);
    if (visualizationEngine) {
      visualizationEngine.setPaused(newPausedState);
    }
  };

  // Handle ground station status change
  const handleSetGroundStationStatus = (id: string, status: 'operational' | 'degraded' | 'offline') => {
    if (groundStationNetwork) {
      groundStationNetwork.setStatus(id, status);
    }
  };

  // Handle ground station bandwidth change
  const handleSetGroundStationBandwidth = (id: string, bandwidth: number) => {
    if (groundStationNetwork) {
      groundStationNetwork.setBandwidth(id, bandwidth);
    }
  };

  // Handle ground station internet toggle
  const handleToggleGroundStationInternet = (id: string, connected: boolean) => {
    if (groundStationNetwork && groundStationNetwork.getGroundStation(id)) {
      const station = groundStationNetwork.getGroundStation(id);
      if (station) {
        station.connections.internet = connected;
      }
    }
  };

  // Handle focus on ground station
  const handleFocusGroundStation = (id: string) => {
    setSelectedGroundStationId(id);
    if (visualizationEngine) {
      visualizationEngine.focusOnGroundStation(id);
    }
  };
  
  // Handle toggle ground station first-person view
  const handleToggleGroundStationView = (id: string) => {
    setSelectedGroundStationId(id);
    if (visualizationEngine) {
      visualizationEngine.toggleGroundStationView(id);
    }
  };

  // Handle enhanced visuals toggle
  const handleEnhancedVisualsToggle = () => {
    if (visualizationEngine) {
      if (enhancedVisualsEnabled) {
        visualizationEngine.disableEnhancedVisualization();
        setEnhancedVisualsEnabled(false);
      } else {
        visualizationEngine.enableEnhancedVisualization();
        setEnhancedVisualsEnabled(true);
      }
    }
  };

  return (
    <div className="simulation">
      <div className="simulation-controls">
        <div className="control-group">
          <button onClick={handlePauseToggle}>
            {isPaused ? 'Resume' : 'Pause'}
          </button>
        </div>
        
        <div className="control-group">
          <label>
            Simulation Speed:
            <input
              type="range"
              min="0.1"
              max="10"
              step="0.1"
              value={simulationSpeed}
              onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
            />
            {simulationSpeed.toFixed(1)}x
          </label>
        </div>
        
        <div className="control-group" style={{ marginTop: '20px', padding: '15px', border: '2px solid #ff6b35', borderRadius: '8px', backgroundColor: '#fff3f0' }}>
          <h4 style={{ color: '#ff6b35', margin: '0 0 10px 0', fontSize: '16px' }}>🚀 Enhanced Visuals</h4>
          <button
            onClick={handleEnhancedVisualsToggle}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: 'bold',
              color: enhancedVisualsEnabled ? '#ffffff' : '#ff6b35',
              backgroundColor: enhancedVisualsEnabled ? '#ff6b35' : '#ffffff',
              border: '2px solid #ff6b35',
              borderRadius: '6px',
              cursor: 'pointer',
              width: '100%',
              transition: 'all 0.3s ease'
            }}
          >
            {enhancedVisualsEnabled ? '🌟 Disable Photorealistic Mode' : '🌟 Enable Photorealistic Mode'}
          </button>
          <div style={{ fontSize: '12px', color: '#666', marginTop: '10px', lineHeight: '1.4' }}>
            {enhancedVisualsEnabled ? (
              <>
                <strong style={{ color: '#ff6b35' }}>Enhanced Mode Active:</strong><br />
                • Physical sky with Hosek-Wilkie model<br />
                • Real-time sun positioning<br />
                • Atmospheric scattering<br />
                • Satellite magnitude calculation<br />
                • Volumetric RF beams<br />
                <em style={{ color: '#e74c3c' }}>Note: May impact performance</em>
              </>
            ) : (
              <>
                <strong style={{ color: '#27ae60' }}>Performance Mode:</strong><br />
                • Standard rendering<br />
                • Basic lighting<br />
                • Optimized for smooth performance<br />
                <br />
                <em style={{ color: '#3498db' }}>Click to enable photorealistic features</em>
              </>
            )}
          </div>
        </div>
      </div>
      
      <div className="side-panel">
        {groundStationNetwork && (
          <GroundStationPanel
            groundStations={groundStationNetwork.getAllGroundStations()}
            onSetStatus={handleSetGroundStationStatus}
            onSetBandwidth={handleSetGroundStationBandwidth}
            onToggleInternet={handleToggleGroundStationInternet}
            onFocusGroundStation={handleFocusGroundStation}
            onToggleGroundStationView={handleToggleGroundStationView}
          />
        )}
      </div>
    </div>
  );
};
