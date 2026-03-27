
<p align="center">
  <img src="Images/image.png" alt="Cortex AI Logo" width="320">
  <br/>
  <strong>Cortex — Plateforme IA pour Véhicule Autonome</strong><br/>
  <em>Autonomous Vehicle AI Platform</em>
</p>

<p align="center">
  <a href="LICENSE.txt">
    <img src="https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg" alt="License: CC BY-NC-SA">
  </a>
  <img src="https://img.shields.io/badge/JavaScript-ES6%2B-yellow?logo=javascript" alt="JavaScript">
  <img src="https://img.shields.io/badge/Arduino-ESP32%20%7C%20Due-teal?logo=arduino" alt="Arduino/ESP32">
</p>

---

## 🇫🇷 Description

**Cortex** est une plateforme éducative complète pour découvrir l'Intelligence Artificielle appliquée aux véhicules autonomes. Elle comprend :

- Une **simulation JavaScript** exécutable directement dans le navigateur — aucune installation requise.
- Trois **modes d'apprentissage** : algorithme génétique, apprentissage supervisé et rétropropagation du gradient.
- Un **véhicule physique** imprimable en 3D, équipé d'un lidar YDlidar, piloté par un ESP32 ou une Arduino Due.
- Un **pipeline complet** : entraîner le réseau dans la simulation, exporter les poids, et les déployer sur le matériel réel.

## 🇬🇧 Description

**Cortex** is a complete educational platform for exploring Artificial Intelligence applied to autonomous vehicles. It includes:

- A **JavaScript simulation** that runs directly in any browser — no installation needed.
- Three **learning modes**: genetic algorithm, supervised learning, and backpropagation.
- A **3D-printable physical vehicle** equipped with a YDlidar scanner, driven by an ESP32 or Arduino Due.
- A **full pipeline**: train the network in simulation, export the weights, and deploy them to real hardware.

<p align="center">
  <img src="Images/GeneticCortex.png" alt="Genetic Algorithm mode" width="640">
  <br/><em>Genetic Algorithm mode — 20 vehicles evolving simultaneously</em>
