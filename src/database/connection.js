/**
 * @file connection.js
 * @brief Database connection management for PQC-Edge-Attestor
 * 
 * This module manages database connections, connection pooling, and provides
 * utilities for database operations with proper error handling and monitoring.
 */

const { Sequelize } = require('sequelize');
const winston = require('winston');
const path = require('path');

// Database configuration
const config = {
    development: {
        dialect: 'postgres',
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'pqc_attestor_dev',
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'password',
        logging: (msg) => winston.debug(msg),
        pool: {
            max: parseInt(process.env.DB_POOL_MAX) || 10,
            min: parseInt(process.env.DB_POOL_MIN) || 2,
            acquire: parseInt(process.env.DB_POOL_ACQUIRE) || 30000,
            idle: parseInt(process.env.DB_POOL_IDLE) || 10000
        },
        dialectOptions: {
            ssl: process.env.DB_SSL === 'true' ? {
                require: true,
                rejectUnauthorized: false
            } : false
        }
    },
    
    test: {
        dialect: 'postgres',
        host: process.env.TEST_DB_HOST || 'localhost',
        port: process.env.TEST_DB_PORT || 5432,
        database: process.env.TEST_DB_NAME || 'pqc_attestor_test',
        username: process.env.TEST_DB_USER || 'postgres',
        password: process.env.TEST_DB_PASSWORD || 'password',
        logging: false, // Disable logging in tests
        pool: {
            max: 5,
            min: 1,
            acquire: 10000,
            idle: 5000
        }
    },
    
    production: {
        dialect: 'postgres',
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME,
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        logging: false,
        pool: {
            max: parseInt(process.env.DB_POOL_MAX) || 20,
            min: parseInt(process.env.DB_POOL_MIN) || 5,
            acquire: parseInt(process.env.DB_POOL_ACQUIRE) || 60000,
            idle: parseInt(process.env.DB_POOL_IDLE) || 10000
        },
        dialectOptions: {
            ssl: {
                require: true,
                rejectUnauthorized: true,
                ca: process.env.DB_SSL_CA,
                cert: process.env.DB_SSL_CERT,
                key: process.env.DB_SSL_KEY
            }
        },
        // Production-specific optimizations
        define: {
            freezeTableName: true,
            underscored: true
        },
        benchmark: true,
        retry: {
            max: 3,
            timeout: 5000
        }
    }
};

