import React, { useState } from 'react';
import { GroundStationData } from '../models/GroundStationNetwork';

interface GroundStationControlsProps {
  groundStations: GroundStationData[];
  onSelectGroundStation: (id: string) => void;
  onSetStatus: (id: string, status: 'operational' | 'degraded' | 'offline') => void;
  onSetBandwidth: (id: string, bandwidth: number) => void;
  onToggleInternet: (id: string, connected: boolean) => void;
  onToggleGroundStationView: (id: string) => void;
}

export const GroundStationControls: React.FC<GroundStationControlsProps> = ({
  groundStations,
  onSelectGroundStation,
  onSetStatus,
  onSetBandwidth,
  onToggleInternet,
  onToggleGroundStationView
}) => {
  const [selectedStation, setSelectedStation] = useState<string | null>(null);

  const handleStationSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const stationId = e.target.value;
    setSelectedStation(stationId);
    onSelectGroundStation(stationId);
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!selectedStation) return;
    const status = e.target.value as 'operational' | 'degraded' | 'offline';
    onSetStatus(selectedStation, status);
  };

  const handleBandwidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedStation) return;
    const bandwidth = parseInt(e.target.value, 10);
    if (!isNaN(bandwidth)) {
      onSetBandwidth(selectedStation, bandwidth);
    }
  };

  const handleInternetToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedStation) return;
    onToggleInternet(selectedStation, e.target.checked);
  };

  // Find the currently selected ground station
  const currentStation = selectedStation 
    ? groundStations.find(station => station.id === selectedStation) 
    : null;

  return (
    <div className="ground-station-controls">
      <h3>Ground Station Controls</h3>
      
      <div className="control-group">
        <label htmlFor="station-select">Select Ground Station:</label>
        <select 
          id="station-select" 
          value={selectedStation || ''} 
          onChange={handleStationSelect}
        >
          <option value="">-- Select a station --</option>
          {groundStations.map(station => (
            <option key={station.id} value={station.id}>
              {station.name} ({station.id})
            </option>
          ))}
        </select>
      </div>
      
      {currentStation && (
        <>
          <div className="control-group">
            <label htmlFor="status-select">Status:</label>
            <select 
              id="status-select" 
              value={currentStation.status} 
              onChange={handleStatusChange}
            >
              <option value="operational">Operational</option>
              <option value="degraded">Degraded</option>
              <option value="offline">Offline</option>
            </select>
          </div>
          
          <div className="control-group">
            <label htmlFor="bandwidth-input">Bandwidth (Mbps):</label>
            <input 
              id="bandwidth-input" 
              type="range" 
              min="100" 
              max="5000" 
              step="100" 
              value={currentStation.bandwidth} 
              onChange={handleBandwidthChange}
            />
            <span>{currentStation.bandwidth} Mbps</span>
          </div>
          
          <div className="control-group">
            <label htmlFor="internet-toggle">Internet Connection:</label>
            <input 
              id="internet-toggle" 
              type="checkbox" 
              checked={currentStation.connections.internet} 
              onChange={handleInternetToggle}
            />
          </div>
          
          <div className="control-group">
            <button 
              className="ground-station-view-button"
              onClick={() => onToggleGroundStationView(currentStation.id)}
            >
              Toggle First-Person View
            </button>
          </div>
          
          <div className="station-info">
            <p>
              <strong>Location:</strong> {currentStation.position.latitude.toFixed(2)}°, 
              {currentStation.position.longitude.toFixed(2)}°
            </p>
            <p>
              <strong>Connected Satellites:</strong> {currentStation.connections.satellites.length}
            </p>
            <p>
              <strong>Current Traffic:</strong> ↓{currentStation.traffic.incoming.toFixed(2)} Mbps | 
              ↑{currentStation.traffic.outgoing.toFixed(2)} Mbps
            </p>
          </div>
        </>
      )}
    </div>
  );
};
