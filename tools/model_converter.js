#!/usr/bin/env node
// =============================================================================
// Cortex AI — Model Converter
// =============================================================================
// Converts a trained neural network JSON file (as saved by NeuralNetwork.js
// in the simulation) into a C/C++ header file ready to paste into Config.h
// or include directly in the firmware.
//
// Usage:
//   node model_converter.js <model.json> [output_weights.h]
//
// If no output path is supplied the header is written to stdout.
//
// Expected JSON structure (matches NeuralNetwork.js save format):
// {
//   "layers": [
//     { "weights": [[...]], "biases": [...] },   // input  → hidden
//     { "weights": [[...]], "biases": [...] }    // hidden → output
//   ],
//   "fitness":    <number>,   // optional — best fitness score during training
//   "generation": <number>,   // optional — generation when exported
//   "date":       <string>    // optional — ISO timestamp
// }
// =============================================================================

'use strict';

const fs   = require('fs');
const path = require('path');

// =============================================================================
// Entry point
// =============================================================================

function main() {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        printUsage();
        process.exit(1);
    }

    const inputPath  = args[0];
    const outputPath = args[1] || null;

    // --- Load and validate the JSON ------------------------------------------
    let model;
    try {
        const raw = fs.readFileSync(inputPath, 'utf8');
        model = JSON.parse(raw);
    } catch (err) {
        die(`Cannot read "${inputPath}": ${err.message}`);
    }

    validateModel(model);

    // --- Generate the header text --------------------------------------------
    const header = generateHeader(model, inputPath);

    // --- Write or print -------------------------------------------------------
    if (outputPath) {
        try {
            fs.writeFileSync(outputPath, header, 'utf8');
            console.log(`Header written to: ${outputPath}`);
        } catch (err) {
            die(`Cannot write "${outputPath}": ${err.message}`);
        }
    } else {
        process.stdout.write(header);
    }
}

// =============================================================================
// validateModel — throw a descriptive error if the JSON structure is wrong
// =============================================================================

function validateModel(model) {
    if (!model || typeof model !== 'object') {
        die('JSON root must be an object.');
    }

    if (!Array.isArray(model.layers)) {
        die('Missing "layers" array in model JSON.');
    }

    if (model.layers.length !== 2) {
        die(`Expected exactly 2 layers (input→hidden, hidden→output), ` +
            `but found ${model.layers.length}.`);
    }

    // Layer 0: input → hidden  (expected 5 hidden neurons, 5 inputs each)
    validateLayer(model.layers[0], 'layers[0] (input→hidden)', 5, 5);

    // Layer 1: hidden → output (expected 2 output neurons, 5 inputs each)
    validateLayer(model.layers[1], 'layers[1] (hidden→output)', 2, 5);
}

function validateLayer(layer, name, expectedNeurons, expectedInputs) {
    if (!layer || typeof layer !== 'object') {
        die(`${name} must be an object.`);
    }

    if (!Array.isArray(layer.weights)) {
        die(`${name}: missing "weights" array.`);
    }
    if (!Array.isArray(layer.biases)) {
        die(`${name}: missing "biases" array.`);
    }

    if (layer.weights.length !== expectedNeurons) {
        die(`${name}: expected ${expectedNeurons} weight rows, ` +
            `found ${layer.weights.length}.`);
    }
    if (layer.biases.length !== expectedNeurons) {
        die(`${name}: expected ${expectedNeurons} biases, ` +
            `found ${layer.biases.length}.`);
    }

    for (let i = 0; i < layer.weights.length; i++) {
        const row = layer.weights[i];
        if (!Array.isArray(row) || row.length !== expectedInputs) {
            die(`${name}: weights[${i}] should have ${expectedInputs} values, ` +
                `found ${Array.isArray(row) ? row.length : typeof row}.`);
        }
        for (let j = 0; j < row.length; j++) {
            if (typeof row[j] !== 'number' || !isFinite(row[j])) {
                die(`${name}: weights[${i}][${j}] is not a finite number.`);
            }
        }
        if (typeof layer.biases[i] !== 'number' || !isFinite(layer.biases[i])) {
            die(`${name}: biases[${i}] is not a finite number.`);
        }
    }
}

// =============================================================================
// generateHeader — build the full C header string
// =============================================================================

