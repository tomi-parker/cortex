/**
 * Track — generates and renders a closed-loop race track.
 *
 * The track is defined as a set of centerline points. Inner and outer walls are
 * computed by offsetting each point along the local perpendicular by half the
 * road width. Both walls are stored as arrays of line segments {x1,y1,x2,y2}
 * for physics/collision queries.
 *
 * Vanilla JS — no external dependencies, runs directly in the browser.
 */
class Track {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {CanvasRenderingContext2D} ctx
   */
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.roadWidth = 84;

    /** @type {{x:number,y:number}[]} */
    this.centerPoints = [];

    /** @type {{x1:number,y1:number,x2:number,y2:number}[]} */
    this.innerWalls = [];

    /** @type {{x1:number,y1:number,x2:number,y2:number}[]} */
    this.outerWalls = [];

    /** @type {{x:number,y:number}[]} */
    this._innerPts = [];

    /** @type {{x:number,y:number}[]} */
    this._outerPts = [];

    /** @type {{x:number,y:number,angle:number}} */
    this.startPos = { x: 0, y: 0, angle: 0 };
  }

  // ---------------------------------------------------------------------------
  // Catmull-Rom spline helpers
  // ---------------------------------------------------------------------------

  /** Evaluates one point on a Catmull-Rom segment at parameter t ∈ [0,1). */
  _catmullRomPoint(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return {
      x: 0.5 * ((2 * p1.x)
        + (-p0.x + p2.x) * t
        + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2
        + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      y: 0.5 * ((2 * p1.y)
        + (-p0.y + p2.y) * t
        + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2
        + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    };
  }

  /**
   * Samples a closed Catmull-Rom spline through `points`.
   * @param {{x:number,y:number}[]} points  Control points (closed loop)
   * @param {number} samplesPerSegment
   * @returns {{x:number,y:number}[]}
   */
  _sampleCatmullRom(points, samplesPerSegment = 18) {
    const n = points.length;
    const result = [];
    for (let i = 0; i < n; i++) {
      const p0 = points[(i - 1 + n) % n];
      const p1 = points[i];
      const p2 = points[(i + 1) % n];
      const p3 = points[(i + 2) % n];
      for (let s = 0; s < samplesPerSegment; s++) {
        result.push(this._catmullRomPoint(p0, p1, p2, p3, s / samplesPerSegment));
      }
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Wall construction
  // ---------------------------------------------------------------------------

  /**
   * Offsets the centerline left/right by half the road width to produce inner
   * and outer wall point arrays, then converts them to line-segment arrays.
   *
   * @param {{x:number,y:number}[]} centerPoints
   * @returns {{ inner: object[], outer: object[], innerPts: object[], outerPts: object[] }}
   */
  _buildWalls(centerPoints) {
    const n = centerPoints.length;
    const hw = this.roadWidth / 2;

    // Compute smooth normals using adjacent points to avoid kinks.
    const normals = centerPoints.map((_, i) => {
      const prev = centerPoints[(i - 1 + n) % n];
      const next = centerPoints[(i + 1) % n];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      // Left-perpendicular of forward direction (points toward the inside for CCW paths)
      return { x: -dy / len, y: dx / len };
    });

    const innerPts = centerPoints.map((p, i) => ({
      x: p.x + normals[i].x * hw,
      y: p.y + normals[i].y * hw,
    }));
    const outerPts = centerPoints.map((p, i) => ({
      x: p.x - normals[i].x * hw,
      y: p.y - normals[i].y * hw,
    }));

    const inner = [];
    const outer = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      inner.push({ x1: innerPts[i].x, y1: innerPts[i].y, x2: innerPts[j].x, y2: innerPts[j].y });
      outer.push({ x1: outerPts[i].x, y1: outerPts[i].y, x2: outerPts[j].x, y2: outerPts[j].y });
    }

    return { inner, outer, innerPts, outerPts };
  }

  // ---------------------------------------------------------------------------
  // Public track generators
  // ---------------------------------------------------------------------------

  /**
   * Generates a fixed oval/circuit track.
   * @returns {{x:number,y:number,angle:number}} start position
   */
  generateCircuit() {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    const rx = 265;
    const ry = 170;
    const N = 80;

    this.centerPoints = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      this.centerPoints.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
    }

    this._applyWalls();
    return this.startPos;
  }

  /**
   * Generates a random winding road by perturbing control points around an
   * ellipse and fitting a Catmull-Rom spline through them.
   * @returns {{x:number,y:number,angle:number}} start position
   */
  generateRandom() {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    const N = 10 + Math.floor(Math.random() * 4); // 10-13 control points
    const baseRx = 200;
    const baseRy = 130;
    const roughness = 55;

    const ctrl = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const jitter = 1 + (Math.random() - 0.5) * (roughness / Math.max(baseRx, baseRy)) * 2;
      ctrl.push({
        x: cx + Math.cos(a) * baseRx * jitter,
        y: cy + Math.sin(a) * baseRy * jitter,
      });
    }

    this.centerPoints = this._sampleCatmullRom(ctrl, 18);
    this._applyWalls();
    return this.startPos;
  }

  /** Shared final step: build walls and compute start position. */
  _applyWalls() {
    const { inner, outer, innerPts, outerPts } = this._buildWalls(this.centerPoints);
    this.innerWalls = inner;
    this.outerWalls = outer;
    this._innerPts = innerPts;
    this._outerPts = outerPts;

    const p0 = this.centerPoints[0];
    const p1 = this.centerPoints[1];
    this.startPos = {
      x: p0.x,
      y: p0.y,
      angle: Math.atan2(p1.y - p0.y, p1.x - p0.x),
    };
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  /** Draws the full track (road surface, curbs, center dashes, start line). */
  draw() {
    const ctx = this.ctx;
    const ip = this._innerPts;
    const op = this._outerPts;
    if (!ip.length) return;

    // --- Road surface (even-odd fills the ring between outer and inner) ---
    ctx.save();
    ctx.fillStyle = '#2c2c3a';
    ctx.beginPath();
    ctx.moveTo(op[0].x, op[0].y);
    for (const p of op) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    // Inner boundary reversed to punch out the hole
    ctx.moveTo(ip[0].x, ip[0].y);
    for (let i = ip.length - 1; i >= 0; i--) ctx.lineTo(ip[i].x, ip[i].y);
    ctx.closePath();
    ctx.fill('evenodd');
    ctx.restore();

    // --- Centre dashes ---
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,120,0.18)';
    ctx.setLineDash([16, 26]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(this.centerPoints[0].x, this.centerPoints[0].y);
    for (const p of this.centerPoints) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // --- Inner wall (red) ---
    ctx.save();
    ctx.strokeStyle = '#e94560';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(ip[0].x, ip[0].y);
    for (const p of ip) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // --- Outer wall (blue) ---
    ctx.save();
    ctx.strokeStyle = '#4488ff';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(op[0].x, op[0].y);
    for (const p of op) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // --- Start / finish line ---
    this._drawStartLine(ctx);
  }

  /** Draws a chequered start line across the road at the first centerline point. */
  _drawStartLine(ctx) {
    const c = this.centerPoints[0];
    const ip0 = this._innerPts[0];
    const op0 = this._outerPts[0];

    ctx.save();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#ffffff';
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(ip0.x, ip0.y);
    ctx.lineTo(op0.x, op0.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Small arrow showing travel direction
    const a = this.startPos.angle;
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x + Math.cos(a) * 22, c.y + Math.sin(a) * 22);
    ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Physics helpers
  // ---------------------------------------------------------------------------

  /** Returns all wall segments (inner + outer). */
  getWalls() {
    return this.innerWalls.concat(this.outerWalls);
  }

  /**
   * Returns true if the circle at (x,y) with the given radius intersects a wall.
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   * @returns {boolean}
   */
  checkCollision(x, y, radius) {
    for (const seg of this.innerWalls) {
      if (this._distPointSegment(x, y, seg) < radius) return true;
    }
    for (const seg of this.outerWalls) {
      if (this._distPointSegment(x, y, seg) < radius) return true;
    }
    return false;
  }

  /** Shortest distance from point (px,py) to segment seg. */
  _distPointSegment(px, py, seg) {
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
      return Math.hypot(px - seg.x1, py - seg.y1);
    }
    const t = Math.max(0, Math.min(1, ((px - seg.x1) * dx + (py - seg.y1) * dy) / lenSq));
    return Math.hypot(px - (seg.x1 + t * dx), py - (seg.y1 + t * dy));
  }
}
