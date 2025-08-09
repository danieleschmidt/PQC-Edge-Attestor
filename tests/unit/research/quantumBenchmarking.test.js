/**
 * @file quantumBenchmarking.test.js
 * @brief Unit tests for quantum benchmarking framework
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
      expect(stats.stdDev).toBe(0);
    });

    test('throws error for empty dataset', () => {
      expect(() => analyzer.calculateDescriptiveStats([])).toThrow('Invalid dataset provided');
    });

    test('throws error for non-array input', () => {
      expect(() => analyzer.calculateDescriptiveStats('not an array')).toThrow('Invalid dataset provided');
    });
  });

  describe('calculateSkewness', () => {
    test('calculates skewness correctly', () => {
      const data = [1, 2, 2, 3, 4, 7, 9];
      const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
      const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (data.length - 1);
      const stdDev = Math.sqrt(variance);
      
      const skewness = analyzer.calculateSkewness(data, mean, stdDev);
      
      expect(typeof skewness).toBe('number');
      expect(skewness).toBeGreaterThan(0); // Right-skewed distribution
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
      iterations: 10, // Small number for fast tests
      algorithms: ['kyber', 'dilithium'],
      warmupRuns: 2
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
      expect(keypair.publicKey).toHaveLength(1568); // Kyber-1024 public key size
      expect(keypair.secretKey).toHaveLength(3168); // Kyber-1024 secret key size
    });
  });

  describe('generateDilithiumKeyPair', () => {
    test('generates valid Dilithium keypair', async () => {
      const keypair = await suite.generateDilithiumKeyPair();
      
      expect(keypair).toHaveProperty('publicKey');
      expect(keypair).toHaveProperty('secretKey');
      expect(keypair.publicKey).toHaveLength(2592); // Dilithium-5 public key size
      expect(keypair.secretKey).toHaveLength(4880); // Dilithium-5 secret key size
    });
  });

  describe('measureKeyGeneration', () => {
    test('measures key generation performance', async () => {
      const result = await suite.measureKeyGeneration('kyber');
      
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('keypair');
      expect(result.duration).toBeGreaterThan(0);
      expect(result.keypair).toHaveProperty('publicKey');
      expect(result.keypair).toHaveProperty('secretKey');
    });

    test('includes memory usage when profiling enabled', async () => {
      const profilingSuite = new QuantumBenchmarkingSuite({ memoryProfiling: true });
      const result = await profilingSuite.measureKeyGeneration('kyber');
      
      expect(result).toHaveProperty('memoryUsage');
      expect(typeof result.memoryUsage).toBe('number');
    });
  });

  describe('measureSigning', () => {
    test('measures signing performance for Dilithium', async () => {
      const keypair = await suite.generateDilithiumKeyPair();
      const result = await suite.measureSigning('dilithium', keypair);
      
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('signature');
      expect(result).toHaveProperty('message');
      expect(result.duration).toBeGreaterThan(0);
      expect(Buffer.isBuffer(result.signature)).toBe(true);
    });

    test('measures signing performance for Falcon', async () => {
      const keypair = await suite.generateFalconKeyPair();
      const result = await suite.measureSigning('falcon', keypair);
      
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('signature');
      expect(result.duration).toBeGreaterThan(0);
    });
  });

  describe('simulateComputationalWork', () => {
    test('simulates work for specified duration', async () => {
      const targetTime = 5; // 5ms
      const startTime = Date.now();
      
      await suite.simulateComputationalWork(targetTime);
      
      const actualTime = Date.now() - startTime;
      expect(actualTime).toBeWithinRange(targetTime * 0.8, targetTime * 1.2); // ±20% tolerance
    });
  });

  describe('calculatePerformanceScore', () => {
    test('calculates performance score correctly', () => {
      const statistics = {
        keyGeneration: { mean: 10 },
        signing: { mean: 5 },
        verification: { mean: 2 },
        memoryUsage: { mean: 1000000 }
      };
      
      const score = suite.calculatePerformanceScore(statistics);
      
      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    test('returns lower score for slower operations', () => {
      const fastStats = {
        keyGeneration: { mean: 5 },
        signing: { mean: 2 }
      };
      
      const slowStats = {
        keyGeneration: { mean: 50 },
        signing: { mean: 20 }
      };
      
      const fastScore = suite.calculatePerformanceScore(fastStats);
      const slowScore = suite.calculatePerformanceScore(slowStats);
      
      expect(fastScore).toBeGreaterThan(slowScore);
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

  describe('assessQuantumResistance', () => {
    test('assesses quantum resistance for known algorithms', () => {
      const kyberResistance = suite.assessQuantumResistance('kyber');
      
      expect(kyberResistance.resistant).toBe(true);
      expect(kyberResistance.basis).toBe('Module Learning with Errors (M-LWE)');
      expect(kyberResistance.confidence).toBe('high');
      expect(kyberResistance.postQuantumSecurity).toBe('Level 5 (AES-256)');
    });

    test('returns unknown for unrecognized algorithms', () => {
      const unknownResistance = suite.assessQuantumResistance('unknown');
      
      expect(unknownResistance.resistant).toBe(false);
      expect(unknownResistance.confidence).toBe('none');
    });
  });

  describe('getEnvironmentMetadata', () => {
    test('returns environment information', () => {
      const metadata = suite.getEnvironmentMetadata();
      
      expect(metadata).toHaveProperty('nodejs');
      expect(metadata).toHaveProperty('platform');
      expect(metadata).toHaveProperty('arch');
      expect(metadata).toHaveProperty('cpus');
      expect(metadata).toHaveProperty('memory');
      expect(metadata).toHaveProperty('timestamp');
      expect(metadata).toHaveProperty('benchmarkVersion');
      
      expect(metadata.nodejs).toMatch(/^v\d+\.\d+\.\d+/);
      expect(typeof metadata.cpus).toBe('number');
      expect(metadata.memory).toMatch(/\d+GB$/);
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

    test('handles signing algorithms correctly', async () => {
      const result = await suite.benchmarkAlgorithm('dilithium');
      
      expect(result.rawMetrics.keyGeneration).toHaveLength(suite.config.iterations);
      expect(result.rawMetrics.signing).toHaveLength(suite.config.iterations);
      expect(result.rawMetrics.verification).toHaveLength(suite.config.iterations);
    });
  });

  describe('compareAlgorithmPair', () => {
    test('compares two algorithm results', () => {
      const result1 = {
        rawMetrics: {
          keyGeneration: [10, 11, 9, 10, 12],
          signing: [5, 6, 4, 5, 7]
        }
      };
      
      const result2 = {
        rawMetrics: {
          keyGeneration: [15, 16, 14, 15, 17],
          signing: [8, 9, 7, 8, 10]
        }
      };
      
      const comparison = suite.compareAlgorithmPair(result1, result2);
      
      expect(comparison).toHaveProperty('keyGeneration');
      expect(comparison).toHaveProperty('signing');
      expect(comparison).toHaveProperty('overallRecommendation');
      
      expect(comparison.keyGeneration).toHaveProperty('tStatistic');
      expect(comparison.keyGeneration).toHaveProperty('significant');
    });
  });

  describe('generateOptimizationRecommendations', () => {
    test('generates recommendations based on results', () => {
      const benchmarkResults = {
        algorithms: {
          kyber: {
            statistics: {
              keyGeneration: { mean: 100 }, // Slow
              memoryUsage: { mean: 2000000 } // High memory
            }
          },
          dilithium: {
            statistics: {
              keyGeneration: { mean: 10 }, // Fast
              memoryUsage: { mean: 500000 } // Low memory
            }
          }
        }
      };
      
      const recommendations = suite.generateOptimizationRecommendations(benchmarkResults);
      
      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations.length).toBeGreaterThan(0);
      
      // Should recommend hardware acceleration for slow kyber
      const kyberRec = recommendations.find(r => r.algorithm === 'kyber');
      expect(kyberRec).toBeDefined();
      expect(kyberRec.type).toBe('performance');
      expect(kyberRec.priority).toBe('high');
    });
  });

  describe('error handling', () => {
    test('handles unsupported algorithm gracefully', async () => {
      await expect(suite.measureKeyGeneration('unsupported'))
        .rejects.toThrow('Unsupported algorithm: unsupported');
    });
  });
});

describe('Integration tests', () => {
  test('full benchmarking workflow', async () => {
    const suite = new QuantumBenchmarkingSuite({
      iterations: 5, // Small for fast test
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
    expect(results.algorithms.kyber.rawMetrics.keyGeneration).toHaveLength(5);
    expect(Array.isArray(results.recommendations)).toBe(true);
  });
});