class DatabaseManager {
    constructor() {
        this.sequelize = null;
        this.isConnected = false;
        this.connectionAttempts = 0;
        this.maxRetries = 5;
        this.retryDelay = 5000; // 5 seconds
        
        this.logger = winston.createLogger({
            level: process.env.LOG_LEVEL || 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json()
            ),
            defaultMeta: { service: 'database' },
            transports: [
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.simple()
                    )
                })
            ]
        });
    }

    /**
     * Initialize database connection
     * @param {string} environment - Environment (development, test, production)
     * @returns {Promise<Sequelize>} Sequelize instance
     */
    async initialize(environment = process.env.NODE_ENV || 'development') {
        if (this.sequelize && this.isConnected) {
            return this.sequelize;
        }

        const dbConfig = config[environment];
        if (!dbConfig) {
            throw new Error(`Database configuration not found for environment: ${environment}`);
        }

        this.logger.info(`Initializing database connection for ${environment} environment`);

        try {
            // Create Sequelize instance
            this.sequelize = new Sequelize(
                dbConfig.database,
                dbConfig.username,
                dbConfig.password,
                {
                    ...dbConfig,
                    hooks: {
                        beforeConnect: (config) => {
                            this.logger.debug('Attempting database connection...');
                        },
                        afterConnect: (connection, config) => {
                            this.logger.info('Database connection established successfully');
                            this.isConnected = true;
                            this.connectionAttempts = 0;
                        },
                        beforeDisconnect: (connection) => {
                            this.logger.info('Disconnecting from database...');
                        },
                        afterDisconnect: (connection) => {
                            this.logger.info('Database connection closed');
                            this.isConnected = false;
                        }
                    }
                }
            );

            // Test the connection
            await this.testConnection();

            // Setup connection monitoring
            this.setupConnectionMonitoring();

            return this.sequelize;

        } catch (error) {
            this.logger.error('Failed to initialize database connection', { error: error.message });
            await this.handleConnectionError(error, environment);
            throw error;
        }
    }

    /**
     * Test database connection
     * @returns {Promise<boolean>} True if connection is successful
     */
    async testConnection() {
        try {
            await this.sequelize.authenticate();
            this.logger.info('Database connection test successful');
            return true;
        } catch (error) {
            this.logger.error('Database connection test failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Handle connection errors with retry logic
     * @param {Error} error - Connection error
     * @param {string} environment - Environment name
     */
    async handleConnectionError(error, environment) {
        this.connectionAttempts++;
        this.isConnected = false;

        if (this.connectionAttempts >= this.maxRetries) {
            this.logger.error(`Maximum connection attempts (${this.maxRetries}) reached. Giving up.`);
            throw new Error(`Database connection failed after ${this.maxRetries} attempts: ${error.message}`);
        }

        this.logger.warn(`Connection attempt ${this.connectionAttempts} failed. Retrying in ${this.retryDelay}ms...`, {
            error: error.message,
            attempt: this.connectionAttempts,
            maxRetries: this.maxRetries
        });

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));

        // Exponential backoff
        this.retryDelay = Math.min(this.retryDelay * 2, 30000); // Max 30 seconds

        try {
            await this.initialize(environment);
        } catch (retryError) {
            // This will recursively call handleConnectionError
            throw retryError;
        }
    }

    /**
     * Setup connection monitoring and health checks
     */
    setupConnectionMonitoring() {
        // Monitor connection pool
        this.sequelize.connectionManager.pool.on('acquire', (connection) => {
            this.logger.debug('Database connection acquired from pool');
        });

        this.sequelize.connectionManager.pool.on('release', (connection) => {
            this.logger.debug('Database connection released to pool');
        });

        this.sequelize.connectionManager.pool.on('remove', (connection) => {
            this.logger.debug('Database connection removed from pool');
        });

        // Setup periodic health checks
        this.setupHealthCheck();
    }

    /**
     * Setup periodic health checks
     */
    setupHealthCheck() {
        const healthCheckInterval = parseInt(process.env.DB_HEALTH_CHECK_INTERVAL) || 30000; // 30 seconds

        setInterval(async () => {
            try {
                await this.sequelize.authenticate();
                this.logger.debug('Database health check passed');
            } catch (error) {
                this.logger.error('Database health check failed', { error: error.message });
                this.isConnected = false;
                
                // Attempt to reconnect
                try {
                    await this.reconnect();
                } catch (reconnectError) {
                    this.logger.error('Failed to reconnect during health check', { 
                        error: reconnectError.message 
                    });
                }
            }
        }, healthCheckInterval);
    }

    /**
     * Reconnect to database
     * @returns {Promise<void>}
     */
    async reconnect() {
        this.logger.info('Attempting to reconnect to database...');
        
        if (this.sequelize) {
            try {
                await this.sequelize.close();
            } catch (error) {
                this.logger.warn('Error closing existing connection', { error: error.message });
            }
        }

        this.sequelize = null;
        this.isConnected = false;
        this.connectionAttempts = 0;

        await this.initialize();
    }

    /**
     * Execute a transaction with retry logic
     * @param {Function} callback - Transaction callback
     * @param {Object} options - Transaction options
     * @returns {Promise<any>} Transaction result
     */
    async executeTransaction(callback, options = {}) {
        const maxRetries = options.maxRetries || 3;
        let attempt = 0;

        while (attempt < maxRetries) {
            try {
                return await this.sequelize.transaction(options, callback);
            } catch (error) {
                attempt++;
                
                // Check if error is retryable
                if (this.isRetryableError(error) && attempt < maxRetries) {
                    this.logger.warn(`Transaction failed, retrying (attempt ${attempt}/${maxRetries})`, {
                        error: error.message
                    });
                    
                    // Wait before retrying with exponential backoff
                    await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
                    continue;
                }
                
                this.logger.error('Transaction failed permanently', { 
                    error: error.message,
                    attempts: attempt
                });
                throw error;
            }
        }
    }

    /**
     * Check if error is retryable
     * @param {Error} error - Database error
     * @returns {boolean} True if error is retryable
     */
    isRetryableError(error) {
        const retryableErrors = [
            'ECONNRESET',
            'ENOTFOUND',
            'ECONNREFUSED',
            'ETIMEDOUT',
            'connection terminated',
            'connection timeout',
            'serialization failure',
            'deadlock detected'
        ];

        return retryableErrors.some(errorType => 
            error.message.toLowerCase().includes(errorType.toLowerCase())
        );
    }

    /**
     * Get connection statistics
     * @returns {Object} Connection statistics
     */
    getConnectionStats() {
        if (!this.sequelize || !this.sequelize.connectionManager.pool) {
            return {
                connected: false,
                error: 'No connection pool available'
            };
        }

        const pool = this.sequelize.connectionManager.pool;
        
        return {
            connected: this.isConnected,
            pool: {
                size: pool.size,
                available: pool.available,
                using: pool.using,
                waiting: pool.waiting,
                max: pool.max,
                min: pool.min
            },
            connectionAttempts: this.connectionAttempts,
            lastError: this.lastError || null
        };
    }

    /**
     * Close database connection
     * @returns {Promise<void>}
     */
    async close() {
        if (this.sequelize) {
            this.logger.info('Closing database connection...');
            
            try {
                await this.sequelize.close();
                this.sequelize = null;
                this.isConnected = false;
                this.logger.info('Database connection closed successfully');
            } catch (error) {
                this.logger.error('Error closing database connection', { error: error.message });
                throw error;
            }
        }
    }

    /**
     * Run database migrations
     * @returns {Promise<void>}
     */
    async runMigrations() {
        if (!this.sequelize) {
            throw new Error('Database not initialized');
        }

        this.logger.info('Running database migrations...');
        
        try {
            const { Umzug, SequelizeStorage } = require('umzug');
            
            const umzug = new Umzug({
                migrations: {
                    glob: path.join(__dirname, '../migrations/*.js')
                },
                context: this.sequelize.getQueryInterface(),
                storage: new SequelizeStorage({ sequelize: this.sequelize }),
                logger: this.logger
            });

            const migrations = await umzug.up();
            
            this.logger.info(`Executed ${migrations.length} migrations`, {
                migrations: migrations.map(m => m.name)
            });
            
        } catch (error) {
            this.logger.error('Migration failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Run database seeds
     * @returns {Promise<void>}
     */
    async runSeeds() {
        if (!this.sequelize) {
            throw new Error('Database not initialized');
        }

        if (process.env.NODE_ENV === 'production') {
            this.logger.warn('Skipping seeds in production environment');
            return;
        }

        this.logger.info('Running database seeds...');
        
        try {
            const seedFiles = require('fs').readdirSync(path.join(__dirname, '../seeds'))
                .filter(file => file.endsWith('.js'))
                .sort();

            for (const seedFile of seedFiles) {
                const seedModule = require(path.join(__dirname, '../seeds', seedFile));
                await seedModule.up(this.sequelize.getQueryInterface(), this.sequelize);
                this.logger.info(`Executed seed: ${seedFile}`);
            }
            
        } catch (error) {
            this.logger.error('Seed execution failed', { error: error.message });
            throw error;
        }
    }
}

// Create singleton instance
const databaseManager = new DatabaseManager();

// Export functions for easy use
module.exports = {
    /**
     * Get database connection
     * @param {string} environment - Environment name
     * @returns {Promise<Sequelize>} Sequelize instance
     */
    getConnection: (environment) => databaseManager.initialize(environment),
    
    /**
     * Test database connection
     * @returns {Promise<boolean>} Connection test result
     */
    testConnection: () => databaseManager.testConnection(),
    
    /**
     * Execute transaction
     * @param {Function} callback - Transaction callback
     * @param {Object} options - Transaction options
     * @returns {Promise<any>} Transaction result
     */
    executeTransaction: (callback, options) => databaseManager.executeTransaction(callback, options),
    
    /**
     * Get connection statistics
     * @returns {Object} Connection statistics
     */
    getStats: () => databaseManager.getConnectionStats(),
    
    /**
     * Close database connection
     * @returns {Promise<void>}
     */
    close: () => databaseManager.close(),
    
    /**
     * Run migrations
     * @returns {Promise<void>}
     */
    migrate: () => databaseManager.runMigrations(),
    
    /**
     * Run seeds
     * @returns {Promise<void>}
     */
    seed: () => databaseManager.runSeeds(),
    
    /**
     * Get the database manager instance
     * @returns {DatabaseManager} Database manager instance
     */
    getManager: () => databaseManager,
    
    /**
     * Configuration for different environments
     */
    config
};