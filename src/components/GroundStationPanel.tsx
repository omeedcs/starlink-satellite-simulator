import React, { useState, useEffect } from 'react';
import { GroundStationData } from '../models/GroundStationNetwork';
import { GroundStationDetails } from './GroundStationDetails';
import { GroundStationControls } from './GroundStationControls';

interface GroundStationPanelProps {
  groundStations: GroundStationData[];
  onSetStatus: (id: string, status: 'operational' | 'degraded' | 'offline') => void;
  onSetBandwidth: (id: string, bandwidth: number) => void;
  onToggleInternet: (id: string, connected: boolean) => void;
  onFocusGroundStation: (id: string) => void;
  onToggleGroundStationView: (id: string) => void;
}

export const GroundStationPanel: React.FC<GroundStationPanelProps> = ({
  groundStations,
  onSetStatus,
  onSetBandwidth,
  onToggleInternet,
  onFocusGroundStation,
  onToggleGroundStationView
}) => {
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [selectedStation, setSelectedStation] = useState<GroundStationData | null>(null);

  // Update selected station when ID changes or ground stations update
  useEffect(() => {
    if (selectedStationId) {
      const station = groundStations.find(s => s.id === selectedStationId) || null;
      setSelectedStation(station);
    } else {
      setSelectedStation(null);
    }
  }, [selectedStationId, groundStations]);

  const handleSelectGroundStation = (id: string) => {
    setSelectedStationId(id);
    onFocusGroundStation(id);
  };

  return (
    <div className="ground-station-panel">
      <h2>Ground Station Network</h2>
      
      <div className="panel-content">
        <div className="controls-section">
          <GroundStationControls 
            groundStations={groundStations}
            onSelectGroundStation={handleSelectGroundStation}
            onSetStatus={onSetStatus}
            onSetBandwidth={onSetBandwidth}
            onToggleInternet={onToggleInternet}
            onToggleGroundStationView={onToggleGroundStationView}
          />
        </div>
        
        <div className="details-section">
          <GroundStationDetails groundStation={selectedStation} />
        </div>
      </div>
      
      <div className="network-stats">
        <h3>Network Statistics</h3>
        <div className="stat-row">
          <span className="label">Total Ground Stations:</span>
          <span className="value">{groundStations.length}</span>
        </div>
        <div className="stat-row">
          <span className="label">Operational Stations:</span>
          <span className="value">
            {groundStations.filter(s => s.status === 'operational').length}
          </span>
        </div>
        <div className="stat-row">
          <span className="label">Total Bandwidth:</span>
          <span className="value">
            {groundStations.reduce((sum, station) => sum + station.bandwidth, 0).toFixed(0)} Mbps
          </span>
        </div>
        <div className="stat-row">
          <span className="label">Total Traffic:</span>
          <span className="value">
            {groundStations.reduce((sum, station) => 
              sum + station.traffic.incoming + station.traffic.outgoing, 0).toFixed(2)} Mbps
          </span>
        </div>
      </div>
    </div>
  );
};
