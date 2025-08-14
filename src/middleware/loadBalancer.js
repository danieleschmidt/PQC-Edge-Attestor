/**
 * @file loadBalancer.js
 * @brief Advanced load balancing and service mesh for Generation 3 scalability
 */

const winston = require('winston');
const { EventEmitter } = require('events');

// Load balancer logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/loadbalancer.log' }),
        new winston.transports.Console()
    ]
});

class ServiceRegistry extends EventEmitter {
    constructor() {
        super();
        this.services = new Map();
        this.healthStatus = new Map();
        
        // Periodic health check
        setInterval(() => this.performHealthChecks(), 10000);
    }

    registerService(name, instances) {
        if (!this.services.has(name)) {
            this.services.set(name, []);
            this.healthStatus.set(name, new Map());
        }

        const serviceInstances = this.services.get(name);
        const healthMap = this.healthStatus.get(name);

        instances.forEach(instance => {
            const existingIndex = serviceInstances.findIndex(s => s.id === instance.id);
            if (existingIndex >= 0) {
                serviceInstances[existingIndex] = instance;
            } else {
                serviceInstances.push(instance);
            }
            
            healthMap.set(instance.id, {
                healthy: true,
                lastCheck: Date.now(),
                responseTime: 0,
                errorCount: 0
            });
        });

        logger.info(`Service '${name}' registered with ${instances.length} instances`);
        this.emit('serviceRegistered', { name, instances });
    }

    deregisterService(name, instanceId) {
        const serviceInstances = this.services.get(name);
        const healthMap = this.healthStatus.get(name);

        if (serviceInstances && healthMap) {
            const index = serviceInstances.findIndex(s => s.id === instanceId);
            if (index >= 0) {
                serviceInstances.splice(index, 1);
                healthMap.delete(instanceId);
                logger.info(`Instance '${instanceId}' deregistered from service '${name}'`);
                this.emit('instanceDeregistered', { name, instanceId });
            }
        }
    }

    getHealthyInstances(serviceName) {
        const instances = this.services.get(serviceName) || [];
        const healthMap = this.healthStatus.get(serviceName) || new Map();

        return instances.filter(instance => {
            const health = healthMap.get(instance.id);
            return health && health.healthy;
        });
    }

    async performHealthChecks() {
        for (const [serviceName, instances] of this.services) {
            const healthMap = this.healthStatus.get(serviceName);

            for (const instance of instances) {
                try {
                    const startTime = Date.now();
                    const isHealthy = await this.checkInstanceHealth(instance);
                    const responseTime = Date.now() - startTime;

                    const currentHealth = healthMap.get(instance.id);
                    healthMap.set(instance.id, {
                        healthy: isHealthy,
                        lastCheck: Date.now(),
                        responseTime,
                        errorCount: isHealthy ? Math.max(0, currentHealth.errorCount - 1) : currentHealth.errorCount + 1
                    });

                    if (!isHealthy && currentHealth.healthy) {
                        logger.warn(`Instance '${instance.id}' marked as unhealthy`);
                        this.emit('instanceUnhealthy', { serviceName, instance });
                    } else if (isHealthy && !currentHealth.healthy) {
                        logger.info(`Instance '${instance.id}' recovered`);
                        this.emit('instanceRecovered', { serviceName, instance });
                    }

                } catch (error) {
                    const currentHealth = healthMap.get(instance.id);
                    healthMap.set(instance.id, {
                        ...currentHealth,
                        healthy: false,
                        lastCheck: Date.now(),
                        errorCount: currentHealth.errorCount + 1
                    });
                }
            }
        }
    }

    async checkInstanceHealth(instance) {
        // Simple HTTP health check
        if (instance.healthCheck) {
            try {
                return await instance.healthCheck();
            } catch (error) {
                return false;
            }
        }

        // Default: assume healthy if no health check defined
        return true;
    }

    getServiceMetrics(serviceName) {
        const instances = this.services.get(serviceName) || [];
        const healthMap = this.healthStatus.get(serviceName) || new Map();

        const metrics = {
            totalInstances: instances.length,
            healthyInstances: 0,
            averageResponseTime: 0,
            totalErrors: 0
        };

        let totalResponseTime = 0;
        let validResponseTimes = 0;

        instances.forEach(instance => {
            const health = healthMap.get(instance.id);
            if (health) {
                if (health.healthy) metrics.healthyInstances++;
                if (health.responseTime > 0) {
                    totalResponseTime += health.responseTime;
                    validResponseTimes++;
                }
                metrics.totalErrors += health.errorCount;
            }
        });

        if (validResponseTimes > 0) {
            metrics.averageResponseTime = Math.round(totalResponseTime / validResponseTimes);
        }

        return metrics;
    }
}

