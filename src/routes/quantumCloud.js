/**
 * @file quantumCloud.js
 * @brief Quantum cloud orchestration API routes
 * 
 * Provides REST API endpoints for quantum cloud computation orchestration,
 * resource management, and distributed quantum algorithm execution.
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { QuantumCloudOrchestrator } = require('../services/quantumCloudOrchestrator');
const { QuantumMachineLearningService } = require('../research/quantumMachineLearning');
const { QuantumComputationalAlgebraService } = require('../research/quantumComputationalAlgebra');

const router = express.Router();

// Initialize quantum cloud orchestrator
const quantumOrchestrator = new QuantumCloudOrchestrator({
  maxConcurrentJobs: 50,
  resourceAllocationStrategy: 'cost_optimized',
  autoScaling: true,
  crossCloudReplication: true,
  quantumErrorMitigation: true
});

// Initialize research services
const quantumML = new QuantumMachineLearningService();
const quantumAlgebra = new QuantumComputationalAlgebraService();

// Rate limiting for quantum cloud operations
const quantumCloudLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 quantum computation requests per windowMs
  message: {
    success: false,
    error: 'Too many quantum computation requests, please try again later',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Validation middleware
const validateComputationRequest = [
  body('algorithm')
    .isIn(['shor_factoring', 'grover_search', 'quantum_ml_optimization', 'lattice_reduction', 'pqc_parameter_optimization'])
    .withMessage('Invalid algorithm type'),
  body('complexity')
    .optional()
    .isIn(['low', 'medium', 'high', 'extreme'])
    .withMessage('Invalid complexity level'),
  body('securityLevel')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Security level must be between 1 and 5'),
  body('errorCorrection')
    .optional()
    .isBoolean()
    .withMessage('Error correction must be boolean'),
  body('realTime')
    .optional()
    .isBoolean()
    .withMessage('Real time flag must be boolean'),
  body('constraints')
    .optional()
    .isObject()
    .withMessage('Constraints must be an object')
];

/**
 * @route   POST /api/v1/quantum-cloud/compute
 * @desc    Submit quantum computation request
 * @access  Private
 */
