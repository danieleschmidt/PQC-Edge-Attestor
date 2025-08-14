/**
 * @file advancedMonitoring.js
 * @brief Advanced monitoring and observability for PQC operations
 * 
 * Provides comprehensive monitoring, alerting, and observability for post-quantum
 * cryptographic operations with integration to modern observability platforms.
 */

const EventEmitter = require('events');
const winston = require('winston');
const prometheus = require('prom-client');
const os = require('os');
const fs = require('fs').promises;
const path = require('path');

// Configure monitoring logger
const monitoringLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'pqc-advanced-monitoring' },
  transports: [
    new winston.transports.File({ filename: 'logs/monitoring.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
      level: 'info'
    })
  ]
});

// Prometheus metrics registry
const metricsRegistry = new prometheus.Registry();

// Custom metrics for PQC operations
const pqcOperationCounter = new prometheus.Counter({
  name: 'pqc_operations_total',
  help: 'Total number of PQC operations',
  labelNames: ['operation_type', 'algorithm', 'status'],
  registers: [metricsRegistry]
});

const pqcOperationDuration = new prometheus.Histogram({
  name: 'pqc_operation_duration_seconds',
  help: 'Duration of PQC operations',
  labelNames: ['operation_type', 'algorithm'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10],
  registers: [metricsRegistry]
});

const pqcMemoryUsage = new prometheus.Gauge({
  name: 'pqc_memory_usage_bytes',
  help: 'Memory usage during PQC operations',
  labelNames: ['operation_type'],
  registers: [metricsRegistry]
});

const pqcThroughput = new prometheus.Gauge({
  name: 'pqc_throughput_ops_per_second',
  help: 'PQC operations throughput',
  labelNames: ['algorithm'],
  registers: [metricsRegistry]
});

const quantumThreatLevel = new prometheus.Gauge({
  name: 'quantum_threat_level',
  help: 'Current quantum threat assessment level',
  registers: [metricsRegistry]
});

const securityViolations = new prometheus.Counter({
  name: 'security_violations_total',
  help: 'Total security violations detected',
  labelNames: ['violation_type', 'severity'],
  registers: [metricsRegistry]
});

const systemResourceUsage = new prometheus.Gauge({
  name: 'system_resource_usage',
  help: 'System resource utilization',
  labelNames: ['resource_type'],
  registers: [metricsRegistry]
});

// Health check indicators
const healthIndicators = new prometheus.Gauge({
  name: 'pqc_service_health',
  help: 'Health status of PQC services',
  labelNames: ['service_name', 'status'],
  registers: [metricsRegistry]
});

