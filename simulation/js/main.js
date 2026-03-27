/**
 * main.js — entry point for the Cortex AI simulation.
 *
 * Waits for DOMContentLoaded, then:
 *   1. Creates a Simulation instance and calls init().
 *   2. Creates a Dashboard and wires every UI control.
 *   3. Sets up event listeners for mode tabs, play/pause, reset,
 *      speed buttons, sliders, and import/export.
 *
 * Vanilla JS — no external dependencies.
 */
document.addEventListener('DOMContentLoaded', () => {

  // ---------------------------------------------------------------------------
  // DOM references
  // ---------------------------------------------------------------------------
  const canvas        = document.getElementById('simulationCanvas');
  const playPauseBtn  = document.getElementById('playPauseBtn');
  const resetBtn      = document.getElementById('resetBtn');
  const trackRandBtn  = document.getElementById('trackRandBtn');
  const modeBtns      = document.querySelectorAll('.mode-btn');
  const speedBtns     = document.querySelectorAll('.speed-btn');
  const mutSlider     = document.getElementById('mutationSlider');
  const mutValue      = document.getElementById('mutationValue');
  // LR sliders are per-mode (unique IDs to avoid duplicate-ID issues)
  const lrSliders = {
    supervised: document.getElementById('lrSlider-sup'),
    backprop:   document.getElementById('lrSlider-bp'),
  };
  const lrValues = {
    supervised: document.getElementById('lrValue-sup'),
    backprop:   document.getElementById('lrValue-bp'),
  };

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  let currentMode  = 'genetic';
  let simulation   = null;
  let dashboard    = null;
  let currentSpeed = 1;

  // ---------------------------------------------------------------------------
  // Simulation factory
  // ---------------------------------------------------------------------------

  /**
   * Tears down any running simulation and creates a fresh one for `mode`.
   * Does NOT auto-start — the user must press Play.
   */
  function createSimulation(mode) {
    if (simulation) simulation.pause();

    currentMode = mode;

    simulation = new Simulation(canvas, {
      mode,
      learningRate: (lrSliders[mode] ? parseFloat(lrSliders[mode].value) : 0.05),
      mutationRate: mutSlider  ? parseFloat(mutSlider.value)  : 0.15,
    });
    simulation.init();
    simulation.setSpeed(currentSpeed);

    // Wire the per-frame stats callback
    simulation.onStats = stats => {
      dashboard.updateStats(stats);

      // Neural-network diagram — show best brain
      const brain = simulation.getBestBrain();
      if (brain) dashboard.drawNetwork(brain);

      // Training chart
      const chartData = mode === 'genetic'
        ? simulation.fitnessHistory
        : simulation.errorHistory.map(e => ({ best: e, mean: e }));
      dashboard.updateChart(chartData);
    };

    // Generation-end callback (genetic only)
    simulation.onGenerationEnd = stats => {
      console.info(
        `[Cortex] Gen ${stats.generation} ended — ` +
        `best=${stats.best.toFixed(1)}  mean=${stats.mean.toFixed(1)}`
      );
    };

    // Re-use (or create) dashboard
    if (!dashboard) {
      dashboard = new Dashboard(
        document.getElementById('dashboardContainer'),
        simulation,
      );
    } else {
      // Re-bind simulation reference and re-wire export/import
      dashboard.simulation = simulation;
      dashboard.buildUI();
    }

    dashboard.setMode(mode);
    syncPlayButton();
  }

  // ---------------------------------------------------------------------------
  // Play / Pause
  // ---------------------------------------------------------------------------

  function syncPlayButton() {
    if (!playPauseBtn) return;
    playPauseBtn.textContent = simulation && simulation.running ? '⏸  Pause' : '▶  Play';
  }

  if (playPauseBtn) {
    playPauseBtn.addEventListener('click', () => {
      if (!simulation) return;
      if (simulation.running) {
        simulation.pause();
      } else {
        simulation.start();
      }
      syncPlayButton();
    });
  }

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      createSimulation(currentMode);
    });
  }

  // ---------------------------------------------------------------------------
  // Random-track toggle
  // ---------------------------------------------------------------------------

  if (trackRandBtn) {
    trackRandBtn.addEventListener('click', () => {
      if (!simulation) return;
      const wasRunning = simulation.running;
      simulation.pause();

      // Switch the track generation method then re-init
      const origInit = simulation.track
        ? simulation.track.generateCircuit.bind(simulation.track)
        : null;

      // Swap generator used in simulation.init()
      simulation._useRandomTrack = !simulation._useRandomTrack;
      trackRandBtn.textContent   = simulation._useRandomTrack ? '⬡ Circuit' : '⬡ Random';

      const oldInit = simulation.init.bind(simulation);
      simulation.init = function () {
        this.track   = new Track(this.canvas, this.ctx);
        this.startPos = this._useRandomTrack
          ? this.track.generateRandom()
          : this.track.generateCircuit();
        this.walls = this.track.getWalls();
        switch (this.mode) {
          case 'genetic':    this._initGenetic();    break;
          case 'supervised': this._initSupervised(); break;
          case 'backprop':   this._initBackprop();   break;
        }
      };

      simulation.reset();
      simulation.init = oldInit; // restore original

      if (wasRunning) simulation.start();
      syncPlayButton();
    });
  }

  // ---------------------------------------------------------------------------
  // Mode tabs
  // ---------------------------------------------------------------------------

  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      createSimulation(mode);
    });
  });

  // ---------------------------------------------------------------------------
  // Speed buttons
  // ---------------------------------------------------------------------------

  speedBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      speedBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSpeed = parseInt(btn.dataset.speed, 10);
      if (simulation) simulation.setSpeed(currentSpeed);
    });
  });

  // ---------------------------------------------------------------------------
  // Mutation-rate slider (genetic mode)
  // ---------------------------------------------------------------------------

  if (mutSlider) {
    mutSlider.addEventListener('input', () => {
      const val = parseFloat(mutSlider.value);
      if (mutValue) mutValue.textContent = val.toFixed(2);
      if (simulation) simulation.setMutationRate(val);
    });
  }

  // ---------------------------------------------------------------------------
  // Learning-rate sliders (supervised / backprop — each has its own element)
  // ---------------------------------------------------------------------------

  Object.entries(lrSliders).forEach(([mode, slider]) => {
    if (!slider) return;
    slider.addEventListener('input', () => {
      const val = parseFloat(slider.value);
      const display = lrValues[mode];
      if (display) display.textContent = val.toFixed(3);
      if (simulation && simulation.mode === mode) simulation.setLearningRate(val);
    });
  });

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts
  // ---------------------------------------------------------------------------

  document.addEventListener('keydown', e => {
    switch (e.key) {
      case ' ':
        e.preventDefault();
        if (simulation) {
          if (simulation.running) simulation.pause(); else simulation.start();
          syncPlayButton();
        }
        break;
      case 'r': case 'R':
        createSimulation(currentMode);
        break;
    }
  });

  // ---------------------------------------------------------------------------
  // Bootstrap
  // ---------------------------------------------------------------------------

  createSimulation(currentMode);
});
