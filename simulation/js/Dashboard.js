/**
 * Dashboard — real-time UI overlay for the Cortex simulation.
 *
 * Manages three visualisations:
 *   1. Stats panel    — textual counters (generation, fitness, alive, error)
 *   2. Network canvas — weight/activation diagram of the best brain
 *   3. Chart canvas   — fitness or error history plotted as a line graph
 *
 * Also wires Export / Import model buttons.
 *
 * Vanilla JS — no external dependencies, runs directly in the browser.
 */
class Dashboard {
  /**
   * @param {HTMLElement}  container   The right-panel DOM element
   * @param {Simulation}   simulation
   */
  constructor(container, simulation) {
    this.container  = container;
    this.simulation = simulation;

    // Canvas contexts (resolved lazily so the dashboard can be created before
    // the canvases are in the DOM, though in practice they are).
    this._netCtx   = null;
    this._chartCtx = null;

    // Stat elements
    this._statEls = {};

    this.buildUI();
  }

  // ---------------------------------------------------------------------------
  // Build / wire UI
  // ---------------------------------------------------------------------------

  /** Resolves DOM references and attaches event listeners. */
  buildUI() {
    // --- Stat value elements ---
    const ids = ['stat-generation', 'stat-best-fitness', 'stat-mean-fitness', 'stat-alive'];
    const keys = ['generation', 'bestFitness', 'meanFitness', 'alive'];
    ids.forEach((id, i) => {
      this._statEls[keys[i]] = document.getElementById(id);
    });

    // --- Canvas contexts ---
    const netCanvas   = document.getElementById('networkCanvas');
    const chartCanvas = document.getElementById('chartCanvas');
    if (netCanvas)   this._netCtx   = netCanvas.getContext('2d');
    if (chartCanvas) this._chartCtx = chartCanvas.getContext('2d');

    // --- Export button ---
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const json = this.simulation.exportModel();
        const blob = new Blob([json], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = Object.assign(document.createElement('a'), {
          href:     url,
          download: 'cortex-model.json',
        });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    }

    // --- Import button (hidden file input) ---
    const importInput = document.getElementById('importInput');
    if (importInput) {
      importInput.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = evt => {
          this.simulation.importModel(evt.target.result);
          importInput.value = ''; // allow re-importing the same file
        };
        reader.readAsText(file);
      });
    }

    // Initial blank state
    if (this._netCtx)   this._clearCanvas(this._netCtx);
    if (this._chartCtx) this._clearCanvas(this._chartCtx);
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  /**
   * Updates the numeric stat counters in the side panel.
   * @param {{ generation, bestFitness, meanFitness, alive, totalVehicles, error }} stats
   */
  updateStats(stats) {
    if (!stats) return;
    this._setText('generation',  stats.generation);
    this._setText('bestFitness', Math.round(stats.bestFitness));
    this._setText('meanFitness', Math.round(stats.meanFitness));
    this._setText('alive',       `${stats.alive}/${stats.totalVehicles}`);
  }

  _setText(key, value) {
    const el = this._statEls[key];
    if (el) el.textContent = value;
  }

  // ---------------------------------------------------------------------------
  // Neural-network diagram
  // ---------------------------------------------------------------------------

  /**
   * Renders a weight/activation diagram for `network` on the networkCanvas.
   * Connections are coloured blue (positive weight) or red (negative weight).
   * Line thickness encodes magnitude.
   *
   * @param {NeuralNetwork} network
   */
  drawNetwork(network) {
    const ctx = this._netCtx;
    if (!ctx || !network) return;

    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    this._clearCanvas(ctx);

    const layers   = network.layerSizes;
    const nLayers  = layers.length;
    const xStep    = W / (nLayers + 1);
    const maxNeurs = Math.max(...layers);

    // Pre-compute neuron pixel positions
    const pos = layers.map((n, l) => {
      const x     = xStep * (l + 1);
      const yStep = H / (n + 1);
      return Array.from({ length: n }, (_, i) => ({ x, y: yStep * (i + 1) }));
    });

    // --- Connections ---
    for (let l = 0; l < nLayers - 1; l++) {
      const W_mat = network.weights[l]; // shape: (layers[l+1] × layers[l])
      for (let j = 0; j < layers[l + 1]; j++) {
        for (let i = 0; i < layers[l]; i++) {
          const w     = W_mat.data[j][i];
          const alpha = Math.min(0.9, Math.abs(w) * 0.55 + 0.1);
          const width = Math.min(2.5, Math.abs(w) * 0.8 + 0.3);
          ctx.save();
          ctx.globalAlpha  = alpha;
          ctx.strokeStyle  = w >= 0 ? '#4488ff' : '#e94560';
          ctx.lineWidth    = width;
          ctx.beginPath();
          ctx.moveTo(pos[l][i].x,     pos[l][i].y);
          ctx.lineTo(pos[l + 1][j].x, pos[l + 1][j].y);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // --- Neurons ---
    const INPUT_LABELS  = ['L90°', 'L45°', 'Fwd', 'R45°', 'R90°'];
    const OUTPUT_LABELS = ['Steer', 'Speed'];
    const R = Math.max(5, Math.min(10, 120 / maxNeurs));

    for (let l = 0; l < nLayers; l++) {
      for (let i = 0; i < layers[l]; i++) {
        const { x, y } = pos[l][i];
        const isInput  = l === 0;
        const isOutput = l === nLayers - 1;

        ctx.beginPath();
        ctx.arc(x, y, R, 0, Math.PI * 2);
        ctx.fillStyle   = isInput ? '#0f3460' : isOutput ? '#501030' : '#1a2e4a';
        ctx.fill();
        ctx.strokeStyle = isInput ? '#4488ff' : isOutput ? '#e94560' : '#2255aa';
        ctx.lineWidth   = 1.5;
        ctx.stroke();

        // Labels for input and output neurons
        ctx.fillStyle   = '#aabbcc';
        ctx.font        = `${R - 1}px monospace`;
        ctx.textBaseline = 'middle';
        if (isInput && i < INPUT_LABELS.length) {
          ctx.textAlign = 'right';
          ctx.fillText(INPUT_LABELS[i], x - R - 2, y);
        } else if (isOutput && i < OUTPUT_LABELS.length) {
          ctx.textAlign = 'left';
          ctx.fillText(OUTPUT_LABELS[i], x + R + 2, y);
        }
      }
    }

    // --- Layer labels at bottom ---
    const layerLabels = ['Input', ...Array(nLayers - 2).fill('Hidden'), 'Output'];
    ctx.fillStyle   = '#445566';
    ctx.font        = '9px monospace';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'alphabetic';
    for (let l = 0; l < nLayers; l++) {
      ctx.fillText(layerLabels[Math.min(l, layerLabels.length - 1)], xStep * (l + 1), H - 4);
    }
  }

  // ---------------------------------------------------------------------------
  // Training chart
  // ---------------------------------------------------------------------------

  /**
   * Draws a line chart of fitness/error history.
   *
   * Each item in `data` should have at least a `best` property (number).
   * An optional `mean` property adds a second (blue) line.
   *
   * @param {Array<{best:number, mean?:number}>} data
   */
  updateChart(data) {
    const ctx = this._chartCtx;
    if (!ctx) return;

    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    this._clearCanvas(ctx);

    if (!data || data.length < 2) {
      ctx.fillStyle    = '#445566';
      ctx.font         = '11px monospace';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Collecting data…', W / 2, H / 2);
      return;
    }

    // Compute value range across both series
    let maxVal = -Infinity, minVal = Infinity;
    for (const d of data) {
      maxVal = Math.max(maxVal, d.best ?? 0, d.mean ?? 0);
      minVal = Math.min(minVal, d.best ?? 0, d.mean ?? 0);
    }
    const range = maxVal - minVal || 1;
    const pad   = 14;

    const toY = v => H - pad - ((v - minVal) / range) * (H - pad * 2);
    const toX = i => (i / (data.length - 1)) * W;

    // --- Grid lines ---
    ctx.strokeStyle = '#1a2744';
    ctx.lineWidth   = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad + (i / 4) * (H - pad * 2);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Helper: draw a series
    const drawLine = (series, color) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth   = 2;
      ctx.lineJoin    = 'round';
      ctx.beginPath();
      for (let i = 0; i < data.length; i++) {
        const v = data[i][series];
        if (v === undefined || v === null) continue;
        if (i === 0) ctx.moveTo(toX(i), toY(v));
        else         ctx.lineTo(toX(i), toY(v));
      }
      ctx.stroke();
      ctx.restore();
    };

    drawLine('best', '#e94560');
    if (data[0].mean !== undefined) drawLine('mean', '#4488ff');

    // --- Axis labels ---
    ctx.fillStyle    = '#667788';
    ctx.font         = '9px monospace';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign    = 'left';
    ctx.fillText(maxVal.toFixed(maxVal > 10 ? 0 : 3), 3, pad - 2);
    ctx.fillText(minVal.toFixed(minVal > 10 ? 0 : 3), 3, H - 3);
    ctx.textAlign = 'right';
    ctx.fillText(`n=${data.length}`, W - 3, H - 3);
  }

  // ---------------------------------------------------------------------------
  // Mode switching
  // ---------------------------------------------------------------------------

  /**
   * Highlights the active mode button and shows the correct settings panel.
   * @param {'genetic'|'supervised'|'backprop'} mode
   */
  setMode(mode) {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`.mode-btn[data-mode="${mode}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    document.querySelectorAll('.mode-panel').forEach(el => el.style.display = 'none');
    const panel = document.getElementById(`panel-${mode}`);
    if (panel) panel.style.display = 'block';
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  _clearCanvas(ctx) {
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }
}
