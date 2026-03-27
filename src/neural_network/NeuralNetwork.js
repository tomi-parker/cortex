/**
 * NeuralNetwork — feed-forward neural network with backpropagation.
 *
 * Depends on Matrix (must be loaded first in the browser).
 * Vanilla JS — no external dependencies, runs directly in the browser.
 *
 * Supported activations: 'sigmoid' | 'relu' | 'tanh' | 'softmax'
 * Loss function      : Mean Squared Error (MSE)
 *                      (softmax output layer pairs naturally with cross-entropy,
 *                       but the gradient delta = output − target is identical for
 *                       the softmax + cross-entropy combination, so MSE and CE
 *                       produce the same backprop update at the output layer.)
 */
class NeuralNetwork {
  /**
   * @param {number[]} layerSizes  e.g. [5, 8, 2] → input=5, hidden=8, output=2
   * @param {object}  [options]
   * @param {number}  [options.learningRate=0.1]
   * @param {string}  [options.activation='sigmoid']  'sigmoid'|'relu'|'tanh'|'softmax'
   * @param {number}  [options.l2Lambda=0]            L2 regularisation coefficient
   */
  constructor(layerSizes, options = {}) {
    if (!Array.isArray(layerSizes) || layerSizes.length < 2) {
      throw new Error('NeuralNetwork: layerSizes must be an array with at least 2 elements');
    }

    this.layerSizes   = layerSizes.slice();
    this.learningRate = options.learningRate  ?? 0.1;
    this.activation   = options.activation   ?? 'sigmoid';
    this.l2Lambda     = options.l2Lambda     ?? 0;

    // Number of weight layers = number of transitions between consecutive layers
    this.numLayers = layerSizes.length - 1;

    // weights[i] : (layerSizes[i+1] × layerSizes[i])
    // biases[i]  : (layerSizes[i+1] × 1)
    this.weights = [];
    this.biases  = [];

    for (let i = 0; i < this.numLayers; i++) {
      this.weights.push(new Matrix(layerSizes[i + 1], layerSizes[i]).randomize());
      this.biases.push(new Matrix(layerSizes[i + 1], 1).randomize());
    }
  }

  // ---------------------------------------------------------------------------
  // Activation functions and their derivatives
  // ---------------------------------------------------------------------------

  /** @param {number} x @returns {number} */
  static _sigmoid(x)       { return 1 / (1 + Math.exp(-x)); }
  /** Derivative in terms of the already-activated value s = sigmoid(x). */
  static _sigmoidDeriv(s)  { return s * (1 - s); }

  /** @param {number} x @returns {number} */
  static _relu(x)          { return Math.max(0, x); }
  /** Derivative in terms of pre-activation value z. */
  static _reluDeriv(z)     { return z > 0 ? 1 : 0; }

  /** @param {number} x @returns {number} */
  static _tanh(x)          { return Math.tanh(x); }
  /** Derivative in terms of the already-activated value t = tanh(x). */
  static _tanhDeriv(t)     { return 1 - t * t; }

  /**
   * Row-wise softmax on a column vector Matrix.
   * @param {Matrix} m  (n × 1)
   * @returns {Matrix}
   */
  static _softmax(m) {
    const col = m.toArray();
    const max = Math.max(...col);                    // numerical stability
    const exps = col.map(v => Math.exp(v - max));
    const sum  = exps.reduce((a, b) => a + b, 0);
    return Matrix.fromArray(exps.map(e => e / sum));
  }

  // ---------------------------------------------------------------------------
  // Forward pass (also used internally to store intermediates for backprop)
  // ---------------------------------------------------------------------------

  /**
   * Applies the configured activation to each element of a column-vector matrix.
   * Softmax is handled as a special case across the whole vector.
   *
   * @param {Matrix} z  pre-activation column vector
   * @param {string} act  activation name
   * @returns {Matrix}  post-activation column vector
   */
  _activate(z, act) {
    switch (act) {
      case 'relu':    return z.map(v => NeuralNetwork._relu(v));
      case 'tanh':    return z.map(v => NeuralNetwork._tanh(v));
      case 'softmax': return NeuralNetwork._softmax(z);
      case 'sigmoid':
      default:        return z.map(v => NeuralNetwork._sigmoid(v));
    }
  }

