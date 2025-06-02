import { LinkQualityMetrics, ModulationScheme } from './RFBeamVisualizer';
import { LinkBudgetCalculation } from './AntennaGainProfiles';
import { HandoffEvent, AntennaState } from './AntennaSlewingController';

export interface LinkStatusDisplay {
  containerId: string;
  antennaId: string;
  groundStationId: string;
  satelliteId?: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  showDetails: boolean;
  updateRate: number; // Hz
}

export interface ConstellationDiagram {
  canvasId: string;
  modulation: ModulationScheme;
  receivedSymbols: Array<{ i: number; q: number; timestamp: number }>;
  idealPoints: Array<{ i: number; q: number }>;
  snr: number;
  errorVector: number;
}

export interface SpectrumAnalyzer {
  canvasId: string;
  centerFrequency: number; // MHz
  span: number; // MHz
  rbw: number; // Resolution bandwidth in kHz
  powerLevels: Float32Array; // dBm per bin
  frequencies: Float32Array; // MHz per bin
  peakHold: boolean;
  averaging: number;
}

export interface EyeDiagram {
  canvasId: string;
  symbolRate: number; // symbols/second
  samplesPerSymbol: number;
  traces: Array<{ data: Float32Array; color: string }>;
  triggerLevel: number;
  timebase: number; // seconds per division
}

export class LinkStatusUI {
  private linkDisplays: Map<string, LinkStatusDisplay> = new Map();
  private constellationDiagrams: Map<string, ConstellationDiagram> = new Map();
  private spectrumAnalyzers: Map<string, SpectrumAnalyzer> = new Map();
  private eyeDiagrams: Map<string, EyeDiagram> = new Map();
  
  // UI containers
  private mainContainer: HTMLElement;
  private statusPanels: Map<string, HTMLElement> = new Map();
  private charts: Map<string, any> = new Map(); // Chart.js instances
  
  // Performance monitoring
  private updateTimers: Map<string, number> = new Map();
  private frameCounter: number = 0;
  private lastUpdateTime: number = 0;
  
