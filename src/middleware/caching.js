/**
 * @file caching.js
 * @brief Advanced multi-tier caching system for Generation 3 performance
 */

const winston = require('winston');
const crypto = require('crypto');
const { EventEmitter } = require('events');

// Cache logger
const logger = winston.createLogger({
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

class MemoryCache extends EventEmitter {
    constructor(options = {}) {
        super();
        this.cache = new Map();
        this.accessTimes = new Map();
        this.maxSize = options.maxSize || 1000;
        this.defaultTTL = options.defaultTTL || 300000; // 5 minutes
        this.cleanupInterval = options.cleanupInterval || 60000; // 1 minute
        
        // Metrics
        this.metrics = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            evictions: 0,
            size: 0
        };

        // Start cleanup timer
        this.cleanupTimer = setInterval(() => this.cleanup(), this.cleanupInterval);
    }

    generateKey(key, namespace = 'default') {
        if (typeof key === 'object') {
            key = JSON.stringify(key);
        }
        return `${namespace}:${crypto.createHash('md5').update(String(key)).digest('hex')}`;
    }

    async get(key, namespace) {
        const cacheKey = this.generateKey(key, namespace);
        const item = this.cache.get(cacheKey);

        if (!item) {
            this.metrics.misses++;
            this.emit('miss', { key: cacheKey });
            return null;
        }

        // Check TTL
        if (item.expiresAt && Date.now() > item.expiresAt) {
            this.cache.delete(cacheKey);
            this.accessTimes.delete(cacheKey);
            this.metrics.misses++;
            this.emit('expired', { key: cacheKey });
            return null;
        }

        // Update access time for LRU
        this.accessTimes.set(cacheKey, Date.now());
        this.metrics.hits++;
        this.emit('hit', { key: cacheKey });
        
        return item.value;
    }

    async set(key, value, ttl, namespace) {
        const cacheKey = this.generateKey(key, namespace);
        const expiresAt = ttl ? Date.now() + ttl : (this.defaultTTL ? Date.now() + this.defaultTTL : null);

        // Check if we need to evict items
        if (this.cache.size >= this.maxSize && !this.cache.has(cacheKey)) {
            this.evictLRU();
        }

        const item = {
            value,
            createdAt: Date.now(),
            expiresAt,
            accessCount: 0
        };

        this.cache.set(cacheKey, item);
        this.accessTimes.set(cacheKey, Date.now());
        this.metrics.sets++;
        this.metrics.size = this.cache.size;

        this.emit('set', { key: cacheKey, ttl, size: JSON.stringify(value).length });
        return true;
    }

    async delete(key, namespace) {
        const cacheKey = this.generateKey(key, namespace);
        const deleted = this.cache.delete(cacheKey);
        
        if (deleted) {
            this.accessTimes.delete(cacheKey);
            this.metrics.deletes++;
            this.metrics.size = this.cache.size;
            this.emit('delete', { key: cacheKey });
        }
        
        return deleted;
    }

    evictLRU() {
        let oldestKey = null;
        let oldestTime = Date.now();

        for (const [key, accessTime] of this.accessTimes) {
            if (accessTime < oldestTime) {
                oldestTime = accessTime;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            this.cache.delete(oldestKey);
            this.accessTimes.delete(oldestKey);
            this.metrics.evictions++;
            this.emit('evicted', { key: oldestKey });
        }
    }

    cleanup() {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, item] of this.cache) {
            if (item.expiresAt && now > item.expiresAt) {
                this.cache.delete(key);
                this.accessTimes.delete(key);
                cleaned++;
            }
        }

        this.metrics.size = this.cache.size;
        if (cleaned > 0) {
            logger.debug(`Cleaned ${cleaned} expired cache items`);
            this.emit('cleanup', { cleaned });
        }
    }

    clear() {
        const size = this.cache.size;
        this.cache.clear();
        this.accessTimes.clear();
        this.metrics.size = 0;
        this.emit('cleared', { size });
        return size;
    }

    getStats() {
        const totalOperations = this.metrics.hits + this.metrics.misses;
        const hitRate = totalOperations > 0 ? (this.metrics.hits / totalOperations) * 100 : 0;

        return {
            ...this.metrics,
            hitRate: Math.round(hitRate * 100) / 100,
            memoryUsage: this.estimateMemoryUsage()
        };
    }

    estimateMemoryUsage() {
        let totalSize = 0;
        for (const [key, item] of this.cache) {
            totalSize += key.length * 2; // UTF-16 encoding
            totalSize += JSON.stringify(item.value).length * 2;
            totalSize += 64; // Overhead for object structure
        }
        return totalSize;
    }

    destroy() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        this.clear();
        this.removeAllListeners();
    }
}

