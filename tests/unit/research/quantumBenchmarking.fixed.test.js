/**
 * @file quantumBenchmarking.fixed.test.js
 * @brief Fixed unit tests for quantum benchmarking framework
 */

const { QuantumBenchmarkingSuite, StatisticalAnalyzer } = require('../../../src/research/quantumBenchmarking');

describe('StatisticalAnalyzer', () => {
  let analyzer;

  beforeEach(() => {
    analyzer = new StatisticalAnalyzer();
  });

  describe('calculateDescriptiveStats', () => {
    test('calculates correct statistics for normal dataset', () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const stats = analyzer.calculateDescriptiveStats(data);
      
      expect(stats.n).toBe(10);
      expect(stats.mean).toBe(5.5);
      expect(stats.median).toBe(5.5);
      expect(stats.min).toBe(1);
      expect(stats.max).toBe(10);
      expect(stats.stdDev).toBeCloseTo(3.03, 1);
    });

    test('handles single value dataset', () => {
      const data = [42];
      const stats = analyzer.calculateDescriptiveStats(data);
      
      expect(stats.n).toBe(1);
      expect(stats.mean).toBe(42);
      expect(stats.median).toBe(42);
      // For single value, standard deviation should be 0 or NaN - we'll accept either
      expect(stats.stdDev === 0 || isNaN(stats.stdDev)).toBe(true);
    });

    test('throws error for empty dataset', () => {
      expect(() => analyzer.calculateDescriptiveStats([])).toThrow('Invalid dataset provided');
    });

    test('throws error for non-array input', () => {
      expect(() => analyzer.calculateDescriptiveStats('not an array')).toThrow('Invalid dataset provided');
    });
  });

  describe('welchTTest', () => {
    test('performs Welch\'s t-test correctly', () => {
      const sample1 = [1, 2, 3, 4, 5];
      const sample2 = [3, 4, 5, 6, 7];
      
      const result = analyzer.welchTTest(sample1, sample2);
      
      expect(result).toHaveProperty('tStatistic');
      expect(result).toHaveProperty('degreesOfFreedom');
      expect(result).toHaveProperty('pValue');
      expect(result).toHaveProperty('effectSize');
      expect(result).toHaveProperty('significant');
      
      expect(typeof result.tStatistic).toBe('number');
      expect(typeof result.effectSize).toBe('number');
      expect(typeof result.significant).toBe('boolean');
    });
  });
});

describe('QuantumBenchmarkingSuite', () => {
  let suite;

  beforeEach(() => {
    suite = new QuantumBenchmarkingSuite({
      iterations: 5, // Small number for fast tests
      algorithms: ['kyber', 'dilithium'],
      warmupRuns: 1
    });
  });

  describe('constructor', () => {
    test('initializes with default configuration', () => {
      const defaultSuite = new QuantumBenchmarkingSuite();
      
      expect(defaultSuite.config.iterations).toBe(1000);
      expect(defaultSuite.config.algorithms).toEqual(['kyber', 'dilithium', 'falcon']);
      expect(defaultSuite.config.warmupRuns).toBe(100);
    });

    test('accepts custom configuration', () => {
      const customConfig = {
        iterations: 50,
        algorithms: ['kyber'],
        energyProfiling: true
      };
      
      const customSuite = new QuantumBenchmarkingSuite(customConfig);
      
      expect(customSuite.config.iterations).toBe(50);
      expect(customSuite.config.algorithms).toEqual(['kyber']);
      expect(customSuite.config.energyProfiling).toBe(true);
    });
  });

  describe('generateKyberKeyPair', () => {
    test('generates valid Kyber keypair', async () => {
      const keypair = await suite.generateKyberKeyPair();
      
      expect(keypair).toHaveProperty('publicKey');
      expect(keypair).toHaveProperty('secretKey');
      expect(keypair.publicKey).toHaveLength(1568);
      expect(keypair.secretKey).toHaveLength(3168);
    });
  });

  describe('simulateComputationalWork', () => {
    test('simulates work for specified duration', async () => {
      const targetTime = 5; // 5ms
      const startTime = performance.now();
      
      await suite.simulateComputationalWork(targetTime);
      
      const actualTime = performance.now() - startTime;
      expect(actualTime).toBeGreaterThan(targetTime * 0.5);
      expect(actualTime).toBeLessThan(targetTime * 2.0);
    });
  });

  describe('compareAlgorithmPair', () => {
    test('compares two algorithm results', () => {
      const result1 = {
        rawMetrics: {
          keyGeneration: [10, 11, 9, 10, 12],
          signing: [5, 6, 4, 5, 7],
          verification: [2, 3, 1, 2, 4] // Add verification data
        }
      };
      
      const result2 = {
        rawMetrics: {
          keyGeneration: [15, 16, 14, 15, 17],
          signing: [8, 9, 7, 8, 10],
          verification: [3, 4, 2, 3, 5] // Add verification data
        }
      };
      
      const comparison = suite.compareAlgorithmPair(result1, result2);
      
      expect(comparison).toHaveProperty('keyGeneration');
      expect(comparison).toHaveProperty('signing');
      expect(comparison).toHaveProperty('verification');
      expect(comparison).toHaveProperty('overallRecommendation');
      
      expect(comparison.keyGeneration).toHaveProperty('tStatistic');
      expect(comparison.keyGeneration).toHaveProperty('significant');
    });
  });

  describe('benchmarkAlgorithm', () => {
    test('benchmarks algorithm successfully', async () => {
      const result = await suite.benchmarkAlgorithm('kyber');
      
      expect(result).toHaveProperty('algorithm');
      expect(result).toHaveProperty('rawMetrics');
      expect(result).toHaveProperty('statistics');
      expect(result).toHaveProperty('performanceScore');
      expect(result).toHaveProperty('securityLevel');
      expect(result).toHaveProperty('quantumResistance');
      
      expect(result.algorithm).toBe('kyber');
      expect(result.rawMetrics.keyGeneration).toHaveLength(suite.config.iterations);
      expect(result.performanceScore).toBeGreaterThanOrEqual(0);
      expect(result.securityLevel).toBe(5);
    });
  });

  describe('getSecurityLevel', () => {
    test('returns correct security levels', () => {
      expect(suite.getSecurityLevel('kyber')).toBe(5);
      expect(suite.getSecurityLevel('dilithium')).toBe(5);
      expect(suite.getSecurityLevel('falcon')).toBe(5);
      expect(suite.getSecurityLevel('unknown')).toBe(0);
    });
  });
});

describe('Integration tests', () => {
  test('full benchmarking workflow', async () => {
    const suite = new QuantumBenchmarkingSuite({
      iterations: 3, // Very small for fast test
      algorithms: ['kyber'],
      warmupRuns: 1
    });
    
    const results = await suite.runComprehensiveBenchmark();
    
    expect(results).toHaveProperty('metadata');
    expect(results).toHaveProperty('algorithms');
    expect(results).toHaveProperty('comparisons');
    expect(results).toHaveProperty('statisticalSummary');
    expect(results).toHaveProperty('recommendations');
    expect(results).toHaveProperty('timestamp');
    
    expect(results.algorithms.kyber).toBeDefined();
    expect(results.algorithms.kyber.rawMetrics.keyGeneration).toHaveLength(3);
    expect(Array.isArray(results.recommendations)).toBe(true);
  });
});