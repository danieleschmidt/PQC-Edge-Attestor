/**
 * @file quantumAttackSimulator.test.js
 * @brief Unit tests for quantum attack simulation framework
 */

const { QuantumAttackSimulator } = require('../../../src/security/quantumAttackSimulator');

describe('QuantumAttackSimulator', () => {
  let simulator;

  beforeEach(() => {
    simulator = new QuantumAttackSimulator({
      qubitCount: 1000,
      gateErrorRate: 0.01,
      coherenceTime: 50,
      attackTypes: ['shor', 'grover'],
      iterations: 10
    });
  });

  describe('constructor', () => {
    test('initializes with default configuration', () => {
      const defaultSimulator = new QuantumAttackSimulator();
      
      expect(defaultSimulator.config.qubitCount).toBe(4096);
      expect(defaultSimulator.config.gateErrorRate).toBe(0.001);
      expect(defaultSimulator.config.attackTypes).toEqual(['shor', 'grover', 'hybrid']);
    });

    test('initializes quantum models', () => {
      expect(simulator.quantumModels.has('shor')).toBe(true);
      expect(simulator.quantumModels.has('grover')).toBe(true);
      expect(simulator.quantumModels.has('hybrid')).toBe(true);
      expect(simulator.quantumModels.has('annealing')).toBe(true);
    });
  });

  describe('estimateShorResources', () => {
    test('estimates resources for RSA algorithm', async () => {
      const resources = await simulator.estimateShorResources('rsa', 2048, {});
      
      expect(resources).toHaveProperty('qubits');
      expect(resources).toHaveProperty('gates');
      expect(resources).toHaveProperty('depth');
      expect(resources).toHaveProperty('time');
      expect(resources).toHaveProperty('physicalQubits');
      expect(resources).toHaveProperty('errorCorrection');
      
      expect(resources.qubits).toBe(2 * 2048 + 3); // 2n+3 qubits
      expect(resources.gates).toBeGreaterThan(0);
      expect(resources.physicalQubits).toBeGreaterThan(resources.qubits);
    });

    test('marks non-vulnerable algorithms as not applicable', async () => {
      const resources = await simulator.estimateShorResources('kyber', 1024, {});
      
      expect(resources.applicable).toBe(false);
      expect(resources).toHaveProperty('reason');
    });
  });

  describe('estimateGroverResources', () => {
    test('estimates resources for AES algorithm', async () => {
      const resources = await simulator.estimateGroverResources('aes', 256, {});
      
      expect(resources).toHaveProperty('qubits', 256);
      expect(resources).toHaveProperty('gates');
      expect(resources).toHaveProperty('iterations');
      expect(resources).toHaveProperty('effectiveKeySize', 128); // Half due to quadratic speedup
      
      expect(resources.iterations).toBeGreaterThan(0);
      expect(resources.gates).toBeGreaterThan(0);
    });

    test('marks non-symmetric algorithms as not applicable', async () => {
      const resources = await simulator.estimateGroverResources('rsa', 2048, {});
      
      expect(resources.applicable).toBe(false);
    });
  });

  describe('estimateHybridResources', () => {
    test('estimates resources for Kyber algorithm', async () => {
      const resources = await simulator.estimateHybridResources('kyber', 1024, {});
      
      expect(resources.applicability).toBe('applicable');
      expect(resources).toHaveProperty('classical');
      expect(resources).toHaveProperty('quantum');
      expect(resources).toHaveProperty('combined');
      
      expect(resources.classical.sieving).toHaveProperty('complexity');
      expect(resources.quantum.sieving).toHaveProperty('complexity');
    });

    test('estimates resources for Dilithium algorithm', async () => {
      const resources = await simulator.estimateHybridResources('dilithium', 512, {});
      
      expect(resources.applicability).toBe('applicable');
      expect(resources.classical.sieving).toBeDefined();
      expect(resources.quantum.sieving).toBeDefined();
    });

    test('estimates resources for Falcon algorithm', async () => {
      const resources = await simulator.estimateHybridResources('falcon', 1024, {});
      
      expect(resources.applicability).toBe('applicable');
      expect(resources.classical.ntru).toBeDefined();
      expect(resources.quantum.ntru).toBeDefined();
    });
  });

  describe('calculateShorSuccess', () => {
    test('calculates success probability for viable attack', async () => {
      const resources = {
        applicable: true,
        gates: 1000000,
        time: 1000,
        physicalQubits: 100
      };
      
      const result = await simulator.calculateShorSuccess('rsa', 1024, resources, { gateErrorRate: 0.001 });
      
      expect(result).toHaveProperty('probability');
      expect(result).toHaveProperty('factors');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('details');
      
      expect(result.probability).toBeGreaterThanOrEqual(0);
      expect(result.probability).toBeLessThanOrEqual(1);
      expect(result.confidence).toBe(simulator.config.confidenceLevel);
    });

    test('returns zero probability for non-applicable resources', async () => {
      const resources = { applicable: false };
      
      const result = await simulator.calculateShorSuccess('kyber', 1024, resources, {});
      
      expect(result).toBe(0);
    });
  });

  describe('calculateGroverSuccess', () => {
    test('calculates success probability for Grover attack', async () => {
      const resources = {
        applicable: true,
        iterations: 1000,
        gates: 500000,
        time: 500,
        physicalQubits: 256,
        effectiveKeySize: 128
      };
      
      const result = await simulator.calculateGroverSuccess('aes', 256, resources, { gateErrorRate: 0.001 });
      
      expect(result).toHaveProperty('probability');
      expect(result).toHaveProperty('factors');
      expect(result).toHaveProperty('effectiveSecurityReduction');
      expect(result).toHaveProperty('iterations');
      
      expect(result.effectiveSecurityReduction).toBe(256 - 128);
    });
  });

  describe('estimateTimeToBreak', () => {
    test('estimates time for successful attack', async () => {
      const resources = { time: 3600, gates: 1000000 }; // 1 hour
      const successProbability = { probability: 0.5 };
      
      const timeToBreak = await simulator.estimateTimeToBreak(resources, successProbability, {});
      
      expect(timeToBreak).toHaveProperty('bestCase');
      expect(timeToBreak).toHaveProperty('expected');
      expect(timeToBreak).toHaveProperty('worstCase');
      expect(timeToBreak).toHaveProperty('readable');
      
      expect(timeToBreak.bestCase).toBe(3600);
      expect(timeToBreak.expected).toBe(3600 / 0.5); // 2 hours
      expect(timeToBreak.readable).toHaveProperty('value');
      expect(timeToBreak.readable).toHaveProperty('unit');
    });

    test('handles impossible attacks', async () => {
      const resources = { time: 1000 };
      const successProbability = { probability: 0 };
      
      const timeToBreak = await simulator.estimateTimeToBreak(resources, successProbability, {});
      
      expect(timeToBreak.expected).toBe(Infinity);
      expect(timeToBreak.readable.value).toBe('Infeasible');
      expect(timeToBreak.readable.unit).toBe('never');
    });
  });

  describe('convertTimeUnits', () => {
    test('converts seconds to readable units', () => {
      expect(simulator.convertTimeUnits(30)).toEqual({ value: '30.000000', unit: 'seconds' });
      expect(simulator.convertTimeUnits(3600)).toEqual({ value: '1.00', unit: 'hours' });
      expect(simulator.convertTimeUnits(86400)).toEqual({ value: '1.00', unit: 'days' });
      expect(simulator.convertTimeUnits(31536000)).toEqual({ value: '1.00', unit: 'years' });
    });
  });

  describe('generateAttackVector', () => {
    test('generates Shor attack vector', async () => {
      const vector = await simulator.generateAttackVector('shor', 'rsa', 2048);
      
      expect(vector).toHaveProperty('type', 'shor');
      expect(vector).toHaveProperty('target', 'rsa');
      expect(vector).toHaveProperty('keySize', 2048);
      expect(vector).toHaveProperty('steps');
      expect(vector).toHaveProperty('prerequisites');
      expect(vector).toHaveProperty('mitigations');
      
      expect(Array.isArray(vector.steps)).toBe(true);
      expect(vector.steps.length).toBeGreaterThan(0);
      expect(vector.steps[0]).toContain('superposition');
    });

    test('generates Grover attack vector', async () => {
      const vector = await simulator.generateAttackVector('grover', 'aes', 256);
      
      expect(vector.type).toBe('grover');
      expect(vector.target).toBe('aes');
      expect(vector.steps).toContain('Initialize uniform superposition over all possible keys');
      expect(vector.prerequisites).toContain('256 qubits for key space');
    });

    test('generates hybrid attack vector', async () => {
      const vector = await simulator.generateAttackVector('hybrid', 'kyber', 1024);
      
      expect(vector.type).toBe('hybrid');
      expect(vector.steps).toContain('Classical preprocessing: lattice reduction');
      expect(vector.prerequisites).toContain('High-performance classical preprocessing');
    });
  });

  describe('generateRiskAssessment', () => {
    test('generates comprehensive risk assessment', () => {
      const attackResults = {
        timeToBreak: {
          shor: { expected: 86400 * 365, readable: { value: '1', unit: 'year' } },
          grover: { expected: Infinity, readable: { value: 'Infeasible', unit: 'never' } }
        },
        successProbabilities: {
          shor: { probability: 0.8 },
          grover: { probability: 0.05 }
        },
        attackVectors: { shor: {}, grover: {} },
        resourceRequirements: { shor: {}, grover: {} }
      };
      
      const assessment = simulator.generateRiskAssessment(attackResults);
      
      expect(assessment).toHaveProperty('overallRisk');
      expect(assessment).toHaveProperty('timeFrame');
      expect(assessment).toHaveProperty('criticalVulnerabilities');
      expect(assessment).toHaveProperty('riskFactors');
      expect(assessment).toHaveProperty('quantumReadiness');
      expect(assessment).toHaveProperty('recommendations');
      
      expect(['critical', 'high', 'medium', 'low', 'negligible']).toContain(assessment.overallRisk);
      expect(Array.isArray(assessment.criticalVulnerabilities)).toBe(true);
    });

    test('identifies critical vulnerabilities', () => {
      const attackResults = {
        timeToBreak: {},
        successProbabilities: {
          shor: { probability: 0.9 }, // High probability
          grover: { probability: 0.05 } // Low probability
        },
        attackVectors: {},
        resourceRequirements: {}
      };
      
      const assessment = simulator.generateRiskAssessment(attackResults);
      
      const criticalVuln = assessment.criticalVulnerabilities.find(v => v.attack === 'shor');
      expect(criticalVuln).toBeDefined();
      expect(criticalVuln.probability).toBe(0.9);
      expect(criticalVuln.severity).toBe('high');
      
      const nonCritical = assessment.criticalVulnerabilities.find(v => v.attack === 'grover');
      expect(nonCritical).toBeUndefined();
    });
  });

  describe('generateMitigationStrategies', () => {
    test('generates mitigation strategies for vulnerable algorithms', () => {
      const attackResults = {
        attackVectors: { shor: {}, grover: {} },
        successProbabilities: {
          shor: { probability: 0.8 },
          grover: { probability: 0.2 }
        }
      };
      
      const strategies = simulator.generateMitigationStrategies('rsa', attackResults);
      
      expect(Array.isArray(strategies)).toBe(true);
      expect(strategies.length).toBeGreaterThan(0);
      
      // Should recommend algorithm replacement for high Shor vulnerability
      const algorithmReplacement = strategies.find(s => s.type === 'algorithm_replacement');
      expect(algorithmReplacement).toBeDefined();
      expect(algorithmReplacement.priority).toBe('high');
      expect(algorithmReplacement.algorithms).toContain('Kyber');
      
      // Should recommend key size increase for Grover vulnerability
      const keySizeIncrease = strategies.find(s => s.type === 'key_size_increase');
      expect(keySizeIncrease).toBeDefined();
    });

    test('includes general mitigation strategies', () => {
      const strategies = simulator.generateMitigationStrategies('aes', {
        attackVectors: {},
        successProbabilities: {}
      });
      
      const hybridStrategy = strategies.find(s => s.type === 'hybrid_approach');
      const agilityStrategy = strategies.find(s => s.type === 'agility');
      const monitoringStrategy = strategies.find(s => s.type === 'monitoring');
      
      expect(hybridStrategy).toBeDefined();
      expect(agilityStrategy).toBeDefined();
      expect(monitoringStrategy).toBeDefined();
    });
  });

  describe('simulateAttack', () => {
    test('simulates complete attack scenario', async () => {
      const attack = await simulator.simulateAttack('shor', 'rsa', 2048, {});
      
      expect(attack).toHaveProperty('type', 'shor');
      expect(attack).toHaveProperty('target', 'rsa');
      expect(attack).toHaveProperty('keySize', 2048);
      expect(attack).toHaveProperty('startTime');
      expect(attack).toHaveProperty('endTime');
      expect(attack).toHaveProperty('resources');
      expect(attack).toHaveProperty('successProbability');
      expect(attack).toHaveProperty('timeToBreak');
      expect(attack).toHaveProperty('vector');
      
      expect(attack.endTime).toBeGreaterThanOrEqual(attack.startTime);
    });
  });

  describe('helper methods', () => {
    test('identifyMostCriticalAttack works correctly', () => {
      const simulationResults = {
        results: {
          successProbabilities: {
            shor: { probability: 0.9 },
            grover: { probability: 0.3 },
            hybrid: { probability: 0.1 }
          }
        }
      };
      
      const mostCritical = simulator.identifyMostCriticalAttack(simulationResults);
      expect(mostCritical).toBe('shor');
    });

    test('getRecommendedAction provides appropriate actions', () => {
      expect(simulator.getRecommendedAction('critical')).toBe('Immediate algorithm replacement required');
      expect(simulator.getRecommendedAction('high')).toBe('Plan migration within 12 months');
      expect(simulator.getRecommendedAction('low')).toBe('Monitor quantum developments');
    });

    test('assessQuantumHardwareProgress evaluates maturity', () => {
      const progress = simulator.assessQuantumHardwareProgress();
      
      expect(progress).toHaveProperty('currentQubitCount');
      expect(progress).toHaveProperty('errorRate');
      expect(progress).toHaveProperty('maturityLevel');
      expect(['early', 'intermediate', 'advanced']).toContain(progress.maturityLevel);
    });
  });

  describe('error handling', () => {
    test('handles invalid algorithm gracefully', async () => {
      const resources = await simulator.estimateShorResources('invalid', 1024, {});
      expect(resources.applicable).toBe(false);
    });

    test('handles zero key size', async () => {
      const resources = await simulator.estimateShorResources('rsa', 0, {});
      expect(resources.qubits).toBe(3); // 2*0 + 3
    });
  });
});

