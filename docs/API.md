# JavaScript API Reference

Complete reference for all public classes in the Cortex simulation and AI library.

> **File load order:** `Matrix.js` → `NeuralNetwork.js` → `GeneticAlgorithm.js` → `Track.js` → `Vehicle.js` → `Simulation.js` → `Dashboard.js` → `main.js`

---

## Table of Contents

- [Matrix](#matrix)
- [NeuralNetwork](#neuralnetwork)
- [GeneticAlgorithm](#geneticalgorithm)
- [Track](#track)
- [Vehicle](#vehicle)
- [Simulation](#simulation)
- [Dashboard](#dashboard)

---

## Matrix

`src/neural_network/Matrix.js`

A zero-dependency matrix class for neural network computations. All operations are row-major.

---

### `constructor(rows, cols)`

Creates a zero-filled matrix.

| Parameter | Type | Description |
|-----------|------|-------------|
| `rows` | `number` | Number of rows |
| `cols` | `number` | Number of columns |

**Example:**
```js
const m = new Matrix(3, 2);
// m.data = [[0,0],[0,0],[0,0]]
```

---

### `static Matrix.fromArray(arr)`

Creates a column vector (`n × 1` matrix) from a 1-D array.

| Parameter | Type | Description |
|-----------|------|-------------|
| `arr` | `number[]` | Source values |

**Returns:** `Matrix` — column vector of shape `(arr.length × 1)`

**Example:**
```js
const v = Matrix.fromArray([0.5, 0.3, 0.8]);
// v.data = [[0.5],[0.3],[0.8]]
```

---

### `toArray()`

Converts the matrix to a flat 1-D array (row-major order).

**Returns:** `number[]`

**Example:**
```js
const m = new Matrix(2, 2);
m.data = [[1, 2], [3, 4]];
m.toArray(); // [1, 2, 3, 4]
```

---

### `randomize()`

Fills every cell with a random value in `[−1, 1]` (mutates in place).

**Returns:** `Matrix` — `this` (for chaining)

**Example:**
```js
new Matrix(3, 3).randomize();
```

---

### `map(fn)`

Applies a function element-wise and returns a **new** matrix (does not mutate).

| Parameter | Type | Description |
|-----------|------|-------------|
| `fn` | `(value, row, col) => number` | Mapping function |

**Returns:** `Matrix` — new matrix with transformed values

**Example:**
```js
const relu = m.map(v => Math.max(0, v));
```

---

### `static Matrix.map(m, fn)`

Static alias for `m.map(fn)`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `m` | `Matrix` | Source matrix |
| `fn` | `(value, row, col) => number` | Mapping function |

**Returns:** `Matrix`

---

### `add(n)`

Adds a scalar or a same-sized Matrix element-wise. **Mutates** `this`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `n` | `number \| Matrix` | Value to add |

**Returns:** `Matrix` — `this`

**Throws:** `Error` if `n` is a Matrix with mismatched dimensions.

**Example:**
```js
m.add(1);           // add scalar
m.add(biasMatrix);  // add bias vector
```

---

### `static Matrix.subtract(a, b)`

Returns a new matrix equal to `(a − b)` element-wise.

| Parameter | Type | Description |
|-----------|------|-------------|
| `a` | `Matrix` | Minuend |
| `b` | `Matrix` | Subtrahend |

**Returns:** `Matrix`

**Throws:** `Error` on dimension mismatch.

---

### `static Matrix.multiply(a, b)`

Matrix multiplication (`a · b`). The number of columns in `a` must equal the number of rows in `b`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `a` | `Matrix` | Left operand `(m × k)` |
| `b` | `Matrix` | Right operand `(k × n)` |

**Returns:** `Matrix` — shape `(m × n)`

**Throws:** `Error` on dimension mismatch.

**Example:**
```js
// Forward pass: W(5×5) · a(5×1) → z(5×1)
const z = Matrix.multiply(weights, activation);
```

---

### `multiply(n)` (instance, element-wise)

Multiplies every element by the scalar `n`. **Mutates** `this`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `n` | `number` | Scalar multiplier |

**Returns:** `Matrix` — `this`

---

### `static Matrix.transpose(m)`

Returns a new matrix that is the transpose of `m`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `m` | `Matrix` | Source matrix `(r × c)` |

**Returns:** `Matrix` — shape `(c × r)`

---

### `copy()`

Returns a deep copy of the matrix.

**Returns:** `Matrix`

---

## NeuralNetwork

`src/neural_network/NeuralNetwork.js`

Feed-forward neural network with backpropagation. Depends on `Matrix`.

---

### `constructor(layerSizes, options)`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `layerSizes` | `number[]` | — | Architecture, e.g. `[5, 5, 2]` |
| `options.learningRate` | `number` | `0.1` | Gradient descent step size |
| `options.activation` | `string` | `'sigmoid'` | `'sigmoid'` \| `'relu'` \| `'tanh'` \| `'softmax'` |
| `options.l2Lambda` | `number` | `0` | L2 regularisation coefficient |

**Throws:** `Error` if `layerSizes` has fewer than 2 elements.

**Example:**
```js
const nn = new NeuralNetwork([5, 5, 2], {
  learningRate: 0.05,
  activation: 'sigmoid',
  l2Lambda: 0.0001,
});
```

---

### `predict(inputArray)`

Runs a full forward pass and returns the output as a plain array.

| Parameter | Type | Description |
|-----------|------|-------------|
| `inputArray` | `number[]` | Input values; length must match `layerSizes[0]` |

**Returns:** `number[]` — output activations; length equals `layerSizes[last]`

**Example:**
```js
const [steer, throttle] = nn.predict([0.8, 0.9, 1.0, 0.7, 0.6]);
```

---

### `train(inputArray, targetArray)`

One step of stochastic gradient descent via backpropagation.

| Parameter | Type | Description |
|-----------|------|-------------|
| `inputArray` | `number[]` | Training input |
| `targetArray` | `number[]` | Desired output |

**Returns:** `void`

**Example:**
```js
nn.train([0.8, 0.9, 1.0, 0.7, 0.6], [0.5, 0.8]);
```

---

### `copy()`

Returns a deep clone of the network (same architecture, same weights).

**Returns:** `NeuralNetwork`

---

### `toJSON()`

Serialises the network to a plain object suitable for `JSON.stringify`.

**Returns:** `object` — `{ layerSizes, activation, learningRate, l2Lambda, layers: [{weights, biases}] }`

---

### `static NeuralNetwork.fromJSON(obj)`

Reconstructs a network from a plain object (as returned by `toJSON`).

| Parameter | Type | Description |
|-----------|------|-------------|
| `obj` | `object` | Serialised network |

**Returns:** `NeuralNetwork`

**Example:**
```js
const json = JSON.parse(savedString);
const nn = NeuralNetwork.fromJSON(json);
```

---

## GeneticAlgorithm

`src/neural_network/GeneticAlgorithm.js`

Evolves a population of `NeuralNetwork` agents. Depends on `NeuralNetwork`.

---

### `constructor(options)`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `options.populationSize` | `number` | `50` | Total agents per generation |
| `options.mutationRate` | `number` | `0.1` | Base probability of mutating each weight |
| `options.eliteCount` | `number` | `2` | Top agents copied unchanged |
| `options.tournamentSize` | `number` | `5` | Candidates per tournament draw |
| `options.mutationDecay` | `number` | `0.995` | Per-generation multiplier for `mutationRate` |
| `options.minMutationRate` | `number` | `0.01` | Floor for adaptive mutation rate |
| `options.mutationStrength` | `number` | `0.5` | Std-dev of Gaussian weight perturbation |

---

### `initPopulation(networkTemplate)`

Creates a fresh population of `populationSize` networks, each a re-randomised copy of the template.

| Parameter | Type | Description |
|-----------|------|-------------|
| `networkTemplate` | `NeuralNetwork` | Blueprint (defines architecture and options) |

**Returns:** `NeuralNetwork[]`

**Example:**
```js
const template = new NeuralNetwork([5, 5, 2]);
const population = ga.initPopulation(template);
```

---

### `selection(fitnessScores)`

Tournament selection: returns the index of the winner among `tournamentSize` random candidates.

| Parameter | Type | Description |
|-----------|------|-------------|
| `fitnessScores` | `number[]` | Fitness aligned with population array |

**Returns:** `number` — index of the selected parent

---

### `crossover(parentA, parentB)`

Single-point crossover on the flat gene vector of two parent networks.

| Parameter | Type | Description |
|-----------|------|-------------|
| `parentA` | `NeuralNetwork` | First parent |
| `parentB` | `NeuralNetwork` | Second parent |

**Returns:** `NeuralNetwork` — child network with mixed genes

---

### `mutate(network, rate)`

Applies Gaussian noise to each gene with probability `rate`. **Mutates** the network in place.

| Parameter | Type | Description |
|-----------|------|-------------|
| `network` | `NeuralNetwork` | Network to mutate |
| `rate` | `number` | Per-gene mutation probability |

**Returns:** `NeuralNetwork` — mutated (same object)

---

### `nextGeneration(population, fitnessScores)`

Produces the next generation from the current population and fitness scores.

| Parameter | Type | Description |
|-----------|------|-------------|
| `population` | `NeuralNetwork[]` | Current generation |
| `fitnessScores` | `number[]` | Fitness aligned with `population` |

**Returns:** `NeuralNetwork[]` — next generation of the same size

**Side effects:** increments `this.generation`, decays `this._currentMutationRate`.

---

### `getStats(fitnessScores)`

Computes summary statistics for the current generation.

| Parameter | Type | Description |
|-----------|------|-------------|
| `fitnessScores` | `number[]` | Fitness scores |

**Returns:** `{ best: number, mean: number, worst: number, generation: number, mutationRate: number }`

---

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `generation` | `number` | Current generation index (0-based) |
| `_currentMutationRate` | `number` | Effective mutation rate (read-only) |

---

## Track

`simulation/js/Track.js`

Generates and renders a closed-loop race track using Catmull-Rom splines.

---

### `constructor(canvas, ctx)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `canvas` | `HTMLCanvasElement` | Rendering canvas |
| `ctx` | `CanvasRenderingContext2D` | 2D context |

---

### `generateCircuit()`

Generates the fixed oval circuit track.

**Returns:** `void`

**Side effects:** populates `this.innerWalls`, `this.outerWalls`, `this.startPos`.

---

### `generateRandom()`

Generates a random track via Catmull-Rom spline through randomised control points.

**Returns:** `void`

---

### `draw()`

Renders the full track: road surface, curbs, centre dashes, and chequered start line.

**Returns:** `void`

---

### `getWalls()`

Returns all wall segments for collision/raycasting queries.

**Returns:** `{x1: number, y1: number, x2: number, y2: number}[]` — concatenation of `innerWalls` and `outerWalls`

---

### `checkCollision(x, y, radius)`

Tests whether a circle centred at `(x, y)` with the given radius overlaps any wall.

| Parameter | Type | Description |
|-----------|------|-------------|
| `x` | `number` | Centre X |
| `y` | `number` | Centre Y |
| `radius` | `number` | Collision radius |

**Returns:** `boolean`

---

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `roadWidth` | `number` | Track width in pixels (default: 84) |
| `centerPoints` | `{x,y}[]` | Sampled centreline points |
| `innerWalls` | `{x1,y1,x2,y2}[]` | Inner edge wall segments |
| `outerWalls` | `{x1,y1,x2,y2}[]` | Outer edge wall segments |
| `startPos` | `{x,y,angle}` | Starting position and heading for vehicles |

---

## Vehicle

`simulation/js/Vehicle.js`

Autonomous agent driven by a `NeuralNetwork` brain with 5 lidar-style sensors.

---

### `constructor(x, y, angle, brain)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `x` | `number` | Initial X position |
| `y` | `number` | Initial Y position |
| `angle` | `number` | Initial heading (radians) |
| `brain` | `NeuralNetwork` | Driving brain |

---

### `update(walls)`

Advances the vehicle one physics step: sense → think → move → collide.

| Parameter | Type | Description |
|-----------|------|-------------|
| `walls` | `{x1,y1,x2,y2}[]` | Wall segments to sense and collide with |

**Returns:** `void`

**Side effects:** updates `x`, `y`, `angle`, `speed`, `score`, `sensorReadings`; may set `alive = false`.

---

### `getSensorReadings(walls)`

Casts 5 rays and returns normalised distance readings.

| Parameter | Type | Description |
|-----------|------|-------------|
| `walls` | `{x1,y1,x2,y2}[]` | Wall segments |

**Returns:** `number[]` — 5 values in [0, 1] (0 = wall, 1 = max range)

---

### `castRay(walls, rayAngle)`

Casts a single ray from the vehicle's current position.

| Parameter | Type | Description |
|-----------|------|-------------|
| `walls` | `{x1,y1,x2,y2}[]` | Wall segments |
| `rayAngle` | `number` | World-space angle (radians) |

**Returns:** `number` — distance in pixels, capped at `_maxSensorDist` (200 px)

---

### `think()`

Runs the brain's `predict()` and converts outputs to steering and throttle.

**Returns:** `void`

**Side effects:** updates `this.angle` and `this.speed`.

---

### `draw(ctx)`

Renders the vehicle body, sensor rays, and direction indicator.

| Parameter | Type | Description |
|-----------|------|-------------|
| `ctx` | `CanvasRenderingContext2D` | Target context |

**Returns:** `void`

---

### `reset(x, y, angle)`

Resets position, heading, speed, score, and marks `alive = true`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `x` | `number` | New X |
| `y` | `number` | New Y |
| `angle` | `number` | New heading (radians) |

**Returns:** `void`

---

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `alive` | `boolean` | `false` after collision |
| `score` | `number` | Accumulated fitness (distance proxy) |
| `sensorReadings` | `number[]` | Last 5 sensor values |
| `color` | `string` | HSL colour string for rendering |
| `maxSpeed` | `number` | Speed cap in px/step (default: 3.2) |
| `maxSteer` | `number` | Steering cap in rad/step (default: 0.065) |

---

## Simulation

`simulation/js/Simulation.js`

Orchestrates the autonomous vehicle simulation across three learning modes.

---

### `constructor(canvas, options)`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `canvas` | `HTMLCanvasElement` | — | Rendering canvas |
| `options.mode` | `string` | `'genetic'` | `'genetic'` \| `'supervised'` \| `'backprop'` |
| `options.learningRate` | `number` | `0.05` | Learning rate for supervised/backprop modes |
| `options.mutationRate` | `number` | `0.15` | Initial mutation rate for genetic mode |
| `options.trackMode` | `string` | `'circuit'` | `'circuit'` \| `'random'` |

---

### `init()`

Builds the track and initialises agents for the current mode. Call once before `start()`, or after changing mode/track.

**Returns:** `void`

---

### `start()`

Starts the main animation loop. No-op if already running.

**Returns:** `void`

---

### `pause()`

Pauses the animation loop. State is preserved; call `start()` to resume.

**Returns:** `void`

---

### `reset()`

Pauses, then calls `init()` to reinitialise everything from scratch.

**Returns:** `void`

---

### `step()`

Advances the simulation by exactly one physics step (useful for debugging).

**Returns:** `void`

---

### `setSpeed(multiplier)`

Sets the simulation speed multiplier.

| Parameter | Type | Description |
|-----------|------|-------------|
| `multiplier` | `number` | Frames computed per animation frame (1, 2, 4, 8…) |

**Returns:** `void`

---

### `getStats()`

Returns a snapshot of current simulation statistics.

**Returns:**
```js
{
  mode: string,
  generation: number,       // genetic mode
  bestFitness: number,      // genetic mode
  meanFitness: number,      // genetic mode
  alive: number,            // genetic mode — vehicles still running
  error: number,            // supervised/backprop — current MSE
  fitnessHistory: [{gen, best, mean}],
  errorHistory: number[],
}
```

---

### `exportModel()`

Serialises the current best brain to a JSON string.

**Returns:** `string` — JSON including weights, architecture, fitness metadata

**Example:**
```js
const json = sim.exportModel();
const blob = new Blob([json], { type: 'application/json' });
```

---

### `importModel(json)`

Loads a previously exported model JSON string into the active brain.

| Parameter | Type | Description |
|-----------|------|-------------|
| `json` | `string` | JSON string from `exportModel()` or `model_converter.js` |

**Returns:** `void`

---

### `setTrackMode(trackMode)`

Changes the track type and resets the simulation.

| Parameter | Type | Description |
|-----------|------|-------------|
| `trackMode` | `string` | `'circuit'` or `'random'` |

**Returns:** `void`

---

### `setMutationRate(rate)`

Updates the genetic algorithm's current mutation rate.

| Parameter | Type | Description |
|-----------|------|-------------|
| `rate` | `number` | New mutation rate in [0, 1] |

**Returns:** `void`

---

### `setLearningRate(lr)`

Updates the learning rate for supervised and backpropagation modes.

| Parameter | Type | Description |
|-----------|------|-------------|
| `lr` | `number` | New learning rate |

**Returns:** `void`

---

### `getBestBrain()`

Returns the `NeuralNetwork` instance of the current best or active vehicle.

**Returns:** `NeuralNetwork | null`

---

### Callbacks

Assign functions to these properties before calling `start()` to receive events:

| Property | Signature | When called |
|----------|-----------|-------------|
| `onGenerationEnd` | `(stats) => void` | End of each genetic generation |
| `onStats` | `(stats) => void` | Once per rendered frame |

---

## Dashboard

`simulation/js/Dashboard.js`

Real-time UI overlay: stats panel, network visualiser, fitness/error chart, and model import/export.

---

### `constructor(container, simulation)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `container` | `HTMLElement` | Right-panel DOM element |
| `simulation` | `Simulation` | Simulation instance to observe |

**Side effects:** calls `buildUI()` immediately.

---

### `buildUI()`

Resolves DOM element references and attaches event listeners (export button, import file input). Called automatically by the constructor.

**Returns:** `void`

---

### `updateStats(stats)`

Updates the textual statistics panel with values from `simulation.getStats()`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `stats` | `object` | Stats object (see `Simulation.getStats()`) |

**Returns:** `void`

---

### `drawNetwork(network)`

Renders an animated diagram of the neural network — nodes coloured by activation, edges coloured and weighted by synapse strength.

| Parameter | Type | Description |
|-----------|------|-------------|
| `network` | `NeuralNetwork` | Network to visualise (typically the best brain) |

**Returns:** `void`

---

### `updateChart(data)`

Plots the fitness or error history as a line graph.

| Parameter | Type | Description |
|-----------|------|-------------|
| `data` | `number[] \| {best, mean}[]` | History values |

**Returns:** `void`

---

### `setMode(mode)`

Updates UI labels and chart axis titles to reflect the active learning mode.

| Parameter | Type | Description |
|-----------|------|-------------|
| `mode` | `string` | `'genetic'` \| `'supervised'` \| `'backprop'` |

**Returns:** `void`

---

## Module-level Helper

### `castRayGlobal(ox, oy, angle, walls, maxDist)`

Defined at module level in `Vehicle.js`. Shared between `Vehicle.castRay()` and the supervised-learning teacher in `Simulation.js`.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `ox` | `number` | — | Ray origin X |
| `oy` | `number` | — | Ray origin Y |
| `angle` | `number` | — | World-space angle (radians) |
| `walls` | `{x1,y1,x2,y2}[]` | — | Wall segments |
| `maxDist` | `number` | `200` | Maximum ray distance |

**Returns:** `number` — distance to nearest wall, capped at `maxDist`

**Algorithm:** Möller–Trumbore-style 2D ray/segment intersection.