  // Real-time data buffers
  private snrHistory: Map<string, number[]> = new Map();
  private berHistory: Map<string, number[]> = new Map();
  private throughputHistory: Map<string, number[]> = new Map();
  private historyLength: number = 300; // 5 minutes at 1Hz
  
  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container with ID ${containerId} not found`);
    }
    
    this.mainContainer = container;
    this.initializeMainUI();
    
    console.log('LinkStatusUI initialized');
  }

  private initializeMainUI(): void {
    this.mainContainer.innerHTML = `
      <div id="link-status-header" class="link-status-header">
        <h2>🛰️ Real-Time Link Status Monitor</h2>
        <div class="controls">
          <button id="pause-updates">⏸️ Pause</button>
          <button id="clear-history">🗑️ Clear</button>
          <select id="update-rate">
            <option value="1">1 Hz</option>
            <option value="5" selected>5 Hz</option>
            <option value="10">10 Hz</option>
          </select>
        </div>
      </div>
      <div id="link-panels-container" class="link-panels-container"></div>
      <div id="detailed-analysis" class="detailed-analysis" style="display: none;">
        <div class="analysis-tabs">
          <button class="tab-button active" data-tab="constellation">Constellation</button>
          <button class="tab-button" data-tab="spectrum">Spectrum</button>
          <button class="tab-button" data-tab="eye">Eye Diagram</button>
          <button class="tab-button" data-tab="link-budget">Link Budget</button>
        </div>
        <div class="analysis-content">
          <div id="constellation-tab" class="tab-content active">
            <canvas id="constellation-canvas" width="400" height="400"></canvas>
            <div class="constellation-metrics">
              <div>EVM: <span id="evm-value">--</span>%</div>
              <div>MER: <span id="mer-value">--</span> dB</div>
              <div>Phase Noise: <span id="phase-noise">--</span>°</div>
            </div>
          </div>
          <div id="spectrum-tab" class="tab-content">
            <canvas id="spectrum-canvas" width="600" height="300"></canvas>
            <div class="spectrum-controls">
              <label>Center: <input type="number" id="center-freq" value="14000"> MHz</label>
              <label>Span: <input type="number" id="span" value="100"> MHz</label>
              <label>RBW: <input type="number" id="rbw" value="1000"> kHz</label>
            </div>
          </div>
          <div id="eye-tab" class="tab-content">
            <canvas id="eye-canvas" width="500" height="350"></canvas>
            <div class="eye-metrics">
              <div>Eye Opening: <span id="eye-opening">--</span>%</div>
              <div>Jitter: <span id="jitter">--</span> ps</div>
              <div>Q-Factor: <span id="q-factor">--</span></div>
            </div>
          </div>
          <div id="link-budget-tab" class="tab-content">
            <div class="link-budget-table"></div>
          </div>
        </div>
      </div>
    `;

    this.initializeStyles();
    this.setupEventListeners();
  }

  private initializeStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      .link-status-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        border-radius: 8px 8px 0 0;
      }
      
      .link-panels-container {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: 10px;
        padding: 10px;
        background: rgba(0, 0, 0, 0.7);
      }
      
      .link-panel {
        background: rgba(20, 20, 20, 0.9);
        border: 1px solid #333;
        border-radius: 8px;
        padding: 15px;
        color: white;
        font-family: 'Courier New', monospace;
        font-size: 12px;
        position: relative;
        cursor: pointer;
        transition: all 0.3s ease;
      }
      
      .link-panel:hover {
        border-color: #4CAF50;
        box-shadow: 0 0 10px rgba(76, 175, 80, 0.3);
      }
      
      .link-panel.active {
        border-color: #2196F3;
        box-shadow: 0 0 15px rgba(33, 150, 243, 0.5);
      }
      
      .link-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
        border-bottom: 1px solid #444;
        padding-bottom: 5px;
      }
      
      .link-status {
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 10px;
        font-weight: bold;
      }
      
      .status-excellent { background: #4CAF50; color: white; }
      .status-good { background: #8BC34A; color: white; }
      .status-marginal { background: #FF9800; color: white; }
      .status-poor { background: #FF5722; color: white; }
      .status-failed { background: #F44336; color: white; }
      
      .metrics-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin: 10px 0;
      }
      
      .metric {
        display: flex;
        justify-content: space-between;
        padding: 4px 0;
      }
      
      .metric-value {
        font-weight: bold;
        color: #4CAF50;
      }
      
      .metric-value.warning { color: #FF9800; }
      .metric-value.error { color: #F44336; }
      
      .mini-chart {
        height: 40px;
        margin: 8px 0;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        position: relative;
        overflow: hidden;
      }
      
      .detailed-analysis {
        background: rgba(0, 0, 0, 0.9);
        border-radius: 0 0 8px 8px;
        color: white;
      }
      
      .analysis-tabs {
        display: flex;
        background: rgba(20, 20, 20, 0.8);
      }
      
      .tab-button {
        background: none;
        border: none;
        color: #ccc;
        padding: 12px 20px;
        cursor: pointer;
        border-bottom: 2px solid transparent;
        transition: all 0.3s ease;
      }
      
      .tab-button:hover {
        color: white;
        background: rgba(255, 255, 255, 0.1);
      }
      
      .tab-button.active {
        color: #2196F3;
        border-bottom-color: #2196F3;
        background: rgba(33, 150, 243, 0.1);
      }
      
      .analysis-content {
        padding: 20px;
      }
      
      .tab-content {
        display: none;
      }
      
      .tab-content.active {
        display: block;
      }
      
      .constellation-metrics, .eye-metrics {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 15px;
        margin-top: 15px;
        padding: 10px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 4px;
      }
      
      .spectrum-controls {
        display: flex;
        gap: 20px;
        margin-top: 15px;
        align-items: center;
      }
      
      .spectrum-controls label {
        display: flex;
        align-items: center;
        gap: 5px;
      }
      
      .spectrum-controls input {
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid #555;
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        width: 80px;
      }
      
      canvas {
        border: 1px solid #333;
        border-radius: 4px;
        background: rgba(0, 0, 0, 0.5);
      }
    `;
    
