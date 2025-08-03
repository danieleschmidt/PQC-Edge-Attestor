/**
 * @file baseRepository.js
 * @brief Base repository class providing common CRUD operations
 * 
 * Implements the Repository pattern with standardized database operations,
 * error handling, caching, and performance monitoring for all entities.
 */

const winston = require('winston');
const { Op } = require('sequelize');
const { getConnection, executeTransaction } = require('../database/connection');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'base-repository' },
  transports: [
    new winston.transports.File({ filename: 'logs/repository-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/repository-combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

class BaseRepository {
  constructor(model) {
    this.model = model;
    this.cache = new Map();
    this.cacheTTL = 300000; // 5 minutes
    this.metrics = {
      queries: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errors: 0,
      totalLatency: 0
    };
  }

  /**
   * Find entity by primary key with caching
   * @param {string|number} id - Primary key
   * @param {Object} options - Query options
   * @returns {Promise<Object|null>} Entity or null
   */
  async findById(id, options = {}) {
    const startTime = Date.now();
    const cacheKey = `${this.model.name}:${id}`;
    
    try {
      // Check cache first
      if (!options.skipCache && this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheTTL) {
          this.metrics.cacheHits++;
          logger.debug('Cache hit for entity', { model: this.model.name, id });
          return cached.data;
        } else {
          this.cache.delete(cacheKey);
        }
      }
      
      this.metrics.cacheMisses++;
      this.metrics.queries++;
      
      // Query database
      const entity = await this.model.findByPk(id, {
        ...options,
        benchmark: true
      });
      
      // Cache result
      if (entity && !options.skipCache) {
        this.cache.set(cacheKey, {
          data: entity,
          timestamp: Date.now()
        });
      }
      
      this.metrics.totalLatency += Date.now() - startTime;
      
      logger.debug('Entity retrieved by ID', {
        model: this.model.name,
        id: id,
        found: !!entity,
        duration: Date.now() - startTime
      });
      
      return entity;
      
    } catch (error) {
      this.metrics.errors++;
      logger.error('Failed to find entity by ID', {
        model: this.model.name,
        id: id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Find all entities matching criteria with pagination
   * @param {Object} criteria - Search criteria
   * @param {Object} options - Query options (limit, offset, order, include)
   * @returns {Promise<{rows: Array, count: number}>} Results with count
   */
  async findAll(criteria = {}, options = {}) {
    const startTime = Date.now();
    
    try {
      this.metrics.queries++;
      
      const queryOptions = {
        where: this._buildWhereClause(criteria),
        limit: options.limit || 50,
        offset: options.offset || 0,
        order: options.order || [['createdAt', 'DESC']],
        include: options.include || [],
        distinct: options.distinct || true,
        benchmark: true
      };
      
      const result = await this.model.findAndCountAll(queryOptions);
      
      this.metrics.totalLatency += Date.now() - startTime;
      
      logger.debug('Entities retrieved', {
        model: this.model.name,
        count: result.count,
        returned: result.rows.length,
        criteria: Object.keys(criteria),
        duration: Date.now() - startTime
      });
      
      return result;
      
    } catch (error) {
      this.metrics.errors++;
      logger.error('Failed to find entities', {
        model: this.model.name,
        criteria: criteria,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Find single entity matching criteria
   * @param {Object} criteria - Search criteria
   * @param {Object} options - Query options
   * @returns {Promise<Object|null>} Entity or null
   */
  async findOne(criteria, options = {}) {
    const startTime = Date.now();
    
    try {
      this.metrics.queries++;
      
      const entity = await this.model.findOne({
        where: this._buildWhereClause(criteria),
        include: options.include || [],
        order: options.order,
        benchmark: true
      });
      
      this.metrics.totalLatency += Date.now() - startTime;
      
      logger.debug('Single entity retrieved', {
        model: this.model.name,
        found: !!entity,
        criteria: Object.keys(criteria),
        duration: Date.now() - startTime
      });
      
      return entity;
      
    } catch (error) {
      this.metrics.errors++;
      logger.error('Failed to find single entity', {
        model: this.model.name,
        criteria: criteria,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create new entity
   * @param {Object} data - Entity data
   * @param {Object} options - Creation options
   * @returns {Promise<Object>} Created entity
   */
  async create(data, options = {}) {
    const startTime = Date.now();
    
    try {
      this.metrics.queries++;
      
      // Validate data
      const validatedData = await this._validateData(data, 'create');
      
      let entity;
      if (options.transaction) {
        entity = await this.model.create(validatedData, {
          transaction: options.transaction,
          benchmark: true
        });
      } else {
        entity = await executeTransaction(async (transaction) => {
          return await this.model.create(validatedData, {
            transaction,
            benchmark: true
          });
        });
      }
      
      // Invalidate related cache entries
      this._invalidateCache(entity.id);
      
      this.metrics.totalLatency += Date.now() - startTime;
      
      logger.info('Entity created', {
        model: this.model.name,
        id: entity.id,
        duration: Date.now() - startTime
      });
      
      return entity;
      
    } catch (error) {
      this.metrics.errors++;
      logger.error('Failed to create entity', {
        model: this.model.name,
        data: this._sanitizeLogData(data),
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update entity by ID
   * @param {string|number} id - Entity ID
   * @param {Object} data - Update data
   * @param {Object} options - Update options
   * @returns {Promise<Object>} Updated entity
   */
  async update(id, data, options = {}) {
    const startTime = Date.now();
    
    try {
      this.metrics.queries++;
      
      // Validate data
      const validatedData = await this._validateData(data, 'update');
      
      let entity;
      if (options.transaction) {
        const [affectedRows] = await this.model.update(validatedData, {
          where: { id },
          transaction: options.transaction,
          benchmark: true
        });
        
        if (affectedRows === 0) {
          throw new Error(`Entity with ID ${id} not found`);
        }
        
        entity = await this.model.findByPk(id, {
          transaction: options.transaction
        });
      } else {
        entity = await executeTransaction(async (transaction) => {
          const [affectedRows] = await this.model.update(validatedData, {
            where: { id },
            transaction,
            benchmark: true
          });
          
          if (affectedRows === 0) {
            throw new Error(`Entity with ID ${id} not found`);
          }
          
          return await this.model.findByPk(id, { transaction });
        });
      }
      
      // Invalidate cache
      this._invalidateCache(id);
      
      this.metrics.totalLatency += Date.now() - startTime;
      
      logger.info('Entity updated', {
        model: this.model.name,
        id: id,
        fields: Object.keys(validatedData),
        duration: Date.now() - startTime
      });
      
      return entity;
      
    } catch (error) {
      this.metrics.errors++;
      logger.error('Failed to update entity', {
        model: this.model.name,
        id: id,
        data: this._sanitizeLogData(data),
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Delete entity by ID
   * @param {string|number} id - Entity ID
   * @param {Object} options - Delete options
   * @returns {Promise<boolean>} True if deleted
   */
  async delete(id, options = {}) {
    const startTime = Date.now();
    
    try {
      this.metrics.queries++;
      
      let affectedRows;
      if (options.transaction) {
        affectedRows = await this.model.destroy({
          where: { id },
          transaction: options.transaction,
          benchmark: true
        });
      } else {
        affectedRows = await executeTransaction(async (transaction) => {
          return await this.model.destroy({
            where: { id },
            transaction,
            benchmark: true
          });
        });
      }
      
      const deleted = affectedRows > 0;
      
      if (deleted) {
        // Invalidate cache
        this._invalidateCache(id);
      }
      
      this.metrics.totalLatency += Date.now() - startTime;
      
      logger.info('Entity deletion attempted', {
        model: this.model.name,
        id: id,
        deleted: deleted,
        duration: Date.now() - startTime
      });
      
      return deleted;
      
    } catch (error) {
      this.metrics.errors++;
      logger.error('Failed to delete entity', {
        model: this.model.name,
        id: id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Bulk create entities
   * @param {Array<Object>} dataArray - Array of entity data
   * @param {Object} options - Creation options
   * @returns {Promise<Array<Object>>} Created entities
   */
  async bulkCreate(dataArray, options = {}) {
    const startTime = Date.now();
    
    try {
      this.metrics.queries++;
      
      if (!Array.isArray(dataArray) || dataArray.length === 0) {
        throw new Error('Invalid data array for bulk create');
      }
      
      // Validate all data
      const validatedDataArray = await Promise.all(
        dataArray.map(data => this._validateData(data, 'create'))
      );
      
      let entities;
      if (options.transaction) {
        entities = await this.model.bulkCreate(validatedDataArray, {
          transaction: options.transaction,
          benchmark: true,
          validate: true,
          ignoreDuplicates: options.ignoreDuplicates || false
        });
      } else {
        entities = await executeTransaction(async (transaction) => {
          return await this.model.bulkCreate(validatedDataArray, {
            transaction,
            benchmark: true,
            validate: true,
            ignoreDuplicates: options.ignoreDuplicates || false
          });
        });
      }
      
      this.metrics.totalLatency += Date.now() - startTime;
      
      logger.info('Bulk entities created', {
        model: this.model.name,
        count: entities.length,
        duration: Date.now() - startTime
      });
      
      return entities;
      
    } catch (error) {
      this.metrics.errors++;
      logger.error('Failed to bulk create entities', {
        model: this.model.name,
        count: dataArray.length,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Count entities matching criteria
   * @param {Object} criteria - Search criteria
   * @returns {Promise<number>} Count of entities
   */
  async count(criteria = {}) {
    const startTime = Date.now();
    
    try {
      this.metrics.queries++;
      
      const count = await this.model.count({
        where: this._buildWhereClause(criteria),
        benchmark: true
      });
      
      this.metrics.totalLatency += Date.now() - startTime;
      
      logger.debug('Entity count retrieved', {
        model: this.model.name,
        count: count,
        criteria: Object.keys(criteria),
        duration: Date.now() - startTime
      });
      
      return count;
      
    } catch (error) {
      this.metrics.errors++;
      logger.error('Failed to count entities', {
        model: this.model.name,
        criteria: criteria,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Check if entity exists
   * @param {Object} criteria - Search criteria
   * @returns {Promise<boolean>} True if exists
   */
  async exists(criteria) {
    const count = await this.count(criteria);
    return count > 0;
  }

  /**
   * Get repository metrics
   * @returns {Object} Performance metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      averageLatency: this.metrics.queries > 0 ? 
        this.metrics.totalLatency / this.metrics.queries : 0,
      cacheHitRate: this.metrics.cacheHits + this.metrics.cacheMisses > 0 ?
        this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) : 0,
      cacheSize: this.cache.size
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    logger.debug('Cache cleared', { model: this.model.name });
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      queries: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errors: 0,
      totalLatency: 0
    };
    logger.debug('Metrics reset', { model: this.model.name });
  }

  // Private helper methods

  /**
   * Build WHERE clause from criteria
   * @param {Object} criteria - Search criteria
   * @returns {Object} Sequelize WHERE clause
   */
  _buildWhereClause(criteria) {
    const whereClause = {};
    
    Object.entries(criteria).forEach(([key, value]) => {
      if (value === null || value === undefined) {
        return;
      }
      
      if (typeof value === 'object' && value.operator) {
        // Handle complex operators
        switch (value.operator) {
          case 'like':
            whereClause[key] = { [Op.like]: `%${value.value}%` };
            break;
          case 'in':
            whereClause[key] = { [Op.in]: value.value };
            break;
          case 'between':
            whereClause[key] = { [Op.between]: value.value };
            break;
          case 'gt':
            whereClause[key] = { [Op.gt]: value.value };
            break;
          case 'gte':
            whereClause[key] = { [Op.gte]: value.value };
            break;
          case 'lt':
            whereClause[key] = { [Op.lt]: value.value };
            break;
          case 'lte':
            whereClause[key] = { [Op.lte]: value.value };
            break;
          default:
            whereClause[key] = value.value;
        }
      } else {
        whereClause[key] = value;
      }
    });
    
    return whereClause;
  }

  /**
   * Validate entity data
   * @param {Object} data - Entity data
   * @param {string} operation - Operation type (create/update)
   * @returns {Promise<Object>} Validated data
   */
  async _validateData(data, operation) {
    // Override in subclasses for custom validation
    return data;
  }

  /**
   * Invalidate cache entries for an entity
   * @param {string|number} id - Entity ID
   */
  _invalidateCache(id) {
    const cacheKey = `${this.model.name}:${id}`;
    this.cache.delete(cacheKey);
    
    // Also clear any related cache entries
    // Override in subclasses for custom cache invalidation
  }

  /**
   * Sanitize data for logging (remove sensitive fields)
   * @param {Object} data - Data to sanitize
   * @returns {Object} Sanitized data
   */
  _sanitizeLogData(data) {
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'privateKey', 'secretKey'];
    const sanitized = { ...data };
    
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });
    
    return sanitized;
  }
}

module.exports = BaseRepository;