function generateHeader(model, sourcePath) {
    const now       = new Date().toISOString();
    const fitness   = model.fitness   !== undefined ? String(model.fitness)   : 'N/A';
    const generation = model.generation !== undefined ? String(model.generation) : 'N/A';
    const trainDate = model.date      !== undefined ? String(model.date)      : 'N/A';

    const layer0 = model.layers[0];  // input → hidden
    const layer1 = model.layers[1];  // hidden → output

    const hiddenCount = layer0.weights.length;   // 5
    const inputCount  = layer0.weights[0].length; // 5
    const outputCount = layer1.weights.length;   // 2

    const lines = [];

    // -------------------------------------------------------------------------
    // File header
    // -------------------------------------------------------------------------
    lines.push('// Auto-generated by Cortex model_converter.js');
    lines.push('// DO NOT EDIT BY HAND — regenerate from model_converter.js');
    lines.push('//');
    lines.push(`// Source file : ${path.basename(sourcePath)}`);
    lines.push(`// Converted   : ${now}`);
    lines.push(`// Training date : ${trainDate}`);
    lines.push(`// Generation    : ${generation}`);
    lines.push(`// Best fitness  : ${fitness}`);
    lines.push('');
    lines.push('#pragma once');
    lines.push('');

    // -------------------------------------------------------------------------
    // Architecture constants
    // -------------------------------------------------------------------------
    lines.push('// Network architecture');
    lines.push(`#define NN_INPUT_SIZE   ${inputCount}`);
    lines.push(`#define NN_HIDDEN_SIZE  ${hiddenCount}`);
    lines.push(`#define NN_OUTPUT_SIZE  ${outputCount}`);
    lines.push('');

    // -------------------------------------------------------------------------
    // W1 — input → hidden  [hidden][input]
    // -------------------------------------------------------------------------
    lines.push(`// Input → Hidden weights  [${hiddenCount}][${inputCount}]`);
    lines.push(`const float NN_WEIGHTS_1[${hiddenCount}][${inputCount}] = {`);
    for (let h = 0; h < hiddenCount; h++) {
        const vals = layer0.weights[h].map(v => formatFloat(v));
        const comma = h < hiddenCount - 1 ? ',' : '';
        lines.push(`    { ${vals.join(', ')} }${comma}`);
    }
    lines.push('};');
    lines.push('');

    // -------------------------------------------------------------------------
    // B1 — hidden biases  [hidden]
    // -------------------------------------------------------------------------
    lines.push(`// Hidden layer biases  [${hiddenCount}]`);
    const b1 = layer0.biases.map(v => formatFloat(v));
    lines.push(`const float NN_BIAS_1[${hiddenCount}] = { ${b1.join(', ')} };`);
    lines.push('');

    // -------------------------------------------------------------------------
    // W2 — hidden → output  [output][hidden]
    // -------------------------------------------------------------------------
    lines.push(`// Hidden → Output weights  [${outputCount}][${hiddenCount}]`);
    lines.push(`const float NN_WEIGHTS_2[${outputCount}][${hiddenCount}] = {`);
    for (let o = 0; o < outputCount; o++) {
        const vals = layer1.weights[o].map(v => formatFloat(v));
        const comma = o < outputCount - 1 ? ',' : '';
        lines.push(`    { ${vals.join(', ')} }${comma}`);
    }
    lines.push('};');
    lines.push('');

    // -------------------------------------------------------------------------
    // B2 — output biases  [output]
    // -------------------------------------------------------------------------
    lines.push(`// Output layer biases  [${outputCount}]`);
    const b2 = layer1.biases.map(v => formatFloat(v));
    lines.push(`const float NN_BIAS_2[${outputCount}] = { ${b2.join(', ')} };`);
    lines.push('');

    return lines.join('\n') + '\n';
}

// =============================================================================
// Helpers
// =============================================================================

// Format a float as a C float literal with 6 decimal places and an 'f' suffix.
function formatFloat(v) {
    return v.toFixed(6) + 'f';
}

function printUsage() {
    console.error('Usage: node model_converter.js <model.json> [output_weights.h]');
    console.error('');
    console.error('  model.json        — trained model exported by NeuralNetwork.js');
    console.error('  output_weights.h  — destination header file (default: stdout)');
    console.error('');
    console.error('Example:');
    console.error('  node model_converter.js ../simulation/best_model.json weights.h');
}

function die(message) {
    console.error(`Error: ${message}`);
    process.exit(1);
}

// =============================================================================
// Run
// =============================================================================

main();
