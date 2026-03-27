# Models Directory

This directory stores trained Cortex AI model files in JSON format.

Models are exported from the browser simulation and can be:
- Re-imported into the simulation to resume training or demonstrate performance
- Converted to C++ firmware weights with `tools/model_converter.js`

---

## Saving a Model from the Simulation

1. Open `simulation/index.html` in your browser.
2. Train a network using any of the three learning modes.
3. Once satisfied with performance, click the **Export** button in the Dashboard.
4. A file named `cortex-model.json` is downloaded — move it to this directory.

---

## Loading a Model into the Simulation

1. Open `simulation/index.html`.
2. Click the **Import** button in the Dashboard (or the hidden file input it triggers).
3. Select the `.json` file from this directory.
4. The simulation immediately loads the saved weights and runs the vehicle with the restored brain.

---

## Converting a Model to Firmware

```bash
# Print C++ header to stdout
node tools/model_converter.js models/cortex-model.json

# Write to a header file (recommended)
node tools/model_converter.js models/cortex-model.json firmware/cortex_vehicle/trained_weights.h
```

The script generates a C header with `const float` arrays:

```c
const float NN_WEIGHTS_1[5][5] = { ... };
const float NN_BIAS_1[5]       = { ... };
const float NN_WEIGHTS_2[2][5] = { ... };
const float NN_BIAS_2[2]       = { ... };
```

Copy these arrays into `firmware/cortex_vehicle/Config.h` to replace the placeholder zeros, then flash the firmware via the Arduino IDE.

---

## Model File Format

A model file is a UTF-8 JSON object with the following structure:

```json
{
  "layerSizes": [5, 5, 2],
  "activation": "sigmoid",
  "learningRate": 0.05,
  "l2Lambda": 0,
  "layers": [
    {
      "weights": [
        [w00, w01, w02, w03, w04],
        [w10, w11, w12, w13, w14],
        [w20, w21, w22, w23, w24],
        [w30, w31, w32, w33, w34],
        [w40, w41, w42, w43, w44]
      ],
      "biases": [b0, b1, b2, b3, b4]
    },
    {
      "weights": [
        [w00, w01, w02, w03, w04],
        [w10, w11, w12, w13, w14]
      ],
      "biases": [b0, b1]
    }
  ],
  "fitness": 4821.3,
  "generation": 47,
  "date": "2024-01-15T14:32:00.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `layerSizes` | `number[]` | Network topology, e.g. `[5, 5, 2]` |
| `activation` | `string` | Activation function used (`sigmoid`, `relu`, `tanh`) |
| `learningRate` | `number` | Learning rate at time of export |
| `l2Lambda` | `number` | L2 regularisation coefficient |
| `layers` | `object[]` | One entry per weight layer (N−1 for N layer sizes) |
| `layers[i].weights` | `number[][]` | Weight matrix, shape `[n_{i+1}][n_i]` |
| `layers[i].biases` | `number[]` | Bias vector, length `n_{i+1}` |
| `fitness` | `number` | Best fitness score when exported (optional) |
| `generation` | `number` | Generation number when exported (optional) |
| `date` | `string` | ISO 8601 export timestamp (optional) |

---

## Naming Convention

Use descriptive names when you have multiple saved models:

```
models/
├── genetic-circuit-gen47.json     # Genetic, circuit track, generation 47
├── genetic-random-gen103.json     # Genetic, random track, generation 103
├── supervised-lr005.json          # Supervised, learning rate 0.05
└── backprop-l2-0001.json          # Backprop, l2Lambda=0.0001
```