    document.head.appendChild(style);
  }

  private setupEventListeners(): void {
    // Pause/resume updates
    const pauseButton = document.getElementById('pause-updates');
    let isPaused = false;
    pauseButton?.addEventListener('click', () => {
      isPaused = !isPaused;
      pauseButton.textContent = isPaused ? '▶️ Resume' : '⏸️ Pause';
      this.setPaused(isPaused);
    });

    // Clear history
    document.getElementById('clear-history')?.addEventListener('click', () => {
      this.clearAllHistory();
    });

    // Update rate
    document.getElementById('update-rate')?.addEventListener('change', (e) => {
      const rate = parseInt((e.target as HTMLSelectElement).value);
      this.setUpdateRate(rate);
    });

    // Tab switching
    document.querySelectorAll('.tab-button').forEach(button => {
      button.addEventListener('click', (e) => {
        const tabName = (e.target as HTMLElement).dataset.tab;
        this.switchTab(tabName || 'constellation');
      });
    });

    // Spectrum analyzer controls
    ['center-freq', 'span', 'rbw'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => {
        this.updateSpectrumSettings();
      });
    });
  }

  public createLinkDisplay(config: LinkStatusDisplay): void {
    const container = document.getElementById('link-panels-container')!;
    
    const panel = document.createElement('div');
    panel.className = 'link-panel';
    panel.id = `link-panel-${config.antennaId}`;
    
    panel.innerHTML = `
      <div class="link-header">
        <div>
          <strong>${config.groundStationId}</strong><br>
          <small>Antenna: ${config.antennaId}</small>
        </div>
        <div class="link-status status-good">TRACKING</div>
      </div>
      
      <div class="satellite-info">
        <div><strong>Target:</strong> <span id="satellite-${config.antennaId}">--</span></div>
        <div><strong>Azimuth:</strong> <span id="azimuth-${config.antennaId}">--</span>°</div>
        <div><strong>Elevation:</strong> <span id="elevation-${config.antennaId}">--</span>°</div>
      </div>
      
      <div class="metrics-grid">
        <div class="metric">
          <span>SNR:</span>
          <span class="metric-value" id="snr-${config.antennaId}">-- dB</span>
        </div>
        <div class="metric">
          <span>BER:</span>
          <span class="metric-value" id="ber-${config.antennaId}">--</span>
        </div>
        <div class="metric">
          <span>RSSI:</span>
          <span class="metric-value" id="rssi-${config.antennaId}">-- dBm</span>
        </div>
        <div class="metric">
          <span>Margin:</span>
          <span class="metric-value" id="margin-${config.antennaId}">-- dB</span>
        </div>
        <div class="metric">
          <span>Modulation:</span>
          <span class="metric-value" id="modulation-${config.antennaId}">--</span>
        </div>
        <div class="metric">
          <span>Throughput:</span>
          <span class="metric-value" id="throughput-${config.antennaId}">-- Mbps</span>
        </div>
      </div>
      
      <div class="mini-chart" id="chart-${config.antennaId}">
        <canvas width="280" height="35"></canvas>
      </div>
      
      <div class="handoff-status" id="handoff-${config.antennaId}" style="display: none;">
        <div class="handoff-progress">
          <div>🔄 Handoff in progress...</div>
          <div class="progress-bar">
            <div class="progress-fill"></div>
          </div>
        </div>
      </div>
    `;
    
    container.appendChild(panel);
    
    // Setup click handler for detailed view
    panel.addEventListener('click', () => {
      this.showDetailedAnalysis(config.antennaId);
    });
    
    // Initialize data buffers
    this.snrHistory.set(config.antennaId, []);
    this.berHistory.set(config.antennaId, []);
    this.throughputHistory.set(config.antennaId, []);
    
    // Setup update timer
    const timer = window.setInterval(() => {
      this.updateMiniChart(config.antennaId);
    }, 1000 / config.updateRate);
    
    this.updateTimers.set(config.antennaId, timer);
    this.linkDisplays.set(config.antennaId, config);
    this.statusPanels.set(config.antennaId, panel);
  }

  public updateLinkStatus(
    antennaId: string,
    linkMetrics: LinkQualityMetrics,
    antennaState: AntennaState,
    linkBudget?: LinkBudgetCalculation
  ): void {
    const display = this.linkDisplays.get(antennaId);
    if (!display) return;

    // Update satellite info
    this.updateElement(`satellite-${antennaId}`, antennaState.trackedSatelliteId || 'None');
    this.updateElement(`azimuth-${antennaId}`, antennaState.position.azimuth.toFixed(1));
    this.updateElement(`elevation-${antennaId}`, antennaState.position.elevation.toFixed(1));

    // Update metrics
    this.updateMetricElement(`snr-${antennaId}`, linkMetrics.snr.toFixed(1), 'dB', linkMetrics.snr);
    this.updateMetricElement(`ber-${antennaId}`, linkMetrics.ber.toExponential(2), '', linkMetrics.ber, true);
    this.updateMetricElement(`rssi-${antennaId}`, linkMetrics.rssi.toFixed(1), 'dBm', linkMetrics.rssi);
    this.updateMetricElement(`margin-${antennaId}`, linkMetrics.linkMargin.toFixed(1), 'dB', linkMetrics.linkMargin);
    this.updateElement(`modulation-${antennaId}`, linkMetrics.currentModulation);
    
    // Calculate throughput based on modulation and link quality
    const throughput = this.calculateThroughput(linkMetrics);
    this.updateElement(`throughput-${antennaId}`, throughput.toFixed(1) + ' Mbps');

    // Update link status
    const statusElement = this.statusPanels.get(antennaId)?.querySelector('.link-status');
    if (statusElement) {
      const quality = this.getLinkQualityCategory(linkMetrics.linkMargin);
      statusElement.className = `link-status status-${quality}`;
      statusElement.textContent = this.getStatusText(antennaState.status, quality);
    }

    // Store history
    this.addToHistory(antennaId, linkMetrics, throughput);

    // Update handoff status if applicable
    if (antennaState.handoffEvent) {
      this.updateHandoffStatus(antennaId, antennaState.handoffEvent);
    }
  }

  private updateElement(id: string, value: string): void {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }

  private updateMetricElement(id: string, value: string, unit: string, numericValue: number, inverse: boolean = false): void {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value + (unit ? ' ' + unit : '');
      
      // Apply color coding based on value
      element.className = 'metric-value';
      if (inverse) {
        // For BER - lower is better
        if (numericValue > 1e-3) element.classList.add('error');
        else if (numericValue > 1e-6) element.classList.add('warning');
      } else {
        // For SNR, RSSI, Margin - higher is better
        if (numericValue < 5) element.classList.add('error');
        else if (numericValue < 10) element.classList.add('warning');
      }
    }
  }

  private calculateThroughput(metrics: LinkQualityMetrics): number {
    const modulationEfficiency = {
      'QPSK': 2,
      'QAM16': 4,
      'QAM64': 6,
      'QAM256': 8,
      'OFDM': 5
    };
    
    const efficiency = modulationEfficiency[metrics.currentModulation] || 2;
    const bandwidth = 36; // MHz
    const codingRate = 0.8; // 4/5 FEC
    const linkEfficiency = Math.min(1, metrics.linkMargin / 10); // Reduce with poor link
    
    return efficiency * bandwidth * codingRate * linkEfficiency;
  }

  private getLinkQualityCategory(linkMargin: number): string {
    if (linkMargin > 6) return 'excellent';
    if (linkMargin > 3) return 'good';
    if (linkMargin > 0) return 'marginal';
    if (linkMargin > -6) return 'poor';
    return 'failed';
  }

  private getStatusText(antennaStatus: string, linkQuality: string): string {
    if (antennaStatus === 'tracking') {
      return linkQuality.toUpperCase();
    }
    return antennaStatus.toUpperCase();
  }

  private addToHistory(antennaId: string, metrics: LinkQualityMetrics, throughput: number): void {
    const snrHist = this.snrHistory.get(antennaId)!;
    const berHist = this.berHistory.get(antennaId)!;
    const tpHist = this.throughputHistory.get(antennaId)!;
    
    snrHist.push(metrics.snr);
    berHist.push(Math.log10(metrics.ber)); // Log scale for BER
    tpHist.push(throughput);
    
    // Maintain history length
    if (snrHist.length > this.historyLength) {
      snrHist.shift();
      berHist.shift();
      tpHist.shift();
    }
  }

  private updateMiniChart(antennaId: string): void {
    const canvas = document.querySelector(`#chart-${antennaId} canvas`) as HTMLCanvasElement;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d')!;
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    const snrHistory = this.snrHistory.get(antennaId) || [];
    if (snrHistory.length < 2) return;
    
    // Draw SNR trend
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 1;
    ctx.beginPath();
    
    const maxSNR = 30; // dB
    const minSNR = 0;
    
    snrHistory.forEach((snr, index) => {
      const x = (index / (snrHistory.length - 1)) * width;
      const y = height - ((snr - minSNR) / (maxSNR - minSNR)) * height;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
    
    // Draw threshold line at 10 dB
    ctx.strokeStyle = '#FF9800';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    const thresholdY = height - ((10 - minSNR) / (maxSNR - minSNR)) * height;
    ctx.beginPath();
    ctx.moveTo(0, thresholdY);
    ctx.lineTo(width, thresholdY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private updateHandoffStatus(antennaId: string, handoffEvent: HandoffEvent): void {
    const handoffDiv = document.getElementById(`handoff-${antennaId}`);
    if (!handoffDiv) return;
    
    if (handoffEvent.status === 'in_progress') {
      handoffDiv.style.display = 'block';
      
      const elapsed = Date.now() - handoffEvent.initiationTime;
      const estimatedDuration = 5000; // 5 seconds
      const progress = Math.min(100, (elapsed / estimatedDuration) * 100);
      
      const progressFill = handoffDiv.querySelector('.progress-fill') as HTMLElement;
      if (progressFill) {
        progressFill.style.width = `${progress}%`;
        progressFill.style.background = progress > 80 ? '#4CAF50' : '#2196F3';
      }
    } else {
      handoffDiv.style.display = 'none';
    }
  }

  private showDetailedAnalysis(antennaId: string): void {
    const detailedDiv = document.getElementById('detailed-analysis')!;
    detailedDiv.style.display = 'block';
    
    // Mark panel as active
    document.querySelectorAll('.link-panel').forEach(panel => {
      panel.classList.remove('active');
    });
    this.statusPanels.get(antennaId)?.classList.add('active');
    
    // Initialize detailed analysis components
    this.initializeConstellationDiagram(antennaId);
    this.initializeSpectrumAnalyzer(antennaId);
    this.initializeEyeDiagram(antennaId);
  }

  private switchTab(tabName: string): void {
    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(button => {
      button.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`)?.classList.add('active');
  }

  private initializeConstellationDiagram(antennaId: string): void {
    const canvas = document.getElementById('constellation-canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    
    // Draw constellation points and received symbols
    this.drawConstellationDiagram(ctx, antennaId);
  }

  private drawConstellationDiagram(ctx: CanvasRenderingContext2D, antennaId: string): void {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const scale = 150;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Draw grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      // Vertical lines
      ctx.beginPath();
      ctx.moveTo(centerX + i * scale / 2, 0);
      ctx.lineTo(centerX + i * scale / 2, height);
      ctx.stroke();
      
      // Horizontal lines
      ctx.beginPath();
      ctx.moveTo(0, centerY + i * scale / 2);
      ctx.lineTo(width, centerY + i * scale / 2);
      ctx.stroke();
    }
    
    // Draw axes
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, height);
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();
    
    // Draw ideal constellation points (QPSK example)
    const idealPoints = [
      { i: 0.7, q: 0.7 },
      { i: -0.7, q: 0.7 },
      { i: -0.7, q: -0.7 },
      { i: 0.7, q: -0.7 }
    ];
    
    ctx.fillStyle = '#4CAF50';
    idealPoints.forEach(point => {
      const x = centerX + point.i * scale;
      const y = centerY - point.q * scale;
      
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, 2 * Math.PI);
      ctx.fill();
    });
    
    // Draw received symbols (simulated with noise)
    ctx.fillStyle = 'rgba(255, 165, 0, 0.6)';
    for (let i = 0; i < 100; i++) {
      const idealPoint = idealPoints[i % 4];
      const noise = 0.1; // Noise level
      const x = centerX + (idealPoint.i + (Math.random() - 0.5) * noise) * scale;
      const y = centerY - (idealPoint.q + (Math.random() - 0.5) * noise) * scale;
      
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, 2 * Math.PI);
      ctx.fill();
    }
    
    // Update metrics
    document.getElementById('evm-value')!.textContent = '3.2';
    document.getElementById('mer-value')!.textContent = '25.1';
    document.getElementById('phase-noise')!.textContent = '1.8';
  }

  private initializeSpectrumAnalyzer(antennaId: string): void {
    const canvas = document.getElementById('spectrum-canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    
    this.drawSpectrumAnalyzer(ctx);
  }

  private drawSpectrumAnalyzer(ctx: CanvasRenderingContext2D): void {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Draw grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    
    // Frequency divisions (10 MHz each)
    for (let i = 0; i <= 10; i++) {
      const x = (i / 10) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    
    // Power divisions (10 dB each)
    for (let i = 0; i <= 10; i++) {
      const y = (i / 10) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    
    // Draw spectrum (simulated Ku-band signal)
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    for (let x = 0; x < width; x++) {
      const freq = 13950 + (x / width) * 100; // 13.95 to 14.05 GHz
      let power = -80; // Noise floor
      
      // Add main signal at 14 GHz
      if (freq >= 13995 && freq <= 14005) {
        power = -30 + 20 * Math.exp(-Math.pow((freq - 14000) / 2, 2));
      }
      
      // Add some spurious signals
      if (Math.abs(freq - 13980) < 1) power = Math.max(power, -50);
      if (Math.abs(freq - 14020) < 0.5) power = Math.max(power, -45);
      
      // Add noise
      power += (Math.random() - 0.5) * 4;
      
      const y = height - ((power + 80) / 50) * height; // Map -80 to -30 dBm to full height
      
      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    
    ctx.stroke();
  }

  private initializeEyeDiagram(antennaId: string): void {
    const canvas = document.getElementById('eye-canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    
    this.drawEyeDiagram(ctx);
  }

  private drawEyeDiagram(ctx: CanvasRenderingContext2D): void {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Draw grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    
    const timeSteps = 10;
    const voltageSteps = 8;
    
    for (let i = 0; i <= timeSteps; i++) {
      const x = (i / timeSteps) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    
    for (let i = 0; i <= voltageSteps; i++) {
      const y = (i / voltageSteps) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    
    // Draw eye traces
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.7)';
    ctx.lineWidth = 1;
    
    // Generate multiple eye traces
    for (let trace = 0; trace < 50; trace++) {
      ctx.beginPath();
      
      for (let sample = 0; sample < width; sample++) {
        const t = (sample / width) * 2; // Two symbol periods
        const bit1 = Math.random() > 0.5 ? 1 : -1;
        const bit2 = Math.random() > 0.5 ? 1 : -1;
        
        // Simple raised cosine pulse shaping
        let signal = 0;
        if (t < 1) {
          signal = bit1 * (0.5 * (1 + Math.cos(Math.PI * (t - 0.5) / 0.5)));
        } else {
          signal = bit2 * (0.5 * (1 + Math.cos(Math.PI * (t - 1.5) / 0.5)));
        }
        
        // Add noise and jitter
        signal += (Math.random() - 0.5) * 0.2;
        const jitter = (Math.random() - 0.5) * 0.05 * width;
        
        const x = sample + jitter;
        const y = height / 2 - signal * height / 4;
        
        if (sample === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      
      ctx.stroke();
    }
    
    // Update eye diagram metrics
    document.getElementById('eye-opening')!.textContent = '78';
    document.getElementById('jitter')!.textContent = '12.5';
    document.getElementById('q-factor')!.textContent = '15.2';
  }

  private updateSpectrumSettings(): void {
    const centerFreq = parseFloat((document.getElementById('center-freq') as HTMLInputElement).value);
    const span = parseFloat((document.getElementById('span') as HTMLInputElement).value);
    const rbw = parseFloat((document.getElementById('rbw') as HTMLInputElement).value);
    
    // Update spectrum analyzer with new settings
    console.log(`Spectrum updated: ${centerFreq} MHz ± ${span/2} MHz, RBW: ${rbw} kHz`);
    
    // Redraw spectrum
    const canvas = document.getElementById('spectrum-canvas') as HTMLCanvasElement;
    if (canvas) {
      this.drawSpectrumAnalyzer(canvas.getContext('2d')!);
    }
  }

  public setPaused(paused: boolean): void {
    // Implementation to pause/resume updates
    console.log(`Link status updates ${paused ? 'paused' : 'resumed'}`);
  }

  public setUpdateRate(rate: number): void {
    // Update all timers with new rate
    this.updateTimers.forEach((timer, antennaId) => {
      window.clearInterval(timer);
      const newTimer = window.setInterval(() => {
        this.updateMiniChart(antennaId);
      }, 1000 / rate);
      this.updateTimers.set(antennaId, newTimer);
    });
    
    console.log(`Update rate set to ${rate} Hz`);
  }

  public clearAllHistory(): void {
    this.snrHistory.forEach((_, antennaId) => {
      this.snrHistory.set(antennaId, []);
      this.berHistory.set(antennaId, []);
      this.throughputHistory.set(antennaId, []);
    });
    
    console.log('All link history cleared');
  }

  public removeLinkDisplay(antennaId: string): void {
    const timer = this.updateTimers.get(antennaId);
    if (timer) {
      window.clearInterval(timer);
      this.updateTimers.delete(antennaId);
    }
    
    const panel = this.statusPanels.get(antennaId);
    if (panel) {
      panel.remove();
      this.statusPanels.delete(antennaId);
    }
    
    this.linkDisplays.delete(antennaId);
    this.snrHistory.delete(antennaId);
    this.berHistory.delete(antennaId);
    this.throughputHistory.delete(antennaId);
  }

  public dispose(): void {
    // Clear all timers
    this.updateTimers.forEach(timer => window.clearInterval(timer));
    this.updateTimers.clear();
    
    // Clear all data
    this.linkDisplays.clear();
    this.statusPanels.clear();
    this.snrHistory.clear();
    this.berHistory.clear();
    this.throughputHistory.clear();
    
    // Clear UI
    this.mainContainer.innerHTML = '';
    
    console.log('LinkStatusUI disposed');
  }
}