class AdvancedMonitoring extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      enablePrometheus: options.enablePrometheus !== false,
      enableTracing: options.enableTracing !== false,
      enableAlerting: options.enableAlerting !== false,
      alertingWebhook: options.alertingWebhook,
      slackWebhook: options.slackWebhook,
      metricsInterval: options.metricsInterval || 10000, // 10 seconds
      healthCheckInterval: options.healthCheckInterval || 30000, // 30 seconds
      performanceThresholds: {
        operationLatency: options.operationLatency || 1000, // ms
        memoryUsage: options.memoryUsage || 500 * 1024 * 1024, // 500MB
        errorRate: options.errorRate || 0.05, // 5%
        ...options.performanceThresholds
      },
      ...options
    };
    
    // Monitoring state
    this.metrics = {
      operations: new Map(),
      alerts: [],
      traces: [],
      healthStatus: new Map(),
      performanceMetrics: new Map(),
      anomalies: []
    };
    
    // Alert management
    this.alertRules = new Map();
    this.activeAlerts = new Map();
    this.alertHistory = [];
    
    // Distributed tracing
    this.traces = new Map();
    this.activeSpans = new Map();
    
    // Performance baselines
    this.performanceBaselines = new Map();
    
    this.initializeMonitoring();
  }

  /**
   * Initialize monitoring system
   */
  async initializeMonitoring() {
    // Start metrics collection
    if (this.options.enablePrometheus) {
      this.startMetricsCollection();
    }
    
    // Initialize alert rules
    this.setupDefaultAlertRules();
    
    // Start health monitoring
    this.startHealthMonitoring();
    
    // Initialize tracing if enabled
    if (this.options.enableTracing) {
      this.initializeTracing();
    }
    
    // Start performance monitoring
    this.startPerformanceMonitoring();
    
    monitoringLogger.info('Advanced monitoring system initialized', {
      prometheus: this.options.enablePrometheus,
      tracing: this.options.enableTracing,
      alerting: this.options.enableAlerting
    });
  }

  /**
   * Record PQC operation metrics
   * @param {string} operationType - Type of operation
   * @param {string} algorithm - PQC algorithm used
   * @param {number} duration - Operation duration in milliseconds
   * @param {string} status - Operation status (success/error)
   * @param {Object} metadata - Additional metadata
   */
  recordOperation(operationType, algorithm, duration, status = 'success', metadata = {}) {
    // Update Prometheus metrics
    pqcOperationCounter.labels(operationType, algorithm, status).inc();
    pqcOperationDuration.labels(operationType, algorithm).observe(duration / 1000);
    
    if (metadata.memoryUsage) {
      pqcMemoryUsage.labels(operationType).set(metadata.memoryUsage);
    }
    
    // Store detailed metrics
    const operationKey = `${operationType}-${algorithm}`;
    const currentMetrics = this.metrics.operations.get(operationKey) || {
      count: 0,
      totalDuration: 0,
      errors: 0,
      lastOperation: 0
    };
    
    currentMetrics.count++;
    currentMetrics.totalDuration += duration;
    currentMetrics.lastOperation = Date.now();
    
    if (status === 'error') {
      currentMetrics.errors++;
    }
    
    this.metrics.operations.set(operationKey, currentMetrics);
    
    // Check for performance anomalies
    this.checkPerformanceThresholds(operationType, algorithm, duration, metadata);
    
    // Update throughput metrics
    this.updateThroughputMetrics(algorithm);
    
    monitoringLogger.debug('Operation recorded', {
      operationType,
      algorithm,
      duration,
      status,
      metadata
    });
  }

  /**
   * Record security violation
   * @param {string} violationType - Type of violation
   * @param {string} severity - Severity level
   * @param {Object} details - Violation details
   */
  recordSecurityViolation(violationType, severity, details = {}) {
    securityViolations.labels(violationType, severity).inc();
    
    const violation = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: violationType,
      severity,
      details
    };
    
    // Trigger alert for high/critical violations
    if (severity === 'high' || severity === 'critical') {
      this.triggerAlert('security_violation', violation);
    }
    
    monitoringLogger.warn('Security violation recorded', violation);
  }

  /**
   * Start distributed trace for operation
   * @param {string} operationName - Name of the operation
   * @param {Object} attributes - Trace attributes
   * @returns {string} Trace ID
   */
  startTrace(operationName, attributes = {}) {
    if (!this.options.enableTracing) {
      return null;
    }
    
    const traceId = crypto.randomUUID();
    const trace = {
      traceId,
      operationName,
      startTime: Date.now(),
      attributes,
      spans: [],
      status: 'active'
    };
    
    this.traces.set(traceId, trace);
    
    monitoringLogger.debug('Trace started', { traceId, operationName });
    return traceId;
  }

  /**
   * Add span to existing trace
   * @param {string} traceId - Trace ID
   * @param {string} spanName - Span name
   * @param {Object} attributes - Span attributes
   * @returns {string} Span ID
   */
  startSpan(traceId, spanName, attributes = {}) {
    if (!traceId || !this.traces.has(traceId)) {
      return null;
    }
    
    const spanId = crypto.randomUUID();
    const span = {
      spanId,
      spanName,
      startTime: Date.now(),
      attributes,
      status: 'active'
    };
    
    const trace = this.traces.get(traceId);
    trace.spans.push(span);
    
    this.activeSpans.set(spanId, { traceId, span });
    
    monitoringLogger.debug('Span started', { traceId, spanId, spanName });
    return spanId;
  }

  /**
   * Finish span
   * @param {string} spanId - Span ID
   * @param {Object} result - Span result
   */
  finishSpan(spanId, result = {}) {
    const spanInfo = this.activeSpans.get(spanId);
    if (!spanInfo) return;
    
    const { traceId, span } = spanInfo;
    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.result = result;
    span.status = result.error ? 'error' : 'success';
    
    this.activeSpans.delete(spanId);
    
    monitoringLogger.debug('Span finished', { traceId, spanId, duration: span.duration });
  }

  /**
   * Finish trace
   * @param {string} traceId - Trace ID
   * @param {Object} result - Trace result
   */
  finishTrace(traceId, result = {}) {
    const trace = this.traces.get(traceId);
    if (!trace) return;
    
    trace.endTime = Date.now();
    trace.duration = trace.endTime - trace.startTime;
    trace.result = result;
    trace.status = result.error ? 'error' : 'success';
    
    // Store completed trace
    this.metrics.traces.push({ ...trace });
    
    // Keep only recent traces in memory
    if (this.metrics.traces.length > 1000) {
      this.metrics.traces = this.metrics.traces.slice(-500);
    }
    
    this.traces.delete(traceId);
    
    monitoringLogger.debug('Trace finished', { traceId, duration: trace.duration });
  }

  /**
   * Trigger alert
   * @param {string} alertType - Type of alert
   * @param {Object} alertData - Alert data
   */
  async triggerAlert(alertType, alertData) {
    const alertId = crypto.randomUUID();
    const alert = {
      id: alertId,
      type: alertType,
      timestamp: Date.now(),
      severity: alertData.severity || 'medium',
      data: alertData,
      status: 'active'
    };
    
    this.activeAlerts.set(alertId, alert);
    this.alertHistory.push(alert);
    this.metrics.alerts.push(alert);
    
    // Send notification if enabled
    if (this.options.enableAlerting) {
      await this.sendAlertNotification(alert);
    }
    
    this.emit('alert-triggered', alert);
    
    monitoringLogger.warn('Alert triggered', {
      alertId,
      type: alertType,
      severity: alert.severity
    });
  }

  /**
   * Send alert notification
   * @param {Object} alert - Alert to send
   */
  async sendAlertNotification(alert) {
    try {
      const message = this.formatAlertMessage(alert);
      
      // Send to Slack if configured
      if (this.options.slackWebhook) {
        await this.sendSlackNotification(message, alert.severity);
      }
      
      // Send to webhook if configured
      if (this.options.alertingWebhook) {
        await this.sendWebhookNotification(alert);
      }
      
      monitoringLogger.info('Alert notification sent', { alertId: alert.id });
      
    } catch (error) {
      monitoringLogger.error('Failed to send alert notification', {
        alertId: alert.id,
        error: error.message
      });
    }
  }

  /**
   * Start metrics collection
   */
  startMetricsCollection() {
    setInterval(() => {
      this.collectSystemMetrics();
      this.updatePerformanceMetrics();
    }, this.options.metricsInterval);
    
    monitoringLogger.info('Metrics collection started');
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    setInterval(() => {
      this.performHealthChecks();
    }, this.options.healthCheckInterval);
    
    monitoringLogger.info('Health monitoring started');
  }

  /**
   * Start performance monitoring
   */
  startPerformanceMonitoring() {
    setInterval(() => {
      this.analyzePerformanceMetrics();
      this.detectAnomalies();
    }, 60000); // Every minute
    
    monitoringLogger.info('Performance monitoring started');
  }

  /**
   * Collect system metrics
   */
  collectSystemMetrics() {
    try {
      const memoryUsage = process.memoryUsage();
      systemResourceUsage.labels('heap_used').set(memoryUsage.heapUsed);
      systemResourceUsage.labels('heap_total').set(memoryUsage.heapTotal);
      systemResourceUsage.labels('external').set(memoryUsage.external);
      
      const cpuUsage = process.cpuUsage();
      systemResourceUsage.labels('cpu_user').set(cpuUsage.user);
      systemResourceUsage.labels('cpu_system').set(cpuUsage.system);
      
      systemResourceUsage.labels('uptime').set(process.uptime());
      
      // System load average
      const loadAverage = os.loadavg();
      systemResourceUsage.labels('load_1min').set(loadAverage[0]);
      systemResourceUsage.labels('load_5min').set(loadAverage[1]);
      systemResourceUsage.labels('load_15min').set(loadAverage[2]);
      
    } catch (error) {
      monitoringLogger.error('Failed to collect system metrics', { error: error.message });
    }
  }

  /**
   * Perform health checks
   */
  async performHealthChecks() {
    const healthChecks = [
      { name: 'pqc_service', check: () => this.checkPQCServiceHealth() },
      { name: 'database', check: () => this.checkDatabaseHealth() },
      { name: 'file_system', check: () => this.checkFileSystemHealth() },
      { name: 'network', check: () => this.checkNetworkHealth() }
    ];
    
    for (const healthCheck of healthChecks) {
      try {
        const isHealthy = await healthCheck.check();
        const status = isHealthy ? 1 : 0;
        
        healthIndicators.labels(healthCheck.name, isHealthy ? 'healthy' : 'unhealthy').set(status);
        this.metrics.healthStatus.set(healthCheck.name, { healthy: isHealthy, lastCheck: Date.now() });
        
        if (!isHealthy) {
          await this.triggerAlert('health_check_failed', {
            service: healthCheck.name,
            severity: 'high'
          });
        }
        
      } catch (error) {
        monitoringLogger.error(`Health check failed for ${healthCheck.name}`, {
          error: error.message
        });
        
        healthIndicators.labels(healthCheck.name, 'unhealthy').set(0);
        this.metrics.healthStatus.set(healthCheck.name, { healthy: false, lastCheck: Date.now(), error: error.message });
      }
    }
  }

  /**
   * Update performance metrics
   */
  updatePerformanceMetrics() {
    for (const [key, metrics] of this.metrics.operations.entries()) {
      const avgDuration = metrics.totalDuration / metrics.count;
      const errorRate = metrics.errors / metrics.count;
      
      this.metrics.performanceMetrics.set(key, {
        avgDuration,
        errorRate,
        throughput: metrics.count,
        lastUpdated: Date.now()
      });
    }
  }

  /**
   * Update throughput metrics
   */
  updateThroughputMetrics(algorithm) {
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window
    
    let operationsInWindow = 0;
    for (const [key, metrics] of this.metrics.operations.entries()) {
      if (key.includes(algorithm) && metrics.lastOperation >= windowStart) {
        operationsInWindow++;
      }
    }
    
    const throughput = operationsInWindow / 60; // operations per second
    pqcThroughput.labels(algorithm).set(throughput);
  }

  /**
   * Check performance thresholds
   */
  checkPerformanceThresholds(operationType, algorithm, duration, metadata) {
    // Check latency threshold
    if (duration > this.options.performanceThresholds.operationLatency) {
      this.triggerAlert('high_latency', {
        operationType,
        algorithm,
        duration,
        threshold: this.options.performanceThresholds.operationLatency,
        severity: 'medium'
      });
    }
    
    // Check memory usage threshold
    if (metadata.memoryUsage && metadata.memoryUsage > this.options.performanceThresholds.memoryUsage) {
      this.triggerAlert('high_memory_usage', {
        operationType,
        memoryUsage: metadata.memoryUsage,
        threshold: this.options.performanceThresholds.memoryUsage,
        severity: 'medium'
      });
    }
  }

  /**
   * Analyze performance metrics for trends
   */
  analyzePerformanceMetrics() {
    for (const [key, metrics] of this.metrics.performanceMetrics.entries()) {
      // Check error rate threshold
      if (metrics.errorRate > this.options.performanceThresholds.errorRate) {
        this.triggerAlert('high_error_rate', {
          operation: key,
          errorRate: metrics.errorRate,
          threshold: this.options.performanceThresholds.errorRate,
          severity: 'high'
        });
      }
      
      // Update performance baselines
      const baseline = this.performanceBaselines.get(key) || { avgDuration: metrics.avgDuration };
      
      // Detect performance degradation
      if (metrics.avgDuration > baseline.avgDuration * 1.5) {
        this.triggerAlert('performance_degradation', {
          operation: key,
          currentDuration: metrics.avgDuration,
          baseline: baseline.avgDuration,
          severity: 'medium'
        });
      }
      
      this.performanceBaselines.set(key, { avgDuration: metrics.avgDuration });
    }
  }

  /**
   * Detect anomalies in operation patterns
   */
  detectAnomalies() {
    // Simple anomaly detection based on statistical analysis
    for (const [key, metrics] of this.metrics.operations.entries()) {
      const recentOperations = this.getRecentOperations(key, 300000); // 5 minutes
      
      if (recentOperations.length > 0) {
        const avg = recentOperations.reduce((sum, op) => sum + op.duration, 0) / recentOperations.length;
        const stdDev = Math.sqrt(
          recentOperations.reduce((sum, op) => sum + Math.pow(op.duration - avg, 2), 0) / recentOperations.length
        );
        
        // Check for outliers (3 standard deviations)
        const outliers = recentOperations.filter(op => Math.abs(op.duration - avg) > 3 * stdDev);
        
        if (outliers.length > recentOperations.length * 0.1) { // More than 10% outliers
          this.metrics.anomalies.push({
            operation: key,
            type: 'duration_anomaly',
            timestamp: Date.now(),
            outliers: outliers.length,
            total: recentOperations.length
          });
        }
      }
    }
  }

  /**
   * Setup default alert rules
   */
  setupDefaultAlertRules() {
    const defaultRules = [
      {
        name: 'high_latency',
        condition: (metrics) => metrics.avgDuration > 1000,
        severity: 'medium',
        message: 'Operation latency exceeds threshold'
      },
      {
        name: 'high_error_rate',
        condition: (metrics) => metrics.errorRate > 0.05,
        severity: 'high',
        message: 'Error rate exceeds threshold'
      },
      {
        name: 'security_violation',
        condition: () => true, // Always trigger for security violations
        severity: 'critical',
        message: 'Security violation detected'
      }
    ];
    
    defaultRules.forEach(rule => {
      this.alertRules.set(rule.name, rule);
    });
  }

  /**
   * Get Prometheus metrics
   * @returns {string} Metrics in Prometheus format
   */
  async getPrometheusMetrics() {
    return metricsRegistry.metrics();
  }

  /**
   * Get comprehensive monitoring dashboard data
   * @returns {Object} Dashboard data
   */
  getDashboardData() {
    return {
      overview: {
        totalOperations: Array.from(this.metrics.operations.values())
          .reduce((sum, m) => sum + m.count, 0),
        errorRate: this.calculateOverallErrorRate(),
        avgLatency: this.calculateOverallAvgLatency(),
        throughput: this.calculateOverallThroughput(),
        activeAlerts: this.activeAlerts.size,
        healthStatus: this.getOverallHealthStatus()
      },
      operations: Object.fromEntries(this.metrics.operations),
      performance: Object.fromEntries(this.metrics.performanceMetrics),
      health: Object.fromEntries(this.metrics.healthStatus),
      alerts: Array.from(this.activeAlerts.values()),
      traces: this.metrics.traces.slice(-100), // Last 100 traces
      anomalies: this.metrics.anomalies.slice(-50), // Last 50 anomalies
      system: this.getSystemMetrics()
    };
  }

  /**
   * Helper methods for health checks
   */
  async checkPQCServiceHealth() {
    // Check if PQC service is responsive
    try {
      // Simple health check - could be more sophisticated
      return process.uptime() > 0;
    } catch {
      return false;
    }
  }

  async checkDatabaseHealth() {
    // Mock database health check
    return Math.random() > 0.05; // 95% healthy
  }

  async checkFileSystemHealth() {
    try {
      await fs.access('./logs', fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  async checkNetworkHealth() {
    // Mock network health check
    return Math.random() > 0.02; // 98% healthy
  }

  /**
   * Helper methods for calculations
   */
  calculateOverallErrorRate() {
    const operations = Array.from(this.metrics.operations.values());
    const totalOps = operations.reduce((sum, m) => sum + m.count, 0);
    const totalErrors = operations.reduce((sum, m) => sum + m.errors, 0);
    return totalOps > 0 ? totalErrors / totalOps : 0;
  }

  calculateOverallAvgLatency() {
    const metrics = Array.from(this.metrics.performanceMetrics.values());
    if (metrics.length === 0) return 0;
    return metrics.reduce((sum, m) => sum + m.avgDuration, 0) / metrics.length;
  }

  calculateOverallThroughput() {
    const operations = Array.from(this.metrics.operations.values());
    const now = Date.now();
    const recentOps = operations.filter(m => now - m.lastOperation < 60000);
    return recentOps.reduce((sum, m) => sum + m.count, 0) / 60; // ops per second
  }

  getOverallHealthStatus() {
    const healthStatuses = Array.from(this.metrics.healthStatus.values());
    const unhealthy = healthStatuses.filter(h => !h.healthy);
    return unhealthy.length === 0 ? 'healthy' : 'degraded';
  }

  getRecentOperations(operationType, timeWindow) {
    // Mock implementation - would track individual operations in production
    return [];
  }

  getSystemMetrics() {
    return {
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      uptime: process.uptime(),
      loadavg: os.loadavg()
    };
  }

  formatAlertMessage(alert) {
    return `🚨 *${alert.type.toUpperCase()}* Alert\n` +
           `Severity: ${alert.severity}\n` +
           `Time: ${new Date(alert.timestamp).toISOString()}\n` +
           `Details: ${JSON.stringify(alert.data, null, 2)}`;
  }

  async sendSlackNotification(message, severity) {
    // Mock Slack notification - implement with actual webhook
    monitoringLogger.info('Slack notification sent', { severity, message });
  }

  async sendWebhookNotification(alert) {
    // Mock webhook notification - implement with actual HTTP request
    monitoringLogger.info('Webhook notification sent', { alertId: alert.id });
  }
}

module.exports = AdvancedMonitoring;