/**
 * GeneticAlgorithm — evolves a population of NeuralNetwork agents.
 *
 * Depends on NeuralNetwork (and transitively Matrix).
 * Vanilla JS — no external dependencies, runs directly in the browser.
 *
 * Strategy:
 *   • Elitism        : top-N networks are copied unchanged into the next gen.
 *   • Tournament sel : pick the best of K random candidates as a parent.
 *   • Crossover      : single-point crossover on the flat weight vector.
 *   • Mutation       : Gaussian perturbation; rate decays over generations.
 */
class GeneticAlgorithm {
  /**
   * @param {object} [options]
   * @param {number} [options.populationSize=50]   Total agents per generation
   * @param {number} [options.mutationRate=0.1]    Base probability of mutating each weight
   * @param {number} [options.eliteCount=2]        Number of top agents carried over unchanged
   * @param {number} [options.tournamentSize=5]    Candidates drawn for each tournament
   * @param {number} [options.mutationDecay=0.995] Per-generation multiplier for mutationRate
   * @param {number} [options.minMutationRate=0.01] Floor for the adaptive mutation rate
   * @param {number} [options.mutationStrength=0.5] Std-dev of Gaussian weight perturbation
   */
  constructor(options = {}) {
    this.populationSize   = options.populationSize   ?? 50;
    this.mutationRate     = options.mutationRate     ?? 0.1;
    this.eliteCount       = options.eliteCount       ?? 2;
    this.tournamentSize   = options.tournamentSize   ?? 5;
    this.mutationDecay    = options.mutationDecay    ?? 0.995;
    this.minMutationRate  = options.minMutationRate  ?? 0.01;
    this.mutationStrength = options.mutationStrength ?? 0.5;

    /** Current generation index (starts at 0, incremented by nextGeneration). */
    this.generation = 0;

    /** Effective mutation rate for the current generation (decays over time). */
    this._currentMutationRate = this.mutationRate;
  }

  // ---------------------------------------------------------------------------
  // Population initialisation
  // ---------------------------------------------------------------------------

  /**
   * Creates a fresh population of `populationSize` networks, each a randomised
   * copy of the provided template network.
   *
   * @param {NeuralNetwork} networkTemplate  Blueprint (architecture + options)
   * @returns {NeuralNetwork[]}
   */
  initPopulation(networkTemplate) {
    const population = [];
    for (let i = 0; i < this.populationSize; i++) {
      const individual = networkTemplate.copy();
      // Re-randomise so every agent starts with different weights
      for (let w = 0; w < individual.numLayers; w++) {
        individual.weights[w].randomize();
        individual.biases[w].randomize();
      }
      population.push(individual);
    }
    return population;
  }

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------

