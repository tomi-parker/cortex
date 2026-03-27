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
// Expected JSON structure (matches NeuralNetwork.js save() format):
// {
//   "layerSizes":   [5, 5, 2],
//   "learningRate": 0.1,
//   "activation":   "sigmoid",
//   "l2Lambda":     0,
//   "weights": [
//     { "rows": 5, "cols": 5, "data": [[...], ...] },  // input  → hidden
//     { "rows": 2, "cols": 5, "data": [[...], ...] }   // hidden → output
//   ],
//   "biases": [
//     { "rows": 5, "cols": 1, "data": [[...]] },       // hidden biases
//     { "rows": 2, "cols": 1, "data": [[...]] }        // output biases
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

    if (!Array.isArray(model.layerSizes)) {
        die('Missing "layerSizes" array in model JSON.');
    }

    if (model.layerSizes.length < 2) {
        die(`Expected at least 2 layer sizes, found ${model.layerSizes.length}.`);
    }

    if (!Array.isArray(model.weights)) {
        die('Missing "weights" array in model JSON.');
    }

    if (!Array.isArray(model.biases)) {
        die('Missing "biases" array in model JSON.');
    }

    const numLayers = model.layerSizes.length - 1;
    if (model.weights.length !== numLayers) {
        die(`Expected ${numLayers} weight matrices, found ${model.weights.length}.`);
    }

    for (let i = 0; i < numLayers; i++) {
        const wm = model.weights[i];
        const bm = model.biases[i];
        const outSize = model.layerSizes[i + 1];
        const inSize  = model.layerSizes[i];

        if (!wm || !Array.isArray(wm.data)) {
            die(`weights[${i}]: missing "data" array.`);
        }
        if (wm.rows !== outSize || wm.cols !== inSize) {
            die(`weights[${i}]: expected ${outSize}×${inSize}, got ${wm.rows}×${wm.cols}.`);
        }

        if (!bm || !Array.isArray(bm.data)) {
            die(`biases[${i}]: missing "data" array.`);
        }
        if (bm.rows !== outSize) {
            die(`biases[${i}]: expected ${outSize} rows, got ${bm.rows}.`);
        }
    }
}

// =============================================================================
// generateHeader — build the full C header string
// =============================================================================

function generateHeader(model, sourcePath) {
    const now        = new Date().toISOString();
    const fitness    = model.fitness    !== undefined ? String(model.fitness)    : 'N/A';
    const generation = model.generation !== undefined ? String(model.generation) : 'N/A';
    const trainDate  = model.date       !== undefined ? String(model.date)       : 'N/A';

    const layerSizes = model.layerSizes;
    const numLayers  = layerSizes.length - 1;

    const lines = [];

    // -------------------------------------------------------------------------
    // File header
    // -------------------------------------------------------------------------
    lines.push('// Auto-generated by Cortex model_converter.js');
    lines.push('// DO NOT EDIT BY HAND — regenerate from model_converter.js');
    lines.push('//');
    lines.push(`// Source file    : ${path.basename(sourcePath)}`);
    lines.push(`// Converted      : ${now}`);
    lines.push(`// Training date  : ${trainDate}`);
    lines.push(`// Generation     : ${generation}`);
    lines.push(`// Best fitness   : ${fitness}`);
    lines.push(`// Architecture   : [${layerSizes.join(', ')}]`);
    lines.push('');
    lines.push('#pragma once');
    lines.push('');

    // -------------------------------------------------------------------------
    // Architecture constants
    // -------------------------------------------------------------------------
    lines.push('// Network architecture');
    for (let i = 0; i < layerSizes.length; i++) {
        const label = i === 0 ? 'INPUT' : (i === layerSizes.length - 1 ? 'OUTPUT' : `HIDDEN${i}`);
        lines.push(`#define NN_${label}_SIZE  ${layerSizes[i]}`);
    }
    lines.push(`#define NN_NUM_LAYERS   ${numLayers}`);
    lines.push('');

    // -------------------------------------------------------------------------
    // Weight matrices and bias vectors
    // -------------------------------------------------------------------------
    for (let i = 0; i < numLayers; i++) {
        const wm  = model.weights[i];  // { rows, cols, data }
        const bm  = model.biases[i];   // { rows, cols, data }
        const idx = i + 1;
        const outSize = wm.rows;
        const inSize  = wm.cols;

        lines.push(`// Layer ${idx} weights  [${outSize}][${inSize}]`);
        lines.push(`const float NN_WEIGHTS_${idx}[${outSize}][${inSize}] = {`);
        for (let r = 0; r < outSize; r++) {
            const vals  = wm.data[r].map(v => formatFloat(v));
            const comma = r < outSize - 1 ? ',' : '';
            lines.push(`    { ${vals.join(', ')} }${comma}`);
        }
        lines.push('};');
        lines.push('');

        lines.push(`// Layer ${idx} biases  [${outSize}]`);
        const biasVals = bm.data.map(row => formatFloat(row[0]));
        lines.push(`const float NN_BIAS_${idx}[${outSize}] = { ${biasVals.join(', ')} };`);
        lines.push('');
    }

    return lines.join('\n') + '\n';
}

// =============================================================================
// Helpers
// =============================================================================

// Format a float as a C float literal with 8 decimal places and an 'f' suffix.
// Using 8 significant digits avoids precision loss for very small weights
// (e.g., after heavy L2 regularisation) while remaining human-readable.
function formatFloat(v) {
    // Use toPrecision(8) to preserve up to 8 significant digits,
    // then append the C 'f' suffix for single-precision literals.
    return parseFloat(v.toPrecision(8)).toString() + 'f';
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
