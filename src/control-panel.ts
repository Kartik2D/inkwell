/**
 * Control Panel - Floating UI Controls
 * 
 * Provides a floating panel with controls for:
 * - Mode selection (add/subtract)
 * - Tool selection (brush/lasso)
 * - Brush size adjustment
 * - Brush color selection
 * - Pixel resolution adjustment
 * - Clear canvas functionality
 * 
 * The panel floats over the canvas and provides real-time control
 * over drawing parameters.
 */
import type { DrawMode, DrawTool } from './types';

export class ControlPanel {
  private panel!: HTMLDivElement;
  private modeAddButton!: HTMLButtonElement;
  private modeSubtractButton!: HTMLButtonElement;
  private toolBrushButton!: HTMLButtonElement;
  private toolLassoButton!: HTMLButtonElement;
  private toolSelectButton!: HTMLButtonElement;
  private brushSizeMinSlider!: HTMLInputElement;
  private brushSizeMinValue!: HTMLSpanElement;
  private brushSizeMaxSlider!: HTMLInputElement;
  private brushSizeMaxValue!: HTMLSpanElement;
  private brushColorInput!: HTMLInputElement;
  private pixelResSlider!: HTMLInputElement;
  private pixelResValue!: HTMLSpanElement;
  private clearButton!: HTMLButtonElement;
  private flattenButton!: HTMLButtonElement;
  private cursorToggle!: HTMLInputElement;
  private currentMode: DrawMode = 'add';
  private currentTool: DrawTool = 'brush';
  
  private onBrushSizeChange: (min: number, max: number) => void;
  private onBrushColorChange: (color: string) => void;
  private onPixelResChange: (scale: number) => void;
  private onClear: () => void;
  private onCursorToggleChange: (enabled: boolean) => void;
  private onModeChange: (mode: DrawMode) => void;
  private onToolChange: (tool: DrawTool) => void;
  private onFlatten: () => void;

  constructor(
    onBrushSizeChange: (min: number, max: number) => void,
    onBrushColorChange: (color: string) => void,
    onPixelResChange: (scale: number) => void,
    onClear: () => void,
    onCursorToggleChange: (enabled: boolean) => void = () => {},
    onModeChange: (mode: DrawMode) => void = () => {},
    onToolChange: (tool: DrawTool) => void = () => {},
    onFlatten: () => void = () => {}
  ) {
    this.onBrushSizeChange = onBrushSizeChange;
    this.onBrushColorChange = onBrushColorChange;
    this.onPixelResChange = onPixelResChange;
    this.onClear = onClear;
    this.onCursorToggleChange = onCursorToggleChange;
    this.onModeChange = onModeChange;
    this.onToolChange = onToolChange;
    this.onFlatten = onFlatten;

    this.createPanel();
    this.setupEventListeners();
  }

  private createPanel() {
    // Create panel container
    this.panel = document.createElement('div');
    this.panel.id = 'control-panel';
    this.panel.innerHTML = `
      <div class="control-group">
        <label>
          <span>Mode</span>
          <div class="tool-buttons">
            <button id="mode-add" class="tool-button active">Add</button>
            <button id="mode-subtract" class="tool-button">Subtract</button>
          </div>
        </label>
      </div>
      <div class="control-group">
        <label>
          <span>Tool</span>
          <div class="tool-buttons">
            <button id="tool-brush" class="tool-button active">Brush</button>
            <button id="tool-lasso" class="tool-button">Lasso</button>
            <button id="tool-select" class="tool-button">Select</button>
          </div>
        </label>
      </div>
      <div class="control-group">
        <label>
          <span>Brush Size (Min)</span>
          <div class="slider-container">
            <input type="range" id="brush-size-min-slider" min="0.5" max="10" value="1" step="0.5">
            <span id="brush-size-min-value">1</span>
          </div>
        </label>
      </div>
      <div class="control-group">
        <label>
          <span>Brush Size (Max)</span>
          <div class="slider-container">
            <input type="range" id="brush-size-max-slider" min="0.5" max="10" value="4" step="0.5">
            <span id="brush-size-max-value">4</span>
          </div>
        </label>
      </div>
      <div class="control-group">
        <label>
          <span>Brush Color</span>
          <div class="color-container">
            <input type="color" id="brush-color-input" value="#000000">
            <span id="brush-color-value">#000000</span>
          </div>
        </label>
      </div>
      <div class="control-group">
        <label>
          <span>Pixel Resolution</span>
          <div class="slider-container">
            <input type="range" id="pixel-res-slider" min="1" max="8" value="2" step="1">
            <span id="pixel-res-value">2x</span>
          </div>
        </label>
      </div>
      <div class="control-group">
        <label class="toggle-label">
          <span>Show Cursor</span>
          <input type="checkbox" id="cursor-toggle" checked>
        </label>
      </div>
      <div class="control-group">
        <button id="flatten-button">Flatten</button>
      </div>
      <div class="control-group">
        <button id="clear-button">Clear</button>
      </div>
    `;

    document.body.appendChild(this.panel);

    // Get references to elements
    this.modeAddButton = document.getElementById('mode-add') as HTMLButtonElement;
    this.modeSubtractButton = document.getElementById('mode-subtract') as HTMLButtonElement;
    this.toolBrushButton = document.getElementById('tool-brush') as HTMLButtonElement;
    this.toolLassoButton = document.getElementById('tool-lasso') as HTMLButtonElement;
    this.toolSelectButton = document.getElementById('tool-select') as HTMLButtonElement;
    this.brushSizeMinSlider = document.getElementById('brush-size-min-slider') as HTMLInputElement;
    this.brushSizeMinValue = document.getElementById('brush-size-min-value') as HTMLSpanElement;
    this.brushSizeMaxSlider = document.getElementById('brush-size-max-slider') as HTMLInputElement;
    this.brushSizeMaxValue = document.getElementById('brush-size-max-value') as HTMLSpanElement;
    this.brushColorInput = document.getElementById('brush-color-input') as HTMLInputElement;
    this.pixelResSlider = document.getElementById('pixel-res-slider') as HTMLInputElement;
    this.pixelResValue = document.getElementById('pixel-res-value') as HTMLSpanElement;
    this.cursorToggle = document.getElementById('cursor-toggle') as HTMLInputElement;
    this.flattenButton = document.getElementById('flatten-button') as HTMLButtonElement;
    this.clearButton = document.getElementById('clear-button') as HTMLButtonElement;
  }

