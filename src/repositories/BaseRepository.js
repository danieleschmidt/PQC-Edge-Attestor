const { Op } = require('sequelize');
const logger = require('../utils/logger');

class BaseRepository {
  constructor(model, cacheManager = null) {
    this.model = model;
    this.cache = cacheManager;
    this.cacheTTL = 3600; // 1 hour default
  }

  async create(data, options = {}) {
    try {
      const startTime = Date.now();
      
      const record = await this.model.create(data, {
        transaction: options.transaction,
        returning: true
      });

      const executionTime = Date.now() - startTime;
      
      logger.debug('Repository create operation', {
        model: this.model.name,
        recordId: record.id,
        executionTime: `${executionTime}ms`
      });

      // Invalidate cache for list operations
      if (this.cache) {
        await this.invalidateListCache();
      }

      return record;

    } catch (error) {
      logger.error('Repository create failed', {
        model: this.model.name,
        error: error.message,
        data: this.sanitizeLogData(data)
      });
      throw error;
    }
  }

  async findById(id, options = {}) {
    try {
      const cacheKey = `${this.model.name}:${id}`;
      
      // Try cache first
      if (this.cache && !options.skipCache) {
        const cached = await this.cache.get(cacheKey);
        if (cached) {
          logger.debug('Repository cache hit', { model: this.model.name, id });
          return cached;
        }
      }

      const startTime = Date.now();
      
      const record = await this.model.findByPk(id, {
        include: options.include,
        attributes: options.attributes,
        transaction: options.transaction
      });

      const executionTime = Date.now() - startTime;
      
      logger.debug('Repository findById operation', {
        model: this.model.name,
        id,
        found: !!record,
        executionTime: `${executionTime}ms`
      });

      // Cache the result
      if (this.cache && record && !options.skipCache) {
        await this.cache.set(cacheKey, record, this.cacheTTL);
      }

      return record;

    } catch (error) {
      logger.error('Repository findById failed', {
        model: this.model.name,
        id,
        error: error.message
      });
      throw error;
    }
  }

  async findAll(options = {}) {
    try {
      const cacheKey = this.generateListCacheKey(options);
      
      // Try cache first
      if (this.cache && !options.skipCache) {
        const cached = await this.cache.get(cacheKey);
        if (cached) {
          logger.debug('Repository list cache hit', { model: this.model.name });
          return cached;
        }
      }

      const startTime = Date.now();
      
      const records = await this.model.findAll({
        where: options.where,
        include: options.include,
        attributes: options.attributes,
        order: options.order,
        limit: options.limit,
        offset: options.offset,
        transaction: options.transaction
      });

      const executionTime = Date.now() - startTime;
      
      logger.debug('Repository findAll operation', {
        model: this.model.name,
        count: records.length,
        executionTime: `${executionTime}ms`
      });

      // Cache the result
      if (this.cache && !options.skipCache) {
        await this.cache.set(cacheKey, records, this.cacheTTL / 2); // Shorter TTL for lists
      }

      return records;

    } catch (error) {
      logger.error('Repository findAll failed', {
        model: this.model.name,
        error: error.message,
        options: this.sanitizeLogData(options)
      });
      throw error;
    }
  }

  async findOne(options = {}) {
    try {
      const startTime = Date.now();
      
      const record = await this.model.findOne({
        where: options.where,
        include: options.include,
        attributes: options.attributes,
        order: options.order,
        transaction: options.transaction
      });

      const executionTime = Date.now() - startTime;
      
      logger.debug('Repository findOne operation', {
        model: this.model.name,
        found: !!record,
        executionTime: `${executionTime}ms`
      });

      return record;

    } catch (error) {
      logger.error('Repository findOne failed', {
        model: this.model.name,
        error: error.message,
        options: this.sanitizeLogData(options)
      });
      throw error;
    }
  }

  async update(id, data, options = {}) {
    try {
      const startTime = Date.now();
      
      const [updatedRowsCount, updatedRows] = await this.model.update(data, {
        where: { id },
        returning: true,
        transaction: options.transaction
      });

      const executionTime = Date.now() - startTime;
      
      logger.debug('Repository update operation', {
        model: this.model.name,
        id,
        updatedRows: updatedRowsCount,
        executionTime: `${executionTime}ms`
      });

      // Invalidate cache
      if (this.cache) {
        await this.invalidateCache(id);
        await this.invalidateListCache();
      }

      return updatedRows[0] || null;

    } catch (error) {
      logger.error('Repository update failed', {
        model: this.model.name,
        id,
        error: error.message,
        data: this.sanitizeLogData(data)
      });
      throw error;
    }
  }

  async delete(id, options = {}) {
    try {
      const startTime = Date.now();
      
      const deletedRows = await this.model.destroy({
        where: { id },
        transaction: options.transaction
      });

      const executionTime = Date.now() - startTime;
      
      logger.debug('Repository delete operation', {
        model: this.model.name,
        id,
        deletedRows,
        executionTime: `${executionTime}ms`
      });

      // Invalidate cache
      if (this.cache) {
        await this.invalidateCache(id);
        await this.invalidateListCache();
      }

      return deletedRows > 0;

    } catch (error) {
      logger.error('Repository delete failed', {
        model: this.model.name,
        id,
        error: error.message
      });
      throw error;
    }
  }

