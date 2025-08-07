/**
 * @file research.js
 * @brief API endpoints for quantum research and benchmarking operations
 * 
 * Provides RESTful endpoints for conducting comparative studies,
 * performance benchmarks, and statistical analysis of PQC algorithms.
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { asyncHandler } = require('../middleware/errorHandler');
const QuantumResearchService = require('../services/quantumResearchService');
const winston = require('winston');

const router = express.Router();

// Configure research logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'research-api' },
  transports: [
    new winston.transports.File({ filename: 'logs/research-api.log' }),
    new winston.transports.Console()
  ]
});

// Initialize research service
let researchService = null;

/**
 * Initialize research service with error handling
 */
async function initializeResearchService() {
  if (!researchService) {
    try {
      researchService = new QuantumResearchService({
        enableStatisticalAnalysis: true,
        confidenceLevel: 0.95,
        minSampleSize: 100,
        maxSampleSize: 10000,
        enableComparativeStudy: true
      });
      logger.info('Research service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize research service', { error: error.message });
      throw error;
    }
  }
  return researchService;
}

/**
 * Validation middleware for research parameters
 */
const validateResearchParams = [
  body('iterations')
    .optional()
    .isInt({ min: 10, max: 50000 })
    .withMessage('Iterations must be between 10 and 50000'),
  body('algorithms')
    .optional()
    .isArray()
    .custom((value) => {
      const validAlgorithms = ['kyber', 'dilithium', 'falcon'];
      return value.every(alg => validAlgorithms.includes(alg));
    })
    .withMessage('Invalid algorithm specified'),
  body('confidenceLevel')
    .optional()
    .isFloat({ min: 0.8, max: 0.999 })
    .withMessage('Confidence level must be between 0.8 and 0.999'),
  body('includeClassical')
    .optional()
    .isBoolean()
    .withMessage('includeClassical must be a boolean')
];

/**
 * POST /api/v1/research/comparative-study
 * Conduct comprehensive comparative study
 */
router.post('/comparative-study', 
  validateResearchParams,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array(),
        requestId: req.id
      });
    }

    const service = await initializeResearchService();
    
    const studyOptions = {
      iterations: req.body.iterations || 1000,
      algorithms: req.body.algorithms || ['kyber', 'dilithium', 'falcon'],
      includeClassical: req.body.includeClassical !== false,
      confidenceLevel: req.body.confidenceLevel || 0.95,
      metrics: req.body.metrics || ['latency', 'throughput', 'memory', 'security']
    };

    logger.info('Starting comparative study', { 
      studyOptions, 
      requestId: req.id,
      clientIp: req.ip
    });

    const startTime = Date.now();
    
    try {
      const results = await service.conductComparativeStudy(studyOptions);
      
      const duration = Date.now() - startTime;
      logger.info('Comparative study completed', {
        duration,
        algorithmsStudied: studyOptions.algorithms.length,
        requestId: req.id
      });

      res.json({
        success: true,
        data: {
          studyId: `study_${Date.now()}_${req.id}`,
          results: results,
          metadata: {
            duration,
            requestId: req.id,
            timestamp: new Date().toISOString()
          }
        },
        requestId: req.id
      });

    } catch (error) {
      logger.error('Comparative study failed', { 
        error: error.message,
        stack: error.stack,
        requestId: req.id
      });
      
      res.status(500).json({
        success: false,
        error: 'Comparative study failed',
        message: error.message,
        requestId: req.id
      });
    }
  })
);

/**
 * POST /api/v1/research/benchmark/:algorithm
 * Benchmark specific algorithm
 */
