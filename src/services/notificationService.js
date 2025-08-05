/**
 * @file notificationService.js
 * @brief Notification and alerting service for Generation 2
 */

const winston = require('winston');
const { EventEmitter } = require('events');

// Notification logger
const notificationLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/notifications.log' }),
        new winston.transports.Console()
    ]
});

class NotificationService extends EventEmitter {
    constructor() {
        super();
        this.channels = new Map();
        this.alertRules = new Map();
        this.notificationQueue = [];
        this.isProcessing = false;
        
        this._initializeDefaultChannels();
        this._initializeDefaultAlertRules();
        this._startNotificationProcessor();
    }

    /**
     * Initialize default notification channels
     */
    _initializeDefaultChannels() {
        // Email channel (mock implementation for Generation 2)
        this.channels.set('email', {
            type: 'email',
            enabled: true,
            config: {
                smtp: 'smtp.terragonlabs.com',
                port: 587,
                from: 'alerts@terragonlabs.com'
            },
            send: async (notification) => {
                notificationLogger.info('Email notification sent (mock)', {
                    to: notification.recipients,
                    subject: notification.subject,
                    priority: notification.priority
                });
                return { success: true, messageId: Date.now().toString() };
            }
        });

        // Slack channel (mock implementation)
        this.channels.set('slack', {
            type: 'slack',
            enabled: true,
            config: {
                webhook: 'https://hooks.slack.com/services/mock',
                channel: '#pqc-alerts'
            },
            send: async (notification) => {
                notificationLogger.info('Slack notification sent (mock)', {
                    channel: notification.channel || '#pqc-alerts',
                    message: notification.message,
                    priority: notification.priority
                });
                return { success: true, timestamp: new Date().toISOString() };
            }
        });

        // SMS channel (mock implementation)
        this.channels.set('sms', {
            type: 'sms',
            enabled: false, // Disabled by default
            config: {
                provider: 'twilio',
                accountSid: 'mock_sid',
                authToken: 'mock_token'
            },
            send: async (notification) => {
                notificationLogger.info('SMS notification sent (mock)', {
                    to: notification.recipients,
                    message: notification.message,
                    priority: notification.priority
                });
                return { success: true, sid: 'mock_' + Date.now() };
            }
        });

        // Webhook channel
        this.channels.set('webhook', {
            type: 'webhook',
            enabled: true,
            config: {
                urls: [
                    'https://api.terragonlabs.com/webhooks/pqc-alerts'
                ]
            },
            send: async (notification) => {
                notificationLogger.info('Webhook notification sent (mock)', {
                    urls: notification.urls || [],
                    payload: notification.payload,
                    priority: notification.priority
                });
                return { success: true, delivered: true };
            }
        });
    }

    /**
     * Initialize default alert rules
     */
    _initializeDefaultAlertRules() {
        // Critical security events
        this.alertRules.set('security_critical', {
            name: 'Critical Security Events',
            conditions: [
                { type: 'security_event', severity: 'critical' },
                { type: 'authentication_failure', count: 5, window: 300 },
                { type: 'attestation_failure', consecutive: 3 }
            ],
            channels: ['email', 'slack', 'webhook'],
            priority: 'critical',
            throttle: 300 // 5 minutes
        });

        // Device health alerts
        this.alertRules.set('device_health', {
            name: 'Device Health Alerts',
            conditions: [
                { type: 'device_offline', duration: 3600 }, // 1 hour
                { type: 'attestation_expired', age: 86400 } // 24 hours
            ],
            channels: ['email', 'slack'],
            priority: 'high',
            throttle: 1800 // 30 minutes
        });

        // System performance alerts
        this.alertRules.set('performance', {
            name: 'Performance Alerts',
            conditions: [
                { type: 'high_error_rate', threshold: 5 }, // 5%
                { type: 'slow_response', threshold: 5000 }, // 5 seconds
                { type: 'high_memory_usage', threshold: 80 } // 80%
            ],
            channels: ['slack', 'webhook'],
            priority: 'medium',
            throttle: 900 // 15 minutes
        });

        // PQC operation failures
        this.alertRules.set('pqc_failures', {
            name: 'PQC Operation Failures',
            conditions: [
                { type: 'pqc_operation_failure', count: 10, window: 300 },
                { type: 'key_generation_failure', count: 3, window: 60 }
            ],
            channels: ['email', 'slack'],
            priority: 'high',
            throttle: 600 // 10 minutes
        });
    }