  async count(options = {}) {
    try {
      const startTime = Date.now();
      
      const count = await this.model.count({
        where: options.where,
        include: options.include,
        transaction: options.transaction
      });

      const executionTime = Date.now() - startTime;
      
      logger.debug('Repository count operation', {
        model: this.model.name,
        count,
        executionTime: `${executionTime}ms`
      });

      return count;

    } catch (error) {
      logger.error('Repository count failed', {
        model: this.model.name,
        error: error.message
      });
      throw error;
    }
  }

  async findAndCountAll(options = {}) {
    try {
      const startTime = Date.now();
      
      const result = await this.model.findAndCountAll({
        where: options.where,
        include: options.include,
        attributes: options.attributes,
        order: options.order,
        limit: options.limit,
        offset: options.offset,
        transaction: options.transaction
      });

      const executionTime = Date.now() - startTime;
      
      logger.debug('Repository findAndCountAll operation', {
        model: this.model.name,
        count: result.count,
        rows: result.rows.length,
        executionTime: `${executionTime}ms`
      });

      return result;

    } catch (error) {
      logger.error('Repository findAndCountAll failed', {
        model: this.model.name,
        error: error.message
      });
      throw error;
    }
  }

  async bulkCreate(records, options = {}) {
    try {
      const startTime = Date.now();
      
      const createdRecords = await this.model.bulkCreate(records, {
        validate: options.validate !== false,
        ignoreDuplicates: options.ignoreDuplicates || false,
        updateOnDuplicate: options.updateOnDuplicate,
        transaction: options.transaction,
        returning: true
      });

      const executionTime = Date.now() - startTime;
      
      logger.debug('Repository bulkCreate operation', {
        model: this.model.name,
        inputCount: records.length,
        createdCount: createdRecords.length,
        executionTime: `${executionTime}ms`
      });

      // Invalidate cache
      if (this.cache) {
        await this.invalidateListCache();
      }

      return createdRecords;

    } catch (error) {
      logger.error('Repository bulkCreate failed', {
        model: this.model.name,
        recordCount: records.length,
        error: error.message
      });
      throw error;
    }
  }

  async findByField(field, value, options = {}) {
    try {
      const where = { [field]: value };
      return await this.findAll({ ...options, where });

    } catch (error) {
      logger.error('Repository findByField failed', {
        model: this.model.name,
        field,
        error: error.message
      });
      throw error;
    }
  }

  async findOneByField(field, value, options = {}) {
    try {
      const where = { [field]: value };
      return await this.findOne({ ...options, where });

    } catch (error) {
      logger.error('Repository findOneByField failed', {
        model: this.model.name,
        field,
        error: error.message
      });
      throw error;
    }
  }

  async search(searchOptions = {}) {
    try {
      const { query, fields, limit = 20, offset = 0 } = searchOptions;
      
      if (!query || !fields || fields.length === 0) {
        return { rows: [], count: 0 };
      }

      const whereConditions = fields.map(field => ({
        [field]: { [Op.iLike]: `%${query}%` }
      }));

      const where = { [Op.or]: whereConditions };

      return await this.findAndCountAll({
        where,
        limit,
        offset,
        order: [['created_at', 'DESC']]
      });

    } catch (error) {
      logger.error('Repository search failed', {
        model: this.model.name,
        query: searchOptions.query,
        error: error.message
      });
      throw error;
    }
  }

  async paginate(options = {}) {
    try {
      const page = Math.max(1, parseInt(options.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(options.limit) || 20));
      const offset = (page - 1) * limit;

      const result = await this.findAndCountAll({
        ...options,
        limit,
        offset
      });

      return {
        data: result.rows,
        pagination: {
          page,
          limit,
          total: result.count,
          pages: Math.ceil(result.count / limit),
          hasNext: page * limit < result.count,
          hasPrev: page > 1
        }
      };

    } catch (error) {
      logger.error('Repository paginate failed', {
        model: this.model.name,
        error: error.message
      });
      throw error;
    }
  }

  async invalidateCache(id) {
    if (!this.cache) return;

    try {
      const cacheKey = `${this.model.name}:${id}`;
      await this.cache.delete(cacheKey);
    } catch (error) {
      logger.warn('Cache invalidation failed', { model: this.model.name, id });
    }
  }

  async invalidateListCache() {
    if (!this.cache) return;

    try {
      const pattern = `${this.model.name}:list:*`;
      // This would need to be implemented based on your cache implementation
      // For Redis, you'd use KEYS pattern and then DEL
    } catch (error) {
      logger.warn('List cache invalidation failed', { model: this.model.name });
    }
  }

  generateListCacheKey(options) {
    const key = `${this.model.name}:list:${JSON.stringify(options)}`;
    return key.length > 250 ? `${this.model.name}:list:${require('crypto').createHash('md5').update(key).digest('hex')}` : key;
  }

  sanitizeLogData(data) {
    if (!data || typeof data !== 'object') return data;

    const sensitiveFields = ['password', 'token', 'key', 'secret', 'signature'];
    const sanitized = { ...data };

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  getModel() {
    return this.model;
  }

  setCacheTTL(ttl) {
    this.cacheTTL = ttl;
  }
}

module.exports = BaseRepository;