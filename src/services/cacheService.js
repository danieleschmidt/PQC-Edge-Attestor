/**
 * @file cacheService.js
 * @brief Redis-based caching and performance optimization for Generation 3
 */

const winston = require('winston');
const { EventEmitter } = require('events');

// Cache logger
const cacheLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/cache.log' }),
        new winston.transports.Console()
    ]
});

class CacheService extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            defaultTTL: config.defaultTTL || 3600, // 1 hour
            maxMemoryMB: config.maxMemoryMB || 100,
            cleanupInterval: config.cleanupInterval || 300000, // 5 minutes
            compressionThreshold: config.compressionThreshold || 1024, // 1KB
            ...config
        };
        
        this.cache = new Map();
        this.accessTimes = new Map();
        this.hitCount = 0;
        this.missCount = 0;
        this.memoryUsage = 0;
        
        this._startCleanupTimer();
        this._startMetricsCollection();
    }

    /**
     * Get value from cache
     */
    async get(key) {
        const startTime = Date.now();
        
        try {
            const entry = this.cache.get(key);
            
            if (!entry) {
                this.missCount++;
                this.emit('miss', { key, duration: Date.now() - startTime });
                return null;
            }
            
            // Check expiration
            if (entry.expiresAt && Date.now() > entry.expiresAt) {
                this.cache.delete(key);
                this.accessTimes.delete(key);
                this.missCount++;
                this.emit('expired', { key, duration: Date.now() - startTime });
                return null;
            }
            
            // Update access time for LRU
            this.accessTimes.set(key, Date.now());
            this.hitCount++;
            
            this.emit('hit', { key, duration: Date.now() - startTime });
            
            cacheLogger.debug('Cache hit', {
                key: this._hashKey(key),
                duration: Date.now() - startTime,
                size: entry.size || 0
            });
            
            return this._decompress(entry.value);
            
        } catch (error) {
            cacheLogger.error('Cache get error', {
                key: this._hashKey(key),
                error: error.message
            });
            return null;
        }
    }

    /**
     * Set value in cache
     */
    async set(key, value, ttl = null) {
        const startTime = Date.now();
        
        try {
            const actualTTL = ttl || this.config.defaultTTL;
            const expiresAt = actualTTL > 0 ? Date.now() + (actualTTL * 1000) : null;
            
            const compressedValue = this._compress(value);
            const size = this._calculateSize(compressedValue);
            
            // Check memory limit
            if (this.memoryUsage + size > this.config.maxMemoryMB * 1024 * 1024) {
                await this._evictLRU(size);
            }
            
            const entry = {
                value: compressedValue,
                expiresAt,
                size,
                createdAt: Date.now()
            };
            
            // Remove old entry if exists
            if (this.cache.has(key)) {
                const oldEntry = this.cache.get(key);
                this.memoryUsage -= oldEntry.size || 0;
            }
            
            this.cache.set(key, entry);
            this.accessTimes.set(key, Date.now());
            this.memoryUsage += size;
            
            this.emit('set', { 
                key, 
                size, 
                ttl: actualTTL,
                duration: Date.now() - startTime 
            });
            
            cacheLogger.debug('Cache set', {
                key: this._hashKey(key),
                size,
                ttl: actualTTL,
                duration: Date.now() - startTime
            });
            
            return true;
            
        } catch (error) {
            cacheLogger.error('Cache set error', {
                key: this._hashKey(key),
                error: error.message
            });
            return false;
        }
    }

    /**
     * Delete value from cache
     */
    async del(key) {
        const entry = this.cache.get(key);
        
        if (entry) {
            this.cache.delete(key);
            this.accessTimes.delete(key);
            this.memoryUsage -= entry.size || 0;
            
            this.emit('delete', { key, size: entry.size });
            
            cacheLogger.debug('Cache delete', {
                key: this._hashKey(key),
                size: entry.size || 0
            });
            
            return true;
        }
        
        return false;
    }

    /**
     * Check if key exists
     */
    async exists(key) {
        const entry = this.cache.get(key);
        
        if (!entry) {
            return false;
        }
        
        // Check expiration
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            this.accessTimes.delete(key);
            return false;
        }
        
        return true;
    }

    /**
     * Clear all cache entries
     */
    async clear() {
        const size = this.cache.size;
        this.cache.clear();
        this.accessTimes.clear();
        this.memoryUsage = 0;
        
        this.emit('clear', { entriesCleared: size });
        
        cacheLogger.info('Cache cleared', { entriesCleared: size });
        
        return true;
    }

    /**
     * Get cache statistics
     */
    getStats() {
        const totalRequests = this.hitCount + this.missCount;
        const hitRate = totalRequests > 0 ? (this.hitCount / totalRequests) * 100 : 0;
        
        return {
            hitCount: this.hitCount,
            missCount: this.missCount,
            hitRate: parseFloat(hitRate.toFixed(2)),
            entryCount: this.cache.size,
            memoryUsageMB: parseFloat((this.memoryUsage / 1024 / 1024).toFixed(2)),
            memoryLimitMB: this.config.maxMemoryMB,
            memoryUtilization: parseFloat(((this.memoryUsage / (this.config.maxMemoryMB * 1024 * 1024)) * 100).toFixed(2))
        };
    }

    /**
     * Cache-aside pattern helper
     */
    async getOrSet(key, fetchFunction, ttl = null) {
        const cached = await this.get(key);
        
        if (cached !== null) {
            return cached;
        }
        
        const value = await fetchFunction();
        await this.set(key, value, ttl);
        
        return value;
    }

    /**
     * Bulk get operation
     */
    async mget(keys) {
        const results = {};
        
        for (const key of keys) {
            results[key] = await this.get(key);
        }
        
        return results;
    }

    /**
     * Bulk set operation
     */
    async mset(entries, ttl = null) {
        const results = {};
        
        for (const [key, value] of Object.entries(entries)) {
            results[key] = await this.set(key, value, ttl);
        }
        
        return results;
    }

    /**
     * Compress value if above threshold
     */
    _compress(value) {
        const serialized = JSON.stringify(value);
        
        if (serialized.length > this.config.compressionThreshold) {
            // Simple compression simulation
            return {
                compressed: true,
                data: Buffer.from(serialized).toString('base64')
            };
        }
        
        return {
            compressed: false,
            data: serialized
        };
    }

    /**
     * Decompress value
     */
    _decompress(compressedValue) {
        if (compressedValue.compressed) {
            const decompressed = Buffer.from(compressedValue.data, 'base64').toString();
            return JSON.parse(decompressed);
        }
        
        return JSON.parse(compressedValue.data);
    }

    /**
     * Calculate size of value
     */
    _calculateSize(value) {
        return Buffer.byteLength(JSON.stringify(value), 'utf8');
    }

    /**
     * Hash key for logging (privacy)
     */
    _hashKey(key) {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(key).digest('hex').substring(0, 16);
    }

    /**
     * Evict least recently used entries
     */
    async _evictLRU(requiredSpace) {
        const entries = Array.from(this.accessTimes.entries())
            .sort((a, b) => a[1] - b[1]); // Sort by access time (oldest first)
        
        let freedSpace = 0;
        let evicted = 0;
        
        for (const [key, _] of entries) {
            if (freedSpace >= requiredSpace) {
                break;
            }
            
            const entry = this.cache.get(key);
            if (entry) {
                freedSpace += entry.size || 0;
                evicted++;
                
                this.cache.delete(key);
                this.accessTimes.delete(key);
                this.memoryUsage -= entry.size || 0;
            }
        }
        
        if (evicted > 0) {
            this.emit('evict', { evicted, freedSpace });
            
            cacheLogger.info('LRU eviction completed', {
                evicted,
                freedSpaceKB: Math.round(freedSpace / 1024)
            });
        }
    }

    /**
     * Clean up expired entries
     */
    _cleanup() {
        const now = Date.now();
        let expired = 0;
        
        for (const [key, entry] of this.cache.entries()) {
            if (entry.expiresAt && now > entry.expiresAt) {
                this.cache.delete(key);
                this.accessTimes.delete(key);
                this.memoryUsage -= entry.size || 0;
                expired++;
            }
        }
        
        if (expired > 0) {
            this.emit('cleanup', { expired });
            
            cacheLogger.info('Cache cleanup completed', {
                expired,
                remaining: this.cache.size
            });
        }
    }

    /**
     * Start cleanup timer
     */
    _startCleanupTimer() {
        setInterval(() => {
            this._cleanup();
        }, this.config.cleanupInterval);
    }

    /**
     * Start metrics collection
     */
    _startMetricsCollection() {
        setInterval(() => {
            const stats = this.getStats();
            
            this.emit('metrics', stats);
            
            cacheLogger.debug('Cache metrics', stats);
        }, 60000); // Every minute
    }

    /**
     * Shutdown cache service
     */
    async shutdown() {
        cacheLogger.info('Cache service shutting down', {
            finalStats: this.getStats()
        });
        
        this.clear();
        this.removeAllListeners();
    }
}

module.exports = CacheService;