  private setupEventListeners() {
    // Mode buttons
    this.modeAddButton.addEventListener('click', () => {
      this.setMode('add');
    });

    this.modeSubtractButton.addEventListener('click', () => {
      this.setMode('subtract');
    });

    // Tool buttons
    this.toolBrushButton.addEventListener('click', () => {
      this.setTool('brush');
    });

    this.toolLassoButton.addEventListener('click', () => {
      this.setTool('lasso');
    });

    this.toolSelectButton.addEventListener('click', () => {
      this.setTool('select');
    });

    // Brush size min slider
    this.brushSizeMinSlider.addEventListener('input', (e) => {
      let minValue = parseFloat((e.target as HTMLInputElement).value);
      const maxValue = parseFloat(this.brushSizeMaxSlider.value);
      
      // Ensure min doesn't exceed max
      if (minValue > maxValue) {
        minValue = maxValue;
        this.brushSizeMinSlider.value = minValue.toString();
      }
      
      this.brushSizeMinValue.textContent = minValue.toString();
      this.onBrushSizeChange(minValue, maxValue);
    });

    // Brush size max slider
    this.brushSizeMaxSlider.addEventListener('input', (e) => {
      let maxValue = parseFloat((e.target as HTMLInputElement).value);
      const minValue = parseFloat(this.brushSizeMinSlider.value);
      
      // Ensure max doesn't go below min
      if (maxValue < minValue) {
        maxValue = minValue;
        this.brushSizeMaxSlider.value = maxValue.toString();
      }
      
      this.brushSizeMaxValue.textContent = maxValue.toString();
      this.onBrushSizeChange(minValue, maxValue);
    });

    // Brush color input
    this.brushColorInput.addEventListener('input', (e) => {
      const value = (e.target as HTMLInputElement).value;
      const colorValueSpan = document.getElementById('brush-color-value');
      if (colorValueSpan) {
        colorValueSpan.textContent = value.toUpperCase();
      }
      this.onBrushColorChange(value);
    });

    // Pixel resolution slider
    this.pixelResSlider.addEventListener('input', (e) => {
      const value = parseInt((e.target as HTMLInputElement).value);
      this.pixelResValue.textContent = `${value}x`;
      this.onPixelResChange(value);
    });

    // Cursor toggle
    this.cursorToggle.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      this.onCursorToggleChange(checked);
    });

    // Flatten button
    this.flattenButton.addEventListener('click', () => {
      this.onFlatten();
    });

    // Clear button
    this.clearButton.addEventListener('click', () => {
      this.onClear();
    });
  }

  getBrushSizeMin(): number {
    return parseFloat(this.brushSizeMinSlider.value);
  }

  getBrushSizeMax(): number {
    return parseFloat(this.brushSizeMaxSlider.value);
  }

  getBrushColor(): string {
    return this.brushColorInput.value;
  }

  getPixelResScale(): number {
    return parseInt(this.pixelResSlider.value);
  }

  getCursorEnabled(): boolean {
    return this.cursorToggle.checked;
  }

  getMode(): DrawMode {
    return this.currentMode;
  }

  getTool(): DrawTool {
    return this.currentTool;
  }

  private setMode(mode: DrawMode) {
    this.currentMode = mode;
    
    // Update button states
    this.modeAddButton.classList.toggle('active', mode === 'add');
    this.modeSubtractButton.classList.toggle('active', mode === 'subtract');
    
    this.onModeChange(mode);
  }

  private setTool(tool: DrawTool) {
    this.currentTool = tool;
    
    // Update button states
    this.toolBrushButton.classList.toggle('active', tool === 'brush');
    this.toolLassoButton.classList.toggle('active', tool === 'lasso');
    this.toolSelectButton.classList.toggle('active', tool === 'select');
    
    this.onToolChange(tool);
  }
}
