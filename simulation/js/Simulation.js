/**
 * Simulation — orchestrates the autonomous vehicle simulation.
 *
 * Three learning modes
 * ───────────────────
 * 'genetic'    20 vehicles evolve simultaneously; GeneticAlgorithm breeds each
 *              new generation when all agents have crashed.
 *
 * 'supervised' A waypoint-following teacher drives the circuit and generates
 *              labelled (sensor → action) training examples every step. The
 *              student NeuralNetwork is trained online; the student vehicle
 *              drives independently on its own sensor readings.
 *
 * 'backprop'   A single vehicle uses an on-board heuristic to compute target
 *              actions from its own sensor readings and trains its brain via
 *              backpropagation every step.
 *
 * Depends on: Track.js, Vehicle.js (castRayGlobal), NeuralNetwork, GeneticAlgorithm
 * Vanilla JS — no external dependencies, runs directly in the browser.
 */
class Simulation {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [options]
   * @param {string} [options.mode='genetic']       'genetic' | 'supervised' | 'backprop'
   * @param {number} [options.learningRate=0.05]
   * @param {number} [options.mutationRate=0.15]
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.mode   = options.mode        ?? 'genetic';

    // ---- Runtime state ----
    this.track       = null;
    this.startPos    = null;
    this.walls       = [];
    this.running     = false;
    this.speedMult   = 1;
    this.frameId     = null;

    // ---- Genetic mode ----
    this.genetic    = null;
    this.population = [];
    this.vehicles   = [];
    this.fitnesses  = [];
    this.generation = 1;
    this.bestFitness = 0;
    this.fitnessHistory = [];  // [{gen, best, mean}]

    // ---- Supervised mode ----
    this.teacher          = null;   // plain object {x,y,angle,speed}
    this.teacherWpIdx     = 0;
    this.teacherWaypoints = [];
    this.student          = null;   // Vehicle

    // ---- Backprop mode ----
    this.bpVehicle = null;

    // ---- Shared ----
    this.errorHistory = [];  // recent MSE values (backprop / supervised)

    // ---- Callbacks (set by external code) ----
    /** Called at the end of each generation in genetic mode. */
    this.onGenerationEnd = null;
    /** Called once per rendered frame with a stats object. */
    this.onStats = null;

    // Options forwarded to agents
    this._learningRate = options.learningRate ?? 0.05;
    this._mutationRate = options.mutationRate ?? 0.15;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Builds the track and initialises agents for the current mode. */
  init() {
    this.track    = new Track(this.canvas, this.ctx);
    this.startPos = this.track.generateCircuit();
    this.walls    = this.track.getWalls();

    switch (this.mode) {
      case 'genetic':    this._initGenetic();    break;
      case 'supervised': this._initSupervised(); break;
      case 'backprop':   this._initBackprop();   break;
    }
  }

  /** Starts the main loop if not already running. */
  start() {
    if (this.running) return;
    this.running = true;
    this._loop();
  }