  /**
   * Tournament selection: draws `tournamentSize` candidates at random and
   * returns the index of the one with the highest fitness score.
   *
   * @param {number[]} fitnessScores  Array aligned with the population
   * @returns {number}  Index of the winner
   */
  selection(fitnessScores) {
    let bestIdx   = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < this.tournamentSize; i++) {
      const idx = Math.floor(Math.random() * fitnessScores.length);
      if (fitnessScores[idx] > bestScore) {
        bestScore = fitnessScores[idx];
        bestIdx   = idx;
      }
    }
    return bestIdx;
  }

  // ---------------------------------------------------------------------------
  // Crossover
  // ---------------------------------------------------------------------------

  /**
   * Single-point crossover on the concatenated flat weight+bias vector of two
   * parent networks. Returns a NEW child network.
   *
   * @param {NeuralNetwork} parentA
   * @param {NeuralNetwork} parentB
   * @returns {NeuralNetwork}  Child network
   */
  crossover(parentA, parentB) {
    const child = parentA.copy();

    // Flatten all weights and biases into a single array for each parent
    const genesA = GeneticAlgorithm._extractGenes(parentA);
    const genesB = GeneticAlgorithm._extractGenes(parentB);

    if (genesA.length !== genesB.length) {
      throw new Error('GeneticAlgorithm.crossover: parent networks have different genome lengths');
    }

    // Pick a random crossover point (at least 1 gene from each parent)
    const point   = 1 + Math.floor(Math.random() * (genesA.length - 1));
    const childGenes = genesA.slice(0, point).concat(genesB.slice(point));

    GeneticAlgorithm._injectGenes(child, childGenes);
    return child;
  }

  // ---------------------------------------------------------------------------
  // Mutation
  // ---------------------------------------------------------------------------

  /**
   * Applies random Gaussian mutations to the weights and biases of a network.
   * Mutates the network IN-PLACE.
   *
   * @param {NeuralNetwork} network  Network to mutate
   * @param {number}        [rate]   Override mutation probability (default: current adaptive rate)
   * @returns {NeuralNetwork}  The same (mutated) network
   */
  mutate(network, rate) {
    const mutationRate = rate ?? this._currentMutationRate;
    const strength     = this.mutationStrength;

    const mutateMatrix = (m) => {
      for (let i = 0; i < m.rows; i++) {
        for (let j = 0; j < m.cols; j++) {
          if (Math.random() < mutationRate) {
            m.data[i][j] += GeneticAlgorithm._gaussianRandom() * strength;
          }
        }
      }
    };

    for (let l = 0; l < network.numLayers; l++) {
      mutateMatrix(network.weights[l]);
      mutateMatrix(network.biases[l]);
    }

    return network;
  }

  // ---------------------------------------------------------------------------
  // Next generation
  // ---------------------------------------------------------------------------

  /**
   * Breeds a new generation from the current population.
   *
   * 1. Elites are copied unchanged (highest fitness first).
   * 2. The rest are filled by tournament-selected crossover + mutation.
   *
   * @param {NeuralNetwork[]} population    Current generation
   * @param {number[]}        fitnessScores Fitness value for each individual
   * @returns {NeuralNetwork[]}             New generation (same length)
   */
  nextGeneration(population, fitnessScores) {
    if (population.length !== fitnessScores.length) {
      throw new Error('GeneticAlgorithm.nextGeneration: population and fitnessScores must have the same length');
    }

    // Sort indices by descending fitness
    const ranked = fitnessScores
      .map((score, idx) => ({ score, idx }))
      .sort((a, b) => b.score - a.score);

    const next = [];

    // 1. Elitism — copy top performers without modification
    for (let e = 0; e < Math.min(this.eliteCount, population.length); e++) {
      next.push(population[ranked[e].idx].copy());
    }

    // 2. Fill remainder with crossover offspring
    while (next.length < population.length) {
      const idxA  = this.selection(fitnessScores);
      let   idxB  = this.selection(fitnessScores);
      // Avoid self-crossover when population > 1; give up after a few tries
      // to prevent an infinite loop when all tournament winners are the same agent.
      const MAX_SELECTION_RETRIES = 10;
      if (population.length > 1) {
        let tries = 0;
        while (idxB === idxA && tries < MAX_SELECTION_RETRIES) {
          idxB = this.selection(fitnessScores);
          tries++;
        }
      }

      const child = this.crossover(population[idxA], population[idxB]);
      this.mutate(child);
      next.push(child);
    }

    // Advance generation counter and decay mutation rate
    this.generation++;
    this._currentMutationRate = Math.max(
      this.minMutationRate,
      this._currentMutationRate * this.mutationDecay,
    );

    return next;
  }

  // ---------------------------------------------------------------------------
  // Statistics
  // ---------------------------------------------------------------------------

  /**
   * Returns basic statistics for the current generation's fitness scores.
   *
   * @param {number[]} fitnessScores
   * @returns {{ best: number, worst: number, mean: number, generation: number }}
   */
  getStats(fitnessScores) {
    let best  = -Infinity;
    let worst =  Infinity;
    let sum   = 0;

    for (const score of fitnessScores) {
      if (score > best)  best  = score;
      if (score < worst) worst = score;
      sum += score;
    }

    return {
      best,
      worst,
      mean:       sum / fitnessScores.length,
      generation: this.generation,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Extracts all weights and biases from a network into a single flat array.
   * Order: for each layer — all weight values (row-major), then all bias values.
   *
   * @param {NeuralNetwork} network
   * @returns {number[]}
   */
  static _extractGenes(network) {
    const genes = [];
    for (let l = 0; l < network.numLayers; l++) {
      for (const v of network.weights[l].toArray()) genes.push(v);
      for (const v of network.biases[l].toArray())  genes.push(v);
    }
    return genes;
  }

  /**
   * Writes a flat gene array back into a network's weights and biases.
   * The gene array must have been produced by _extractGenes on a compatible network.
   *
   * @param {NeuralNetwork} network
   * @param {number[]}      genes
   */
  static _injectGenes(network, genes) {
    let cursor = 0;
    for (let l = 0; l < network.numLayers; l++) {
      const w = network.weights[l];
      for (let i = 0; i < w.rows; i++) {
        for (let j = 0; j < w.cols; j++) {
          w.data[i][j] = genes[cursor++];
        }
      }
      const b = network.biases[l];
      for (let i = 0; i < b.rows; i++) {
        b.data[i][0] = genes[cursor++];
      }
    }
  }

  /**
   * Generates an approximately standard-normal random number via the
   * Box-Muller transform.
   * @returns {number}
   */
  static _gaussianRandom() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();   // avoid log(0)
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }
}