</p>

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Hardware Requirements](#hardware-requirements)
- [How It Works](#how-it-works)
- [Documentation](#documentation)
- [License](#license)
- [Credits](#credits)

---

## Features

| Mode | Description (FR) | Description (EN) |
|------|-----------------|-----------------|
| 🧬 **Genetic Algorithm** | 20 véhicules évoluent simultanément par sélection naturelle. Les poids synaptiques sont les gènes. | 20 vehicles evolve simultaneously via natural selection. Synaptic weights are the genes. |
| 🎓 **Supervised Learning** | Un véhicule "professeur" suit une trajectoire définie. L'élève apprend par régression linéaire. | A "teacher" vehicle follows a drawn path. The student learns via linear regression. |
| 📉 **Backpropagation** | Un réseau à 12 neurones apprend par rétropropagation du gradient d'erreur avec sigmoïde. | A 12-neuron network learns via gradient error backpropagation with sigmoid activation. |
| 🚗 **Physical Hardware** | Déploiement sur ESP32/Arduino Due avec lidar YDlidar X4 ou X2. | Deployment to ESP32/Arduino Due with YDlidar X4 or X2 scanner. |
| 📦 **Model Export** | Exportez les poids entraînés en JSON et convertissez-les en firmware C++. | Export trained weights as JSON and convert them to C++ firmware. |

---

## Quick Start

### Simulation (navigateur / browser)

```bash
# Aucune installation requise / No installation required
# Ouvrir dans le navigateur / Open in browser:
simulation/index.html
```

Double-click `simulation/index.html` or serve with any static HTTP server:

```bash
# With Python:
python -m http.server 8080
# Then open: http://localhost:8080/simulation/
```

### Model Converter (Node.js requis / required)

```bash
node tools/model_converter.js models/my-trained-model.json output_weights.h
```

---

## Project Structure

```
cortex/
├── simulation/              # Browser simulation (open index.html)
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── main.js          # Entry point
│       ├── Simulation.js    # 3 learning modes orchestration
│       ├── Vehicle.js       # Autonomous agent + 5 lidar sensors
│       ├── Track.js         # Catmull-Rom spline track generator
│       └── Dashboard.js     # Real-time stats & network visualiser
├── src/
│   └── neural_network/      # Reusable AI library
│       ├── Matrix.js        # Matrix maths (no dependencies)
│       ├── NeuralNetwork.js # Feed-forward NN + backpropagation
│       └── GeneticAlgorithm.js  # GA: selection, crossover, mutation
├── firmware/
│   └── cortex_vehicle/      # Arduino/ESP32 firmware
│       ├── cortex_vehicle.ino
│       ├── Config.h         # Board & pin configuration
│       ├── NeuralNet.h      # Embedded inference engine
│       ├── Lidar.h          # YDlidar X4/X2 driver
│       └── Motor.h          # Motor driver abstraction
├── tools/
│   └── model_converter.js   # JSON model → C++ header
├── models/                  # Saved trained models (JSON)
├── CAO/                     # 3D printable files
│   ├── chassis.stl
│   └── patin.stl
├── Images/                  # Wiring diagrams and screenshots
├── JavaScript/              # Original simulation sources (preserved)
├── Arduino/                 # Original firmware sources (preserved)
└── docs/                    # Detailed documentation
    ├── GETTING_STARTED.md
    ├── HARDWARE.md
    ├── NEURAL_NETWORK.md
    └── API.md
```

---

## Hardware Requirements

| Component | Model | Notes |
|-----------|-------|-------|
| **Microcontroller** | ESP32 DEVKIT V1 (30 pins) | Recommended; footprint matches 3D chassis |
| **Microcontroller (alt)** | Arduino Due | Also supported; trim ESP32 mounts after printing |
| **Lidar scanner** | YDlidar X4 | 128 000 baud, full-duplex; primary support |
| **Lidar scanner (alt)** | YDlidar X2 | 115 200 baud; TX pin not required |
| **Motor driver** | TB6612FNG or DRV8833 | Dual H-bridge; shield also works with Due |
| **DC-DC converter** | LM2596 module | Steps battery voltage down to 5 V for lidar |
| **Motors** | 2× geared DC motors with wheels | N20-style recommended |
| **Battery** | 7.4 V LiPo (2S) or equivalent | |
| **Frame** | Printed from `CAO/chassis.stl` | PLA, 0.2 mm layers |
| **Skids** | Printed from `CAO/patin.stl` | PLA, 0.2 mm layers |

> **Note (lidar baud rates) :** The X4 uses a non-standard 128 000 bps rate incompatible with Arduino Uno. The X2 runs at standard 115 200 bps but generates continuous data — increase the Arduino Due serial buffer to 512 bytes: edit `%LOCALAPPDATA%\Arduino15\packages\arduino\hardware\sam\1.6.12\cores\arduino\RingBuffer.h` and change `#define SERIAL_BUFFER_SIZE` from 64 to 512 (see [docs/HARDWARE.md](docs/HARDWARE.md) for full path details).

---

## How It Works

```
 ┌──────────────────────────────────────────────────────────────┐
 │                    SENSOR LAYER                              │
 │  5 lidar distances at: −90° | −45° | 0° | +45° | +90°       │
 │  Normalised to [0, 1] (0 = wall, 1 = max range 2 m)         │
 └──────────────────┬───────────────────────────────────────────┘
                    │  5 inputs
 ┌──────────────────▼───────────────────────────────────────────┐
 │            HIDDEN LAYER 1 (8 neurons, simulation)            │
 │         or HIDDEN LAYER   (5 neurons, firmware)              │
 │  Weighted sum + sigmoid activation                           │
 └──────────────────┬───────────────────────────────────────────┘
                    │
 ┌──────────────────▼───────────────────────────────────────────┐
 │            HIDDEN LAYER 2 (8 neurons, simulation only)       │
 │  Weighted sum + sigmoid activation                           │
 └──────────────────┬───────────────────────────────────────────┘
                    │
 ┌──────────────────▼───────────────────────────────────────────┐
 │                   OUTPUT LAYER (2 neurons)                   │
 │  output[0] → steering  (0=full left, 0.5=straight, 1=right)  │
 │  output[1] → throttle  (0=stop, 1=max speed)                 │
 └──────────────────┬───────────────────────────────────────────┘
                    │
 ┌──────────────────▼───────────────────────────────────────────┐
 │                   MOTOR COMMANDS                             │
 │  Left motor PWM / Right motor PWM → TB6612 / DRV8833         │
 └──────────────────────────────────────────────────────────────┘
```

The three learning modes all converge to the same goal — a network that maps sensor distances to motor commands — but use entirely different training strategies:

- **Genetic Algorithm**: fitness = total distance driven without collision; genes = all synaptic weights.
- **Supervised Learning**: a scripted teacher generates labelled examples; student trained by linear regression on sensor→action pairs.
- **Backpropagation**: a heuristic generates target actions each frame; network trained online with gradient descent.

> **Architecture note:** The browser simulation uses a `[5, 8, 8, 2]` network (deeper, for richer training). The firmware uses a `[5, 5, 2]` network (shallower, to fit microcontroller memory). Use `tools/model_converter.js` to bridge the gap — see [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md).

---

## Documentation

| Document | Description |
|----------|-------------|
| [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) | Step-by-step guide: simulation, training, export, deploy |
| [docs/HARDWARE.md](docs/HARDWARE.md) | Bill of materials, wiring, 3D printing, assembly |
| [docs/NEURAL_NETWORK.md](docs/NEURAL_NETWORK.md) | Technical deep-dive: architectures, equations, tuning tips |
| [docs/API.md](docs/API.md) | Full JavaScript API reference for all classes |
| [models/README.md](models/README.md) | Model file format and save/load/convert instructions |

---

## License

This project is licensed under **Creative Commons Attribution-NonCommercial-ShareAlike (CC BY-NC-SA)**.  
You are free to share and adapt the material for non-commercial purposes, provided you give appropriate credit and distribute your contributions under the same license.

See [LICENSE.txt](LICENSE.txt) for the full text.

---

## Credits

This project is a refactoring and extension of the original **Cortex** project created by **Sylvain Grimal** (GSDevelop-04), published under CC BY-NC-SA, 2019–2020.

Original repository: [github.com/GSDevelop-04/Cortex](https://github.com/GSDevelop-04/Cortex)

The original JavaScript simulations are preserved unchanged in the `JavaScript/` directory and the original Arduino firmware in the `Arduino/` directory.

[![Vidéo de présentation](Images/presentation.jpg)](https://youtu.be/U6bnyhtQa3g)