router.post('/compute', quantumCloudLimiter, validateComputationRequest, async (req, res) => {
  try {
    // Check validation results
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array(),
        timestamp: new Date().toISOString(),
        requestId: req.id
      });
    }

    const computationRequest = {
      algorithm: req.body.algorithm,
      complexity: req.body.complexity || 'medium',
      securityLevel: req.body.securityLevel || 5,
      errorCorrection: req.body.errorCorrection || false,
      realTime: req.body.realTime || false,
      constraints: req.body.constraints || {},
      metadata: {
        userId: req.user?.id || 'anonymous',
        requestId: req.id,
        timestamp: Date.now(),
        clientInfo: {
          userAgent: req.get('user-agent'),
          ip: req.ip
        }
      },
      // Algorithm-specific parameters
      ...req.body.parameters
    };

    // Submit computation to quantum cloud orchestrator
    const result = await quantumOrchestrator.submitComputation(computationRequest);

    res.json({
      success: result.success,
      requestId: result.requestId,
      results: result.results,
      performance: {
        executionTime: result.performance.totalTime,
        quantumAdvantage: result.performance.quantumAdvantage,
        resourcesUsed: result.metadata?.resourcesUsed
      },
      costs: {
        total: result.costs.total,
        breakdown: result.costs
      },
      metadata: {
        algorithm: computationRequest.algorithm,
        complexity: computationRequest.complexity,
        executionStrategy: result.metadata?.executionStrategy
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Quantum computation failed',
      message: error.message,
      requestId: req.id,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route   GET /api/v1/quantum-cloud/providers
 * @desc    Get available quantum cloud providers
 * @access  Public
 */
router.get('/providers', async (req, res) => {
  try {
    const providers = quantumOrchestrator.getAvailableProviders();

    res.json({
      success: true,
      data: {
        providers,
        summary: {
          total: providers.length,
          quantum: providers.filter(p => p.type === 'quantum_cloud').length,
          classical: providers.filter(p => p.type === 'classical_hpc').length,
          totalQubits: providers
            .filter(p => p.maxQubits)
            .reduce((sum, p) => sum + p.maxQubits, 0)
        }
      },
      timestamp: new Date().toISOString(),
      requestId: req.id
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch providers',
      message: error.message,
      requestId: req.id,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route   GET /api/v1/quantum-cloud/metrics
 * @desc    Get quantum cloud system metrics
 * @access  Private
 */
router.get('/metrics', async (req, res) => {
  try {
    const metrics = quantumOrchestrator.getSystemMetrics();

    res.json({
      success: true,
      data: {
        system: metrics,
        performance: {
          successRate: (metrics.successRate * 100).toFixed(2) + '%',
          averageExecutionTime: metrics.averageExecutionTime.toFixed(2) + 'ms',
          averageQuantumAdvantage: metrics.averageQuantumAdvantage.toFixed(2) + 'x',
          totalCost: '$' + metrics.totalCost.toFixed(2)
        },
        resourceUtilization: {
          overall: (metrics.resourceUtilization * 100).toFixed(1) + '%'
        }
      },
      timestamp: new Date().toISOString(),
      requestId: req.id
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch metrics',
      message: error.message,
      requestId: req.id,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route   POST /api/v1/quantum-cloud/research/ml
 * @desc    Run quantum machine learning research
 * @access  Private
 */
router.post('/research/ml', quantumCloudLimiter, async (req, res) => {
  try {
    const researchConfig = {
      neuralNetwork: req.body.neuralNetwork || {},
      attackPredictor: req.body.attackPredictor || {},
      algorithmSelector: req.body.algorithmSelector || {},
      federatedLearning: req.body.federatedLearning || {},
      realTimeOptimizer: req.body.realTimeOptimizer || {}
    };

    const research = await quantumML.runQuantumMLResearch(researchConfig);

    res.json({
      success: true,
      data: {
        studyId: research.studyId,
        results: research.results,
        conclusions: research.conclusions,
        publications: research.publications,
        executionTime: Date.now() - research.timestamp
      },
      metadata: {
        configuration: researchConfig,
        timestamp: research.timestamp
      },
      requestId: req.id
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Quantum ML research failed',
      message: error.message,
      requestId: req.id,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route   POST /api/v1/quantum-cloud/research/algebra
 * @desc    Run quantum computational algebra research
 * @access  Private
 */
router.post('/research/algebra', quantumCloudLimiter, async (req, res) => {
  try {
    const researchConfig = {
      tensorNetwork: req.body.tensorNetwork || {},
      errorCorrection: req.body.errorCorrection || {}
    };

    const research = await quantumAlgebra.runQuantumAlgebraResearch(researchConfig);

    res.json({
      success: true,
      data: {
        studyId: research.studyId,
        experiments: research.experiments,
        novelContributions: research.novelContributions,
        academicPublications: research.academicPublications,
        patentApplications: research.patentApplications,
        executionTime: Date.now() - research.timestamp
      },
      metadata: {
        configuration: researchConfig,
        timestamp: research.timestamp
      },
      requestId: req.id
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Quantum algebra research failed',
      message: error.message,
      requestId: req.id,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route   POST /api/v1/quantum-cloud/optimize/pqc
 * @desc    Optimize PQC parameters using quantum algorithms
 * @access  Private
 */
router.post('/optimize/pqc', 
  quantumCloudLimiter,
  [
    body('targetAlgorithm')
      .isIn(['kyber', 'dilithium', 'falcon', 'ml-kem', 'ml-dsa'])
      .withMessage('Invalid PQC algorithm'),
    body('optimizationGoals')
      .isArray()
      .withMessage('Optimization goals must be an array'),
    body('constraints')
      .optional()
      .isObject()
      .withMessage('Constraints must be an object')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array(),
          timestamp: new Date().toISOString(),
          requestId: req.id
        });
      }

      const optimizationRequest = {
        algorithm: 'pqc_parameter_optimization',
        parameters: {
          targetAlgorithm: req.body.targetAlgorithm,
          optimizationGoals: req.body.optimizationGoals,
          constraints: req.body.constraints || {},
          currentParameters: req.body.currentParameters || {}
        },
        complexity: req.body.complexity || 'medium',
        errorCorrection: true,
        securityLevel: 5
      };

      const result = await quantumOrchestrator.submitComputation(optimizationRequest);

      res.json({
        success: result.success,
        data: {
          optimizedParameters: result.results?.optimizedParameters,
          improvementFactor: result.results?.improvementFactor,
          quantumAdvantage: result.performance?.quantumAdvantage,
          executionTime: result.performance?.totalTime,
          costs: result.costs
        },
        metadata: {
          targetAlgorithm: req.body.targetAlgorithm,
          optimizationGoals: req.body.optimizationGoals,
          requestId: result.requestId
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'PQC optimization failed',
        message: error.message,
        requestId: req.id,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * @route   POST /api/v1/quantum-cloud/simulate/attack
 * @desc    Simulate quantum attacks for testing
 * @access  Private
 */
router.post('/simulate/attack',
  quantumCloudLimiter,
  [
    body('attackType')
      .isIn(['shor_factoring', 'grover_search', 'quantum_annealing'])
      .withMessage('Invalid attack type'),
    body('targetSystem')
      .notEmpty()
      .withMessage('Target system is required'),
    body('parameters')
      .optional()
      .isObject()
      .withMessage('Parameters must be an object')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array(),
          timestamp: new Date().toISOString(),
          requestId: req.id
        });
      }

      const simulationRequest = {
        algorithm: req.body.attackType,
        parameters: {
          targetSystem: req.body.targetSystem,
          attackParameters: req.body.parameters || {},
          simulation: true,
          ethicalTesting: true
        },
        complexity: req.body.complexity || 'medium',
        errorCorrection: false,
        securityLevel: 5
      };

      const result = await quantumOrchestrator.submitComputation(simulationRequest);

      res.json({
        success: result.success,
        data: {
          attackSuccess: result.results?.success || false,
          timeToBreak: result.results?.timeToBreak || 'N/A',
          vulnerabilities: result.results?.vulnerabilities || [],
          recommendations: result.results?.recommendations || [],
          quantumResources: result.results?.quantumResources || {},
          executionTime: result.performance?.totalTime
        },
        metadata: {
          attackType: req.body.attackType,
          targetSystem: req.body.targetSystem,
          simulation: true,
          requestId: result.requestId
        },
        warning: 'This is a simulated attack for security testing purposes only',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Attack simulation failed',
        message: error.message,
        requestId: req.id,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * @route   GET /api/v1/quantum-cloud/algorithms
 * @desc    Get supported quantum algorithms and their specifications
 * @access  Public
 */
router.get('/algorithms', async (req, res) => {
  try {
    const algorithms = {
      shor_factoring: {
        name: 'Shor\'s Factoring Algorithm',
        type: 'quantum',
        purpose: 'Integer factorization',
        complexity: 'polynomial',
        quantumAdvantage: 'exponential',
        qubitsRequired: 'O(log N)',
        applications: ['RSA breaking', 'ECC breaking'],
        parameters: {
          keySize: { type: 'integer', min: 512, max: 4096 },
          errorCorrection: { type: 'boolean', default: true }
        }
      },
      grover_search: {
        name: 'Grover\'s Search Algorithm',
        type: 'quantum',
        purpose: 'Unstructured search',
        complexity: 'O(√N)',
        quantumAdvantage: 'quadratic',
        qubitsRequired: 'O(log N)',
        applications: ['AES key search', 'Hash collision'],
        parameters: {
          searchSpace: { type: 'integer', min: 1000, max: 1000000 },
          iterations: { type: 'integer', optional: true }
        }
      },
      quantum_ml_optimization: {
        name: 'Quantum Machine Learning Optimization',
        type: 'quantum_hybrid',
        purpose: 'ML model optimization',
        complexity: 'polynomial',
        quantumAdvantage: 'problem_dependent',
        qubitsRequired: 'O(model_size)',
        applications: ['PQC optimization', 'Attack prediction'],
        parameters: {
          modelSize: { type: 'integer', min: 10, max: 100 },
          optimizationGoals: { type: 'array', items: 'string' }
        }
      },
      lattice_reduction: {
        name: 'Quantum-Enhanced Lattice Reduction',
        type: 'classical_enhanced',
        purpose: 'Lattice basis reduction',
        complexity: 'exponential',
        quantumAdvantage: 'constant_factor',
        qubitsRequired: 0,
        applications: ['Lattice cryptanalysis', 'SVP solving'],
        parameters: {
          dimension: { type: 'integer', min: 10, max: 1000 },
          delta: { type: 'float', min: 0.5, max: 0.99, default: 0.75 }
        }
      },
      pqc_parameter_optimization: {
        name: 'PQC Parameter Optimization',
        type: 'quantum_hybrid',
        purpose: 'Cryptographic parameter tuning',
        complexity: 'polynomial',
        quantumAdvantage: 'problem_dependent',
        qubitsRequired: 'O(parameter_space)',
        applications: ['Kyber optimization', 'Dilithium tuning'],
        parameters: {
          targetAlgorithm: { type: 'string', enum: ['kyber', 'dilithium', 'falcon'] },
          optimizationGoals: { type: 'array', items: 'string' }
        }
      }
    };

    res.json({
      success: true,
      data: {
        algorithms,
        summary: {
          total: Object.keys(algorithms).length,
          quantum: Object.values(algorithms).filter(a => a.type === 'quantum').length,
          hybrid: Object.values(algorithms).filter(a => a.type === 'quantum_hybrid').length,
          classical: Object.values(algorithms).filter(a => a.type === 'classical_enhanced').length
        }
      },
      timestamp: new Date().toISOString(),
      requestId: req.id
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch algorithms',
      message: error.message,
      requestId: req.id,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route   GET /api/v1/quantum-cloud/health
 * @desc    Get quantum cloud service health status
 * @access  Public
 */
router.get('/health', async (req, res) => {
  try {
    const metrics = quantumOrchestrator.getSystemMetrics();
    const providers = quantumOrchestrator.getAvailableProviders();

    const healthStatus = {
      status: 'healthy',
      version: '1.0.0',
      uptime: process.uptime(),
      metrics: {
        successRate: metrics.successRate,
        averageExecutionTime: metrics.averageExecutionTime,
        resourceUtilization: metrics.resourceUtilization
      },
      providers: {
        total: providers.length,
        available: providers.filter(p => p.type === 'quantum_cloud').length,
        totalQubits: providers
          .filter(p => p.maxQubits)
          .reduce((sum, p) => sum + p.maxQubits, 0)
      },
      services: {
        orchestrator: 'operational',
        quantumML: 'operational',
        quantumAlgebra: 'operational'
      }
    };

    // Determine overall health
    if (metrics.successRate < 0.9 || providers.length === 0) {
      healthStatus.status = 'degraded';
    }
    
    if (metrics.successRate < 0.5 || providers.filter(p => p.type === 'quantum_cloud').length === 0) {
      healthStatus.status = 'unhealthy';
    }

    const statusCode = healthStatus.status === 'healthy' ? 200 : 
                      healthStatus.status === 'degraded' ? 206 : 503;

    res.status(statusCode).json({
      success: true,
      data: healthStatus,
      timestamp: new Date().toISOString(),
      requestId: req.id
    });

  } catch (error) {
    res.status(503).json({
      success: false,
      error: 'Health check failed',
      message: error.message,
      status: 'unhealthy',
      requestId: req.id,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;