  /** Pauses the main loop. */
  pause() {
    this.running = false;
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  /** Pauses and re-initialises everything from scratch. */
  reset() {
    this.pause();
    this.generation  = 1;
    this.bestFitness = 0;
    this.fitnessHistory  = [];
    this.errorHistory    = [];
    this.teacherWpIdx    = 0;
    this.init();
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------

  _loop() {
    if (!this.running) return;

    // Run multiple physics steps per rendered frame for speed multiplier > 1
    for (let s = 0; s < this.speedMult; s++) {
      this.step();
    }

    this._render();
    this.frameId = requestAnimationFrame(() => this._loop());
  }

  /** Advances the simulation by exactly one physics step. */
  step() {
    switch (this.mode) {
      case 'genetic':    this._stepGenetic();    break;
      case 'supervised': this._stepSupervised(); break;
      case 'backprop':   this._stepBackprop();   break;
    }
  }

  // ---------------------------------------------------------------------------
  // Speed control
  // ---------------------------------------------------------------------------

  /**
   * Sets how many physics steps are computed per rendered frame.
   * @param {number} multiplier  1 | 2 | 5 | 10
   */
  setSpeed(multiplier) {
    this.speedMult = multiplier;
  }

  // ---------------------------------------------------------------------------
  // Genetic mode
  // ---------------------------------------------------------------------------

  _initGenetic() {
    const template = new NeuralNetwork([5, 8, 8, 2], {
      activation:   'sigmoid',
      learningRate: 0.1,
    });
    this.genetic = new GeneticAlgorithm({
      populationSize:   20,
      mutationRate:     this._mutationRate,
      eliteCount:       2,
      tournamentSize:   5,
      mutationStrength: 0.4,
    });
    this.population = this.genetic.initPopulation(template);
    this.fitnesses  = new Array(this.population.length).fill(0);
    this.vehicles   = this.population.map(brain =>
      new Vehicle(this.startPos.x, this.startPos.y, this.startPos.angle, brain),
    );
  }

  _stepGenetic() {
    let anyAlive = false;

    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      if (!v.alive) continue;
      anyAlive = true;

      v.getSensorReadings(this.walls);
      v.think();
      v.update(this.walls);
      this.fitnesses[i] = v.score;
    }

    if (!anyAlive) this._endGeneration();
  }

  _endGeneration() {
    const stats = this.genetic.getStats(this.fitnesses);
    this.bestFitness = Math.max(this.bestFitness, stats.best);
    this.fitnessHistory.push({ gen: this.generation, best: stats.best, mean: stats.mean });

    if (this.onGenerationEnd) this.onGenerationEnd(stats);

    // Breed next generation
    this.population = this.genetic.nextGeneration(this.population, this.fitnesses);
    this.generation  = this.genetic.generation + 1;
    this.fitnesses   = new Array(this.population.length).fill(0);
    this.vehicles    = this.population.map(brain =>
      new Vehicle(this.startPos.x, this.startPos.y, this.startPos.angle, brain),
    );
  }

  // ---------------------------------------------------------------------------
  // Supervised mode
  // ---------------------------------------------------------------------------

  _initSupervised() {
    this.teacherWaypoints = this.track.centerPoints;
    this.teacherWpIdx     = 0;
    this.teacher = {
      x:     this.startPos.x,
      y:     this.startPos.y,
      angle: this.startPos.angle,
      speed: 0,
    };

    const brain = new NeuralNetwork([5, 8, 8, 2], {
      activation:   'sigmoid',
      learningRate: this._learningRate,
    });
    this.student = new Vehicle(this.startPos.x, this.startPos.y, this.startPos.angle, brain);
  }

  _stepSupervised() {
    // 1. Advance teacher along waypoints
    this._updateTeacher();

    // 2. Generate training example from teacher's perspective
    const teacherSensors  = this._getTeacherSensors();
    const teacherSteering = this._getTeacherSteeringNorm();
    const teacherSpeed    = this._getTeacherSpeedNorm();

    // 3. Train student brain on teacher's labelled data
    this.student.brain.train(teacherSensors, [teacherSteering, teacherSpeed]);

    // 4. Student drives independently using its own sensor readings
    if (this.student.alive) {
      this.student.getSensorReadings(this.walls);
      this.student.think();
      this.student.update(this.walls);
    } else {
      this.student.reset(this.startPos.x, this.startPos.y, this.startPos.angle);
    }

    // 5. Track prediction error
    const pred = this.student.brain.predict(teacherSensors);
    const err  = 0.5 * ((pred[0] - teacherSteering) ** 2 + (pred[1] - teacherSpeed) ** 2);
    this._pushError(err);
  }

  _updateTeacher() {
    const wps = this.teacherWaypoints;
    const N   = wps.length;
    const t   = this.teacher;

    // Advance waypoint index when close enough
    const wp = wps[this.teacherWpIdx % N];
    if (Math.hypot(wp.x - t.x, wp.y - t.y) < 18) {
      this.teacherWpIdx = (this.teacherWpIdx + 1) % N;
    }

    // Look ahead several waypoints for smoother navigation
    const lookIdx = (this.teacherWpIdx + 6) % N;
    const target  = wps[lookIdx];
    const targetAngle = Math.atan2(target.y - t.y, target.x - t.x);

    let diff = targetAngle - t.angle;
    while (diff >  Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;

    // Smooth angular correction
    t.angle += Math.sign(diff) * Math.min(Math.abs(diff), 0.055);

    // Slow down for sharp turns
    t.speed = Math.max(1.4, 2.6 - Math.abs(diff) * 2.8);

    t.x += Math.cos(t.angle) * t.speed;
    t.y += Math.sin(t.angle) * t.speed;
  }

  _getTeacherSensors() {
    const angles = [-Math.PI / 2, -Math.PI / 4, 0, Math.PI / 4, Math.PI / 2];
    return angles.map(a =>
      castRayGlobal(this.teacher.x, this.teacher.y, this.teacher.angle + a, this.walls, 200) / 200,
    );
  }

  _getTeacherSteeringNorm() {
    const wps     = this.teacherWaypoints;
    const N       = wps.length;
    const lookIdx = (this.teacherWpIdx + 6) % N;
    const target  = wps[lookIdx];
    const t       = this.teacher;

    let diff = Math.atan2(target.y - t.y, target.x - t.x) - t.angle;
    while (diff >  Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;

    // Map [-π/4, +π/4] → [0, 1] (0.5 = straight)
    return 0.5 + 0.5 * Math.max(-1, Math.min(1, diff / (Math.PI / 4)));
  }

  _getTeacherSpeedNorm() {
    return Math.max(0.2, Math.min(1.0, this.teacher.speed / 3.0));
  }

  // ---------------------------------------------------------------------------
  // Backprop mode
  // ---------------------------------------------------------------------------

  _initBackprop() {
    const brain = new NeuralNetwork([5, 8, 8, 2], {
      activation:   'sigmoid',
      learningRate: this._learningRate,
    });
    this.bpVehicle = new Vehicle(this.startPos.x, this.startPos.y, this.startPos.angle, brain);
  }

  _stepBackprop() {
    const v = this.bpVehicle;

    if (!v.alive) {
      v.reset(this.startPos.x, this.startPos.y, this.startPos.angle);
      return;
    }

    v.getSensorReadings(this.walls);
    const s = v.sensorReadings;

    // Heuristic target: balance left/right clearance, speed ∝ forward clearance
    const leftClear  = (s[0] + s[1]) * 0.5;
    const rightClear = (s[3] + s[4]) * 0.5;
    const targetSteer = 0.5 + 0.38 * (rightClear - leftClear);
    const targetSpeed = Math.max(0.18, s[2] * 0.88);

    v.brain.train(s, [targetSteer, targetSpeed]);

    v.think();
    v.update(this.walls);

    // Track error
    const pred = v.brain.predict(s);
    const err  = 0.5 * ((pred[0] - targetSteer) ** 2 + (pred[1] - targetSpeed) ** 2);
    this._pushError(err);
  }

  /** Keeps the error history bounded. */
  _pushError(err) {
    this.errorHistory.push(err);
    if (this.errorHistory.length > 600) this.errorHistory.shift();
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  _render() {
    const ctx = this.ctx;
    const W   = this.canvas.width;
    const H   = this.canvas.height;

    // Background
    ctx.fillStyle = '#0d0d1a';
    ctx.fillRect(0, 0, W, H);

    this.track.draw();

    switch (this.mode) {
      case 'genetic':
        for (const v of this.vehicles) v.draw(ctx);
        // Highlight the current best vehicle
        this._drawBestHighlight(ctx);
        break;

      case 'supervised':
        this._drawTeacher(ctx);
        if (this.student) this.student.draw(ctx);
        break;

      case 'backprop':
        if (this.bpVehicle) this.bpVehicle.draw(ctx);
        break;
    }

    // HUD
    this._drawHUD(ctx);

    // Fire stats callback
    if (this.onStats) this.onStats(this.getStats());
  }

  _drawBestHighlight(ctx) {
    let bestIdx = 0, bestScore = -Infinity;
    for (let i = 0; i < this.vehicles.length; i++) {
      if (this.fitnesses[i] > bestScore) {
        bestScore = this.fitnesses[i];
        bestIdx   = i;
      }
    }
    const v = this.vehicles[bestIdx];
    if (!v.alive) return;

    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(v.x, v.y, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  _drawTeacher(ctx) {
    const t = this.teacher;
    if (!t) return;
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(t.angle);
    ctx.fillStyle = '#00ff88';
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.roundRect(-10, -5, 20, 10, 2);
    ctx.fill();
    // "T" label
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#003300';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('T', 0, 0);
    ctx.restore();
  }

  _drawHUD(ctx) {
    const stats = this.getStats();
    ctx.save();
    ctx.fillStyle = 'rgba(13,13,26,0.72)';
    ctx.fillRect(8, 8, 190, 56);
    ctx.fillStyle = '#4488ff';
    ctx.font = '11px monospace';
    ctx.fillText(`Gen: ${stats.generation}`, 18, 26);
    ctx.fillText(`Best: ${Math.round(stats.bestFitness)}`, 18, 42);
    if (this.mode === 'genetic') {
      ctx.fillText(`Alive: ${stats.alive}/${stats.totalVehicles}`, 110, 26);
      ctx.fillText(`Mean: ${Math.round(stats.meanFitness)}`, 110, 42);
    } else {
      const label = this.mode === 'supervised' ? 'Err' : 'Err';
      ctx.fillText(`${label}: ${(stats.error || 0).toFixed(4)}`, 110, 26);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Returns a snapshot of current simulation statistics.
   * @returns {{ generation, bestFitness, meanFitness, alive, totalVehicles, error }}
   */
  getStats() {
    if (this.mode === 'genetic') {
      const alive = this.vehicles.filter(v => v.alive).length;
      const best  = this.fitnesses.reduce((m, f) => Math.max(m, f), 0);
      const mean  = this.fitnesses.reduce((a, b) => a + b, 0) / (this.fitnesses.length || 1);
      return {
        generation:    this.generation,
        bestFitness:   best,
        meanFitness:   mean,
        alive,
        totalVehicles: this.vehicles.length,
        error:         0,
      };
    }

    const vehicle = this.mode === 'supervised' ? this.student : this.bpVehicle;
    const err     = this.errorHistory.length
      ? this.errorHistory[this.errorHistory.length - 1]
      : 0;
    return {
      generation:    1,
      bestFitness:   vehicle ? vehicle.score : 0,
      meanFitness:   0,
      alive:         (vehicle && vehicle.alive) ? 1 : 0,
      totalVehicles: 1,
      error:         err,
    };
  }

  /**
   * Serialises the best (or only) model to a JSON string.
   * @returns {string}
   */
  exportModel() {
    let brain;
    if (this.mode === 'genetic') {
      let bestIdx = 0, bestScore = -Infinity;
      for (let i = 0; i < this.fitnesses.length; i++) {
        if (this.fitnesses[i] > bestScore) {
          bestScore = this.fitnesses[i];
          bestIdx   = i;
        }
      }
      brain = this.population[bestIdx];
    } else if (this.mode === 'supervised') {
      brain = this.student.brain;
    } else {
      brain = this.bpVehicle.brain;
    }
    return JSON.stringify({ mode: this.mode, network: brain.save() });
  }

  /**
   * Loads a previously exported model JSON string into the live agents.
   * @param {string} json
   */
  importModel(json) {
    try {
      const data = JSON.parse(json);
      const nn   = NeuralNetwork.deserialize(data.network);

      if (this.mode === 'genetic') {
        for (const v of this.vehicles) v.brain = nn.copy();
        for (let i = 0; i < this.population.length; i++) this.population[i] = nn.copy();
      } else if (this.mode === 'supervised') {
        this.student.brain = nn;
      } else {
        this.bpVehicle.brain = nn;
      }
    } catch (e) {
      console.error('[Simulation] importModel failed:', e);
    }
  }

  /**
   * Updates the mutation rate for genetic mode.
   * @param {number} rate
   */
  setMutationRate(rate) {
    this._mutationRate = rate;
    if (this.genetic) {
      this.genetic.mutationRate            = rate;
      this.genetic._currentMutationRate   = rate;
    }
  }

  /**
   * Updates the learning rate for the active learning agent.
   * @param {number} lr
   */
  setLearningRate(lr) {
    this._learningRate = lr;
    if (this.student)   this.student.brain.setLearningRate(lr);
    if (this.bpVehicle) this.bpVehicle.brain.setLearningRate(lr);
  }

  /** Returns the brain of the current best/active agent (or null). */
  getBestBrain() {
    if (this.mode === 'genetic') {
      let bestIdx = 0, bestScore = -Infinity;
      for (let i = 0; i < this.fitnesses.length; i++) {
        if (this.fitnesses[i] > bestScore) { bestScore = this.fitnesses[i]; bestIdx = i; }
      }
      return this.population[bestIdx] || null;
    }
    if (this.mode === 'supervised') return this.student ? this.student.brain : null;
    return this.bpVehicle ? this.bpVehicle.brain : null;
  }
}
