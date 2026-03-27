# Getting Started with Cortex AI

This guide walks you through running the simulation, training a neural network, and deploying it to real hardware.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Running the Simulation](#running-the-simulation)
3. [The Three Learning Modes](#the-three-learning-modes)
   - [Genetic Algorithm](#1-genetic-algorithm)
   - [Supervised Learning](#2-supervised-learning)
   - [Backpropagation](#3-backpropagation)
4. [Track Options](#track-options)
5. [Exporting a Trained Model](#exporting-a-trained-model)
6. [Converting a Model to Firmware](#converting-a-model-to-firmware)
7. [Deploying to Hardware](#deploying-to-hardware)

---

## Prerequisites

| Task | Requirement |
|------|-------------|
| Running the simulation | Any modern web browser (Chrome, Firefox, Edge, Safari) |
| Converting models | [Node.js](https://nodejs.org/) v14 or later |
| Flashing firmware | [Arduino IDE](https://www.arduino.cc/en/software) 2.x with ESP32 or SAM board packages |

No package installation, no build step — the simulation is pure vanilla JavaScript.

---

## Running the Simulation

### Option A — Open directly (recommended for quick start)

1. Clone or download the repository.
2. Navigate to the `simulation/` folder.
3. Double-click **`index.html`** — it opens in your default browser.

### Option B — Local HTTP server (required if the browser blocks `file://` imports)

```bash
# Python 3
python -m http.server 8080

# Node.js (npx)
npx serve .
```

Then open `http://localhost:8080/simulation/`.

### What you will see

The simulation opens with a canvas on the left showing the track and vehicle(s), and a **Dashboard panel** on the right showing:

- Current mode (Genetic / Supervised / Backpropagation)
- Statistics: generation, best fitness, mean fitness, alive count
- A live neural network diagram with animated activations
- A fitness or error history chart
- **Export / Import** model buttons

---

## The Three Learning Modes

Switch modes using the **Mode** dropdown in the Dashboard. Click **Reset** after switching.

### 1. Genetic Algorithm

> 20 vehicles evolve through natural selection. No labelled data required.

**How it works:**

- Every vehicle is assigned a randomly initialised neural network.
- Each frame the network reads 5 lidar distances and outputs steering + throttle.
- When all vehicles have crashed, the generation ends.
- **Fitness = cumulative distance** driven without collision.
- The top 2 vehicles (elites) survive unchanged; the rest are bred via tournament selection + single-point crossover + Gaussian mutation.
- Mutation rate decays by a factor of 0.995 each generation (down to a floor of 0.01).

**Step-by-step:**

1. Select **Genetic Algorithm** mode.
2. Click **Start** — 20 coloured vehicles appear on the track.
3. Watch the fitness chart: the mean fitness rises over generations.
4. Use the **Mutation Rate** slider to control exploration vs. exploitation.
   - High rate (0.3–0.5): more exploration, slower convergence.
   - Low rate (0.01–0.05): exploits known good solutions, risk of local optima.
5. Increase **Speed** multiplier (2×, 4×, 8×) to fast-forward evolution.
6. Once a vehicle consistently completes laps, click **Export** to save the model.

**Tips:**

- Population of 20 usually converges in 30–80 generations on the circuit track.
- The random track is harder — expect 100+ generations.
- If evolution stalls, press **Reset** and start fresh with a higher initial mutation rate.

---

### 2. Supervised Learning

> A scripted teacher drives the track and generates labelled training examples. The student network learns online from those examples.

**How it works:**

- The **teacher** follows a sequence of waypoints (defined programmatically) at a target speed.
- Every simulation step the teacher records `(sensorReadings, [steerTarget, throttleTarget])`.
- The **student** network is trained via backpropagation on these live examples.
- A separate student vehicle drives on its own sensor readings simultaneously.

**Step-by-step:**

1. Select **Supervised Learning** mode.
2. Click **Start**.
3. The yellow teacher vehicle drives the track; the student (different colour) drives independently.
4. Watch the **error chart** — MSE drops as the student converges toward the teacher's policy.
5. Adjust **Learning Rate** (default 0.05):
   - Too high (> 0.5): oscillations, divergence.
   - Too low (< 0.001): very slow convergence.
6. Once the error stabilises and the student drives cleanly, click **Export**.

**Understanding the sensor→action mapping:**

The teacher translates its current position relative to the waypoint into steering and throttle targets. The student must generalise from these examples to arbitrary track positions.

---

### 3. Backpropagation

> A single vehicle generates its own training targets from a reactive heuristic and trains online via gradient descent.

**How it works:**

- One vehicle drives the track.
- Every step a simple heuristic computes target `[steer, throttle]` from the sensor readings (e.g., steer away from the nearest wall).
- The network is trained immediately on that `(sensors → heuristic_target)` pair.
- Over time the network internalises the heuristic and generalises beyond it.

**Step-by-step:**

1. Select **Backpropagation** mode.
2. Click **Start**.
3. The vehicle may crash frequently at first — this is normal; the network is learning.
4. Watch the error chart: MSE typically drops sharply then plateaus.
5. Tune **Learning Rate** and observe convergence speed.
6. The network architecture in this mode is 5 inputs → 5 hidden → 2 outputs, sigmoid activation throughout.

**L2 Regularisation:**

To prevent overfitting to a specific track segment, a small L2 penalty (`l2Lambda`) can be set at construction time in the source. This penalises large weights and promotes smoother generalisation.

---

## Track Options

Two track types are available via the **Track** dropdown:

| Track | Description |
|-------|-------------|
| **Circuit** | Fixed oval-style road with gentle curves — good for initial training |
| **Random** | Procedurally generated each run using a Catmull-Rom spline through random control points — harder, tests generalisation |

The random track changes every time you click **Reset**, so a model that performs well on many random tracks is more robustly trained.

---

## Exporting a Trained Model

Once you are satisfied with the vehicle's performance:

1. Click the **Export** button in the Dashboard.
2. A file named `cortex-model.json` is downloaded automatically.
3. Move it to the `models/` directory for safe-keeping.

The JSON file contains the full network topology, all weights, all biases, plus metadata (fitness, generation, timestamp). See [models/README.md](../models/README.md) for the file format.

### Importing a saved model

1. Click **Import** in the Dashboard.
2. Select a `.json` file from `models/`.
3. The simulation loads the weights and immediately runs the vehicle with the saved brain.

---

## Converting a Model to Firmware

The `tools/model_converter.js` script reads a JSON model and generates a C++ header file ready to paste into the firmware.

```bash
# Print to stdout
node tools/model_converter.js models/cortex-model.json

# Write to a header file
node tools/model_converter.js models/cortex-model.json firmware/cortex_vehicle/trained_weights.h
```

The output is a header that defines `NN_WEIGHTS_1`, `NN_BIAS_1`, `NN_WEIGHTS_2`, `NN_BIAS_2` as `const float` arrays, which map directly to the `NeuralNet.h` firmware structure.

Copy the generated arrays into `firmware/cortex_vehicle/Config.h`, replacing the placeholder zero arrays.

---

## Deploying to Hardware

See **[HARDWARE.md](HARDWARE.md)** for the complete bill of materials, wiring instructions, 3D printing guide, and firmware flashing steps.

Quick checklist:

1. ✅ Print chassis and skids from `CAO/chassis.stl` and `CAO/patin.stl`
2. ✅ Wire the lidar, motor driver, and LM2596 per `Images/schema.png`
3. ✅ Edit `firmware/cortex_vehicle/Config.h` — select board, driver type, lidar type
4. ✅ Paste converted weight arrays into `Config.h`
5. ✅ Flash with Arduino IDE
6. ✅ Power on — the vehicle drives autonomously using the trained model
