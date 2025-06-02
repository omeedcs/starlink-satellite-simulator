import React, { useEffect, useState } from 'react';
import { GroundStationData } from '../models/GroundStationNetwork';

interface GroundStationDetailsProps {
  groundStation: GroundStationData | null;
}

export const GroundStationDetails: React.FC<GroundStationDetailsProps> = ({ groundStation }) => {
  if (!groundStation) {
    return (
      <div className="ground-station-details">
        <p>Select a ground station to view details</p>
      </div>
    );
  }

  // Format traffic values to 2 decimal places
  const incomingTraffic = groundStation.traffic.incoming.toFixed(2);
  const outgoingTraffic = groundStation.traffic.outgoing.toFixed(2);

  // Status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'operational':
        return '#4CAF50'; // Green
      case 'degraded':
        return '#FFC107'; // Yellow
      case 'offline':
        return '#F44336'; // Red
      default:
        return '#9E9E9E'; // Grey
    }
  };

  return (
    <div className="ground-station-details">
      <h3>{groundStation.name}</h3>
      
      <div className="detail-row">
        <span className="label">ID:</span>
        <span className="value">{groundStation.id}</span>
      </div>
      
      <div className="detail-row">
        <span className="label">Location:</span>
        <span className="value">
          {groundStation.position.latitude.toFixed(4)}°, {groundStation.position.longitude.toFixed(4)}°
        </span>
      </div>
      
      <div className="detail-row">
        <span className="label">Status:</span>
        <span className="value" style={{ color: getStatusColor(groundStation.status) }}>
          {groundStation.status.toUpperCase()}
        </span>
      </div>
      
      <div className="detail-row">
        <span className="label">Coverage:</span>
        <span className="value">{groundStation.coverage} km</span>
      </div>
      
      <div className="detail-row">
        <span className="label">Bandwidth:</span>
        <span className="value">{groundStation.bandwidth} Mbps</span>
      </div>
      
      <div className="detail-row">
        <span className="label">Internet Connection:</span>
        <span className="value">{groundStation.connections.internet ? 'Yes' : 'No'}</span>
      </div>
      
      <div className="detail-row">
        <span className="label">Connected Satellites:</span>
        <span className="value">{groundStation.connections.satellites.length}</span>
      </div>
      
      <div className="detail-row">
        <span className="label">Traffic (Incoming):</span>
        <span className="value">{incomingTraffic} Mbps</span>
      </div>
      
      <div className="detail-row">
        <span className="label">Traffic (Outgoing):</span>
        <span className="value">{outgoingTraffic} Mbps</span>
      </div>
      
      {groundStation.connections.satellites.length > 0 && (
        <div className="satellite-connections">
          <h4>Connected Satellites</h4>
          <ul>
            {groundStation.connections.satellites.map(satelliteId => (
              <li key={satelliteId}>{satelliteId}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
