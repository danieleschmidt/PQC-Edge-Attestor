/**
 * @file quantumAcceleratedOptimization.fixed.test.js
 * @brief Fixed unit tests for quantum-accelerated optimization
 */

const { QuantumAcceleratedOptimizer, EnergyOptimizer } = require('../../../src/optimization/quantumAcceleratedOptimization');

describe('QuantumAcceleratedOptimizer', () => {
  let optimizer;

  beforeEach(() => {
    optimizer = new QuantumAcceleratedOptimizer({
      populationSize: 10,
      generations: 5,
      algorithms: ['kyber', 'dilithium']
    });
  });

  describe('constructor', () => {
    test('initializes with default configuration', () => {
      const defaultOptimizer = new QuantumAcceleratedOptimizer();
      
      expect(defaultOptimizer.config.populationSize).toBe(50);
      expect(defaultOptimizer.config.generations).toBe(100);
      expect(defaultOptimizer.config.quantumInspired).toBe(true);
    });

    test('initializes quantum components', () => {
      expect(optimizer.quantumState).toHaveProperty('amplitudes');
      expect(optimizer.quantumState).toHaveProperty('phases');
      expect(optimizer.quantumState).toHaveProperty('entanglement');
      expect(optimizer.quantumState).toHaveProperty('coherenceTime');
      
      expect(optimizer.quantumState.amplitudes).toHaveLength(optimizer.config.populationSize);
      expect(optimizer.quantumState.phases).toHaveLength(optimizer.config.populationSize);
    });
  });

  describe('measurePerformance', () => {
    test('measures performance with different configurations', async () => {
      const config = {
        nttOptimization: true,
        hardwareAcceleration: true,
        cacheSize: 4096,
        batchSize: 64
      };
      
      const performance = await optimizer.measurePerformance(config, null);
      
      expect(performance).toHaveProperty('keyGenerationTime');
      expect(performance).toHaveProperty('signingTime');
      expect(performance).toHaveProperty('memoryUsage');
      expect(performance).toHaveProperty('throughput');
      
      expect(performance.keyGenerationTime).toBeGreaterThan(0);
      expect(performance.throughput).toBeGreaterThan(0);
    });
  });

  describe('calculateFitness', () => {
    test('calculates fitness score correctly', () => {
      const performance = {
        keyGenerationTime: 10,
        memoryUsage: 1000000,
        throughput: 100
      };
      
      const energyEfficiency = 0.8;
      const config = {};
      
      const fitness = optimizer.calculateFitness(performance, energyEfficiency, config);
      
      expect(typeof fitness).toBe('number');
      expect(fitness).toBeGreaterThan(0);
    });
  });
});

describe('EnergyOptimizer', () => {
  let energyOptimizer;

  beforeEach(() => {
    energyOptimizer = new EnergyOptimizer({
      targetReduction: 0.25,
      measurementInterval: 500
    });
  });

  describe('constructor', () => {
    test('initializes with configuration', () => {
      expect(energyOptimizer.config.targetReduction).toBe(0.25);
      expect(energyOptimizer.config.measurementInterval).toBe(500);
      expect(energyOptimizer.optimizationStrategies.has('voltage_scaling')).toBe(true);
      expect(energyOptimizer.optimizationStrategies.has('frequency_scaling')).toBe(true);
    });
  });

  describe('applyVoltageScaling', () => {
    test('applies voltage scaling optimization', async () => {
      const workload = { keyGenerations: 10 };
      const result = await energyOptimizer.applyVoltageScaling(workload);
      
      expect(result).toHaveProperty('energyReduction');
      expect(result).toHaveProperty('performanceImpact');
      expect(result).toHaveProperty('details');
      
      expect(result.energyReduction).toBeGreaterThan(0);
      expect(result.performanceImpact).toBeGreaterThanOrEqual(0);
    });
  });

  describe('assessWorkloadIntensity', () => {
    test('assesses workload intensity correctly', () => {
      const lightWorkload = { keyGenerations: 1, signings: 1 };
      const heavyWorkload = { keyGenerations: 50, signings: 100, networkOperations: 200 };
      
      const lightIntensity = energyOptimizer.assessWorkloadIntensity(lightWorkload);
      const heavyIntensity = energyOptimizer.assessWorkloadIntensity(heavyWorkload);
      
      expect(lightIntensity).toBeLessThan(heavyIntensity);
      expect(lightIntensity).toBeGreaterThanOrEqual(0);
      expect(heavyIntensity).toBeLessThanOrEqual(1);
    });
  });
});

describe('Integration tests', () => {
  test('energy optimization workflow', async () => {
    const energyOptimizer = new EnergyOptimizer();
    const workload = {
      keyGenerations: 10,
      signings: 5,
      verifications: 8
    };
    
    const result = await energyOptimizer.optimizeEnergyConsumption(workload);
    
    expect(result).toHaveProperty('startTime');
    expect(result).toHaveProperty('endTime');
    expect(result).toHaveProperty('strategies');
    expect(result).toHaveProperty('results');
    
    expect(result.results).toHaveProperty('energyReduction');
    expect(result.results).toHaveProperty('appliedOptimizations');
    expect(Array.isArray(result.results.appliedOptimizations)).toBe(true);
  });
});