  /**
   * Runs a full forward pass and returns both pre- and post-activation values
   * for every layer (needed by backprop).
   *
   * @param {number[]} inputArray
   * @returns {{ zs: Matrix[], activations: Matrix[] }}
   *   activations[0] = input layer (no activation applied)
   *   activations[i] = post-activation output of weight-layer i (1-indexed)
   *   zs[i]          = pre-activation output of weight-layer i  (1-indexed)
   */
  _forwardFull(inputArray) {
    const zs          = [];          // zs[0] corresponds to layer index 1
    const activations = [Matrix.fromArray(inputArray)];

    for (let i = 0; i < this.numLayers; i++) {
      // z = W * a_prev + b
      const z = Matrix.multiply(this.weights[i], activations[i]);
      z.add(this.biases[i]);
      zs.push(z);

      // Choose activation: use the configured one for all hidden layers AND
      // the output layer.  Callers that want a different output activation
      // can subclass or pass a per-layer option (future extension).
      activations.push(this._activate(z, this.activation));
    }

    return { zs, activations };
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Forward pass — returns the network's output as a plain number array.
   * @param {number[]} inputArray
   * @returns {number[]}
   */
  predict(inputArray) {
    const { activations } = this._forwardFull(inputArray);
    return activations[activations.length - 1].toArray();
  }

  /**
   * One step of stochastic gradient descent via backpropagation.
   *
   * @param {number[]} inputArray   Training input
   * @param {number[]} targetArray  Desired output
   */
  train(inputArray, targetArray) {
    const { zs, activations } = this._forwardFull(inputArray);
    const target = Matrix.fromArray(targetArray);

    // ---- Compute deltas (error signals) layer by layer, back to front ------

    // deltas[i] is the delta for weight-layer i (0-indexed from front)
    const deltas = new Array(this.numLayers);

    // Output layer delta
    // For MSE loss:   dL/dz = (a - target) ⊙ activation'(z)
    // For softmax+CE: dL/dz = a - target  (activation'(z) cancels with CE grad)
    const outputActivation = activations[this.numLayers];
    const outputError      = Matrix.subtract(outputActivation, target); // (a - y)

    if (this.activation === 'softmax') {
      // Combined softmax + cross-entropy gradient is simply (a - y)
      deltas[this.numLayers - 1] = outputError;
    } else {
      const deriv = this._activationDeriv(zs[this.numLayers - 1], outputActivation, this.activation);
      deltas[this.numLayers - 1] = outputError.map((v, i, j) => v * deriv.data[i][j]);
    }

    // Hidden layer deltas (back-propagate)
    for (let i = this.numLayers - 2; i >= 0; i--) {
      // propagated error: W[i+1]^T * delta[i+1]
      const wT            = Matrix.transpose(this.weights[i + 1]);
      const propagated    = Matrix.multiply(wT, deltas[i + 1]);
      const deriv         = this._activationDeriv(zs[i], activations[i + 1], this.activation);
      deltas[i]           = propagated.map((v, r, c) => v * deriv.data[r][c]);
    }

    // ---- Update weights and biases -----------------------------------------
    for (let i = 0; i < this.numLayers; i++) {
      const aT = Matrix.transpose(activations[i]);

      // Gradient: delta * a_prev^T
      const dW = Matrix.multiply(deltas[i], aT);

      // L2 regularisation: add λ·W to gradient
      if (this.l2Lambda !== 0) {
        const l2term = this.weights[i].map(v => v * this.l2Lambda);
        dW.add(l2term);
      }

      // W ← W − lr · dW
      dW.multiply(this.learningRate);
      this.weights[i] = Matrix.subtract(this.weights[i], dW);

      // b ← b − lr · delta
      const db = deltas[i].map(v => v * this.learningRate);
      this.biases[i] = Matrix.subtract(this.biases[i], db);
    }
  }

  /**
   * Computes element-wise activation derivative for a layer.
   * Returns a Matrix of the same shape as z / a.
   *
   * @param {Matrix} z  pre-activation values
   * @param {Matrix} a  post-activation values
   * @param {string} act
   * @returns {Matrix}
   */
  _activationDeriv(z, a, act) {
    switch (act) {
      case 'relu':
        // Derivative depends on pre-activation sign
        return z.map(v => NeuralNetwork._reluDeriv(v));
      case 'tanh':
        // Derivative in terms of post-activation: 1 − a²
        return a.map(v => NeuralNetwork._tanhDeriv(v));
      case 'sigmoid':
      default:
        // Derivative in terms of post-activation: a(1 − a)
        return a.map(v => NeuralNetwork._sigmoidDeriv(v));
    }
  }

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  /**
   * Updates the learning rate.
   * @param {number} lr
   */
  setLearningRate(lr) {
    this.learningRate = lr;
  }

  /**
   * Returns a deep copy of this network (same architecture and weights).
   * @returns {NeuralNetwork}
   */
  copy() {
    const nn = new NeuralNetwork(this.layerSizes, {
      learningRate: this.learningRate,
      activation:   this.activation,
      l2Lambda:     this.l2Lambda,
    });
    for (let i = 0; i < this.numLayers; i++) {
      nn.weights[i] = this.weights[i].copy();
      nn.biases[i]  = this.biases[i].copy();
    }
    return nn;
  }

  // ---------------------------------------------------------------------------
  // Serialization
  // ---------------------------------------------------------------------------

  /**
   * Returns a plain JSON-serializable object representing this network.
   * @returns {object}
   */
  save() {
    return {
      layerSizes:   this.layerSizes.slice(),
      learningRate: this.learningRate,
      activation:   this.activation,
      l2Lambda:     this.l2Lambda,
      weights:      this.weights.map(w => w.serialize()),
      biases:       this.biases.map(b => b.serialize()),
    };
  }

  /**
   * Restores weights and biases from a previously saved object (mutates this).
   * @param {object} data  Output of save()
   */
  load(data) {
    if (JSON.stringify(data.layerSizes) !== JSON.stringify(this.layerSizes)) {
      throw new Error('NeuralNetwork.load: layerSizes mismatch');
    }
    this.learningRate = data.learningRate;
    this.activation   = data.activation;
    this.l2Lambda     = data.l2Lambda ?? 0;
    for (let i = 0; i < this.numLayers; i++) {
      this.weights[i] = Matrix.deserialize(data.weights[i]);
      this.biases[i]  = Matrix.deserialize(data.biases[i]);
    }
  }

  /**
   * Creates a new NeuralNetwork from a previously saved plain object.
   * @param {object} data  Output of save()
   * @returns {NeuralNetwork}
   */
  static deserialize(data) {
    const nn = new NeuralNetwork(data.layerSizes, {
      learningRate: data.learningRate,
      activation:   data.activation,
      l2Lambda:     data.l2Lambda ?? 0,
    });
    for (let i = 0; i < nn.numLayers; i++) {
      nn.weights[i] = Matrix.deserialize(data.weights[i]);
      nn.biases[i]  = Matrix.deserialize(data.biases[i]);
    }
    return nn;
  }
}
