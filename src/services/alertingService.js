/**
 * @file alertingService.js
 * @brief Advanced alerting and notification service for Generation 2
 */

const winston = require('winston');
const crypto = require('crypto');
const { performance } = require('perf_hooks');

// Alerting logger
const alertLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/alerts.log' }),
        new winston.transports.Console()
    ]
});

// Alert severity levels
const SEVERITY_LEVELS = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical'
};

// Alert types
const ALERT_TYPES = {
    SECURITY: 'security',
    PERFORMANCE: 'performance',
    HEALTH: 'health',
    BUSINESS: 'business',
    SYSTEM: 'system'
};

class AlertingService {
    constructor() {
        this.rules = new Map();
        this.channels = new Map();
        this.alertHistory = [];
        this.suppressions = new Map();
        this.escalationPolicies = new Map();
        
        // Initialize default channels and rules
        this.initializeDefaults();
        
        // Start alert processing
        this.startAlertProcessor();
    }
    
    initializeDefaults() {
        // Default notification channels
        this.addChannel('email', {
            type: 'email',
            config: {
                smtp: process.env.SMTP_HOST || 'localhost',
                from: process.env.ALERT_EMAIL_FROM || 'alerts@terragonlabs.com',
                to: process.env.ALERT_EMAIL_TO || 'ops@terragonlabs.com'
            },
            enabled: true
        });
        
        this.addChannel('slack', {
            type: 'slack',
            config: {
                webhook: process.env.SLACK_WEBHOOK_URL,
                channel: process.env.SLACK_CHANNEL || '#alerts'
            },
            enabled: !!process.env.SLACK_WEBHOOK_URL
        });
        
        this.addChannel('pagerduty', {
            type: 'pagerduty',
            config: {
                apiKey: process.env.PAGERDUTY_API_KEY,
                serviceKey: process.env.PAGERDUTY_SERVICE_KEY
            },
            enabled: !!process.env.PAGERDUTY_API_KEY
        });
        
        // Default alert rules
        this.addRule('high_error_rate', {
            type: ALERT_TYPES.SYSTEM,
            severity: SEVERITY_LEVELS.HIGH,
            condition: (metrics) => {
                const errorRate = metrics.errorRate || 0;
                return errorRate > 5; // 5% error rate
            },
            message: 'High error rate detected: {errorRate}%',
            channels: ['slack', 'email'],
            suppressionTime: 300000, // 5 minutes
            escalationPolicy: 'default'
        });
        
        this.addRule('memory_usage_high', {
            type: ALERT_TYPES.PERFORMANCE,
            severity: SEVERITY_LEVELS.MEDIUM,
            condition: (metrics) => {
                const memoryUsage = metrics.memoryUsage || 0;
                return memoryUsage > 80; // 80% memory usage
            },
            message: 'High memory usage: {memoryUsage}%',
            channels: ['slack'],
            suppressionTime: 600000 // 10 minutes
        });
        
        this.addRule('security_breach_attempt', {
            type: ALERT_TYPES.SECURITY,
            severity: SEVERITY_LEVELS.CRITICAL,
            condition: (metrics) => {
                return metrics.securityEvents > 0;
            },
            message: 'Security breach attempt detected: {securityEvents} events',
            channels: ['slack', 'email', 'pagerduty'],
            suppressionTime: 0, // No suppression for security alerts
            escalationPolicy: 'security'
        });
        
        this.addRule('circuit_breaker_open', {
            type: ALERT_TYPES.SYSTEM,
            severity: SEVERITY_LEVELS.HIGH,
            condition: (metrics) => {
                return metrics.openCircuitBreakers > 0;
            },
            message: 'Circuit breaker opened: {openCircuitBreakers} breakers',
            channels: ['slack', 'email'],
            suppressionTime: 300000
        });
        
        // Default escalation policies
        this.addEscalationPolicy('default', {
            steps: [
                { delay: 0, channels: ['slack'] },
                { delay: 300000, channels: ['email'] }, // 5 minutes
                { delay: 900000, channels: ['pagerduty'] } // 15 minutes
            ]
        });
        
        this.addEscalationPolicy('security', {
            steps: [
                { delay: 0, channels: ['slack', 'email'] },
                { delay: 60000, channels: ['pagerduty'] } // 1 minute
            ]
        });
    }
    
