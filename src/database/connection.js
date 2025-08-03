const { Sequelize } = require('sequelize');
const redis = require('redis');
const logger = require('../utils/logger');

class DatabaseConnection {
  constructor(config = {}) {
    this.config = {
      database: config.database || process.env.DB_NAME || 'pqc_attestor',
      username: config.username || process.env.DB_USER || 'postgres',
      password: config.password || process.env.DB_PASSWORD || 'password',
      host: config.host || process.env.DB_HOST || 'localhost',
      port: config.port || process.env.DB_PORT || 5432,
      dialect: config.dialect || 'postgres',
      ssl: config.ssl || process.env.DB_SSL === 'true',
      pool: {
        max: config.poolMax || parseInt(process.env.DB_POOL_SIZE) || 10,
        min: 0,
        acquire: 30000,
        idle: 10000
      },
      logging: config.logging || ((msg) => logger.debug(msg)),
      dialectOptions: {
        ssl: config.ssl ? {
          require: true,
          rejectUnauthorized: false
        } : false
      },
      ...config
    };

    this.redisConfig = {
      host: config.redisHost || process.env.REDIS_HOST || 'localhost',
      port: config.redisPort || process.env.REDIS_PORT || 6379,
      password: config.redisPassword || process.env.REDIS_PASSWORD || '',
      db: config.redisDb || process.env.REDIS_DB || 0,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: null
    };

    this.sequelize = null;
    this.redisClient = null;
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxRetries = config.maxRetries || 5;
  }

