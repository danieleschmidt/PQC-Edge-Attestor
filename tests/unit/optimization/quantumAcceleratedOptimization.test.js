/**
 * @file quantumAcceleratedOptimization.test.js
 * @brief Unit tests for quantum-accelerated optimization
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

  describe('generateAnnealingSchedule', () => {
    test('generates valid annealing schedule', () => {
      const schedule = optimizer.generateAnnealingSchedule();
      
      expect(Array.isArray(schedule)).toBe(true);
      expect(schedule).toHaveLength(optimizer.config.generations);
      
      schedule.forEach((step, index) => {
        expect(step).toHaveProperty('step', index);
        expect(step).toHaveProperty('temperature');
        expect(step).toHaveProperty('quantumFluctuation');
        expect(step).toHaveProperty('classicalBias');
        
        expect(step.temperature).toBeGreaterThanOrEqual(0);
        expect(step.quantumFluctuation).toBeGreaterThanOrEqual(0);
        expect(step.classicalBias).toBeGreaterThanOrEqual(0);
      });
      
      // Temperature should decrease over time
      expect(schedule[0].temperature).toBeGreaterThan(schedule[schedule.length - 1].temperature);
    });
  });

  describe('extractOptimizationParameters', () => {
    test('extracts comprehensive parameter set', () => {
      const params = optimizer.extractOptimizationParameters();
      
      expect(params).toHaveProperty('keyGenerationOptimization');
      expect(params).toHaveProperty('cacheSize');
      expect(params).toHaveProperty('threadCount');
      expect(params).toHaveProperty('clockFrequency');
      expect(params).toHaveProperty('nttOptimization');
      
      expect(Array.isArray(params.cacheSize)).toBe(true);
      expect(Array.isArray(params.threadCount)).toBe(true);
      expect(Array.isArray(params.clockFrequency)).toBe(true);
    });
  });

  describe('initializeQuantumPopulation', () => {
    test('initializes population with quantum superposition', async () => {
      const population = await optimizer.initializeQuantumPopulation({});
      
      expect(Array.isArray(population)).toBe(true);
      expect(population).toHaveLength(optimizer.config.populationSize);
      
      population.forEach(individual => {
        expect(individual).toHaveProperty('cacheSize');
        expect(individual).toHaveProperty('threadCount');
        expect(individual).toHaveProperty('clockFrequency');
        
        expect([1024, 2048, 4096, 8192]).toContain(individual.cacheSize);
        expect([1, 2, 4, 8]).toContain(individual.threadCount);
      });
    });

    test('applies constraints correctly', async () => {
      const constraints = {
        maxMemory: 2048,
        maxPower: 400,
        requireConstantTime: true
      };
      
      const population = await optimizer.initializeQuantumPopulation(constraints);
      
      population.forEach(individual => {
        expect(individual.cacheSize).toBeLessThanOrEqual(constraints.maxMemory);
        expect(individual.clockFrequency).toBeLessThanOrEqual(constraints.maxPower);
        expect(individual.constantTimeOperations).toBe(true);
      });
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

    test('shows performance improvement with optimizations', async () => {
      const baseConfig = {
        nttOptimization: false,
        hardwareAcceleration: false
      };
      
      const optimizedConfig = {
        nttOptimization: true,
        hardwareAcceleration: true
      };
      
      const basePerf = await optimizer.measurePerformance(baseConfig, null);
      const optimizedPerf = await optimizer.measurePerformance(optimizedConfig, null);
      
      // Optimized should be faster
      expect(optimizedPerf.keyGenerationTime).toBeLessThan(basePerf.keyGenerationTime);
    });
  });

  describe('measureEnergyEfficiency', () => {
    test('measures energy efficiency correctly', async () => {
      const config = {
        clockFrequency: 400,
        voltageScaling: 1.0,
        sleepModes: 'balanced',
        hardwareAcceleration: false
      };
      
      const efficiency = await optimizer.measureEnergyEfficiency(config);
      
      expect(typeof efficiency).toBe('number');
      expect(efficiency).toBeGreaterThan(0);
    });

    test('shows better efficiency with hardware acceleration', async () => {
      const withoutHW = {
        clockFrequency: 400,
        voltageScaling: 1.0,
        sleepModes: 'balanced',
        hardwareAcceleration: false
      };
      
      const withHW = {
        clockFrequency: 400,
        voltageScaling: 1.0,
        sleepModes: 'balanced',
        hardwareAcceleration: true
      };
      
      const efficiencyWithoutHW = await optimizer.measureEnergyEfficiency(withoutHW);
      const efficiencyWithHW = await optimizer.measureEnergyEfficiency(withHW);
      
      expect(efficiencyWithHW).toBeGreaterThan(efficiencyWithoutHW);
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

  describe('quantumTournament', () => {
    test('performs quantum tournament selection', () => {
      const population = [
        { param1: 'a' },
        { param1: 'b' },
        { param1: 'c' },
        { param1: 'd' }
      ];
      const fitnessScores = [10, 20, 30, 40];
      const totalFitness = 100;
      
      const winner = optimizer.quantumTournament(population, fitnessScores, totalFitness);
      
      expect(winner).toHaveProperty('index');
      expect(winner).toHaveProperty('fitness');
      expect(winner.index).toBeGreaterThanOrEqual(0);
      expect(winner.index).toBeLessThan(population.length);
      expect(fitnessScores).toContain(winner.fitness);
    });
  });

  describe('calculateQuantumInterference', () => {
    test('calculates interference pattern', () => {
      const interference = optimizer.calculateQuantumInterference(0, 1);
      
      expect(typeof interference).toBe('number');
      expect(interference).toBeGreaterThanOrEqual(0);
      expect(interference).toBeLessThanOrEqual(1);
    });
  });

  describe('quantumRecombination', () => {
    test('performs quantum recombination', () => {
      const parent1 = {
        cacheSize: 2048,
        threadCount: 2,
        nttOptimization: true
      };
      
      const parent2 = {
        cacheSize: 4096,
        threadCount: 4,
        nttOptimization: false
      };
      
      const [offspring1, offspring2] = optimizer.quantumRecombination(parent1, parent2);
      
      expect(offspring1).toHaveProperty('cacheSize');
      expect(offspring1).toHaveProperty('threadCount');
      expect(offspring1).toHaveProperty('nttOptimization');
      
      expect(offspring2).toHaveProperty('cacheSize');
      expect(offspring2).toHaveProperty('threadCount');
      expect(offspring2).toHaveProperty('nttOptimization');
      
      // Offspring should have values from parents
      expect([2048, 4096]).toContain(offspring1.cacheSize);
      expect([2, 4]).toContain(offspring1.threadCount);
    });
  });

  describe('quantumTunneling', () => {
    test('performs quantum tunneling mutation', () => {
      const params = optimizer.extractOptimizationParameters();
      const schedule = { quantumFluctuation: 0.5 };
      
      const originalValue = 2048;
      const newValue = optimizer.quantumTunneling('cacheSize', originalValue, schedule);
      
      expect(params.cacheSize).toContain(newValue);
    });
  });

  describe('calculateHammingDistance', () => {
    test('calculates normalized Hamming distance', () => {
      const config1 = {
        param1: 'a',
        param2: 'b',
        param3: 'c'
      };
      
      const config2 = {
        param1: 'a',
        param2: 'x',
        param3: 'c'
      };
      
      const distance = optimizer.calculateHammingDistance(config1, config2);
      
      expect(distance).toBeCloseTo(1/3, 2); // 1 difference out of 3 parameters
    });
  });

  describe('getOptimizationRecommendations', () => {
    test('provides recommendations for different use cases', () => {
      const iotRec = optimizer.getOptimizationRecommendations('iot_low_power');
      const smartMeterRec = optimizer.getOptimizationRecommendations('smart_meter');
      const evChargerRec = optimizer.getOptimizationRecommendations('ev_charger');
      
      expect(iotRec).toHaveProperty('clockFrequency', 100);
      expect(iotRec).toHaveProperty('voltageScaling', 0.8);
      expect(iotRec).toHaveProperty('rationale');
      
      expect(smartMeterRec.constantTimeOperations).toBe(true);
      expect(evChargerRec.threadCount).toBe(4);
      
      // EV charger should have higher performance settings
      expect(evChargerRec.clockFrequency).toBeGreaterThan(iotRec.clockFrequency);
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
      expect(energyOptimizer.optimizationStrategies).toHaveProperty('voltage_scaling');
      expect(energyOptimizer.optimizationStrategies).toHaveProperty('frequency_scaling');
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

  describe('applyFrequencyScaling', () => {
    test('applies frequency scaling based on workload', async () => {
      const lightWorkload = { keyGenerations: 1 };
      const heavyWorkload = { keyGenerations: 100 };
      
      const lightResult = await energyOptimizer.applyFrequencyScaling(lightWorkload);
      const heavyResult = await energyOptimizer.applyFrequencyScaling(heavyWorkload);
      
      // Light workload should allow more frequency reduction
      expect(lightResult.energyReduction).toBeGreaterThanOrEqual(heavyResult.energyReduction);
    });
  });

  describe('applySleepOptimization', () => {
    test('optimizes sleep modes effectively', async () => {
      const workload = { keyGenerations: 5 };
      const result = await energyOptimizer.applySleepOptimization(workload);
      
      expect(result).toHaveProperty('energyReduction');
      expect(result).toHaveProperty('performanceImpact', 0); // No performance impact for sleep
      expect(result).toHaveProperty('details');
      
      expect(result.details.idleTime).toBeGreaterThanOrEqual(0);
      expect(result.details.sleepEfficiency).toBeGreaterThanOrEqual(0);
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

  describe('estimateIdleTime', () => {
    test('estimates idle time based on workload', () => {
      const lowWorkload = { keyGenerations: 10 };
      const highWorkload = { keyGenerations: 900 };
      
      const lowIdleTime = energyOptimizer.estimateIdleTime(lowWorkload);
      const highIdleTime = energyOptimizer.estimateIdleTime(highWorkload);
      
      expect(lowIdleTime).toBeGreaterThan(highIdleTime);
      expect(lowIdleTime).toBeGreaterThanOrEqual(0);
      expect(highIdleTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('measureEnergyConsumption', () => {
    test('measures energy consumption for different workloads', async () => {
      const lightWorkload = { keyGenerations: 1 };
      const heavyWorkload = { keyGenerations: 100 };
      
      const lightEnergy = await energyOptimizer.measureEnergyConsumption(lightWorkload);
      const heavyEnergy = await energyOptimizer.measureEnergyConsumption(heavyWorkload);
      
      expect(heavyEnergy).toBeGreaterThan(lightEnergy);
      expect(lightEnergy).toBeGreaterThan(0);
    });
  });
});

describe('Integration tests', () => {
  test('full optimization workflow', async () => {
    const optimizer = new QuantumAcceleratedOptimizer({
      populationSize: 5,
      generations: 3
    });
    
    const mockTargetFunction = jest.fn().mockResolvedValue({ score: 100 });
    const constraints = { maxMemory: 4096 };
    
    const result = await optimizer.runOptimization(mockTargetFunction, constraints);
    
    expect(result).toHaveProperty('startTime');
    expect(result).toHaveProperty('endTime');
    expect(result).toHaveProperty('parameters');
    expect(result).toHaveProperty('results');
    
    expect(result.results).toHaveProperty('bestConfiguration');
    expect(result.results).toHaveProperty('performanceImprovement');
    expect(result.results).toHaveProperty('convergenceData');
    
    expect(result.results.convergenceData).toHaveLength(3); // 3 generations
    expect(mockTargetFunction).toHaveBeenCalled();
  });

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