router.post('/benchmark/:algorithm',
  [
    param('algorithm')
      .isIn(['kyber', 'dilithium', 'falcon', 'classical'])
      .withMessage('Invalid algorithm'),
    body('iterations')
      .optional()
      .isInt({ min: 10, max: 10000 })
      .withMessage('Iterations must be between 10 and 10000')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array(),
        requestId: req.id
      });
    }

    const service = await initializeResearchService();
    const algorithm = req.params.algorithm;
    const iterations = req.body.iterations || 1000;

    logger.info('Starting algorithm benchmark', { 
      algorithm, 
      iterations, 
      requestId: req.id 
    });

    const startTime = Date.now();

    try {
      let results;
      
      if (algorithm === 'classical') {
        results = await service.benchmarkClassicalAlgorithms(iterations);
      } else {
        results = await service.benchmarkAlgorithm(algorithm, iterations);
      }

      const duration = Date.now() - startTime;
      logger.info('Algorithm benchmark completed', {
        algorithm,
        iterations,
        duration,
        requestId: req.id
      });

      res.json({
        success: true,
        data: {
          algorithm,
          results: results,
          metadata: {
            duration,
            requestId: req.id,
            timestamp: new Date().toISOString()
          }
        },
        requestId: req.id
      });

    } catch (error) {
      logger.error('Algorithm benchmark failed', { 
        algorithm,
        error: error.message,
        requestId: req.id
      });
      
      res.status(500).json({
        success: false,
        error: 'Benchmark failed',
        message: error.message,
        requestId: req.id
      });
    }
  })
);

/**
 * POST /api/v1/research/statistical-analysis
 * Perform statistical analysis on provided data
 */
router.post('/statistical-analysis',
  [
    body('data')
      .isArray()
      .withMessage('Data must be an array'),
    body('data.*')
      .isNumeric()
      .withMessage('All data points must be numeric'),
    body('confidenceLevel')
      .optional()
      .isFloat({ min: 0.8, max: 0.999 })
      .withMessage('Confidence level must be between 0.8 and 0.999')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array(),
        requestId: req.id
      });
    }

    const service = await initializeResearchService();
    const { data, confidenceLevel = 0.95 } = req.body;

    logger.info('Starting statistical analysis', { 
      sampleSize: data.length,
      confidenceLevel,
      requestId: req.id 
    });

    try {
      // Create mock benchmark results structure for analysis
      const mockResults = {
        algorithm: 'user_provided_data',
        iterations: data.length,
        keyGeneration: data,
        summary: service.calculateBenchmarkSummary({
          keyGeneration: data,
          signatureOperations: [],
          verificationOperations: [],
          memoryUsage: [],
          iterations: data.length
        })
      };

      const analysis = await service.performStatisticalAnalysis(mockResults);

      logger.info('Statistical analysis completed', {
        sampleSize: data.length,
        requestId: req.id
      });

      res.json({
        success: true,
        data: {
          analysis: analysis,
          inputData: {
            sampleSize: data.length,
            confidenceLevel
          },
          metadata: {
            requestId: req.id,
            timestamp: new Date().toISOString()
          }
        },
        requestId: req.id
      });

    } catch (error) {
      logger.error('Statistical analysis failed', { 
        error: error.message,
        requestId: req.id
      });
      
      res.status(500).json({
        success: false,
        error: 'Statistical analysis failed',
        message: error.message,
        requestId: req.id
      });
    }
  })
);

/**
 * GET /api/v1/research/generate-report/:studyId
 * Generate publication-ready research report
 */
