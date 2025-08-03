const BaseRepository = require('./BaseRepository');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

class DeviceRepository extends BaseRepository {
  constructor(deviceModel, cacheManager = null) {
    super(deviceModel, cacheManager);
    this.setCacheTTL(7200); // 2 hours for devices
  }

  async findBySerialNumber(serialNumber, options = {}) {
    try {
      const cacheKey = `device:serial:${serialNumber}`;
      
      // Try cache first
      if (this.cache && !options.skipCache) {
        const cached = await this.cache.get(cacheKey);
        if (cached) {
          return cached;
        }
      }

      const device = await this.findOne({
        where: { serial_number: serialNumber },
        ...options
      });

      // Cache the result
      if (this.cache && device && !options.skipCache) {
        await this.cache.set(cacheKey, device, this.cacheTTL);
      }

      return device;

    } catch (error) {
      logger.error('DeviceRepository findBySerialNumber failed', {
        serialNumber,
        error: error.message
      });
      throw error;
    }
  }

  async findByType(deviceType, options = {}) {
    try {
      return await this.findAll({
        where: { device_type: deviceType },
        order: [['created_at', 'DESC']],
        ...options
      });

    } catch (error) {
      logger.error('DeviceRepository findByType failed', {
        deviceType,
        error: error.message
      });
      throw error;
    }
  }

  async findByStatus(status, options = {}) {
    try {
      return await this.findAll({
        where: { status },
        order: [['last_seen', 'DESC']],
        ...options
      });

    } catch (error) {
      logger.error('DeviceRepository findByStatus failed', {
        status,
        error: error.message
      });
      throw error;
    }
  }

  async findByManufacturer(manufacturer, model = null, options = {}) {
    try {
      const where = { manufacturer };
      if (model) {
        where.model = model;
      }

      return await this.findAll({
        where,
        order: [['created_at', 'DESC']],
        ...options
      });

    } catch (error) {
      logger.error('DeviceRepository findByManufacturer failed', {
        manufacturer,
        model,
        error: error.message
      });
      throw error;
    }
  }

