/**
 * @file monitoring.js
 * @brief Prometheus metrics and monitoring for Generation 2
 */

const promClient = require('prom-client');
const winston = require('winston');

// Create a Registry to register the metrics
const register = new promClient.Registry();

// Add default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics({
    register,
    prefix: 'pqc_attestor_',
});

// Custom metrics
const httpRequestDuration = new promClient.Histogram({
    name: 'pqc_http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
});

const httpRequestTotal = new promClient.Counter({
    name: 'pqc_http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code']
});

const pqcOperationsTotal = new promClient.Counter({
    name: 'pqc_operations_total',
    help: 'Total number of PQC operations',
    labelNames: ['operation', 'algorithm', 'status']
});

const pqcOperationDuration = new promClient.Histogram({
    name: 'pqc_operation_duration_seconds',
    help: 'Duration of PQC operations in seconds',
    labelNames: ['operation', 'algorithm'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});

const attestationReportsTotal = new promClient.Counter({
    name: 'pqc_attestation_reports_total',
    help: 'Total number of attestation reports',
    labelNames: ['device_type', 'status']
});

const deviceConnectionsActive = new promClient.Gauge({
    name: 'pqc_device_connections_active',
    help: 'Number of active device connections',
    labelNames: ['device_type']
});

const securityEventsTotal = new promClient.Counter({
    name: 'pqc_security_events_total',
    help: 'Total number of security events',
    labelNames: ['event_type', 'severity']
});

const rateLimitHitsTotal = new promClient.Counter({
    name: 'pqc_rate_limit_hits_total',
    help: 'Total number of rate limit hits',
    labelNames: ['endpoint', 'ip']
});

const errorRateGauge = new promClient.Gauge({
    name: 'pqc_error_rate_percent',
    help: 'Current error rate percentage',
    labelNames: ['endpoint']
});

// Register custom metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestTotal);
register.registerMetric(pqcOperationsTotal);
register.registerMetric(pqcOperationDuration);
register.registerMetric(attestationReportsTotal);
register.registerMetric(deviceConnectionsActive);
register.registerMetric(securityEventsTotal);
register.registerMetric(rateLimitHitsTotal);
register.registerMetric(errorRateGauge);

// Monitoring logger
const monitoringLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/monitoring.log' })
    ]
});

// HTTP metrics middleware
const httpMetricsMiddleware = (req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = (Date.now() - start) / 1000;
        const route = req.route ? req.route.path : req.path;
        const labels = {
            method: req.method,
            route: route,
            status_code: res.statusCode
        };
        
        httpRequestDuration.observe(labels, duration);
        httpRequestTotal.inc(labels);
        
        // Log slow requests
        if (duration > 5) {
            monitoringLogger.warn('Slow request detected', {
                method: req.method,
                url: req.originalUrl,
                duration: duration,
                statusCode: res.statusCode
            });
        }
    });
    
    next();
};

// PQC operation metrics
const recordPQCOperation = (operation, algorithm, duration, success = true) => {
    const status = success ? 'success' : 'failure';
    
    pqcOperationsTotal.inc({ operation, algorithm, status });
    pqcOperationDuration.observe({ operation, algorithm }, duration / 1000);
    
    monitoringLogger.info('PQC operation recorded', {
        operation,
        algorithm,
        duration,
        success
    });
};

// Attestation metrics
const recordAttestationReport = (deviceType, status) => {
    attestationReportsTotal.inc({ device_type: deviceType, status });
    
    monitoringLogger.info('Attestation report recorded', {
        deviceType,
        status
    });
};

// Security event metrics
const recordSecurityEvent = (eventType, severity) => {
    securityEventsTotal.inc({ event_type: eventType, severity });
    
    monitoringLogger.warn('Security event recorded', {
        eventType,
        severity,
        timestamp: new Date().toISOString()
    });
};

// Rate limit metrics
const recordRateLimitHit = (endpoint, ip) => {
    rateLimitHitsTotal.inc({ endpoint, ip });
    
    monitoringLogger.warn('Rate limit hit recorded', {
        endpoint,
        ip,
        timestamp: new Date().toISOString()
    });
};

// Device connection metrics
const updateActiveConnections = (deviceType, delta) => {
    deviceConnectionsActive.inc({ device_type: deviceType }, delta);
};

// Error rate calculation
const updateErrorRate = (endpoint, errorRate) => {
    errorRateGauge.set({ endpoint }, errorRate);
};

// Health check metrics
const healthCheckGauge = new promClient.Gauge({
    name: 'pqc_health_check_status',
    help: 'Health check status (1 = healthy, 0 = unhealthy)',
    labelNames: ['service']
});

register.registerMetric(healthCheckGauge);

const updateHealthStatus = (service, healthy) => {
    healthCheckGauge.set({ service }, healthy ? 1 : 0);
};

// System resource metrics
const cpuUsageGauge = new promClient.Gauge({
    name: 'pqc_cpu_usage_percent',
    help: 'CPU usage percentage'
});

const memoryUsageGauge = new promClient.Gauge({
    name: 'pqc_memory_usage_bytes',
    help: 'Memory usage in bytes',
    labelNames: ['type']
});

register.registerMetric(cpuUsageGauge);
register.registerMetric(memoryUsageGauge);

// Update system metrics periodically
const updateSystemMetrics = () => {
    const memoryUsage = process.memoryUsage();
    
    memoryUsageGauge.set({ type: 'heap_used' }, memoryUsage.heapUsed);
    memoryUsageGauge.set({ type: 'heap_total' }, memoryUsage.heapTotal);
    memoryUsageGauge.set({ type: 'external' }, memoryUsage.external);
    memoryUsageGauge.set({ type: 'rss' }, memoryUsage.rss);
    
    // CPU usage would require additional monitoring
    const cpuUsage = process.cpuUsage();
    const totalUsage = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
    cpuUsageGauge.set(totalUsage);
};

// Start system metrics collection
setInterval(updateSystemMetrics, 10000); // Every 10 seconds

// Metrics endpoint handler
const getMetrics = async (req, res) => {
    try {
        res.set('Content-Type', register.contentType);
        const metrics = await register.metrics();
        res.end(metrics);
    } catch (error) {
        res.status(500).end('Error collecting metrics');
    }
};

// Alert thresholds
const ALERT_THRESHOLDS = {
    ERROR_RATE: 5, // 5% error rate
    RESPONSE_TIME: 5000, // 5 seconds
    MEMORY_USAGE: 0.8, // 80% memory usage
    CPU_USAGE: 0.8 // 80% CPU usage
};

// Alert checker
const checkAlerts = () => {
    // This would typically integrate with alerting systems like PagerDuty
    monitoringLogger.info('Alert check performed', {
        timestamp: new Date().toISOString()
    });
};

// Start alert checking
setInterval(checkAlerts, 60000); // Every minute

module.exports = {
    register,
    httpMetricsMiddleware,
    recordPQCOperation,
    recordAttestationReport,
    recordSecurityEvent,
    recordRateLimitHit,
    updateActiveConnections,
    updateErrorRate,
    updateHealthStatus,
    getMetrics,
    monitoringLogger,
    ALERT_THRESHOLDS
};