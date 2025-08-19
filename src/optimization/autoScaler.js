/**
 * @file autoScaler.js
 * @brief Intelligent auto-scaling system for Generation 3 performance optimization
 * 
 * Implements dynamic resource scaling based on load patterns, predictive analytics,
 * and performance metrics to ensure optimal resource utilization.
 */

const EventEmitter = require('events');
const { CircuitBreaker } = require('../middleware/circuitBreaker');

/**
 * Scaling strategies
 */
const SCALING_STRATEGIES = {
    REACTIVE: 'reactive',           // React to current load
    PREDICTIVE: 'predictive',       // Predict future load
    HYBRID: 'hybrid',               // Combine reactive and predictive
    ADAPTIVE: 'adaptive'            // Learn from patterns
};

/**
 * Resource types
 */
const RESOURCE_TYPES = {
    CPU: 'cpu',
    MEMORY: 'memory',
    CRYPTO_WORKERS: 'crypto_workers',
    CACHE_SIZE: 'cache_size',
    CONNECTION_POOL: 'connection_pool'
};

/**
 * @class AutoScaler
 * @brief Intelligent auto-scaling system for dynamic resource management
 */
class AutoScaler extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            // Scaling configuration
            strategy: options.strategy || SCALING_STRATEGIES.HYBRID,
            
            // Thresholds
            scaleUpThreshold: options.scaleUpThreshold || 0.75,
            scaleDownThreshold: options.scaleDownThreshold || 0.30,
            
            // Timing
            evaluationInterval: options.evaluationInterval || 30000, // 30 seconds
            cooldownPeriod: options.cooldownPeriod || 120000, // 2 minutes
            predictionWindow: options.predictionWindow || 300000, // 5 minutes
            
            // Limits
            minInstances: options.minInstances || 1,
            maxInstances: options.maxInstances || 10,
            maxScaleUpStep: options.maxScaleUpStep || 2,
            maxScaleDownStep: options.maxScaleDownStep || 1,
            
            // Learning parameters
            learningRate: options.learningRate || 0.1,
            historyWindow: options.historyWindow || 3600000, // 1 hour
            
            // Circuit breaker integration
            enableCircuitBreaker: options.enableCircuitBreaker !== false,
            
            ...options
        };

        // Current state
        this.resources = new Map();
        this.lastScaleAction = new Map();
        this.metrics = [];
        this.predictions = new Map();
        
        // Learning system
        this.patterns = new Map();
        this.seasonality = new Map();
        
        // Performance tracking
        this.stats = {
            scaleUpActions: 0,
            scaleDownActions: 0,
            predictionAccuracy: 0,
            avgResponseTime: 0,
            totalDecisions: 0,
            correctDecisions: 0
        };

        // Circuit breakers for each resource type
        this.circuitBreakers = new Map();
        
        if (this.options.enableCircuitBreaker) {
            this._initializeCircuitBreakers();
        }

        // Initialize default resources
        this._initializeResources();

        // Start monitoring
        this.evaluationTimer = setInterval(() => {
            this._evaluate();
        }, this.options.evaluationInterval);

        this.emit('initialized', {
            strategy: this.options.strategy,
            resources: Array.from(this.resources.keys())
        });
    }

    /**
     * Register a resource for auto-scaling
     */
    registerResource(type, config) {
        const resource = {
            type,
            current: config.initial || config.min,
            min: config.min,
            max: config.max,
            stepSize: config.stepSize || 1,
            costPerUnit: config.costPerUnit || 1,
            scaleFunction: config.scaleFunction,
            metricExtractor: config.metricExtractor,
            enabled: config.enabled !== false,
            lastAction: null,
            performance: {
                efficiency: 1.0,
                utilization: 0.0,
                responseTime: 0.0
            }
        };

        this.resources.set(type, resource);
        this.lastScaleAction.set(type, 0);

        this.emit('resourceRegistered', { type, config: resource });
    }

    /**
     * Update metrics for scaling decisions
     */
    updateMetrics(metrics) {
        const timestamp = Date.now();
        const entry = {
            timestamp,
            ...metrics
        };

        this.metrics.push(entry);

        // Maintain sliding window
        const cutoff = timestamp - this.options.historyWindow;
        this.metrics = this.metrics.filter(m => m.timestamp > cutoff);

        // Update resource performance metrics
        this._updateResourceMetrics(metrics);

        // Trigger learning update
        this._updatePatterns(entry);

        this.emit('metricsUpdated', { entry, totalMetrics: this.metrics.length });
    }

    /**
     * Manual scaling trigger
     */
    async scaleResource(type, targetLevel, reason = 'manual') {
        const resource = this.resources.get(type);
        if (!resource) {
            throw new Error(`Resource type ${type} not registered`);
        }

        if (!resource.enabled) {
            this.emit('scalingSkipped', { type, reason: 'disabled' });
            return false;
        }

        const clamped = Math.max(resource.min, Math.min(resource.max, targetLevel));
        
        if (clamped === resource.current) {
            return true; // Already at target
        }

        try {
            const success = await this._executeScaling(type, clamped, reason);
            
            if (success) {
                this.emit('manualScaling', { 
                    type, 
                    from: resource.current, 
                    to: clamped, 
                    reason 
                });
            }

            return success;

        } catch (error) {
            this.emit('scalingError', { type, targetLevel, error: error.message });
            return false;
        }
    }

    /**
     * Get current scaling status
     */
    getStatus() {
        const resources = {};
        
        for (const [type, resource] of this.resources) {
            resources[type] = {
                current: resource.current,
                min: resource.min,
                max: resource.max,
                utilization: resource.performance.utilization,
                efficiency: resource.performance.efficiency,
                lastAction: resource.lastAction,
                enabled: resource.enabled
            };
        }

        const recentMetrics = this.metrics.slice(-10);
        const avgLoad = recentMetrics.length > 0 
            ? recentMetrics.reduce((sum, m) => sum + (m.cpuUsage || 0), 0) / recentMetrics.length
            : 0;

        return {
            strategy: this.options.strategy,
            resources,
            metrics: {
                avgLoad,
                metricsCount: this.metrics.length,
                predictionAccuracy: this.stats.predictionAccuracy
            },
            stats: this.stats,
            predictions: Object.fromEntries(this.predictions)
        };
    }

    /**
     * Get scaling recommendations
     */
    getRecommendations() {
        const recommendations = [];
        const currentTime = Date.now();

        for (const [type, resource] of this.resources) {
            if (!resource.enabled) continue;

            const recommendation = this._analyzeResource(type, resource);
            
            if (recommendation.action !== 'none') {
                recommendations.push({
                    type,
                    action: recommendation.action,
                    confidence: recommendation.confidence,
                    reason: recommendation.reason,
                    estimatedBenefit: recommendation.estimatedBenefit,
                    cost: recommendation.cost
                });
            }
        }

        return recommendations.sort((a, b) => b.estimatedBenefit - a.estimatedBenefit);
    }

    // Private methods

    _initializeResources() {
        // Register default resources
        this.registerResource(RESOURCE_TYPES.CPU, {
            initial: 2,
            min: 1,
            max: 8,
            stepSize: 1,
            costPerUnit: 0.10,
            scaleFunction: this._scaleCPU.bind(this),
            metricExtractor: (metrics) => metrics.cpuUsage
        });

        this.registerResource(RESOURCE_TYPES.MEMORY, {
            initial: 4096, // MB
            min: 2048,
            max: 16384,
            stepSize: 1024,
            costPerUnit: 0.05,
            scaleFunction: this._scaleMemory.bind(this),
            metricExtractor: (metrics) => metrics.memoryUsage
        });

        this.registerResource(RESOURCE_TYPES.CRYPTO_WORKERS, {
            initial: 4,
            min: 2,
            max: 16,
            stepSize: 2,
            costPerUnit: 0.20,
            scaleFunction: this._scaleCryptoWorkers.bind(this),
            metricExtractor: (metrics) => metrics.cryptoQueueLength
        });
    }

    _initializeCircuitBreakers() {
        for (const type of Object.values(RESOURCE_TYPES)) {
            this.circuitBreakers.set(type, new CircuitBreaker({
                serviceName: `auto-scaler-${type}`,
                failureThreshold: 3,
                timeout: 30000
            }));
        }
    }

    async _evaluate() {
        const currentTime = Date.now();
        
        try {
            // Get recent metrics for analysis
            const recentMetrics = this._getRecentMetrics();
            
            if (recentMetrics.length < 3) {
                return; // Need more data
            }

            // Generate predictions if using predictive strategy
            if (this.options.strategy === SCALING_STRATEGIES.PREDICTIVE || 
                this.options.strategy === SCALING_STRATEGIES.HYBRID) {
                this._generatePredictions();
            }

            // Evaluate each resource
            for (const [type, resource] of this.resources) {
                if (!resource.enabled) continue;
                
                // Check cooldown period
                const lastAction = this.lastScaleAction.get(type) || 0;
                if (currentTime - lastAction < this.options.cooldownPeriod) {
                    continue;
                }

                await this._evaluateResource(type, resource, recentMetrics);
            }

        } catch (error) {
            this.emit('evaluationError', { error: error.message });
        }
    }

    async _evaluateResource(type, resource, recentMetrics) {
        const analysis = this._analyzeResource(type, resource);
        
        if (analysis.action === 'none') {
            return;
        }

        const decision = this._makeScalingDecision(type, resource, analysis);
        
        if (decision.shouldScale) {
            try {
                const success = await this._executeScaling(type, decision.targetLevel, analysis.reason);
                
                if (success) {
                    this.stats.totalDecisions++;
                    if (decision.confident) {
                        this.stats.correctDecisions++;
                    }
                }

            } catch (error) {
                this.emit('scalingError', { type, error: error.message });
            }
        }
    }

    _analyzeResource(type, resource) {
        const recentMetrics = this._getRecentMetrics();
        const currentUtilization = resource.performance.utilization;
        
        let action = 'none';
        let confidence = 0;
        let reason = '';
        let estimatedBenefit = 0;
        let cost = 0;

        // Reactive analysis
        if (currentUtilization > this.options.scaleUpThreshold) {
            action = 'scale_up';
            confidence = Math.min((currentUtilization - this.options.scaleUpThreshold) / 0.25, 1.0);
            reason = `High utilization: ${(currentUtilization * 100).toFixed(1)}%`;
            estimatedBenefit = this._estimateScaleUpBenefit(type, resource);
            cost = resource.costPerUnit * resource.stepSize;
            
        } else if (currentUtilization < this.options.scaleDownThreshold) {
            action = 'scale_down';
            confidence = Math.min((this.options.scaleDownThreshold - currentUtilization) / 0.25, 1.0);
            reason = `Low utilization: ${(currentUtilization * 100).toFixed(1)}%`;
            estimatedBenefit = resource.costPerUnit * resource.stepSize; // Cost savings
            cost = this._estimateScaleDownRisk(type, resource);
        }

        // Predictive analysis adjustment
        if (this.options.strategy === SCALING_STRATEGIES.PREDICTIVE || 
            this.options.strategy === SCALING_STRATEGIES.HYBRID) {
            
            const prediction = this.predictions.get(type);
            if (prediction) {
                const predictiveAdjustment = this._adjustForPrediction(action, prediction);
                confidence = Math.max(confidence, predictiveAdjustment.confidence);
                
                if (predictiveAdjustment.override) {
                    action = predictiveAdjustment.action;
                    reason += ` (predictive: ${predictiveAdjustment.reason})`;
                }
            }
        }

        return { action, confidence, reason, estimatedBenefit, cost };
    }

    _makeScalingDecision(type, resource, analysis) {
        let targetLevel = resource.current;
        let shouldScale = false;
        let confident = analysis.confidence > 0.7;

        if (analysis.action === 'scale_up' && resource.current < resource.max) {
            const stepSize = Math.min(resource.stepSize, this.options.maxScaleUpStep);
            targetLevel = Math.min(resource.current + stepSize, resource.max);
            shouldScale = analysis.confidence > 0.5; // Lower threshold for scale up
            
        } else if (analysis.action === 'scale_down' && resource.current > resource.min) {
            const stepSize = Math.min(resource.stepSize, this.options.maxScaleDownStep);
            targetLevel = Math.max(resource.current - stepSize, resource.min);
            shouldScale = analysis.confidence > 0.7; // Higher threshold for scale down
        }

        return { shouldScale, targetLevel, confident };
    }

    async _executeScaling(type, targetLevel, reason) {
        const resource = this.resources.get(type);
        const circuitBreaker = this.circuitBreakers.get(type);

        try {
            let success = true;

            if (circuitBreaker && this.options.enableCircuitBreaker) {
                success = await circuitBreaker.execute(async () => {
                    return await resource.scaleFunction(targetLevel);
                });
            } else {
                success = await resource.scaleFunction(targetLevel);
            }

            if (success) {
                const previousLevel = resource.current;
                resource.current = targetLevel;
                resource.lastAction = {
                    timestamp: Date.now(),
                    from: previousLevel,
                    to: targetLevel,
                    reason
                };

                this.lastScaleAction.set(type, Date.now());

                if (targetLevel > previousLevel) {
                    this.stats.scaleUpActions++;
                } else {
                    this.stats.scaleDownActions++;
                }

                this.emit('scaled', {
                    type,
                    from: previousLevel,
                    to: targetLevel,
                    reason
                });
            }

            return success;

        } catch (error) {
            this.emit('scalingError', { type, targetLevel, error: error.message });
            return false;
        }
    }

    // Resource-specific scaling functions
    async _scaleCPU(targetLevel) {
        // Simulate CPU scaling
        await this._simulateDelay(1000);
        this.emit('cpuScaled', { targetLevel });
        return true;
    }

    async _scaleMemory(targetLevel) {
        // Simulate memory scaling
        await this._simulateDelay(500);
        this.emit('memoryScaled', { targetLevel });
        return true;
    }

    async _scaleCryptoWorkers(targetLevel) {
        // Simulate crypto worker scaling
        await this._simulateDelay(2000);
        this.emit('cryptoWorkersScaled', { targetLevel });
        return true;
    }

    // Analytics and prediction methods
    _getRecentMetrics() {
        const cutoff = Date.now() - this.options.predictionWindow;
        return this.metrics.filter(m => m.timestamp > cutoff);
    }

    _updateResourceMetrics(metrics) {
        for (const [type, resource] of this.resources) {
            if (resource.metricExtractor) {
                const value = resource.metricExtractor(metrics);
                if (typeof value === 'number') {
                    resource.performance.utilization = Math.max(0, Math.min(1, value));
                }
            }
        }
    }

    _updatePatterns(entry) {
        // Simple pattern learning - can be enhanced with ML
        const hour = new Date(entry.timestamp).getHours();
        const dayOfWeek = new Date(entry.timestamp).getDay();
        
        if (!this.patterns.has(hour)) {
            this.patterns.set(hour, []);
        }
        
        this.patterns.get(hour).push(entry);
        
        // Maintain pattern history
        if (this.patterns.get(hour).length > 100) {
            this.patterns.get(hour).shift();
        }
    }

    _generatePredictions() {
        const now = new Date();
        const currentHour = now.getHours();
        const nextHour = (currentHour + 1) % 24;
        
        for (const [type, resource] of this.resources) {
            if (!resource.metricExtractor) continue;
            
            const prediction = this._predictResourceUsage(type, nextHour);
            this.predictions.set(type, prediction);
        }
    }

    _predictResourceUsage(type, hour) {
        const historicalData = this.patterns.get(hour) || [];
        
        if (historicalData.length < 5) {
            return { usage: 0.5, confidence: 0.1 }; // Default prediction
        }

        const resource = this.resources.get(type);
        const usageValues = historicalData
            .map(entry => resource.metricExtractor(entry))
            .filter(val => typeof val === 'number');

        if (usageValues.length === 0) {
            return { usage: 0.5, confidence: 0.1 };
        }

        const avgUsage = usageValues.reduce((sum, val) => sum + val, 0) / usageValues.length;
        const variance = usageValues.reduce((sum, val) => sum + Math.pow(val - avgUsage, 2), 0) / usageValues.length;
        const confidence = Math.max(0.1, 1 - Math.sqrt(variance));

        return { usage: avgUsage, confidence };
    }

    _adjustForPrediction(currentAction, prediction) {
        if (prediction.confidence < 0.6) {
            return { override: false, confidence: 0 };
        }

        if (prediction.usage > this.options.scaleUpThreshold && currentAction !== 'scale_up') {
            return {
                override: true,
                action: 'scale_up',
                confidence: prediction.confidence,
                reason: 'predicted high load'
            };
        }

        if (prediction.usage < this.options.scaleDownThreshold && currentAction !== 'scale_down') {
            return {
                override: true,
                action: 'scale_down',
                confidence: prediction.confidence,
                reason: 'predicted low load'
            };
        }

        return { override: false, confidence: prediction.confidence };
    }

    _estimateScaleUpBenefit(type, resource) {
        // Estimate performance improvement from scaling up
        const currentUtil = resource.performance.utilization;
        const newUtil = currentUtil * (resource.current / (resource.current + resource.stepSize));
        
        return (currentUtil - newUtil) * 100; // Benefit score
    }

    _estimateScaleDownRisk(type, resource) {
        // Estimate risk of performance degradation from scaling down
        const currentUtil = resource.performance.utilization;
        const newUtil = currentUtil * (resource.current / (resource.current - resource.stepSize));
        
        return Math.max(0, newUtil - this.options.scaleUpThreshold) * 100; // Risk score
    }

    async _simulateDelay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        if (this.evaluationTimer) {
            clearInterval(this.evaluationTimer);
        }

        for (const circuitBreaker of this.circuitBreakers.values()) {
            if (circuitBreaker.cleanup) {
                circuitBreaker.cleanup();
            }
        }

        this.emit('cleanup-complete');
    }
}

module.exports = { AutoScaler, SCALING_STRATEGIES, RESOURCE_TYPES };