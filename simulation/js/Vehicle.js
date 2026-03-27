/**
 * castRayGlobal — module-level helper so both Vehicle and the teacher in
 * Simulation can share the same ray-segment intersection logic without
 * duplication.
 *
 * Casts a ray from (ox,oy) in direction `angle` and returns the distance to
 * the nearest wall segment, capped at maxDist.
 *
 * @param {number} ox
 * @param {number} oy
 * @param {number} angle   World-space angle in radians
 * @param {{x1,y1,x2,y2}[]} walls
 * @param {number} [maxDist=200]
 * @returns {number}
 */
function castRayGlobal(ox, oy, angle, walls, maxDist = 200) {
  const rdx = Math.cos(angle);
  const rdy = Math.sin(angle);
  let minDist = maxDist;

  for (const seg of walls) {
    // Möller–Trumbore-style 2-D segment/ray intersection.
    const sx = seg.x2 - seg.x1;
    const sy = seg.y2 - seg.y1;
    const denom = rdx * sy - rdy * sx;          // cross(ray_dir, seg_dir)
    if (Math.abs(denom) < 1e-10) continue;      // parallel

    const tx = seg.x1 - ox;
    const ty = seg.y1 - oy;
    const t = (tx * sy - ty * sx) / denom;      // distance along ray
    const s = (tx * rdy - ty * rdx) / denom;    // position along segment [0,1]

    if (t >= 0 && t < minDist && s >= 0 && s <= 1) {
      minDist = t;
    }
  }
  return minDist;
}

// ---------------------------------------------------------------------------

/**
 * Vehicle — autonomous agent driven by a NeuralNetwork brain.
 *
 * Physics:
 *   • Each frame the brain predicts [steer, speed] from 5 lidar sensor inputs.
 *   • Steering adjusts the heading angle; speed is applied as velocity.
 *   • Gentle friction decays momentum each frame.
 *   • Collision is tested against the four bounding-box corners.
 *
 * Sensor layout (angles relative to current heading):
 *   index 0 → −90°  (hard left)
 *   index 1 → −45°  (front-left)
 *   index 2 →   0°  (straight ahead)
 *   index 3 → +45°  (front-right)
 *   index 4 → +90°  (hard right)
 *
 * Neural-network outputs (both in [0,1] range from sigmoid):
 *   output[0] → steering  (0 = full left, 0.5 = straight, 1 = full right)
 *   output[1] → throttle  (0 = stop, 1 = max speed)
 *
 * Vanilla JS — no external dependencies, runs directly in the browser.
 */
class Vehicle {
  /**
   * @param {number} x
   * @param {number} y
   * @param {number} angle  Initial heading in radians
   * @param {NeuralNetwork} brain
   */
  constructor(x, y, angle, brain) {
    this.brain = brain;

    // --- Physics state ---
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.speed = 0;

    // --- Simulation bookkeeping ---
    this.alive = true;
    this.score = 0;         // distance proxy (accumulates speed each step)
    this.distance = 0;      // raw pixel distance

    // --- Sensor readings (normalised 0=wall, 1=clear) ---
    this.sensorReadings = new Array(5).fill(1);

    // --- Appearance ---
    this.color = `hsl(${Math.floor(Math.random() * 360)},75%,60%)`;

    // --- Tuning constants ---
    this.maxSpeed   = 3.2;   // px / step
    this.maxSteer   = 0.065; // rad / step
    this.friction   = 0.96;
    this.halfW      = 10;    // half-width  of bounding box
    this.halfH      = 5;     // half-height of bounding box

    // Sensor angles relative to heading
    this._sensorAngles = [-Math.PI / 2, -Math.PI / 4, 0, Math.PI / 4, Math.PI / 2];
    this._maxSensorDist = 200;
  }

  // ---------------------------------------------------------------------------
  // Core update loop
  // ---------------------------------------------------------------------------