class LoadBalancer {
    constructor(strategy = 'round-robin') {
        this.strategy = strategy;
        this.registry = new ServiceRegistry();
        this.roundRobinCounters = new Map();
        this.metrics = new Map();

        // Setup event listeners
        this.registry.on('instanceUnhealthy', ({ serviceName, instance }) => {
            this.recordFailure(serviceName, instance.id);
        });
    }

    registerService(name, instances) {
        this.registry.registerService(name, instances);
        if (!this.roundRobinCounters.has(name)) {
            this.roundRobinCounters.set(name, 0);
        }
    }

    async selectInstance(serviceName, requestContext = {}) {
        const healthyInstances = this.registry.getHealthyInstances(serviceName);
        
        if (healthyInstances.length === 0) {
            throw new Error(`No healthy instances available for service '${serviceName}'`);
        }

        let selectedInstance;

        switch (this.strategy) {
            case 'round-robin':
                selectedInstance = this.roundRobinSelection(serviceName, healthyInstances);
                break;
            case 'least-connections':
                selectedInstance = this.leastConnectionsSelection(healthyInstances);
                break;
            case 'weighted-round-robin':
                selectedInstance = this.weightedRoundRobinSelection(serviceName, healthyInstances);
                break;
            case 'ip-hash':
                selectedInstance = this.ipHashSelection(healthyInstances, requestContext.clientIp);
                break;
            case 'least-response-time':
                selectedInstance = this.leastResponseTimeSelection(serviceName, healthyInstances);
                break;
            default:
                selectedInstance = healthyInstances[0];
        }

        this.recordSelection(serviceName, selectedInstance.id);
        return selectedInstance;
    }

    roundRobinSelection(serviceName, instances) {
        const counter = this.roundRobinCounters.get(serviceName);
        const index = counter % instances.length;
        this.roundRobinCounters.set(serviceName, counter + 1);
        return instances[index];
    }

    leastConnectionsSelection(instances) {
        // Sort by current connections (mock implementation)
        return instances.reduce((least, current) => {
            const leastConnections = least.currentConnections || 0;
            const currentConnections = current.currentConnections || 0;
            return currentConnections < leastConnections ? current : least;
        });
    }

    weightedRoundRobinSelection(serviceName, instances) {
        // Implement weighted selection based on instance weights
        const totalWeight = instances.reduce((sum, instance) => sum + (instance.weight || 1), 0);
        let counter = this.roundRobinCounters.get(serviceName);
        
        for (const instance of instances) {
            const weight = instance.weight || 1;
            if (counter < weight) {
                this.roundRobinCounters.set(serviceName, counter + 1);
                return instance;
            }
            counter -= weight;
        }

        // Reset and select first
        this.roundRobinCounters.set(serviceName, 1);
        return instances[0];
    }

    ipHashSelection(instances, clientIp) {
        if (!clientIp) return instances[0];
        
        // Simple hash function for IP
        const hash = clientIp.split('.').reduce((acc, octet) => acc + parseInt(octet), 0);
        const index = hash % instances.length;
        return instances[index];
    }

    leastResponseTimeSelection(serviceName, instances) {
        const healthMap = this.registry.healthStatus.get(serviceName) || new Map();
        
        return instances.reduce((fastest, current) => {
            const fastestTime = healthMap.get(fastest.id)?.responseTime || Infinity;
            const currentTime = healthMap.get(current.id)?.responseTime || Infinity;
            return currentTime < fastestTime ? current : fastest;
        });
    }

    recordSelection(serviceName, instanceId) {
        const serviceMetrics = this.metrics.get(serviceName) || {
            totalRequests: 0,
            instanceRequests: new Map()
        };

        serviceMetrics.totalRequests++;
        const instanceRequests = serviceMetrics.instanceRequests.get(instanceId) || 0;
        serviceMetrics.instanceRequests.set(instanceId, instanceRequests + 1);
        this.metrics.set(serviceName, serviceMetrics);
    }

    recordFailure(serviceName, instanceId) {
        const serviceMetrics = this.metrics.get(serviceName) || {
            totalRequests: 0,
            instanceRequests: new Map(),
            instanceFailures: new Map()
        };

        const instanceFailures = serviceMetrics.instanceFailures?.get(instanceId) || 0;
        if (!serviceMetrics.instanceFailures) {
            serviceMetrics.instanceFailures = new Map();
        }
        serviceMetrics.instanceFailures.set(instanceId, instanceFailures + 1);
        this.metrics.set(serviceName, serviceMetrics);
    }

