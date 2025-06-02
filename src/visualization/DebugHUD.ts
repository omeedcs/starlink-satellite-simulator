import * as THREE from 'three';

export interface DebugHUDConfig {
  showAtmosphere: boolean;
  showHDRExposure: boolean;
  showDishLobes: boolean;
  showSatelliteMagnitudes: boolean;
  showBeamAnalysis: boolean;
  showPerformanceStats: boolean;
}

export class DebugHUD {
  private container: HTMLElement;
  private hudElement!: HTMLDivElement;
  private config: DebugHUDConfig;
  
  private statsPanel!: HTMLDivElement;
  private atmospherePanel!: HTMLDivElement;
  private exposurePanel!: HTMLDivElement;
  private satellitePanel!: HTMLDivElement;
  
  constructor(container: HTMLElement) {
    this.container = container;
    
    this.config = {
      showAtmosphere: true,
      showHDRExposure: true,
      showDishLobes: false,
      showSatelliteMagnitudes: true,
      showBeamAnalysis: true,
      showPerformanceStats: true
    };
    
    this.createHUD();
    
    console.log('DebugHUD initialized');
  }

  private createHUD(): void {
    // Main HUD container
    this.hudElement = document.createElement('div');
    this.hudElement.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      width: 300px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      padding: 10px;
      border-radius: 5px;
      border: 1px solid #333;
      pointer-events: auto;
      z-index: 1000;
      max-height: 90vh;
      overflow-y: auto;
    `;
    
    // Title
    const title = document.createElement('h3');
    title.textContent = 'Debug Controls';
    title.style.cssText = `
      margin: 0 0 10px 0;
      color: #00ff00;
      border-bottom: 1px solid #333;
      padding-bottom: 5px;
    `;
    this.hudElement.appendChild(title);
    
    // Control panels
    this.createControlPanels();
    
    // Add to container
    this.container.appendChild(this.hudElement);
  }

  private createControlPanels(): void {
    // Atmosphere Controls
    this.atmospherePanel = this.createPanel('Atmosphere', [
      { label: 'Turbidity', id: 'turbidity', type: 'range', min: 1, max: 10, value: 2, step: 0.1 },
      { label: 'Rayleigh', id: 'rayleigh', type: 'range', min: 0, max: 4, value: 1, step: 0.1 },
      { label: 'Mie Coeff', id: 'mie', type: 'range', min: 0, max: 0.1, value: 0.005, step: 0.001 },
      { label: 'Mie G', id: 'mieG', type: 'range', min: 0, max: 1, value: 0.8, step: 0.01 }
    ]);
    
    // Exposure Controls
    this.exposurePanel = this.createPanel('HDR Exposure', [
      { label: 'Exposure', id: 'exposure', type: 'range', min: 0.1, max: 3, value: 0.68, step: 0.01 },
      { label: 'Tone Mapping', id: 'toneMapping', type: 'select', options: ['Linear', 'Reinhard', 'Cineon', 'ACESFilmic'] },
      { label: 'Gamma', id: 'gamma', type: 'range', min: 1.8, max: 2.8, value: 2.2, step: 0.1 }
    ]);
    
    // Performance Stats
    this.statsPanel = this.createPanel('Performance', []);
    
    // Satellite Info
    this.satellitePanel = this.createPanel('Satellites', []);
    
    // Visibility toggles
    const togglePanel = this.createTogglePanel();
    
    this.hudElement.appendChild(this.atmospherePanel);
    this.hudElement.appendChild(this.exposurePanel);
    this.hudElement.appendChild(this.statsPanel);
    this.hudElement.appendChild(this.satellitePanel);
    this.hudElement.appendChild(togglePanel);
  }

  private createPanel(title: string, controls: any[]): HTMLDivElement {
    const panel = document.createElement('div');
    panel.style.cssText = `
      margin-bottom: 15px;
      border: 1px solid #444;
      border-radius: 3px;
      padding: 8px;
    `;
    
    const panelTitle = document.createElement('div');
    panelTitle.textContent = title;
    panelTitle.style.cssText = `
      color: #88ccff;
      font-weight: bold;
      margin-bottom: 8px;
      font-size: 13px;
    `;
    panel.appendChild(panelTitle);
    
    controls.forEach(control => {
      const controlElement = this.createControl(control);
      panel.appendChild(controlElement);
    });
    
    return panel;
  }

  private createControl(config: any): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      margin-bottom: 5px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    
    const label = document.createElement('label');
    label.textContent = config.label;
    label.style.cssText = `
      min-width: 80px;
      font-size: 11px;
    `;
    
    let input: HTMLInputElement | HTMLSelectElement;
    
    if (config.type === 'range') {
      input = document.createElement('input');
      input.type = 'range';
      input.min = config.min.toString();
      input.max = config.max.toString();
      input.value = config.value.toString();
      input.step = config.step.toString();
      input.style.cssText = 'width: 120px; margin-left: 10px;';
      
      const valueDisplay = document.createElement('span');
      valueDisplay.textContent = config.value.toString();
      valueDisplay.style.cssText = `
        min-width: 40px;
        text-align: right;
        font-size: 10px;
        color: #aaa;
      `;
      
      input.addEventListener('input', () => {
        valueDisplay.textContent = input.value;
        this.onControlChange(config.id, parseFloat(input.value));
      });
      
      wrapper.appendChild(label);
      wrapper.appendChild(input);
      wrapper.appendChild(valueDisplay);
    } else if (config.type === 'select') {
      input = document.createElement('select');
      input.style.cssText = 'width: 100px; margin-left: 10px;';
      
      config.options.forEach((option: string) => {
        const optionElement = document.createElement('option');
        optionElement.value = option;
        optionElement.textContent = option;
        input.appendChild(optionElement);
      });
      
      input.addEventListener('change', () => {
        this.onControlChange(config.id, input.value);
      });
      
      wrapper.appendChild(label);
      wrapper.appendChild(input);
    }
    
    return wrapper;
  }

  private createTogglePanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.style.cssText = `
      margin-bottom: 15px;
      border: 1px solid #444;
      border-radius: 3px;
      padding: 8px;
    `;
    
    const title = document.createElement('div');
    title.textContent = 'Display Options';
    title.style.cssText = `
      color: #88ccff;
      font-weight: bold;
      margin-bottom: 8px;
      font-size: 13px;
    `;
    panel.appendChild(title);
    
    const toggles = [
      { label: 'Atmosphere', key: 'showAtmosphere' },
      { label: 'HDR Exposure', key: 'showHDRExposure' },
      { label: 'Dish Lobes', key: 'showDishLobes' },
      { label: 'Magnitudes', key: 'showSatelliteMagnitudes' },
      { label: 'Beam Analysis', key: 'showBeamAnalysis' },
      { label: 'Performance', key: 'showPerformanceStats' }
    ];
    
    toggles.forEach(toggle => {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = `
        margin-bottom: 3px;
        display: flex;
        align-items: center;
      `;
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = this.config[toggle.key as keyof DebugHUDConfig] as boolean;
      checkbox.style.cssText = 'margin-right: 8px;';
      
      const label = document.createElement('label');
      label.textContent = toggle.label;
      label.style.cssText = 'font-size: 11px; cursor: pointer;';
      
      checkbox.addEventListener('change', () => {
        (this.config as any)[toggle.key] = checkbox.checked;
        this.updatePanelVisibility();
        this.onToggleChange(toggle.key, checkbox.checked);
      });
      
      label.addEventListener('click', () => {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
      });
      
      wrapper.appendChild(checkbox);
      wrapper.appendChild(label);
      panel.appendChild(wrapper);
    });
    
    return panel;
  }

  private updatePanelVisibility(): void {
    this.atmospherePanel.style.display = this.config.showAtmosphere ? 'block' : 'none';
    this.exposurePanel.style.display = this.config.showHDRExposure ? 'block' : 'none';
    this.statsPanel.style.display = this.config.showPerformanceStats ? 'block' : 'none';
    this.satellitePanel.style.display = this.config.showSatelliteMagnitudes ? 'block' : 'none';
  }

  private onControlChange(id: string, value: number | string): void {
    // Dispatch events for control changes
    const event = new CustomEvent('debugControlChange', {
      detail: { id, value }
    });
    this.container.dispatchEvent(event);
  }

  private onToggleChange(key: string, value: boolean): void {
    // Dispatch events for toggle changes
    const event = new CustomEvent('debugToggleChange', {
      detail: { key, value }
    });
    this.container.dispatchEvent(event);
  }

  public updatePerformanceStats(stats: {
    fps: number;
    frameTime: number;
    triangles: number;
    calls: number;
    memory: number;
  }): void {
    if (!this.config.showPerformanceStats) return;
    
    this.statsPanel.innerHTML = `
      <div style="color: #88ccff; font-weight: bold; margin-bottom: 8px; font-size: 13px;">Performance</div>
      <div style="font-size: 10px; line-height: 1.4;">
        <div>FPS: <span style="color: ${stats.fps > 30 ? '#00ff00' : '#ff4444'}">${stats.fps.toFixed(1)}</span></div>
        <div>Frame: ${stats.frameTime.toFixed(2)}ms</div>
        <div>Triangles: ${stats.triangles.toLocaleString()}</div>
        <div>Draw Calls: ${stats.calls}</div>
        <div>Memory: ${(stats.memory / 1024 / 1024).toFixed(1)}MB</div>
      </div>
    `;
  }

  public updateSatelliteInfo(satellites: {
    visible: number;
    total: number;
    brightestMagnitude: number;
    averageMagnitude: number;
  }): void {
    if (!this.config.showSatelliteMagnitudes) return;
    
    this.satellitePanel.innerHTML = `
      <div style="color: #88ccff; font-weight: bold; margin-bottom: 8px; font-size: 13px;">Satellites</div>
      <div style="font-size: 10px; line-height: 1.4;">
        <div>Visible: ${satellites.visible}/${satellites.total}</div>
        <div>Brightest: mag ${satellites.brightestMagnitude.toFixed(1)}</div>
        <div>Average: mag ${satellites.averageMagnitude.toFixed(1)}</div>
      </div>
    `;
  }

  public updateTimeInfo(timeInfo: {
    localTime: string;
    utcTime: string;
    sunElevation: number;
    phase: string;
  }): void {
    // Add time info to a dedicated panel if needed
    const timeDisplay = document.createElement('div');
    timeDisplay.style.cssText = `
      position: absolute;
      bottom: 10px;
      left: 10px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      font-family: 'Courier New', monospace;
      font-size: 11px;
      padding: 8px;
      border-radius: 3px;
      border: 1px solid #333;
    `;
    
    timeDisplay.innerHTML = `
      <div style="color: #88ccff; font-weight: bold;">Time & Lighting</div>
      <div>Local: ${timeInfo.localTime}</div>
      <div>UTC: ${timeInfo.utcTime}</div>
      <div>Sun: ${timeInfo.sunElevation.toFixed(1)}°</div>
      <div>Phase: ${timeInfo.phase}</div>
    `;
    
    // Remove existing time display
    const existing = this.container.querySelector('.time-display');
    if (existing) existing.remove();
    
    timeDisplay.className = 'time-display';
    this.container.appendChild(timeDisplay);
  }

  public setVisible(visible: boolean): void {
    this.hudElement.style.display = visible ? 'block' : 'none';
  }

  public getConfig(): DebugHUDConfig {
    return { ...this.config };
  }

  public dispose(): void {
    if (this.hudElement && this.hudElement.parentNode) {
      this.hudElement.parentNode.removeChild(this.hudElement);
    }
    
    // Remove time display
    const timeDisplay = this.container.querySelector('.time-display');
    if (timeDisplay) timeDisplay.remove();
    
    console.log('DebugHUD disposed');
  }
}