  /**
   * Advances the vehicle by one physics step.
   * Call getSensorReadings() and think() before update() each frame.
   *
   * @param {{x1,y1,x2,y2}[]} walls
   */
  update(walls) {
    if (!this.alive) return;

    this.x += Math.cos(this.angle) * this.speed;
    this.y += Math.sin(this.angle) * this.speed;
    this.speed *= this.friction;

    const moved = Math.abs(this.speed);
    this.distance += moved;
    this.score    += moved + 0.05; // small survival bonus

    if (this._checkCollision(walls)) {
      this.alive = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Sensing
  // ---------------------------------------------------------------------------

  /**
   * Casts all 5 lidar rays and stores normalised readings in this.sensorReadings.
   * @param {{x1,y1,x2,y2}[]} walls
   * @returns {number[]} the readings array (same reference as this.sensorReadings)
   */
  getSensorReadings(walls) {
    for (let i = 0; i < 5; i++) {
      const dist = this.castRay(walls, this.angle + this._sensorAngles[i]);
      this.sensorReadings[i] = dist / this._maxSensorDist;
    }
    return this.sensorReadings;
  }

  /**
   * Casts a single ray and returns the distance to the nearest wall.
   * @param {{x1,y1,x2,y2}[]} walls
   * @param {number} rayAngle  World-space angle in radians
   * @returns {number} distance in pixels (max 200)
   */
  castRay(walls, rayAngle) {
    return castRayGlobal(this.x, this.y, rayAngle, walls, this._maxSensorDist);
  }

  // ---------------------------------------------------------------------------
  // Brain
  // ---------------------------------------------------------------------------

  /**
   * Runs a forward pass through the brain and applies the result to steering
   * and throttle.  Must be called after getSensorReadings().
   */
  think() {
    if (!this.brain) return;
    const output = this.brain.predict(this.sensorReadings);

    // output[0] ∈ [0,1] → steering ∈ [−maxSteer, +maxSteer]
    this.angle += (output[0] - 0.5) * 2 * this.maxSteer;

    // output[1] ∈ [0,1] → speed
    this.speed = output[1] * this.maxSpeed;
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  /**
   * Draws the vehicle body and its sensor rays on `ctx`.
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx) {
    if (!this.alive) return;

    // --- Sensor rays ---
    for (let i = 0; i < 5; i++) {
      const rayAngle = this.angle + this._sensorAngles[i];
      const dist     = this.sensorReadings[i] * this._maxSensorDist;
      const endX     = this.x + Math.cos(rayAngle) * dist;
      const endY     = this.y + Math.sin(rayAngle) * dist;

      // Colour: green (far) → red (close)
      const hue = Math.round(this.sensorReadings[i] * 110);
      ctx.save();
      ctx.strokeStyle = `hsla(${hue},100%,58%,0.35)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // Hit-point dot
      ctx.fillStyle = `hsl(${hue},100%,65%)`;
      ctx.beginPath();
      ctx.arc(endX, endY, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // --- Vehicle body ---
    const ca = Math.cos(this.angle);
    const sa = Math.sin(this.angle);
    const hw = this.halfW;
    const hh = this.halfH;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    // Body
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.roundRect(-hw, -hh, hw * 2, hh * 2, 2);
    ctx.fill();

    // Windscreen highlight
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(hw * 0.1, -hh * 0.6, hw * 0.7, hh * 1.2);

    // Front indicator
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(hw - 3, -hh + 1, 3, hh * 2 - 2);

    ctx.restore();

    // Suppress unused-variable lint for ca, sa (used if we ever switch to manual transform)
    void ca; void sa;
  }

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  /**
   * Resets the vehicle to a given position without changing the brain.
   * @param {number} x
   * @param {number} y
   * @param {number} angle
   */
  reset(x, y, angle) {
    this.x        = x;
    this.y        = y;
    this.angle    = angle;
    this.speed    = 0;
    this.distance = 0;
    this.score    = 0;
    this.alive    = true;
    this.sensorReadings.fill(1);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Checks whether any corner of the bounding box lies within 2 px of a wall.
   * @param {{x1,y1,x2,y2}[]} walls
   * @returns {boolean}
   */
  _checkCollision(walls) {
    const corners = this._getCorners();
    for (const corner of corners) {
      for (const seg of walls) {
        if (_distPointSeg(corner.x, corner.y, seg) < 2) return true;
      }
    }
    return false;
  }

  /** Returns the four world-space corners of the vehicle bounding box. */
  _getCorners() {
    const ca = Math.cos(this.angle);
    const sa = Math.sin(this.angle);
    const hw = this.halfW;
    const hh = this.halfH;
    return [
      { x: this.x + hw * ca - hh * sa, y: this.y + hw * sa + hh * ca },
      { x: this.x + hw * ca + hh * sa, y: this.y + hw * sa - hh * ca },
      { x: this.x - hw * ca - hh * sa, y: this.y - hw * sa + hh * ca },
      { x: this.x - hw * ca + hh * sa, y: this.y - hw * sa - hh * ca },
    ];
  }
}

/** Point-to-segment distance (shared with Track._distPointSegment). */
function _distPointSeg(px, py, seg) {
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - seg.x1, py - seg.y1);
  const t = Math.max(0, Math.min(1, ((px - seg.x1) * dx + (py - seg.y1) * dy) / lenSq));
  return Math.hypot(px - (seg.x1 + t * dx), py - (seg.y1 + t * dy));
}
