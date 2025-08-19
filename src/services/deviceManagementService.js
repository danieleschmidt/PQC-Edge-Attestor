/**
 * @file deviceManagementService.js
 * @brief Device management and orchestration service - Generation 1
 */

const EventEmitter = require('events');
const crypto = require('crypto');
const PQCCryptoService = require('./pqcCryptoService');
const AttestationService = require('./attestationService');
const OTAUpdateService = require('./otaUpdateService');

class DeviceManagementService extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            deviceId: config.deviceId || this._generateDeviceId(),
            deviceType: config.deviceType || 'PQC_EDGE_ATTESTOR',
            managementServerUrl: config.managementServerUrl || 'https://management.terragon.io',
            heartbeatInterval: config.heartbeatInterval || 300000, // 5 minutes
            enableRemoteManagement: config.enableRemoteManagement !== false,
            enableTelemetry: config.enableTelemetry !== false,
            maxCommandQueue: config.maxCommandQueue || 100,
            commandTimeout: config.commandTimeout || 30000, // 30 seconds
            ...config
        };

        // Initialize services
        this.pqcCrypto = new PQCCryptoService();
        this.attestationService = new AttestationService(config);
        this.otaService = new OTAUpdateService(config);

        this.initialized = false;
        this.deviceState = 'offline';
        this.lastHeartbeat = 0;
        this.heartbeatTimer = null;
        this.commandQueue = [];
        this.activeCommands = new Map();
        this.telemetryData = new Map();
        
        this.deviceCapabilities = {
            pqcCrypto: true,
            attestation: true,
            otaUpdates: true,
            remoteCommands: true,
            telemetry: true,
            secureStorage: false // Generation 2 feature
        };

        this.stats = {
            uptime: 0,
            commandsProcessed: 0,
            commandsFailed: 0,
            attestationsGenerated: 0,
            updatesApplied: 0,
            heartbeatsSent: 0,
            lastError: null
        };
    }

    async initialize() {
        if (this.initialized) return;

        try {
            await this.attestationService.initialize();
            await this.otaService.initialize();

            if (this.config.enableRemoteManagement) {
                this._startHeartbeat();
            }

            this.deviceState = 'online';
            this.initialized = true;
            this.stats.uptime = Date.now();

            this.emit('initialized', {
                deviceId: this.config.deviceId,
                deviceType: this.config.deviceType,
                capabilities: this.deviceCapabilities
            });

        } catch (error) {
            this.deviceState = 'error';
            this.stats.lastError = error.message;
            throw new Error(`Device management initialization failed: ${error.message}`);
        }
    }

    async executeCommand(command) {
        const commandId = crypto.randomBytes(8).toString('hex');
        const commandData = {
            id: commandId,
            type: command.type,
            parameters: command.parameters || {},
            timestamp: Date.now(),
            status: 'pending'
        };

        try {
            this.commandQueue.push(commandData);
            this.activeCommands.set(commandId, commandData);

            const result = await this._processCommand(commandData);
            
            commandData.status = 'completed';
            commandData.result = result;
            this.stats.commandsProcessed++;
            this.activeCommands.delete(commandId);

            return result;

        } catch (error) {
            commandData.status = 'failed';
            commandData.error = error.message;
            this.stats.commandsFailed++;
            this.activeCommands.delete(commandId);
            throw error;
        }
    }

    async getDeviceStatus() {
        return {
            deviceId: this.config.deviceId,
            deviceType: this.config.deviceType,
            state: this.deviceState,
            uptime: Date.now() - this.stats.uptime,
            version: this.otaService.getCurrentVersion(),
            lastHeartbeat: this.lastHeartbeat,
            capabilities: this.deviceCapabilities,
            stats: this.stats
        };
    }

    async generateAttestationReport() {
        const report = await this.attestationService.generateAttestationReport();
        this.stats.attestationsGenerated++;
        return report;
    }

    async sendHeartbeat() {
        if (!this.config.enableRemoteManagement) return null;

        const heartbeatData = {
            deviceId: this.config.deviceId,
            timestamp: Date.now(),
            state: this.deviceState,
            uptime: Date.now() - this.stats.uptime
        };

        this.lastHeartbeat = Date.now();
        this.stats.heartbeatsSent++;
        this.emit('heartbeat-sent', heartbeatData);
        return heartbeatData;
    }

    async cleanup() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }

        await this.attestationService.cleanup();
        await this.otaService.cleanup();
        this.pqcCrypto.cleanup();

        this.deviceState = 'offline';
        this.initialized = false;
        this.emit('cleanup-complete');
    }

    // Private methods
    _generateDeviceId() {
        return 'TERRAGON-' + Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex');
    }

    async _processCommand(commandData) {
        switch (commandData.type) {
            case 'get_status':
                return await this.getDeviceStatus();
            case 'collect_attestation':
                return await this.generateAttestationReport();
            case 'reboot':
                await new Promise(resolve => setTimeout(resolve, 1000));
                return { success: true, message: 'Device reboot initiated' };
            default:
                throw new Error(`Unknown command type: ${commandData.type}`);
        }
    }

    _startHeartbeat() {
        this.heartbeatTimer = setInterval(async () => {
            try {
                await this.sendHeartbeat();
            } catch (error) {
                this.emit('heartbeat-error', { error: error.message });
            }
        }, this.config.heartbeatInterval);
    }
}

module.exports = DeviceManagementService;