    addChannel(name, config) {
        this.channels.set(name, {
            ...config,
            lastUsed: null,
            successCount: 0,
            failureCount: 0,
            created: Date.now()
        });
        
        alertLogger.info('Alert channel added', { name, type: config.type });
    }
    
    addRule(name, rule) {
        this.rules.set(name, {
            ...rule,
            name,
            created: Date.now(),
            lastTriggered: null,
            triggerCount: 0
        });
        
        alertLogger.info('Alert rule added', { name, type: rule.type, severity: rule.severity });
    }
    
    addEscalationPolicy(name, policy) {
        this.escalationPolicies.set(name, {
            ...policy,
            name,
            created: Date.now()
        });
        
        alertLogger.info('Escalation policy added', { name, steps: policy.steps.length });
    }
    
    async processMetrics(metrics) {
        const triggeredAlerts = [];
        
        for (const [ruleName, rule] of this.rules) {
            try {
                if (rule.condition(metrics)) {
                    const alert = await this.createAlert(rule, metrics);
                    if (alert) {
                        triggeredAlerts.push(alert);
                    }
                }
            } catch (error) {
                alertLogger.error('Rule evaluation failed', {
                    rule: ruleName,
                    error: error.message
                });
            }
        }
        
        return triggeredAlerts;
    }
    