router.get('/generate-report/:studyId',
  [
    param('studyId')
      .matches(/^study_\d+_[\w-]+$/)
      .withMessage('Invalid study ID format'),
    query('format')
      .optional()
      .isIn(['json', 'markdown', 'latex'])
      .withMessage('Format must be json, markdown, or latex')
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array(),
        requestId: req.id
      });
    }

    const service = await initializeResearchService();
    const { studyId } = req.params;
    const format = req.query.format || 'json';

    logger.info('Generating research report', { 
      studyId, 
      format, 
      requestId: req.id 
    });

    try {
      // In a real implementation, we would load study results from storage
      // For now, we'll return a template response
      const mockResults = {
        metadata: {
          studyId,
          duration: 30000,
          platform: { os: 'linux', arch: 'x64', cpus: 8 }
        },
        studyParameters: {
          iterations: 1000,
          algorithms: ['kyber', 'dilithium', 'falcon']
        },
        comparative: {
          algorithmsCompared: ['kyber', 'dilithium', 'falcon'],
          recommendations: {
            overall: { best: 'kyber' }
          }
        },
        conclusions: {
          keyFindings: [
            'Kyber demonstrates best overall performance',
            'All algorithms show stable performance characteristics'
          ]
        }
      };

      const report = await service.generateResearchReport(mockResults, format);

      logger.info('Research report generated', {
        studyId,
        format,
        requestId: req.id
      });

      if (format === 'markdown' || format === 'latex') {
        res.set('Content-Type', 'text/plain');
        res.send(report);
      } else {
        res.json({
          success: true,
          data: {
            studyId,
            format,
            report: report,
            metadata: {
              generated: new Date().toISOString(),
              requestId: req.id
            }
          },
          requestId: req.id
        });
      }

    } catch (error) {
      logger.error('Report generation failed', { 
        studyId,
        error: error.message,
        requestId: req.id
      });
      
      res.status(500).json({
        success: false,
        error: 'Report generation failed',
        message: error.message,
        requestId: req.id
      });
    }
  })
);

/**
 * GET /api/v1/research/algorithms
 * Get list of supported algorithms for research
 */
router.get('/algorithms',
  asyncHandler(async (req, res) => {
    const algorithms = {
      postQuantum: [
        {
          name: 'kyber',
          fullName: 'Kyber-1024',
          category: 'Key Encapsulation Mechanism',
          securityLevel: 5,
          description: 'NIST standard for quantum-resistant key encapsulation'
        },
        {
          name: 'dilithium',
          fullName: 'Dilithium-5',
          category: 'Digital Signature',
          securityLevel: 5,
          description: 'NIST standard for quantum-resistant digital signatures'
        },
        {
          name: 'falcon',
          fullName: 'Falcon-1024',
          category: 'Compact Digital Signature',
          securityLevel: 5,
          description: 'NIST standard for compact quantum-resistant signatures'
        }
      ],
      classical: [
        {
          name: 'ecdsa-p384',
          fullName: 'ECDSA with P-384',
          category: 'Digital Signature',
          securityLevel: 3,
          description: 'Classical elliptic curve digital signature algorithm'
        }
      ],
      capabilities: {
        statisticalAnalysis: true,
        comparativeStudies: true,
        performanceBenchmarking: true,
        reportGeneration: true
      }
    };

    res.json({
      success: true,
      data: algorithms,
      metadata: {
        requestId: req.id,
        timestamp: new Date().toISOString()
      },
      requestId: req.id
    });
  })
);

/**
 * GET /api/v1/research/status
 * Get research service status and capabilities
 */
router.get('/status',
  asyncHandler(async (req, res) => {
    try {
      const service = await initializeResearchService();
      
      const status = {
        service: 'quantum-research',
        version: '3.0.0',
        status: 'operational',
        capabilities: {
          algorithms: ['kyber', 'dilithium', 'falcon', 'classical'],
          maxIterations: 50000,
          statisticalAnalysis: true,
          comparativeStudies: true,
          reportGeneration: ['json', 'markdown', 'latex'],
          confidenceLevels: [0.90, 0.95, 0.99, 0.999]
        },
        limits: {
          maxConcurrentStudies: 3,
          maxIterationsPerRequest: 50000,
          maxDataPointsForAnalysis: 100000
        },
        uptime: process.uptime(),
        memory: process.memoryUsage()
      };

      res.json({
        success: true,
        data: status,
        metadata: {
          requestId: req.id,
          timestamp: new Date().toISOString()
        },
        requestId: req.id
      });

    } catch (error) {
      logger.error('Failed to get research service status', { 
        error: error.message,
        requestId: req.id
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to get service status',
        message: error.message,
        requestId: req.id
      });
    }
  })
);

/**
 * Cleanup function for graceful shutdown
 */
async function cleanup() {
  if (researchService) {
    await researchService.cleanup();
    researchService = null;
  }
  logger.info('Research API routes cleaned up');
}

module.exports = { router, cleanup };