  async connect() {
    try {
      await this.connectPostgreSQL();
      await this.connectRedis();
      
      this.isConnected = true;
      this.connectionAttempts = 0;
      
      logger.info('Database connections established successfully', {
        postgres: 'connected',
        redis: 'connected'
      });

      return true;

    } catch (error) {
      this.connectionAttempts++;
      logger.error('Database connection failed', { 
        error: error.message,
        attempt: this.connectionAttempts,
        maxRetries: this.maxRetries
      });

      if (this.connectionAttempts < this.maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, this.connectionAttempts), 30000);
        logger.info(`Retrying database connection in ${delay}ms`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.connect();
      }

      throw new Error(`Failed to connect to database after ${this.maxRetries} attempts`);
    }
  }

  async connectPostgreSQL() {
    try {
      this.sequelize = new Sequelize(
        this.config.database,
        this.config.username,
        this.config.password,
        {
          host: this.config.host,
          port: this.config.port,
          dialect: this.config.dialect,
          dialectOptions: this.config.dialectOptions,
          pool: this.config.pool,
          logging: this.config.logging,
          define: {
            timestamps: true,
            underscored: true,
            freezeTableName: true
          }
        }
      );

      // Test the connection
      await this.sequelize.authenticate();
      
      logger.info('PostgreSQL connection established', {
        host: this.config.host,
        port: this.config.port,
        database: this.config.database
      });

    } catch (error) {
      logger.error('PostgreSQL connection failed', { error: error.message });
      throw error;
    }
  }

  async connectRedis() {
    try {
      this.redisClient = redis.createClient(this.redisConfig);

      this.redisClient.on('error', (error) => {
        logger.error('Redis client error', { error: error.message });
      });

      this.redisClient.on('connect', () => {
        logger.info('Redis connection established', {
          host: this.redisConfig.host,
          port: this.redisConfig.port
        });
      });

      this.redisClient.on('ready', () => {
        logger.info('Redis client ready');
      });

      this.redisClient.on('end', () => {
        logger.warn('Redis connection closed');
      });

      await this.redisClient.connect();

    } catch (error) {
      logger.error('Redis connection failed', { error: error.message });
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.sequelize) {
        await this.sequelize.close();
        logger.info('PostgreSQL connection closed');
      }

      if (this.redisClient) {
        await this.redisClient.quit();
        logger.info('Redis connection closed');
      }

      this.isConnected = false;

    } catch (error) {
      logger.error('Error disconnecting from databases', { error: error.message });
      throw error;
    }
  }

  async testConnection() {
    try {
      if (!this.isConnected) {
        throw new Error('Database not connected');
      }

      // Test PostgreSQL
      await this.sequelize.query('SELECT 1');
      
      // Test Redis
      await this.redisClient.ping();

      return {
        postgres: 'healthy',
        redis: 'healthy',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Database health check failed', { error: error.message });
      throw error;
    }
  }

  async createTransaction() {
    if (!this.sequelize) {
      throw new Error('PostgreSQL not connected');
    }

    return await this.sequelize.transaction();
  }

  async executeQuery(query, options = {}) {
    try {
      if (!this.sequelize) {
        throw new Error('PostgreSQL not connected');
      }

      const startTime = Date.now();
      const result = await this.sequelize.query(query, {
        type: Sequelize.QueryTypes.SELECT,
        ...options
      });
      
      const executionTime = Date.now() - startTime;
      
      logger.debug('Query executed', {
        query: query.substring(0, 100),
        executionTime: `${executionTime}ms`,
        resultCount: result.length
      });

      return result;

    } catch (error) {
      logger.error('Query execution failed', { 
        query: query.substring(0, 100),
        error: error.message 
      });
      throw error;
    }
  }

  async cacheGet(key) {
    try {
      if (!this.redisClient) {
        throw new Error('Redis not connected');
      }

      const value = await this.redisClient.get(key);
      return value ? JSON.parse(value) : null;

    } catch (error) {
      logger.error('Cache get failed', { key, error: error.message });
      return null;
    }
  }

  async cacheSet(key, value, ttl = 3600) {
    try {
      if (!this.redisClient) {
        throw new Error('Redis not connected');
      }

      await this.redisClient.setEx(key, ttl, JSON.stringify(value));
      return true;

    } catch (error) {
      logger.error('Cache set failed', { key, error: error.message });
      return false;
    }
  }

  async cacheDelete(key) {
    try {
      if (!this.redisClient) {
        throw new Error('Redis not connected');
      }

      await this.redisClient.del(key);
      return true;

    } catch (error) {
      logger.error('Cache delete failed', { key, error: error.message });
      return false;
    }
  }

  async cacheFlush() {
    try {
      if (!this.redisClient) {
        throw new Error('Redis not connected');
      }

      await this.redisClient.flushDb();
      logger.info('Cache flushed');
      return true;

    } catch (error) {
      logger.error('Cache flush failed', { error: error.message });
      return false;
    }
  }

  getSequelize() {
    return this.sequelize;
  }

  getRedisClient() {
    return this.redisClient;
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      connectionAttempts: this.connectionAttempts,
      postgres: {
        database: this.config.database,
        host: this.config.host,
        port: this.config.port
      },
      redis: {
        host: this.redisConfig.host,
        port: this.redisConfig.port,
        db: this.redisConfig.db
      }
    };
  }

  async getConnectionStats() {
    try {
      const stats = {
        postgres: {
          poolSize: this.config.pool.max,
          activeConnections: 0,
          idleConnections: 0
        },
        redis: {
          status: 'unknown',
          usedMemory: 0,
          connectedClients: 0
        }
      };

      if (this.sequelize) {
        const pool = this.sequelize.connectionManager.pool;
        stats.postgres.activeConnections = pool.used.length;
        stats.postgres.idleConnections = pool.free.length;
      }

      if (this.redisClient) {
        const info = await this.redisClient.info();
        const lines = info.split('\r\n');
        
        for (const line of lines) {
          if (line.startsWith('used_memory:')) {
            stats.redis.usedMemory = parseInt(line.split(':')[1]);
          }
          if (line.startsWith('connected_clients:')) {
            stats.redis.connectedClients = parseInt(line.split(':')[1]);
          }
        }
        
        stats.redis.status = 'connected';
      }

      return stats;

    } catch (error) {
      logger.error('Failed to get connection stats', { error: error.message });
      throw error;
    }
  }
}

// Export singleton instance
let dbConnection = null;

function createConnection(config) {
  if (!dbConnection) {
    dbConnection = new DatabaseConnection(config);
  }
  return dbConnection;
}

function getConnection() {
  if (!dbConnection) {
    throw new Error('Database connection not initialized. Call createConnection() first.');
  }
  return dbConnection;
}

module.exports = {
  DatabaseConnection,
  createConnection,
  getConnection
};