    /**
     * Start the notification processor
     */
    _startNotificationProcessor() {
        setInterval(async () => {
            if (!this.isProcessing && this.notificationQueue.length > 0) {
                await this._processNotificationQueue();
            }
        }, 1000); // Process every second
    }

    /**
     * Process the notification queue
     */
    async _processNotificationQueue() {
        this.isProcessing = true;
        
        try {
            while (this.notificationQueue.length > 0) {
                const notification = this.notificationQueue.shift();
                await this._sendNotification(notification);
            }
        } catch (error) {
            notificationLogger.error('Error processing notification queue', {
                error: error.message,
                queueLength: this.notificationQueue.length
            });
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Send a notification
     */
    async _sendNotification(notification) {
        const results = [];
        
        for (const channelName of notification.channels) {
            const channel = this.channels.get(channelName);
            
            if (!channel || !channel.enabled) {
                notificationLogger.warn('Channel not available or disabled', {
                    channel: channelName,
                    notificationId: notification.id
                });
                continue;
            }
            
            try {
                const result = await channel.send(notification);
                results.push({
                    channel: channelName,
                    success: true,
                    result: result
                });
                
                notificationLogger.info('Notification sent successfully', {
                    channel: channelName,
                    notificationId: notification.id,
                    priority: notification.priority
                });
                
            } catch (error) {
                results.push({
                    channel: channelName,
                    success: false,
                    error: error.message
                });
                
                notificationLogger.error('Failed to send notification', {
                    channel: channelName,
                    notificationId: notification.id,
                    error: error.message
                });
            }
        }
        
        // Emit notification completed event
        this.emit('notificationSent', {
            notification: notification,
            results: results
        });
        
        return results;
    }

    /**
     * Send an alert based on event
     */
    async sendAlert(eventType, data = {}) {
        const matchingRules = this._findMatchingAlertRules(eventType, data);
        
        for (const rule of matchingRules) {
            // Check throttling
            if (this._isThrottled(rule.name, rule.throttle)) {
                continue;
            }
            
            const notification = {
                id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: 'alert',
                rule: rule.name,
                eventType: eventType,
                priority: rule.priority,
                channels: rule.channels,
                timestamp: new Date().toISOString(),
                data: data,
                subject: this._generateAlertSubject(eventType, data, rule.priority),
                message: this._generateAlertMessage(eventType, data),
                recipients: this._getAlertRecipients(rule.priority)
            };
            
            this.notificationQueue.push(notification);
            
            notificationLogger.info('Alert queued for processing', {
                alertId: notification.id,
                rule: rule.name,
                eventType: eventType,
                priority: rule.priority
            });
        }
    }

    /**
     * Send a custom notification
     */
    async sendNotification(type, channels, message, options = {}) {
        const notification = {
            id: `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: type,
            channels: channels,
            message: message,
            priority: options.priority || 'medium',
            timestamp: new Date().toISOString(),
            subject: options.subject || 'PQC-Edge-Attestor Notification',
            recipients: options.recipients || [],
            ...options
        };
        
        this.notificationQueue.push(notification);
        
        notificationLogger.info('Custom notification queued', {
            notificationId: notification.id,
            type: type,
            channels: channels,
            priority: notification.priority
        });
        
        return notification.id;
    }

    /**
     * Find matching alert rules for an event
     */
    _findMatchingAlertRules(eventType, data) {
        const matchingRules = [];
        
        for (const [ruleName, rule] of this.alertRules) {
            for (const condition of rule.conditions) {
                if (this._evaluateCondition(condition, eventType, data)) {
                    matchingRules.push(rule);
                    break; // Rule matched, no need to check other conditions
                }
            }
        }
        
        return matchingRules;
    }

    /**
     * Evaluate alert condition
     */
    _evaluateCondition(condition, eventType, data) {
        if (condition.type !== eventType) {
            return false;
        }
        
        // Check severity
        if (condition.severity && data.severity !== condition.severity) {
            return false;
        }
        
        // Check threshold
        if (condition.threshold && data.value < condition.threshold) {
            return false;
        }
        
        // Additional condition checks would be implemented here
        return true;
    }

    /**
     * Check if alert is throttled
     */
    _isThrottled(ruleName, throttleSeconds) {
        const key = `throttle_${ruleName}`;
        const lastSent = this._getThrottleTimestamp(key);
        const now = Date.now();
        
        if (lastSent && (now - lastSent) < (throttleSeconds * 1000)) {
            return true;
        }
        
        this._setThrottleTimestamp(key, now);
        return false;
    }

    /**
     * Get throttle timestamp (mock implementation)
     */
    _getThrottleTimestamp(key) {
        // In production, this would be stored in Redis or similar
        return this.throttleCache?.get(key);
    }

    /**
     * Set throttle timestamp (mock implementation)
     */
    _setThrottleTimestamp(key, timestamp) {
        // In production, this would be stored in Redis or similar
        if (!this.throttleCache) {
            this.throttleCache = new Map();
        }
        this.throttleCache.set(key, timestamp);
    }

    /**
     * Generate alert subject
     */
    _generateAlertSubject(eventType, data, priority) {
        const priorityEmoji = {
            'critical': '🚨',
            'high': '⚠️',
            'medium': '⚡',
            'low': 'ℹ️'
        };
        
        return `${priorityEmoji[priority]} PQC-Edge-Attestor Alert: ${eventType}`;
    }

    /**
     * Generate alert message
     */
    _generateAlertMessage(eventType, data) {
        let message = `Alert triggered: ${eventType}\n`;
        message += `Timestamp: ${new Date().toISOString()}\n`;
        
        if (data.deviceId) {
            message += `Device ID: ${data.deviceId}\n`;
        }
        
        if (data.error) {
            message += `Error: ${data.error}\n`;
        }
        
        if (data.value !== undefined) {
            message += `Value: ${data.value}\n`;
        }
        
        message += `\nPlease investigate and take appropriate action.`;
        
        return message;
    }

    /**
     * Get alert recipients based on priority
     */
    _getAlertRecipients(priority) {
        const recipients = {
            'critical': ['admin@terragonlabs.com', 'security@terragonlabs.com'],
            'high': ['admin@terragonlabs.com', 'devops@terragonlabs.com'],
            'medium': ['devops@terragonlabs.com'],
            'low': ['monitoring@terragonlabs.com']
        };
        
        return recipients[priority] || recipients['medium'];
    }

    /**
     * Get notification statistics
     */
    getNotificationStats() {
        return {
            queueLength: this.notificationQueue.length,
            isProcessing: this.isProcessing,
            enabledChannels: Array.from(this.channels.entries())
                .filter(([_, channel]) => channel.enabled)
                .map(([name, _]) => name),
            alertRulesCount: this.alertRules.size
        };
    }

    /**
     * Test notification channels
     */
    async testChannels(channels = []) {
        const testChannels = channels.length > 0 ? channels : Array.from(this.channels.keys());
        const results = {};
        
        for (const channelName of testChannels) {
            const channel = this.channels.get(channelName);
            
            if (!channel) {
                results[channelName] = { success: false, error: 'Channel not found' };
                continue;
            }
            
            try {
                const testNotification = {
                    id: `test_${Date.now()}`,
                    message: 'This is a test notification from PQC-Edge-Attestor',
                    subject: 'PQC-Edge-Attestor Test Notification',
                    priority: 'low',
                    recipients: ['test@terragonlabs.com']
                };
                
                const result = await channel.send(testNotification);
                results[channelName] = { success: true, result: result };
                
            } catch (error) {
                results[channelName] = { success: false, error: error.message };
            }
        }
        
        return results;
    }
}

module.exports = NotificationService;