#pragma once

// =============================================================================
// Cortex AI — Lightweight Neural Network (forward-pass only)
// =============================================================================
// Topology: 5 inputs → 5 hidden (sigmoid) → 2 outputs (sigmoid)
//
// These weights are loaded from the simulation training export.
// Use tools/model_converter.js to regenerate Config.h from a trained JSON model.
// =============================================================================

#include <math.h>
#include "Config.h"

class NeuralNet {
public:
    // -------------------------------------------------------------------------
    // Constructor — copies weights from the arrays defined in Config.h
    // -------------------------------------------------------------------------
    NeuralNet() {
        for (int h = 0; h < 5; h++) {
            _bias1[h] = NN_BIAS_1[h];
            for (int i = 0; i < 5; i++) {
                _w1[h][i] = NN_WEIGHTS_1[h][i];
            }
        }
        for (int o = 0; o < 2; o++) {
            _bias2[o] = NN_BIAS_2[o];
            for (int h = 0; h < 5; h++) {
                _w2[o][h] = NN_WEIGHTS_2[o][h];
            }
        }
    }

    // -------------------------------------------------------------------------
    // sigmoid — activation function, computed inline for speed
    // -------------------------------------------------------------------------
    inline float sigmoid(float x) const {
        return 1.0f / (1.0f + expf(-x));
    }

    // -------------------------------------------------------------------------
    // forward — run one inference pass through the network
    //
    //   inputs[5]  : normalised sensor distances (each value in [0, 1])
    //   outputs[2] : motor commands (each value in [0, 1] after sigmoid)
    // -------------------------------------------------------------------------
    void forward(float inputs[5], float outputs[2]) {
        float hidden[5];

        // --- Input → Hidden layer --------------------------------------------
        for (int h = 0; h < 5; h++) {
            float sum = _bias1[h];
            for (int i = 0; i < 5; i++) {
                sum += _w1[h][i] * inputs[i];
            }
            hidden[h] = sigmoid(sum);
        }

        // --- Hidden → Output layer -------------------------------------------
        for (int o = 0; o < 2; o++) {
            float sum = _bias2[o];
            for (int h = 0; h < 5; h++) {
                sum += _w2[o][h] * hidden[h];
            }
            outputs[o] = sigmoid(sum);
        }
    }

    // -------------------------------------------------------------------------
    // setWeights — load a new set of weights at runtime (e.g., over Serial)
    //
    //   w1[5][5]  : input→hidden weights
    //   b1[5]     : hidden biases
    //   w2[2][5]  : hidden→output weights (note: row = output neuron)
    //   b2[2]     : output biases
    // -------------------------------------------------------------------------
    void setWeights(float w1[][5], float b1[], float w2[][5], float b2[]) {
        for (int h = 0; h < 5; h++) {
            _bias1[h] = b1[h];
            for (int i = 0; i < 5; i++) {
                _w1[h][i] = w1[h][i];
            }
        }
        for (int o = 0; o < 2; o++) {
            _bias2[o] = b2[o];
            for (int h = 0; h < 5; h++) {
                _w2[o][h] = w2[o][h];
            }
        }
    }

    // -------------------------------------------------------------------------
    // printWeights — dump current weights over Serial for debugging
    // -------------------------------------------------------------------------
    void printWeights() const {
        Serial.println(F("-- NeuralNet weights --"));
        Serial.println(F("W1 (input→hidden):"));
        for (int h = 0; h < 5; h++) {
            for (int i = 0; i < 5; i++) {
                Serial.print(_w1[h][i], 4);
                Serial.print(i < 4 ? F("\t") : F("\n"));
            }
        }
        Serial.println(F("B1 (hidden bias):"));
        for (int h = 0; h < 5; h++) {
            Serial.print(_bias1[h], 4);
            Serial.print(h < 4 ? F("\t") : F("\n"));
        }
        Serial.println(F("W2 (hidden→output):"));
        for (int o = 0; o < 2; o++) {
            for (int h = 0; h < 5; h++) {
                Serial.print(_w2[o][h], 4);
                Serial.print(h < 4 ? F("\t") : F("\n"));
            }
        }
        Serial.println(F("B2 (output bias):"));
        for (int o = 0; o < 2; o++) {
            Serial.print(_bias2[o], 4);
            Serial.print(o < 1 ? F("\t") : F("\n"));
        }
    }

private:
    float _w1[5][5];   // input→hidden weights
    float _bias1[5];   // hidden biases
    float _w2[2][5];   // hidden→output weights
    float _bias2[2];   // output biases
};