class CacheManager {
    constructor() {
        this.caches = new Map();
        this.defaultCache = new MemoryCache();
        this.caches.set('default', this.defaultCache);
        
        // Distributed cache configuration
        this.distributedCache = null; // Can be Redis, Memcached, etc.
        
        // Cache strategies
        this.strategies = {
            'cache-aside': this.cacheAsideStrategy.bind(this),
            'write-through': this.writeThroughStrategy.bind(this),
            'write-behind': this.writeBehindStrategy.bind(this),
            'refresh-ahead': this.refreshAheadStrategy.bind(this)
        };

        // Write-behind queue
        this.writeBehindQueue = [];
        this.processingWriteBehind = false;
    }

    createCache(name, options = {}) {
        const cache = new MemoryCache(options);
        this.caches.set(name, cache);
        logger.info(`Created cache '${name}'`, options);
        return cache;
    }

    getCache(name = 'default') {
        return this.caches.get(name) || this.defaultCache;
    }

    // Cache-aside pattern (lazy loading)
    async cacheAsideStrategy(cacheName, key, dataLoader, options = {}) {
        const cache = this.getCache(cacheName);
        const { ttl, namespace } = options;

        // Try to get from cache first
        let value = await cache.get(key, namespace);
        
        if (value === null) {
            // Cache miss - load data
            try {
                value = await dataLoader();
                if (value !== null && value !== undefined) {
                    await cache.set(key, value, ttl, namespace);
                }
            } catch (error) {
                logger.error('Data loader failed in cache-aside strategy', { error: error.message });
                throw error;
            }
        }

        return value;
    }

    // Write-through pattern
    async writeThroughStrategy(cacheName, key, value, dataWriter, options = {}) {
        const cache = this.getCache(cacheName);
        const { ttl, namespace } = options;

        try {
            // Write to persistent store first
            await dataWriter(value);
            
            // Then update cache
            await cache.set(key, value, ttl, namespace);
            
            return value;
        } catch (error) {
            logger.error('Write-through strategy failed', { error: error.message });
            throw error;
        }
    }

    // Write-behind pattern (write-back)
    async writeBehindStrategy(cacheName, key, value, dataWriter, options = {}) {
        const cache = this.getCache(cacheName);
        const { ttl, namespace, batchSize = 10 } = options;

        // Update cache immediately
        await cache.set(key, value, ttl, namespace);

        // Queue write operation
        this.writeBehindQueue.push({
            key,
            value,
            dataWriter,
            timestamp: Date.now(),
            retryCount: 0
        });

        // Process queue if not already processing
        if (!this.processingWriteBehind && this.writeBehindQueue.length >= batchSize) {
            this.processWriteBehindQueue();
        }

        return value;
    }

    async processWriteBehindQueue() {
        if (this.processingWriteBehind) return;
        
        this.processingWriteBehind = true;
        
        try {
            while (this.writeBehindQueue.length > 0) {
                const batch = this.writeBehindQueue.splice(0, 10); // Process in batches of 10
                
                await Promise.allSettled(batch.map(async (item) => {
                    try {
                        await item.dataWriter(item.value);
                    } catch (error) {
                        item.retryCount++;
                        if (item.retryCount < 3) {
                            this.writeBehindQueue.push(item); // Retry
                        } else {
                            logger.error('Write-behind item failed after 3 retries', { 
                                key: item.key, 
                                error: error.message 
                            });
                        }
                    }
                }));
            }
        } finally {
            this.processingWriteBehind = false;
        }
    }

    // Refresh-ahead pattern
    async refreshAheadStrategy(cacheName, key, dataLoader, options = {}) {
        const cache = this.getCache(cacheName);
        const { ttl, namespace, refreshThreshold = 0.8 } = options;

        const item = cache.cache.get(cache.generateKey(key, namespace));
        
        if (item) {
            const age = Date.now() - item.createdAt;
            const refreshTime = (item.expiresAt - item.createdAt) * refreshThreshold;
            
            // If item is getting old, refresh in background
            if (age > refreshTime) {
                // Return current value immediately
                setImmediate(async () => {
                    try {
                        const newValue = await dataLoader();
                        await cache.set(key, newValue, ttl, namespace);
                        logger.debug('Background refresh completed', { key });
                    } catch (error) {
                        logger.error('Background refresh failed', { key, error: error.message });
                    }
                });
            }
            
            return item.value;
        }

        // Cache miss - load synchronously
        return await this.cacheAsideStrategy(cacheName, key, dataLoader, options);
    }