    async createAlert(rule, metrics) {
        const alertId = crypto.randomUUID();
        const now = Date.now();
        
        // Check suppression
        const suppressionKey = `${rule.name}_${rule.severity}`;\n        if (this.isSuppressed(suppressionKey, now)) {\n            alertLogger.debug('Alert suppressed', { rule: rule.name, suppressionKey });\n            return null;\n        }\n        \n        // Create alert object\n        const alert = {\n            id: alertId,\n            rule: rule.name,\n            type: rule.type,\n            severity: rule.severity,\n            message: this.formatMessage(rule.message, metrics),\n            metrics,\n            timestamp: new Date().toISOString(),\n            acknowledged: false,\n            resolved: false,\n            channels: rule.channels || [],\n            escalationPolicy: rule.escalationPolicy\n        };\n        \n        // Add to history\n        this.alertHistory.push(alert);\n        \n        // Limit history size\n        if (this.alertHistory.length > 1000) {\n            this.alertHistory = this.alertHistory.slice(-1000);\n        }\n        \n        // Update rule statistics\n        rule.lastTriggered = now;\n        rule.triggerCount++;\n        \n        // Set suppression\n        if (rule.suppressionTime > 0) {\n            this.suppressions.set(suppressionKey, now + rule.suppressionTime);\n        }\n        \n        alertLogger.warn('Alert triggered', {\n            id: alertId,\n            rule: rule.name,\n            severity: rule.severity,\n            message: alert.message\n        });\n        \n        // Send alert\n        await this.sendAlert(alert);\n        \n        return alert;\n    }\n    \n    async sendAlert(alert) {\n        const sendPromises = [];\n        \n        for (const channelName of alert.channels) {\n            const channel = this.channels.get(channelName);\n            \n            if (channel && channel.enabled) {\n                sendPromises.push(this.sendToChannel(alert, channel));\n            }\n        }\n        \n        // Execute escalation policy if defined\n        if (alert.escalationPolicy) {\n            this.executeEscalationPolicy(alert);\n        }\n        \n        const results = await Promise.allSettled(sendPromises);\n        \n        // Log results\n        results.forEach((result, index) => {\n            const channelName = alert.channels[index];\n            \n            if (result.status === 'fulfilled') {\n                alertLogger.info('Alert sent successfully', {\n                    alertId: alert.id,\n                    channel: channelName\n                });\n            } else {\n                alertLogger.error('Alert sending failed', {\n                    alertId: alert.id,\n                    channel: channelName,\n                    error: result.reason\n                });\n            }\n        });\n    }\n    \n    async sendToChannel(alert, channel) {\n        const startTime = performance.now();\n        \n        try {\n            switch (channel.type) {\n                case 'email':\n                    await this.sendEmail(alert, channel.config);\n                    break;\n                case 'slack':\n                    await this.sendSlack(alert, channel.config);\n                    break;\n                case 'pagerduty':\n                    await this.sendPagerDuty(alert, channel.config);\n                    break;\n                case 'webhook':\n                    await this.sendWebhook(alert, channel.config);\n                    break;\n                default:\n                    throw new Error(`Unknown channel type: ${channel.type}`);\n            }\n            \n            channel.successCount++;\n            channel.lastUsed = Date.now();\n            \n        } catch (error) {\n            channel.failureCount++;\n            const duration = performance.now() - startTime;\n            \n            alertLogger.error('Channel send failed', {\n                channel: channel.type,\n                error: error.message,\n                duration: Math.round(duration)\n            });\n            \n            throw error;\n        }\n    }\n    \n    async sendEmail(alert, config) {\n        // Mock email implementation\n        await new Promise(resolve => setTimeout(resolve, 100));\n        \n        alertLogger.info('Email alert sent', {\n            to: config.to,\n            subject: `[${alert.severity.toUpperCase()}] ${alert.message}`,\n            alertId: alert.id\n        });\n    }\n    \n    async sendSlack(alert, config) {\n        // Mock Slack implementation\n        await new Promise(resolve => setTimeout(resolve, 200));\n        \n        const payload = {\n            channel: config.channel,\n            text: `🚨 *${alert.severity.toUpperCase()}* Alert`,\n            attachments: [\n                {\n                    color: this.getSeverityColor(alert.severity),\n                    fields: [\n                        {\n                            title: 'Message',\n                            value: alert.message,\n                            short: false\n                        },\n                        {\n                            title: 'Rule',\n                            value: alert.rule,\n                            short: true\n                        },\n                        {\n                            title: 'Type',\n                            value: alert.type,\n                            short: true\n                        },\n                        {\n                            title: 'Timestamp',\n                            value: alert.timestamp,\n                            short: true\n                        }\n                    ]\n                }\n            ]\n        };\n        \n        alertLogger.info('Slack alert sent', {\n            channel: config.channel,\n            alertId: alert.id\n        });\n    }\n    \n    async sendPagerDuty(alert, config) {\n        // Mock PagerDuty implementation\n        await new Promise(resolve => setTimeout(resolve, 300));\n        \n        alertLogger.info('PagerDuty alert sent', {\n            serviceKey: config.serviceKey,\n            alertId: alert.id\n        });\n    }\n    \n    async sendWebhook(alert, config) {\n        // Mock webhook implementation\n        await new Promise(resolve => setTimeout(resolve, 150));\n        \n        alertLogger.info('Webhook alert sent', {\n            url: config.url,\n            alertId: alert.id\n        });\n    }\n    \n    executeEscalationPolicy(alert) {\n        const policy = this.escalationPolicies.get(alert.escalationPolicy);\n        \n        if (!policy) {\n            alertLogger.warn('Escalation policy not found', {\n                policy: alert.escalationPolicy,\n                alertId: alert.id\n            });\n            return;\n        }\n        \n        policy.steps.forEach((step, index) => {\n            setTimeout(async () => {\n                try {\n                    // Check if alert is still unresolved\n                    const currentAlert = this.alertHistory.find(a => a.id === alert.id);\n                    \n                    if (currentAlert && !currentAlert.acknowledged && !currentAlert.resolved) {\n                        alertLogger.info('Executing escalation step', {\n                            alertId: alert.id,\n                            step: index + 1,\n                            channels: step.channels\n                        });\n                        \n                        const escalatedAlert = {\n                            ...alert,\n                            channels: step.channels,\n                            message: `[ESCALATED] ${alert.message}`\n                        };\n                        \n                        await this.sendAlert(escalatedAlert);\n                    }\n                } catch (error) {\n                    alertLogger.error('Escalation step failed', {\n                        alertId: alert.id,\n                        step: index + 1,\n                        error: error.message\n                    });\n                }\n            }, step.delay);\n        });\n    }\n    \n    acknowledgeAlert(alertId, acknowledgedBy) {\n        const alert = this.alertHistory.find(a => a.id === alertId);\n        \n        if (alert) {\n            alert.acknowledged = true;\n            alert.acknowledgedBy = acknowledgedBy;\n            alert.acknowledgedAt = new Date().toISOString();\n            \n            alertLogger.info('Alert acknowledged', {\n                alertId,\n                acknowledgedBy\n            });\n            \n            return true;\n        }\n        \n        return false;\n    }\n    \n    resolveAlert(alertId, resolvedBy, resolution) {\n        const alert = this.alertHistory.find(a => a.id === alertId);\n        \n        if (alert) {\n            alert.resolved = true;\n            alert.resolvedBy = resolvedBy;\n            alert.resolvedAt = new Date().toISOString();\n            alert.resolution = resolution;\n            \n            alertLogger.info('Alert resolved', {\n                alertId,\n                resolvedBy,\n                resolution\n            });\n            \n            return true;\n        }\n        \n        return false;\n    }\n    \n    formatMessage(template, metrics) {\n        return template.replace(/\\{(\\w+)\\}/g, (match, key) => {\n            return metrics[key] !== undefined ? metrics[key] : match;\n        });\n    }\n    \n    isSuppressed(key, currentTime) {\n        const suppressionEnd = this.suppressions.get(key);\n        return suppressionEnd && currentTime < suppressionEnd;\n    }\n    \n    getSeverityColor(severity) {\n        const colors = {\n            [SEVERITY_LEVELS.LOW]: '#36a64f',\n            [SEVERITY_LEVELS.MEDIUM]: '#ff9500',\n            [SEVERITY_LEVELS.HIGH]: '#ff4444',\n            [SEVERITY_LEVELS.CRITICAL]: '#8b0000'\n        };\n        \n        return colors[severity] || '#cccccc';\n    }\n    \n    getAlertSummary() {\n        const now = Date.now();\n        const last24Hours = now - (24 * 60 * 60 * 1000);\n        const recentAlerts = this.alertHistory.filter(a => \n            new Date(a.timestamp).getTime() > last24Hours\n        );\n        \n        const summary = {\n            total: this.alertHistory.length,\n            last24Hours: recentAlerts.length,\n            bySevert: {},\n            byType: {},\n            acknowledged: this.alertHistory.filter(a => a.acknowledged).length,\n            resolved: this.alertHistory.filter(a => a.resolved).length,\n            active: this.alertHistory.filter(a => !a.resolved).length\n        };\n        \n        // Group by severity\n        Object.values(SEVERITY_LEVELS).forEach(severity => {\n            summary.bySeverity[severity] = recentAlerts.filter(a => \n                a.severity === severity\n            ).length;\n        });\n        \n        // Group by type\n        Object.values(ALERT_TYPES).forEach(type => {\n            summary.byType[type] = recentAlerts.filter(a => \n                a.type === type\n            ).length;\n        });\n        \n        return summary;\n    }\n    \n    getChannelStatus() {\n        const status = [];\n        \n        for (const [name, channel] of this.channels) {\n            status.push({\n                name,\n                type: channel.type,\n                enabled: channel.enabled,\n                successCount: channel.successCount,\n                failureCount: channel.failureCount,\n                successRate: channel.successCount + channel.failureCount > 0 ?\n                    Math.round((channel.successCount / (channel.successCount + channel.failureCount)) * 100) + '%' :\n                    'N/A',\n                lastUsed: channel.lastUsed ? new Date(channel.lastUsed).toISOString() : null\n            });\n        }\n        \n        return status;\n    }\n    \n    startAlertProcessor() {\n        // Process suppression cleanup every minute\n        setInterval(() => {\n            const now = Date.now();\n            \n            for (const [key, expiry] of this.suppressions) {\n                if (now >= expiry) {\n                    this.suppressions.delete(key);\n                }\n            }\n        }, 60000);\n        \n        alertLogger.info('Alert processor started');\n    }\n}\n\n// Global alerting service instance\nconst alertingService = new AlertingService();\n\nmodule.exports = {\n    AlertingService,\n    alertingService,\n    SEVERITY_LEVELS,\n    ALERT_TYPES\n};