    getLoadBalancerMetrics() {
        const metrics = {};
        
        for (const [serviceName] of this.metrics) {
            metrics[serviceName] = {
                ...this.registry.getServiceMetrics(serviceName),
                loadBalancing: this.metrics.get(serviceName)
            };
        }

        return metrics;
    }

    // Express middleware for load balancing
    middleware(serviceName, options = {}) {
        return async (req, res, next) => {
            try {
                const requestContext = {
                    clientIp: req.ip,
                    userAgent: req.get('User-Agent'),
                    path: req.path
                };

                const instance = await this.selectInstance(serviceName, requestContext);
                req.selectedInstance = instance;
                req.serviceName = serviceName;
                
                // Add instance info to response headers
                res.setHeader('X-Selected-Instance', instance.id);
                res.setHeader('X-Load-Balancer-Strategy', this.strategy);
                
                next();
            } catch (error) {
                logger.error(`Load balancing failed for service '${serviceName}'`, { error: error.message });
                next(error);
            }
        };
    }
}

// Auto-scaling controller
class AutoScaler {
    constructor(loadBalancer) {
        this.loadBalancer = loadBalancer;
        this.scalingPolicies = new Map();
        this.scalingHistory = new Map();
        
        // Monitor for scaling decisions
        setInterval(() => this.evaluateScaling(), 30000); // Every 30 seconds
    }

    addScalingPolicy(serviceName, policy) {
        const defaultPolicy = {
            minInstances: 1,
            maxInstances: 10,
            targetUtilization: 70, // %
            scaleUpThreshold: 80, // %
            scaleDownThreshold: 30, // %
            cooldownPeriod: 300000, // 5 minutes
            scaleUpBy: 1,
            scaleDownBy: 1
        };

        this.scalingPolicies.set(serviceName, { ...defaultPolicy, ...policy });
        this.scalingHistory.set(serviceName, []);
        
        logger.info(`Auto-scaling policy configured for service '${serviceName}'`, policy);
    }

    async evaluateScaling() {
        for (const [serviceName, policy] of this.scalingPolicies) {
            try {
                await this.evaluateServiceScaling(serviceName, policy);
            } catch (error) {
                logger.error(`Scaling evaluation failed for '${serviceName}'`, { error: error.message });
            }
        }
    }

    async evaluateServiceScaling(serviceName, policy) {
        const metrics = this.loadBalancer.registry.getServiceMetrics(serviceName);
        const history = this.scalingHistory.get(serviceName);
        
        // Check cooldown period
        const lastScaling = history[history.length - 1];
        if (lastScaling && (Date.now() - lastScaling.timestamp) < policy.cooldownPeriod) {
            return;
        }

        // Calculate utilization
        const utilization = metrics.healthyInstances > 0 ? 
            (metrics.totalRequests / metrics.healthyInstances) : 0;
        
        let scalingDecision = null;

        // Scale up decision
        if (utilization > policy.scaleUpThreshold && 
            metrics.healthyInstances < policy.maxInstances) {
            scalingDecision = {
                action: 'scale-up',
                currentInstances: metrics.healthyInstances,
                targetInstances: Math.min(
                    metrics.healthyInstances + policy.scaleUpBy,
                    policy.maxInstances
                ),
                reason: `High utilization: ${utilization}%`,
                timestamp: Date.now()
            };
        }
        // Scale down decision
        else if (utilization < policy.scaleDownThreshold && 
                 metrics.healthyInstances > policy.minInstances) {
            scalingDecision = {
                action: 'scale-down',
                currentInstances: metrics.healthyInstances,
                targetInstances: Math.max(
                    metrics.healthyInstances - policy.scaleDownBy,
                    policy.minInstances
                ),
                reason: `Low utilization: ${utilization}%`,
                timestamp: Date.now()
            };
        }

        if (scalingDecision) {
            logger.info(`Auto-scaling decision for '${serviceName}'`, scalingDecision);
            history.push(scalingDecision);
            
            // Emit scaling event for external handling
            this.loadBalancer.registry.emit('autoScaling', { serviceName, decision: scalingDecision });
        }
    }

    getScalingMetrics() {
        const metrics = {};
        
        for (const [serviceName, policy] of this.scalingPolicies) {
            const history = this.scalingHistory.get(serviceName);
            metrics[serviceName] = {
                policy,
                recentScalingEvents: history.slice(-10), // Last 10 events
                totalScalingEvents: history.length
            };
        }

        return metrics;
    }
}

// Global instances
const loadBalancer = new LoadBalancer();
const autoScaler = new AutoScaler(loadBalancer);

module.exports = {
    LoadBalancer,
    ServiceRegistry,
    AutoScaler,
    loadBalancer,
    autoScaler
};