    // Multi-tier caching
    async multiTierGet(key, options = {}) {
        const { l1Cache = 'default', l2Cache, namespace } = options;

        // Try L1 cache first
        let value = await this.getCache(l1Cache).get(key, namespace);
        
        if (value === null && l2Cache) {
            // Try L2 cache
            value = await this.getCache(l2Cache).get(key, namespace);
            
            if (value !== null) {
                // Promote to L1 cache
                await this.getCache(l1Cache).set(key, value, options.ttl, namespace);
            }
        }

        return value;
    }

    async multiTierSet(key, value, options = {}) {
        const { l1Cache = 'default', l2Cache, ttl, namespace } = options;

        // Set in L1 cache
        await this.getCache(l1Cache).set(key, value, ttl, namespace);
        
        // Set in L2 cache if specified
        if (l2Cache) {
            await this.getCache(l2Cache).set(key, value, ttl * 2, namespace); // Longer TTL for L2
        }
    }

    // Express middleware for response caching
    responseCache(options = {}) {
        const {
            cacheName = 'responses',
            ttl = 300000, // 5 minutes
            keyGenerator,
            shouldCache,
            namespace = 'http'
        } = options;

        return async (req, res, next) => {
            // Skip if not GET request
            if (req.method !== 'GET') {
                return next();
            }

            // Generate cache key
            const key = keyGenerator ? 
                keyGenerator(req) : 
                `${req.method}:${req.originalUrl}:${req.get('Accept-Encoding') || ''}`;

            // Check if response should be cached
            if (shouldCache && !shouldCache(req)) {
                return next();
            }

            try {
                // Try to get cached response
                const cachedResponse = await this.cacheAsideStrategy(
                    cacheName,
                    key,
                    () => null,
                    { ttl, namespace }
                );

                if (cachedResponse) {
                    res.setHeader('X-Cache', 'HIT');
                    res.setHeader('X-Cache-Key', key);
                    res.status(cachedResponse.status).json(cachedResponse.data);
                    return;
                }

                // Capture response
                const originalSend = res.json;
                res.json = function(data) {
                    // Cache successful responses
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        const responseToCache = {
                            status: res.statusCode,
                            data: data,
                            timestamp: new Date().toISOString()
                        };
                        
                        setImmediate(async () => {
                            try {
                                const cache = cacheManager.getCache(cacheName);
                                await cache.set(key, responseToCache, ttl, namespace);
                            } catch (error) {
                                logger.error('Failed to cache response', { error: error.message });
                            }
                        });
                    }

                    res.setHeader('X-Cache', 'MISS');
                    res.setHeader('X-Cache-Key', key);
                    return originalSend.call(this, data);
                };

                next();
            } catch (error) {
                logger.error('Response cache middleware error', { error: error.message });
                next();
            }
        };
    }

    getAllStats() {
        const stats = {};
        for (const [name, cache] of this.caches) {
            stats[name] = cache.getStats();
        }
        return stats;
    }

    // Cache warming
    async warmCache(cacheName, items) {
        const cache = this.getCache(cacheName);
        let warmed = 0;

        for (const item of items) {
            try {
                await cache.set(item.key, item.value, item.ttl, item.namespace);
                warmed++;
            } catch (error) {
                logger.error('Cache warming failed for item', { 
                    key: item.key, 
                    error: error.message 
                });
            }
        }

        logger.info(`Cache warming completed for '${cacheName}'`, { warmed, total: items.length });
        return warmed;
    }

    destroy() {
        for (const cache of this.caches.values()) {
            cache.destroy();
        }
        this.caches.clear();
    }
}

// Global cache manager instance
const cacheManager = new CacheManager();

// Auto-start write-behind queue processing
setInterval(() => {
    if (cacheManager.writeBehindQueue.length > 0) {
        cacheManager.processWriteBehindQueue();
    }
}, 5000); // Every 5 seconds

module.exports = {
    MemoryCache,
    CacheManager,
    cacheManager
};