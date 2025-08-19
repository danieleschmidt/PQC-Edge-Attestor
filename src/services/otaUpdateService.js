/**
 * @file otaUpdateService.js
 * @brief Secure Over-The-Air update service - Generation 1
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');
const PQCCryptoService = require('./pqcCryptoService');

class OTAUpdateService extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            updateServerUrl: config.updateServerUrl || 'https://updates.terragon.io',
            deviceType: config.deviceType || 'PQC_EDGE_ATTESTOR',
            currentVersion: config.currentVersion || '1.0.0',
            updateCheckInterval: config.updateCheckInterval || 3600000, // 1 hour
            maxUpdateSize: config.maxUpdateSize || 100 * 1024 * 1024, // 100MB
            verifySignatures: config.verifySignatures !== false,
            enableAutoUpdate: config.enableAutoUpdate || false,
            updateDirectory: config.updateDirectory || './updates',
            ...config
        };

        this.pqcCrypto = new PQCCryptoService();
        this.updatePublicKey = null;
        this.downloadInProgress = false;
        this.updateCheckTimer = null;
        this.pendingUpdates = new Map();
        
        this.updateStates = {
            IDLE: 'idle',
            CHECKING: 'checking',
            DOWNLOADING: 'downloading',
            VERIFYING: 'verifying',
            INSTALLING: 'installing',
            COMPLETE: 'complete',
            ERROR: 'error'
        };
        
        this.currentState = this.updateStates.IDLE;
        this.lastCheck = 0;
        this.stats = {
            updatesChecked: 0,
            updatesDownloaded: 0,
            updatesInstalled: 0,
            updatesFailed: 0,
            totalBytesDownloaded: 0
        };
    }

    async initialize() {
        try {
            // Ensure update directory exists
            await this._ensureUpdateDirectory();
            
            // Initialize update server public key (for signature verification)
            await this._initializeUpdateKey();
            
            // Start automatic update checking if enabled
            if (this.config.enableAutoUpdate) {
                this._startUpdateTimer();
            }
            
            this.emit('initialized', {
                version: this.config.currentVersion,
                autoUpdate: this.config.enableAutoUpdate
            });

        } catch (error) {
            throw new Error(`OTA service initialization failed: ${error.message}`);
        }
    }

    async checkForUpdates() {
        if (this.currentState !== this.updateStates.IDLE) {
            throw new Error(`Cannot check for updates in state: ${this.currentState}`);
        }

        this.currentState = this.updateStates.CHECKING;
        this.lastCheck = Date.now();
        this.stats.updatesChecked++;

        try {
            this.emit('update-check-started');

            // Simulate checking for updates (Generation 1)
            const updateInfo = await this._fetchUpdateInfo();

            if (updateInfo.available) {
                this.emit('update-available', updateInfo);
                
                if (this.config.enableAutoUpdate) {
                    return await this.downloadUpdate(updateInfo);
                }
                
                return updateInfo;
            } else {
                this.emit('no-updates-available');
                return { available: false, message: 'No updates available' };
            }

        } catch (error) {
            this.currentState = this.updateStates.ERROR;
            this.stats.updatesFailed++;
            this.emit('update-check-failed', { error: error.message });
            throw error;
        } finally {
            if (this.currentState === this.updateStates.CHECKING) {
                this.currentState = this.updateStates.IDLE;
            }
        }
    }

    async downloadUpdate(updateInfo) {
        if (this.downloadInProgress) {
            throw new Error('Update download already in progress');
        }

        this.downloadInProgress = true;
        this.currentState = this.updateStates.DOWNLOADING;

        try {
            this.emit('download-started', updateInfo);

            // Generate mock update package for Generation 1
            const updatePackage = await this._generateMockUpdate(updateInfo);
            
            // Save update package
            const updatePath = path.join(this.config.updateDirectory, updateInfo.filename);
            await fs.writeFile(updatePath, updatePackage.data);

            this.stats.updatesDownloaded++;
            this.stats.totalBytesDownloaded += updatePackage.data.length;

            // Store update info
            this.pendingUpdates.set(updateInfo.version, {
                ...updateInfo,
                localPath: updatePath,
                downloadedAt: Date.now(),
                verified: false
            });

            this.emit('download-complete', {
                version: updateInfo.version,
                size: updatePackage.data.length,
                path: updatePath
            });

            // Auto-verify if signature verification is enabled
            if (this.config.verifySignatures) {
                return await this.verifyUpdate(updateInfo.version);
            }

            return { success: true, path: updatePath };

        } catch (error) {
            this.currentState = this.updateStates.ERROR;
            this.stats.updatesFailed++;
            this.emit('download-failed', { error: error.message });
            throw error;
        } finally {
            this.downloadInProgress = false;
            if (this.currentState === this.updateStates.DOWNLOADING) {
                this.currentState = this.updateStates.IDLE;
            }
        }
    }

    async verifyUpdate(version) {
        const updateInfo = this.pendingUpdates.get(version);
        if (!updateInfo) {
            throw new Error(`Update ${version} not found`);
        }

        this.currentState = this.updateStates.VERIFYING;

        try {
            this.emit('verification-started', { version });

            // Read update file
            const updateData = await fs.readFile(updateInfo.localPath);
            
            // Verify file hash
            const calculatedHash = crypto.createHash('sha256').update(updateData).digest('hex');
            if (calculatedHash !== updateInfo.hash) {
                throw new Error('Update file hash verification failed');
            }

            // Verify digital signature (Generation 1 simplified)
            if (this.config.verifySignatures && updateInfo.signature) {
                const signatureBuffer = Buffer.from(updateInfo.signature, 'hex');
                const isValid = await this.pqcCrypto.dilithiumVerify(
                    signatureBuffer,
                    updateData,
                    this.updatePublicKey
                );

                if (!isValid) {
                    throw new Error('Update signature verification failed');
                }
            }

            // Mark as verified
            updateInfo.verified = true;
            updateInfo.verifiedAt = Date.now();
            this.pendingUpdates.set(version, updateInfo);

            this.emit('verification-complete', { version, verified: true });

            // Auto-install if auto-update is enabled
            if (this.config.enableAutoUpdate) {
                return await this.installUpdate(version);
            }

            return { success: true, verified: true };

        } catch (error) {
            this.currentState = this.updateStates.ERROR;
            this.stats.updatesFailed++;
            this.emit('verification-failed', { version, error: error.message });
            throw error;
        } finally {
            if (this.currentState === this.updateStates.VERIFYING) {
                this.currentState = this.updateStates.IDLE;
            }
        }
    }

    async installUpdate(version) {
        const updateInfo = this.pendingUpdates.get(version);
        if (!updateInfo) {
            throw new Error(`Update ${version} not found`);
        }

        if (!updateInfo.verified && this.config.verifySignatures) {
            throw new Error('Cannot install unverified update');
        }

        this.currentState = this.updateStates.INSTALLING;

        try {
            this.emit('installation-started', { version });

            // Simulate installation process (Generation 1)
            await this._simulateInstallation(updateInfo);

            // Update current version
            this.config.currentVersion = version;
            
            // Clean up old update files
            await this._cleanupUpdate(updateInfo);
            this.pendingUpdates.delete(version);

            this.stats.updatesInstalled++;
            this.currentState = this.updateStates.COMPLETE;

            this.emit('installation-complete', {
                version,
                previousVersion: updateInfo.previousVersion || 'unknown'
            });

            return { success: true, newVersion: version };

        } catch (error) {
            this.currentState = this.updateStates.ERROR;
            this.stats.updatesFailed++;
            this.emit('installation-failed', { version, error: error.message });
            throw error;
        } finally {
            if (this.currentState === this.updateStates.INSTALLING) {
                this.currentState = this.updateStates.IDLE;
            }
        }
    }

    async rollbackUpdate(toVersion = null) {
        try {
            this.emit('rollback-started', { toVersion });

            // Simulate rollback process (Generation 1)
            const previousVersion = toVersion || this._getPreviousVersion();
            
            if (!previousVersion) {
                throw new Error('No previous version available for rollback');
            }

            // Simulate rollback installation
            await new Promise(resolve => setTimeout(resolve, 2000));

            this.config.currentVersion = previousVersion;
            this.currentState = this.updateStates.COMPLETE;

            this.emit('rollback-complete', { 
                version: previousVersion,
                rolledBackFrom: this.config.currentVersion
            });

            return { success: true, version: previousVersion };

        } catch (error) {
            this.currentState = this.updateStates.ERROR;
            this.emit('rollback-failed', { error: error.message });
            throw error;
        }
    }

    getPendingUpdates() {
        return Array.from(this.pendingUpdates.values());
    }

    getCurrentVersion() {
        return this.config.currentVersion;
    }

    getUpdateStats() {
        return {
            ...this.stats,
            currentState: this.currentState,
            lastCheck: this.lastCheck,
            pendingUpdates: this.pendingUpdates.size
        };
    }

    async cleanup() {
        // Stop update timer
        if (this.updateCheckTimer) {
            clearInterval(this.updateCheckTimer);
            this.updateCheckTimer = null;
        }

        // Clean up pending updates
        for (const [version, updateInfo] of this.pendingUpdates) {
            try {
                await this._cleanupUpdate(updateInfo);
            } catch (error) {
                // Ignore cleanup errors during shutdown
            }
        }
        this.pendingUpdates.clear();

        // Cleanup crypto service
        this.pqcCrypto.cleanup();

        this.emit('cleanup-complete');
    }

    // Private helper methods

    async _ensureUpdateDirectory() {
        try {
            await fs.access(this.config.updateDirectory);
        } catch {
            await fs.mkdir(this.config.updateDirectory, { recursive: true });
        }
    }

    async _initializeUpdateKey() {
        // Generate mock update server public key for Generation 1
        const serverKeypair = await this.pqcCrypto.generateDilithiumKeypair();
        this.updatePublicKey = serverKeypair.publicKey;
    }

    async _fetchUpdateInfo() {
        // Simulate fetching update information (Generation 1)
        await new Promise(resolve => setTimeout(resolve, 1000));

        const currentVersionNum = this._parseVersion(this.config.currentVersion);
        const latestVersionNum = currentVersionNum + 1;
        const latestVersion = `1.${latestVersionNum}.0`;

        // Randomly decide if update is available (for testing)
        const available = Math.random() > 0.7; // 30% chance of update

        if (!available) {
            return { available: false };
        }

        return {
            available: true,
            version: latestVersion,
            previousVersion: this.config.currentVersion,
            filename: `update-${latestVersion}.pkg`,
            size: Math.floor(Math.random() * 10000000) + 1000000, // 1-10MB
            hash: crypto.randomBytes(32).toString('hex'),
            signature: crypto.randomBytes(128).toString('hex'),
            releaseNotes: `Release ${latestVersion}: Enhanced security and performance improvements`,
            critical: Math.random() > 0.8, // 20% chance of critical update
            downloadUrl: `${this.config.updateServerUrl}/updates/${latestVersion}`
        };
    }

    async _generateMockUpdate(updateInfo) {
        // Generate mock update package data
        const packageInfo = {
            version: updateInfo.version,
            previousVersion: updateInfo.previousVersion,
            timestamp: Date.now(),
            deviceType: this.config.deviceType,
            files: [
                { path: '/app/main.js', hash: crypto.randomBytes(32).toString('hex') },
                { path: '/app/package.json', hash: crypto.randomBytes(32).toString('hex') }
            ]
        };

        const packageData = Buffer.from(JSON.stringify(packageInfo) + '\n' + 'UPDATE_BINARY_DATA'.repeat(1000));
        
        return {
            data: packageData,
            info: packageInfo
        };
    }

    async _simulateInstallation(updateInfo) {
        // Simulate installation steps
        const steps = [
            'Backing up current version',
            'Extracting update package',
            'Verifying file integrity',
            'Installing new files',
            'Updating configuration',
            'Finalizing installation'
        ];

        for (const step of steps) {
            this.emit('installation-progress', { 
                step, 
                version: updateInfo.version 
            });
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    async _cleanupUpdate(updateInfo) {
        try {
            await fs.unlink(updateInfo.localPath);
        } catch (error) {
            // Ignore cleanup errors
        }
    }

    _parseVersion(version) {
        const parts = version.split('.');
        return parseInt(parts[1] || '0', 10);
    }

    _getPreviousVersion() {
        const currentNum = this._parseVersion(this.config.currentVersion);
        if (currentNum > 0) {
            return `1.${currentNum - 1}.0`;
        }
        return null;
    }

    _startUpdateTimer() {
        if (this.updateCheckTimer) {
            clearInterval(this.updateCheckTimer);
        }

        this.updateCheckTimer = setInterval(async () => {
            try {
                await this.checkForUpdates();
            } catch (error) {
                this.emit('auto-update-error', { error: error.message });
            }
        }, this.config.updateCheckInterval);

        this.emit('auto-update-enabled', { 
            interval: this.config.updateCheckInterval 
        });
    }
}

module.exports = OTAUpdateService;