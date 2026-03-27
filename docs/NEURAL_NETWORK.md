# Neural Network Technical Reference

A deep dive into the AI algorithms used in the Cortex platform: architecture, mathematical foundations, and practical tuning guidance.

---

## Table of Contents

1. [Introduction to Neural Networks](#introduction-to-neural-networks)
2. [The Cortex Network Architecture](#the-cortex-network-architecture)
3. [Activation Functions](#activation-functions)
4. [Forward Propagation](#forward-propagation)
5. [Backpropagation](#backpropagation)
6. [L2 Regularisation](#l2-regularisation)
7. [Genetic Algorithm](#genetic-algorithm)
8. [Supervised Learning — Linear Regression](#supervised-learning--linear-regression)
9. [Sensor-to-Motor Mapping](#sensor-to-motor-mapping)
10. [Tuning Guide](#tuning-guide)

---

## Introduction to Neural Networks

A **neural network** is a function approximator inspired by biological brains. It consists of layers of simple computational units called **neurons** (or perceptrons) connected by weighted edges.

### Perceptron

A single neuron computes:

```
output = activation( Σ(wᵢ × xᵢ) + b )
```

Where:
- `xᵢ` — input values
- `wᵢ` — learned weights (one per input)
- `b` — bias (a learned offset)
- `activation` — a non-linear function that introduces expressive power

### Layers

| Layer type | Role |
|-----------|------|
| **Input layer** | Receives raw sensor data; no computation |
| **Hidden layer(s)** | Learns intermediate feature representations |
| **Output layer** | Produces the final prediction (steering, throttle) |

Neurons in adjacent layers are **fully connected**: every neuron in layer *l* has a weighted edge to every neuron in layer *l+1*.

---

## The Cortex Network Architecture

There are two architectures in use depending on context:

### Simulation architecture — 5-8-8-2 (browser)

The browser simulation (`Simulation.js`) uses a deeper network with two hidden layers:

```
Input (5)    Hidden 1 (8)   Hidden 2 (8)   Output (2)
  ┌───┐        ┌───┐          ┌───┐          ┌───┐
  │d₀ │───────►│h₀ │─────────►│g₀ │─────────►│y₀ │ → steering
  │d₁ │───────►│h₁ │─────────►│g₁ │─────────►│y₁ │ → throttle
  │d₂ │───────►│h₂ │─────────►│g₂ │─────────►└───┘
  │d₃ │───────►│h₃ │─────────►│g₃ │
  │d₄ │───────►│h₄ │─────────►│g₄ │
  └───┘        │h₅ │─────────►│g₅ │
               │h₆ │─────────►│g₆ │
               │h₇ │─────────►│g₇ │
               └───┘          └───┘
```

**Parameter count (simulation):**
- Input → Hidden 1: 5 × 8 = 40 weights + 8 biases
- Hidden 1 → Hidden 2: 8 × 8 = 64 weights + 8 biases
- Hidden 2 → Output: 8 × 2 = 16 weights + 2 biases
- **Total: 138 trainable parameters**

### Firmware architecture — 5-5-2 (ESP32 / Arduino Due)

The embedded firmware (`NeuralNet.h`, `Config.h`) uses a shallower 3-layer network to fit within microcontroller memory constraints:

```
Input (5)    Hidden (5)    Output (2)
  ┌───┐        ┌───┐        ┌───┐
  │d₀ │───────►│h₀ │───────►│y₀ │ → steering
  │d₁ │───────►│h₁ │───────►│y₁ │ → throttle
  │d₂ │───────►│h₂ │───────►└───┘
  │d₃ │───────►│h₃ │
  │d₄ │───────►│h₄ │
  └───┘        └───┘
```

**Parameter count (firmware):**
- Input → Hidden: 5 × 5 = 25 weights + 5 biases
- Hidden → Output: 5 × 2 = 10 weights + 2 biases
- **Total: 42 trainable parameters**

> **Note on deployment:** The `model_converter.js` tool reads the JSON exported by the simulation and extracts the first two weight layers to populate the firmware's fixed-size arrays. If you train a `[5, 8, 8, 2]` model in the simulation and deploy it, only the first hidden layer weights are transferred — retrain the simulation using the `[5, 5, 2]` architecture (or modify `Config.h` and `NeuralNet.h` to match `[5, 8, 8, 2]`) for best results on hardware.

**Inputs (indices 0–4):**

| Index | Lidar angle | Description |
|-------|------------|-------------|
| 0 | −90° | Hard left (side wall) |
| 1 | −45° | Front-left diagonal |
| 2 | 0° | Straight ahead |
| 3 | +45° | Front-right diagonal |
| 4 | +90° | Hard right (side wall) |

Distances are normalised to [0, 1] by dividing by `DIST_NORM_MAX = 2000 mm`. A value of 1.0 means no obstacle within 2 m; a value near 0 means the wall is very close.

**Outputs:**
- `y₀ ∈ [0, 1]`: steering — 0 = full left, 0.5 = straight, 1 = full right
- `y₁ ∈ [0, 1]`: throttle — 0 = stopped, 1 = maximum speed

---

## Activation Functions

### Sigmoid

```
σ(x) = 1 / (1 + e^(−x))
```

- Output range: (0, 1)
- Smooth, differentiable everywhere
- Used in output layer so predictions naturally sit in [0, 1]
- Derivative: `σ'(x) = σ(x) × (1 − σ(x))`
- **Weakness**: gradient vanishes for large |x| ("vanishing gradient problem")

### ReLU (Rectified Linear Unit)

```
ReLU(x) = max(0, x)
```

- Output range: [0, +∞)
- Computationally efficient
- Avoids vanishing gradients for positive activations
- Derivative: `ReLU'(x) = 1 if x > 0, else 0`
- **Weakness**: "dying ReLU" — neurons with x ≤ 0 produce no gradient

### Tanh

```
tanh(x) = (e^x − e^(−x)) / (e^x + e^(−x))
```

- Output range: (−1, 1) — zero-centred, which aids training
- Stronger gradients than sigmoid near zero
- Derivative: `tanh'(x) = 1 − tanh²(x)`

### Softmax (output layer option)

```
softmax(xᵢ) = e^(xᵢ − max(x)) / Σⱼ e^(xⱼ − max(x))
```

- Outputs sum to 1.0 — useful for classification
- Numerical stability via subtracting `max(x)` before exponentiation

**Default in Cortex:** sigmoid for all hidden and output layers.

---

## Forward Propagation

For each layer *l* (0-indexed, where 0 is the first weight layer):

```
z^(l) = W^(l) · a^(l−1) + b^(l)
a^(l) = activation(z^(l))
```

Where:
- `W^(l)` — weight matrix of shape `(n_{l+1} × n_l)`
- `a^(l−1)` — activation column vector from the previous layer
- `b^(l)` — bias column vector
- `z^(l)` — pre-activation values
- `a^(l)` — post-activation values (output of this layer)

For the simulation's 5-8-8-2 network:

```
z¹ = W¹ · x  + b¹       (8×5  · 5×1 → 8×1)
a¹ = sigmoid(z¹)        (8×1)

z² = W² · a¹ + b²       (8×8  · 8×1 → 8×1)
a² = sigmoid(z²)        (8×1)

z³ = W³ · a² + b³       (2×8  · 8×1 → 2×1)
a³ = sigmoid(z³)        (2×1)  ← final output [steer, throttle]
```

---

## Backpropagation

Backpropagation computes gradients of the loss with respect to all weights using the **chain rule**, then updates weights via **gradient descent**.

### Loss function — Mean Squared Error (MSE)

```
L = (1/n) × Σᵢ (yᵢ − ŷᵢ)²
```

Where `y` is the target and `ŷ` is the network output.

### Output layer delta

```
δ^(L) = (ŷ − y) ⊙ activation'(z^(L))
```

For sigmoid: `δ^(L) = (ŷ − y) ⊙ ŷ ⊙ (1 − ŷ)`

### Hidden layer delta (chain rule)

```
δ^(l) = (W^(l+1)ᵀ · δ^(l+1)) ⊙ activation'(z^(l))
```

### Weight and bias gradients

```
∂L/∂W^(l) = δ^(l) · a^(l−1)ᵀ
∂L/∂b^(l) = δ^(l)
```

### Gradient descent update

```
W^(l) ← W^(l) − α × ∂L/∂W^(l)
b^(l) ← b^(l) − α × ∂L/∂b^(l)
```

Where `α` is the **learning rate** (default 0.05 in Cortex).

### Stochastic vs. batch

Cortex uses **online (stochastic) gradient descent** — weights are updated after every single training sample. This is appropriate for the real-time simulation where new samples arrive every frame.

---

## L2 Regularisation

To prevent overfitting (memorising one track segment rather than learning to drive generally), an optional L2 penalty can be added to the loss:

```
L_reg = L + (λ/2) × Σ_w w²
```

This adds an extra gradient term to the weight update:

```
W^(l) ← W^(l) − α × (∂L/∂W^(l) + λ × W^(l))
```

Equivalently: `W^(l) ← W^(l) × (1 − α × λ) − α × ∂L/∂W^(l)`

The factor `(1 − α × λ)` is called **weight decay**. With small λ (e.g., 0.0001), large weights are penalised and the network is gently biased toward smoother solutions.

Set `l2Lambda` in the `NeuralNetwork` constructor options. Default is 0 (disabled).

---

## Genetic Algorithm

### Overview

The genetic algorithm (GA) treats the entire set of network weights as a **genome** and evolves a population of networks over generations.

### Population initialisation

Each of the `populationSize` (default: 20) networks is a copy of the template architecture with **independently randomised weights** in [−1, 1].

### Fitness function

```
fitness(vehicle) = total distance driven without collision
```

Vehicles that drive farther score higher. A vehicle that crashes immediately scores near zero. The simulation accumulates `vehicle.speed` each step into `vehicle.score`.

### Selection — Tournament

For each parent slot needed:
1. Draw `tournamentSize` (default: 5) candidates at random from the population.
2. Select the candidate with the highest fitness.

This is unbiased toward any fixed number of parents and scales well.

### Crossover — Single-point

Given two parent networks A and B (as flat weight vectors of length N):

```
split = random integer in [1, N−1]
child_genes = [ A.genes[0..split], B.genes[split..N] ]
```

This recombines the "strategies" learned by each parent.

### Mutation — Gaussian perturbation

For each gene in the child, with probability `mutationRate`:

```
gene += N(0, mutationStrength²)
```

Where `N(0, σ²)` is a Gaussian random sample with mean 0 and standard deviation `mutationStrength` (default: 0.5).

The mutation rate decays each generation:

```
mutationRate_next = max(minMutationRate, mutationRate × mutationDecay)
```

Default decay: 0.995 per generation; floor: 0.01.

### Elitism

The top `eliteCount` (default: 2) networks are copied **unchanged** into the next generation, ensuring the best solution found is never lost.

### Full generation cycle

```
1. Evaluate fitness for all vehicles in population
2. Sort by fitness (descending)
3. Copy top eliteCount directly to next generation
4. For remaining slots:
   a. Select two parents via tournament
   b. Crossover → child genome
   c. Mutate child genome
   d. Inject child genome into a copy of the template network
5. Replace current population with next generation
6. Decay mutation rate
7. Increment generation counter
```

---

## Supervised Learning — Linear Regression

The simplified 5-neuron version uses **linear regression** rather than backpropagation, following the approach of the original `brain5.js`.

### Model

```
steer   = w₀ + w₁d₁ + w₂d₂ + w₃d₃
throttle = v₀ + v₁d₁ + v₂d₂ + v₃d₃
```

Where d₁, d₂, d₃ are the left diagonal, forward, and right diagonal sensor readings (the side sensors at ±90° are less informative for basic steering).

### Regression via ordinary least squares

Collect N samples from the teacher: `{(d₁ⁱ, d₂ⁱ, d₃ⁱ) → (steerⁱ, throttleⁱ)}`.

The weight vector `w` minimising the squared error is:

```
w = (XᵀX)⁻¹ Xᵀ y
```

Where `X` is the design matrix (each row is `[1, d₁, d₂, d₃]`) and `y` is the target vector.

**Direction constraint:** The steering regression line must pass through the origin (no bias term) because when d₁ = d₂ = d₃ = 0 (equidistant from all walls), the steering command should be neutral. This constraint is applied manually in the regression formula.

In the browser simulation the calculation uses the mean of horizontal and vertical regressions as an approximation to the orthogonal regression — sufficient in practice and simpler to implement.

---

## Sensor-to-Motor Mapping

### In the simulation (Vehicle.js)

Each simulation step:

1. **Sense**: cast 5 rays at angles −90°, −45°, 0°, +45°, +90° relative to the vehicle heading. Each ray returns the distance to the nearest wall, capped at `maxSensorDist = 200 px`, normalised to [0, 1].

2. **Think**: pass the 5 normalised readings to `brain.predict(sensorReadings)`. Returns `[steer, throttle]` ∈ [0, 1]².

3. **Act**:
   ```
   steerAngle = (steer - 0.5) × 2 × maxSteer   // radians per step
   speed      = throttle × maxSpeed             // px per step
   ```
   - `maxSteer = 0.065 rad/step`
   - `maxSpeed = 3.2 px/step`

4. **Collide**: test four bounding-box corners against wall segments; mark `alive = false` on hit.

### In the firmware (NeuralNet.h / Motor.h)

1. **Sense**: parse the latest YDlidar scan packet; extract distance at the 5 programmed angles; normalise by `DIST_NORM_MAX = 2000.0 mm`.

2. **Think**: run the embedded forward pass using `const float` weight arrays from `Config.h`.

3. **Act**: map `output[0]` (steering) and `output[1]` (throttle) to differential motor speeds:
   ```
   leftSpeed  = (throttle + (steer - 0.5) × 2) × MOTOR_MAX_SPEED
   rightSpeed = (throttle - (steer - 0.5) × 2) × MOTOR_MAX_SPEED
   ```
   Clamp both to [0, MOTOR_MAX_SPEED].

4. **Emergency stop**: if `min(distances) < MIN_OBSTACLE_DIST (150 mm)`, cut both motors immediately.

---

## Tuning Guide

### Learning Rate (backpropagation / supervised)

| Value | Behaviour |
|-------|-----------|
| > 0.5 | Oscillates, may diverge |
| 0.05–0.2 | Typical range — fast convergence |
| 0.01–0.05 | Slower but stable |
| < 0.001 | Very slow; may stall in flat loss regions |

Start at 0.05 and halve it if the error chart shows oscillations. The default in `Simulation.js` is 0.05.

### Mutation Rate (genetic algorithm)

| Value | Behaviour |
|-------|-----------|
| 0.3–0.5 | High exploration; converges slowly |
| 0.1–0.2 | Balanced; good starting point |
| 0.01–0.05 | Fine-tuning an already-good network |
| 0 | No evolution — population is static |

The rate decays automatically (×0.995/generation). If evolution stalls at a local optimum, reset with a higher initial rate.

### Population Size

| Size | Behaviour |
|------|-----------|
| 5–10 | Fast to evaluate; limited diversity |
| 20 (default) | Good balance of diversity and speed |
| 50–100 | Higher probability of finding global optimum; much slower per generation |

### Tournament Size

Larger tournament sizes increase selection pressure (only the fittest breed). Smaller sizes allow weaker individuals to occasionally contribute genes, maintaining diversity.

| Tournament size | Selection pressure |
|----------------|--------------------|
| 2 | Low — lots of diversity |
| 5 (default) | Moderate |
| 10+ | High — can lead to premature convergence |

### L2 Lambda

| Value | Effect |
|-------|--------|
| 0 (default) | No regularisation |
| 0.0001 | Gentle weight decay; good first choice |
| 0.001 | Stronger regularisation; may underfit |
| > 0.01 | Usually too aggressive |

### Network Architecture

The 5-5-2 architecture is deliberately minimal and matches the firmware constraints of small microcontrollers. If you modify the simulation to use a deeper network, you must update `NeuralNet.h` in the firmware and regenerate the `Config.h` weight arrays with `model_converter.js`.
