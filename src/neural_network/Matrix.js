/**
 * Matrix utility class for neural network computations.
 * Vanilla JS — no external dependencies, runs directly in the browser.
 */
class Matrix {
  /**
   * Creates a zero-filled matrix.
   * @param {number} rows
   * @param {number} cols
   */
  constructor(rows, cols) {
    this.rows = rows;
    this.cols = cols;
    this.data = Array.from({ length: rows }, () => new Array(cols).fill(0));
  }

  // ---------------------------------------------------------------------------
  // Static factory helpers
  // ---------------------------------------------------------------------------

  /**
   * Creates a column vector (n×1 matrix) from a 1-D array.
   * @param {number[]} arr
   * @returns {Matrix}
   */
  static fromArray(arr) {
    const m = new Matrix(arr.length, 1);
    for (let i = 0; i < arr.length; i++) {
      m.data[i][0] = arr[i];
    }
    return m;
  }

  // ---------------------------------------------------------------------------
  // Instance helpers
  // ---------------------------------------------------------------------------

  /**
   * Converts the matrix to a flat 1-D array (row-major order).
   * @returns {number[]}
   */
  toArray() {
    const result = [];
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.push(this.data[i][j]);
      }
    }
    return result;
  }

  /**
   * Fills every cell with a random value in [-1, 1] (mutates).
   * @returns {Matrix} this
   */
  randomize() {
    return this.map(() => Math.random() * 2 - 1);
  }

  /**
   * Applies a function element-wise and returns a NEW matrix.
   * @param {function(number, number, number): number} fn  (value, row, col)
   * @returns {Matrix}
   */
  map(fn) {
    const result = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.data[i][j] = fn(this.data[i][j], i, j);
      }
    }
    return result;
  }

  /**
   * Static version of map — applies fn to every element of m.
   * @param {Matrix} m
   * @param {function(number, number, number): number} fn
   * @returns {Matrix}
   */
  static map(m, fn) {
    return m.map(fn);
  }

  /**
   * Adds a scalar or a same-sized Matrix element-wise (mutates this).
   * @param {number|Matrix} n
   * @returns {Matrix} this
   */
  add(n) {
    if (n instanceof Matrix) {
      if (n.rows !== this.rows || n.cols !== this.cols) {
        throw new Error(`Matrix.add: dimension mismatch (${this.rows}×${this.cols} vs ${n.rows}×${n.cols})`);
      }
      for (let i = 0; i < this.rows; i++) {
        for (let j = 0; j < this.cols; j++) {
          this.data[i][j] += n.data[i][j];
        }
      }
    } else {
      for (let i = 0; i < this.rows; i++) {
        for (let j = 0; j < this.cols; j++) {
          this.data[i][j] += n;
        }
      }
    }
    return this;
  }

  /**
   * Returns a new matrix equal to (a - b) element-wise.
   * @param {Matrix} a
   * @param {Matrix} b
   * @returns {Matrix}
   */
  static subtract(a, b) {
    if (a.rows !== b.rows || a.cols !== b.cols) {
      throw new Error(`Matrix.subtract: dimension mismatch (${a.rows}×${a.cols} vs ${b.rows}×${b.cols})`);
    }
    const result = new Matrix(a.rows, a.cols);
    for (let i = 0; i < a.rows; i++) {
      for (let j = 0; j < a.cols; j++) {
        result.data[i][j] = a.data[i][j] - b.data[i][j];
      }
    }
    return result;
  }

  /**
   * Static dot-product (matrix multiplication): returns a × b as a new matrix.
   * Requires a.cols === b.rows.
   * @param {Matrix} a
   * @param {Matrix} b
   * @returns {Matrix}
   */
  static multiply(a, b) {
    if (a.cols !== b.rows) {
      throw new Error(`Matrix.multiply: incompatible dimensions (${a.rows}×${a.cols}) × (${b.rows}×${b.cols})`);
    }
    const result = new Matrix(a.rows, b.cols);
    for (let i = 0; i < result.rows; i++) {
      for (let j = 0; j < result.cols; j++) {
        let sum = 0;
        for (let k = 0; k < a.cols; k++) {
          sum += a.data[i][k] * b.data[k][j];
        }
        result.data[i][j] = sum;
      }
    }
    return result;
  }

  /**
   * Element-wise multiplication by a scalar or same-sized Matrix (mutates this).
   * @param {number|Matrix} n
   * @returns {Matrix} this
   */
  multiply(n) {
    if (n instanceof Matrix) {
      if (n.rows !== this.rows || n.cols !== this.cols) {
        throw new Error(`Matrix.multiply (instance): dimension mismatch (${this.rows}×${this.cols} vs ${n.rows}×${n.cols})`);
      }
      for (let i = 0; i < this.rows; i++) {
        for (let j = 0; j < this.cols; j++) {
          this.data[i][j] *= n.data[i][j];
        }
      }
    } else {
      for (let i = 0; i < this.rows; i++) {
        for (let j = 0; j < this.cols; j++) {
          this.data[i][j] *= n;
        }
      }
    }
    return this;
  }

  /**
   * Returns the transpose of matrix m as a new matrix.
   * @param {Matrix} m
   * @returns {Matrix}
   */
  static transpose(m) {
    const result = new Matrix(m.cols, m.rows);
    for (let i = 0; i < m.rows; i++) {
      for (let j = 0; j < m.cols; j++) {
        result.data[j][i] = m.data[i][j];
      }
    }
    return result;
  }

  /**
   * Returns a deep copy of this matrix.
   * @returns {Matrix}
   */
  copy() {
    const m = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      m.data[i] = this.data[i].slice();
    }
    return m;
  }

  // ---------------------------------------------------------------------------
  // Serialization
  // ---------------------------------------------------------------------------

  /**
   * Returns a plain object suitable for JSON serialization.
   * @returns {{ rows: number, cols: number, data: number[][] }}
   */
  serialize() {
    return {
      rows: this.rows,
      cols: this.cols,
      data: this.data.map(row => row.slice()),
    };
  }

  /**
   * Reconstructs a Matrix from a serialized plain object.
   * @param {{ rows: number, cols: number, data: number[][] }} data
   * @returns {Matrix}
   */
  static deserialize(data) {
    const m = new Matrix(data.rows, data.cols);
    m.data = data.data.map(row => row.slice());
    return m;
  }
}