  async findActiveDevices(options = {}) {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      return await this.findAll({
        where: {
          status: 'active',
          last_seen: {
            [Op.gte]: thirtyDaysAgo
          }
        },
        order: [['last_seen', 'DESC']],
        ...options
      });

    } catch (error) {
      logger.error('DeviceRepository findActiveDevices failed', {
        error: error.message
      });
      throw error;
    }
  }

  async findStaleDevices(options = {}) {
    try {
      const staleThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days
      
      return await this.findAll({
        where: {
          status: { [Op.in]: ['active', 'provisioned'] },
          [Op.or]: [
            { last_seen: { [Op.lt]: staleThreshold } },
            { last_seen: { [Op.is]: null } }
          ]
        },
        order: [['last_seen', 'ASC']],
        ...options
      });

    } catch (error) {
      logger.error('DeviceRepository findStaleDevices failed', {
        error: error.message
      });
      throw error;
    }
  }

  async updateLastSeen(deviceId, timestamp = new Date(), options = {}) {
    try {
      const result = await this.update(deviceId, {
        last_seen: timestamp
      }, options);

      // Update cache
      if (this.cache && result) {
        await this.invalidateCache(deviceId);
        // Also invalidate serial number cache if we have the device
        const device = await this.findById(deviceId, { skipCache: true });
        if (device) {
          const serialCacheKey = `device:serial:${device.serial_number}`;
          await this.cache.delete(serialCacheKey);
        }
      }

      return result;

    } catch (error) {
      logger.error('DeviceRepository updateLastSeen failed', {
        deviceId,
        error: error.message
      });
      throw error;
    }
  }

  async updatePQCAlgorithms(deviceId, algorithms, options = {}) {
    try {
      return await this.update(deviceId, {
        pqc_algorithms: algorithms
      }, options);

    } catch (error) {
      logger.error('DeviceRepository updatePQCAlgorithms failed', {
        deviceId,
        error: error.message
      });
      throw error;
    }
  }

  async updateAttestationPolicy(deviceId, policy, options = {}) {
    try {
      return await this.update(deviceId, {
        attestation_policy: policy
      }, options);

    } catch (error) {
      logger.error('DeviceRepository updateAttestationPolicy failed', {
        deviceId,
        error: error.message
      });
      throw error;
    }
  }

  async updateCertificates(deviceId, certificates, options = {}) {
    try {
      return await this.update(deviceId, {
        certificates: certificates
      }, options);

    } catch (error) {
      logger.error('DeviceRepository updateCertificates failed', {
        deviceId,
        error: error.message
      });
      throw error;
    }
  }

  async provisionDevice(deviceId, algorithms, certificates, options = {}) {
    try {
      return await this.update(deviceId, {
        status: 'provisioned',
        provisioned_at: new Date(),
        pqc_algorithms: algorithms,
        certificates: certificates
      }, options);

    } catch (error) {
      logger.error('DeviceRepository provisionDevice failed', {
        deviceId,
        error: error.message
      });
      throw error;
    }
  }

  async revokeDevice(deviceId, reason, options = {}) {
    try {
      const result = await this.update(deviceId, {
        status: 'revoked',
        metadata: {
          revoked_at: new Date(),
          revocation_reason: reason
        }
      }, options);

      // Log security event
      logger.securityEvent('device_revoked', {
        deviceId,
        reason,
        severity: 'medium'
      });

      return result;

    } catch (error) {
      logger.error('DeviceRepository revokeDevice failed', {
        deviceId,
        error: error.message
      });
      throw error;
    }
  }

  async getDeviceStatistics(options = {}) {
    try {
      const stats = {};

      // Count by status
      const statusCounts = await this.model.findAll({
        attributes: [
          'status',
          [this.model.sequelize.fn('COUNT', this.model.sequelize.col('id')), 'count']
        ],
        group: ['status'],
        raw: true,
        transaction: options.transaction
      });

      stats.byStatus = statusCounts.reduce((acc, item) => {
        acc[item.status] = parseInt(item.count);
        return acc;
      }, {});

      // Count by device type
      const typeCounts = await this.model.findAll({
        attributes: [
          'device_type',
          [this.model.sequelize.fn('COUNT', this.model.sequelize.col('id')), 'count']
        ],
        group: ['device_type'],
        raw: true,
        transaction: options.transaction
      });

      stats.byType = typeCounts.reduce((acc, item) => {
        acc[item.device_type] = parseInt(item.count);
        return acc;
      }, {});

      // Count by manufacturer
      const manufacturerCounts = await this.model.findAll({
        attributes: [
          'manufacturer',
          [this.model.sequelize.fn('COUNT', this.model.sequelize.col('id')), 'count']
        ],
        group: ['manufacturer'],
        order: [[this.model.sequelize.fn('COUNT', this.model.sequelize.col('id')), 'DESC']],
        limit: 10,
        raw: true,
        transaction: options.transaction
      });

      stats.byManufacturer = manufacturerCounts.reduce((acc, item) => {
        acc[item.manufacturer] = parseInt(item.count);
        return acc;
      }, {});

      // Activity statistics
      const now = new Date();
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      stats.activity = {
        total: await this.count({ transaction: options.transaction }),
        active_24h: await this.count({
          where: { last_seen: { [Op.gte]: dayAgo } },
          transaction: options.transaction
        }),
        active_7d: await this.count({
          where: { last_seen: { [Op.gte]: weekAgo } },
          transaction: options.transaction
        })
      };

      return stats;

    } catch (error) {
      logger.error('DeviceRepository getDeviceStatistics failed', {
        error: error.message
      });
      throw error;
    }
  }

  async findDevicesNeedingAttestation(options = {}) {
    try {
      const { maxAge = 300000 } = options; // 5 minutes default
      const cutoffTime = new Date(Date.now() - maxAge);

      // This would typically join with attestation_reports table
      // For now, we'll find devices that haven't been seen recently
      return await this.findAll({
        where: {
          status: 'active',
          [Op.or]: [
            { last_seen: { [Op.lt]: cutoffTime } },
            { last_seen: { [Op.is]: null } }
          ]
        },
        order: [['last_seen', 'ASC']],
        ...options
      });

    } catch (error) {
      logger.error('DeviceRepository findDevicesNeedingAttestation failed', {
        error: error.message
      });
      throw error;
    }
  }

  async searchDevices(searchOptions = {}) {
    try {
      const { query, type, status, manufacturer, limit = 20, offset = 0 } = searchOptions;
      
      let where = {};

      // Text search across multiple fields
      if (query) {
        where[Op.or] = [
          { serial_number: { [Op.iLike]: `%${query}%` } },
          { manufacturer: { [Op.iLike]: `%${query}%` } },
          { model: { [Op.iLike]: `%${query}%` } }
        ];
      }

      // Filter by type
      if (type) {
        where.device_type = type;
      }

      // Filter by status
      if (status) {
        where.status = status;
      }

      // Filter by manufacturer
      if (manufacturer) {
        where.manufacturer = manufacturer;
      }

      return await this.findAndCountAll({
        where,
        order: [['created_at', 'DESC']],
        limit,
        offset
      });

    } catch (error) {
      logger.error('DeviceRepository searchDevices failed', {
        searchOptions,
        error: error.message
      });
      throw error;
    }
  }

  async getHealthyDeviceCount(options = {}) {
    try {
      const recentThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
      
      return await this.count({
        where: {
          status: 'active',
          last_seen: { [Op.gte]: recentThreshold }
        },
        transaction: options.transaction
      });

    } catch (error) {
      logger.error('DeviceRepository getHealthyDeviceCount failed', {
        error: error.message
      });
      throw error;
    }
  }

  async bulkUpdateStatus(deviceIds, status, options = {}) {
    try {
      const [updatedCount] = await this.model.update(
        { status },
        {
          where: { id: { [Op.in]: deviceIds } },
          transaction: options.transaction
        }
      );

      // Invalidate cache for all updated devices
      if (this.cache) {
        for (const deviceId of deviceIds) {
          await this.invalidateCache(deviceId);
        }
        await this.invalidateListCache();
      }

      logger.info('DeviceRepository bulk status update', {
        deviceCount: deviceIds.length,
        updatedCount,
        status
      });

      return updatedCount;

    } catch (error) {
      logger.error('DeviceRepository bulkUpdateStatus failed', {
        deviceIds: deviceIds.length,
        status,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = DeviceRepository;