describe('Integration tests', () => {
  test('full attack simulation workflow', async () => {
    const simulator = new QuantumAttackSimulator({
      attackTypes: ['shor'],
      iterations: 5
    });
    
    const simulation = await simulator.runAttackSimulation('rsa', 2048);
    
    expect(simulation).toHaveProperty('startTime');
    expect(simulation).toHaveProperty('endTime');
    expect(simulation).toHaveProperty('targetAlgorithm', 'rsa');
    expect(simulation).toHaveProperty('keySize', 2048);
    expect(simulation).toHaveProperty('results');
    
    expect(simulation.results).toHaveProperty('attackVectors');
    expect(simulation.results).toHaveProperty('timeToBreak');
    expect(simulation.results).toHaveProperty('resourceRequirements');
    expect(simulation.results).toHaveProperty('successProbabilities');
    expect(simulation.results).toHaveProperty('riskAssessment');
    expect(simulation.results).toHaveProperty('mitigationStrategies');
    
    expect(simulation.results.attackVectors.shor).toBeDefined();
    expect(simulation.results.riskAssessment.overallRisk).toBeDefined();
    expect(Array.isArray(simulation.results.mitigationStrategies)).toBe(true);
  });

  test('vulnerability report generation', async () => {
    const simulator = new QuantumAttackSimulator();
    const simulationResults = {
      targetAlgorithm: 'rsa',
      keySize: 2048,
      results: {
        riskAssessment: {
          overallRisk: 'high',
          criticalVulnerabilities: []
        },
        mitigationStrategies: [],
        attackVectors: {},
        resourceRequirements: {}
      }
    };
    
    const report = await simulator.generateVulnerabilityReport(simulationResults);
    
    expect(report).toHaveProperty('executiveSummary');
    expect(report).toHaveProperty('technicalFindings');
    expect(report).toHaveProperty('riskAnalysis');
    expect(report).toHaveProperty('mitigationPlan');
    expect(report).toHaveProperty('recommendations');
    expect(report).toHaveProperty('appendices');
    
    expect(report.executiveSummary).toHaveProperty('overview');
    expect(report.executiveSummary).toHaveProperty('keyFindings');
    expect(Array.isArray(report.executiveSummary.keyFindings)).toBe(true);
  });
});