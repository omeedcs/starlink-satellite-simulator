import React from 'react';

interface SimulationControlsProps {
  speed: number;
  isPaused: boolean;
  showSatellites: boolean;
  showGroundStations: boolean;
  showDataFlow: boolean;
  enhancedVisualsEnabled: boolean;
  onSpeedChange: (speed: number) => void;
  onPauseToggle: () => void;
  onVisibilityToggle: (type: 'satellites' | 'groundStations' | 'dataFlow') => void;
  onEnhancedVisualsToggle: () => void;
}

export const SimulationControls: React.FC<SimulationControlsProps> = ({
  speed,
  isPaused,
  showSatellites,
  showGroundStations,
  showDataFlow,
  enhancedVisualsEnabled,
  onSpeedChange,
  onPauseToggle,
  onVisibilityToggle,
  onEnhancedVisualsToggle
}) => {
  return (
    <div className="controls">
      <h3>Simulation Controls</h3>
      
      <div>
        <button onClick={onPauseToggle}>
          {isPaused ? 'Resume' : 'Pause'}
        </button>
      </div>
      
      <div>
        <label>
          Simulation Speed:
          <input
            type="range"
            min="0.1"
            max="10"
            step="0.1"
            value={speed}
            onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
          />
          {speed.toFixed(1)}x
        </label>
      </div>
      
      <div>
        <h4>Visibility</h4>
        <label>
          <input
            type="checkbox"
            checked={showSatellites}
            onChange={() => onVisibilityToggle('satellites')}
          />
          Satellites
        </label>
        <br />
        <label>
          <input
            type="checkbox"
            checked={showGroundStations}
            onChange={() => onVisibilityToggle('groundStations')}
          />
          Ground Stations
        </label>
        <br />
        <label>
          <input
            type="checkbox"
            checked={showDataFlow}
            onChange={() => onVisibilityToggle('dataFlow')}
          />
          Data Flow
        </label>
      </div>
      
      <div style={{ marginTop: '20px', padding: '10px', border: '2px solid #ff6b35', borderRadius: '5px', backgroundColor: '#fff3f0' }}>
        <h4 style={{ color: '#ff6b35', margin: '0 0 10px 0' }}>🚀 Enhanced Visuals</h4>
        <button
          onClick={onEnhancedVisualsToggle}
          style={{
            padding: '8px 16px',
            fontSize: '14px',
            fontWeight: 'bold',
            color: enhancedVisualsEnabled ? '#ffffff' : '#ff6b35',
            backgroundColor: enhancedVisualsEnabled ? '#ff6b35' : '#ffffff',
            border: '2px solid #ff6b35',
            borderRadius: '4px',
            cursor: 'pointer',
            width: '100%'
          }}
        >
          {enhancedVisualsEnabled ? '🌟 Disable Photorealistic Mode' : '🌟 Enable Photorealistic Mode'}
        </button>
        <div style={{ fontSize: '12px', color: '#666', marginTop: '8px', lineHeight: '1.4' }}>
          {enhancedVisualsEnabled ? (
            <>
              <strong>Enhanced Mode Active:</strong><br />
              • Physical sky with Hosek-Wilkie model<br />
              • Real-time sun positioning<br />
              • Atmospheric scattering<br />
              • Satellite magnitude calculation<br />
              • Volumetric RF beams<br />
              <em>Note: May impact performance</em>
            </>
          ) : (
            <>
              <strong>Performance Mode:</strong><br />
              • Standard rendering<br />
              • Basic lighting<br />
              • Optimized for smooth performance<br />
              <br />
              <em>Click to enable photorealistic features</em>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
