import React, { useEffect, useRef, useState } from 'react';
import { Simulation } from './components/Simulation';
import './App.css';

const App: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  return (
    <div className="app-container">
      <header className="app-header">
        <h1>SpaceX Satellite Network Simulator</h1>
        <p>Visualizing data flow between satellites and ground stations</p>
      </header>
      
      <main className="app-main">
        <div ref={containerRef} className="visualization-container"></div>
        <Simulation containerRef={containerRef} />
      </main>
      
      <footer className="app-footer">
        <p>SpaceX Satellite Simulator - Data Flow Visualization</p>
      </footer>
    </div>
  );
};

export default App;
