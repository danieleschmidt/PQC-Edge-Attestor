/**
 * @file performanceCache.js
 * @brief High-performance caching system for Generation 3 scalability
 * 
 * Implements multi-tier caching with LRU eviction, TTL expiration,
 * and intelligent prefetching for optimal performance.
 */

const crypto = require('crypto');
const EventEmitter = require('events');

/**
 * LRU Node for doubly-linked list
 */
class LRUNode {
    constructor(key, value, ttl = null) {
        this.key = key;
        this.value = value;
        this.ttl = ttl;
        this.created = Date.now();
        this.accessed = Date.now();
        this.accessCount = 1;
        this.prev = null;
        this.next = null;
    }

    isExpired() {
        return this.ttl && (Date.now() - this.created > this.ttl);
    }

    touch() {
        this.accessed = Date.now();
        this.accessCount++;
    }
}

/**
 * @class PerformanceCache
 * @brief High-performance multi-tier caching system
 */
class PerformanceCache extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            // L1 Cache (hot data)
            l1MaxSize: options.l1MaxSize || 1000,
            l1DefaultTTL: options.l1DefaultTTL || 300000, // 5 minutes
            
            // L2 Cache (warm data)
            l2MaxSize: options.l2MaxSize || 5000,
            l2DefaultTTL: options.l2DefaultTTL || 900000, // 15 minutes
            
            // L3 Cache (cold data)
            l3MaxSize: options.l3MaxSize || 10000,
            l3DefaultTTL: options.l3DefaultTTL || 3600000, // 1 hour
            
            // Performance settings
            enablePrefetch: options.enablePrefetch !== false,
            prefetchThreshold: options.prefetchThreshold || 0.8,
            
            // Monitoring
            enableMetrics: options.enableMetrics !== false,
            metricsInterval: options.metricsInterval || 60000, // 1 minute
            
            // Memory management
            maxMemoryMB: options.maxMemoryMB || 100,
            gcThreshold: options.gcThreshold || 0.9,
            
            ...options
        };

        // L1 Cache - LRU with fastest access
        this.l1Cache = new Map();
        this.l1Head = null;
        this.l1Tail = null;
        this.l1Size = 0;

        // L2 Cache - Frequency-based eviction
        this.l2Cache = new Map();
        this.l2AccessFreq = new Map();
        
        // L3 Cache - FIFO with TTL
        this.l3Cache = new Map();
        this.l3Queue = [];

        // Statistics
        this.stats = {
            l1: { hits: 0, misses: 0, evictions: 0, size: 0 },
            l2: { hits: 0, misses: 0, evictions: 0, size: 0 },
            l3: { hits: 0, misses: 0, evictions: 0, size: 0 },
            total: { requests: 0, hits: 0, misses: 0 },
            memory: { used: 0, peak: 0 },
            prefetch: { triggered: 0, successful: 0, failed: 0 }
        };

        // Cleanup and monitoring
        this.cleanupTimer = setInterval(() => this._cleanup(), 30000); // 30 seconds
        
        if (this.options.enableMetrics) {
            this.metricsTimer = setInterval(() => this._emitMetrics(), this.options.metricsInterval);
        }

        this.emit('initialized', {
            l1MaxSize: this.options.l1MaxSize,
            l2MaxSize: this.options.l2MaxSize,
            l3MaxSize: this.options.l3MaxSize
        });
    }

    /**
     * Get value from cache with multi-tier lookup
     */
    async get(key) {
        const startTime = Date.now();
        this.stats.total.requests++;

        try {
            // L1 Cache lookup (fastest)
            let result = this._getFromL1(key);
            if (result !== undefined) {
                this.stats.l1.hits++;
                this.stats.total.hits++;
                this._recordAccess(key, 'l1', Date.now() - startTime);
                return result;
            }

            // L2 Cache lookup
            result = this._getFromL2(key);
            if (result !== undefined) {
                this.stats.l2.hits++;
                this.stats.total.hits++;
                
                // Promote to L1 cache
                await this._promoteToL1(key, result);
                
                this._recordAccess(key, 'l2', Date.now() - startTime);
                return result;
            }

            // L3 Cache lookup
            result = this._getFromL3(key);
            if (result !== undefined) {
                this.stats.l3.hits++;
                this.stats.total.hits++;
                
                // Promote to L2 cache
                await this._promoteToL2(key, result);
                
                this._recordAccess(key, 'l3', Date.now() - startTime);
                return result;
            }

            // Cache miss
            this.stats.total.misses++;
            this._recordMiss(key, Date.now() - startTime);
            
            return undefined;

        } catch (error) {
            this.emit('error', { operation: 'get', key, error: error.message });
            return undefined;
        }
    }

    /**
     * Set value in cache with intelligent tier placement
     */
    async set(key, value, options = {}) {
        const ttl = options.ttl || this.options.l1DefaultTTL;
        const tier = options.tier || this._determineTier(key, value);
        const priority = options.priority || 'normal';

        try {
            // Estimate memory impact
            const estimatedSize = this._estimateSize(value);
            
            if (this._shouldRejectDueToMemory(estimatedSize)) {
                this.emit('memoryPressure', { key, estimatedSize, action: 'rejected' });
                return false;
            }

            switch (tier) {
                case 'l1':
                    await this._setInL1(key, value, ttl, priority);
                    break;
                case 'l2':
                    await this._setInL2(key, value, ttl);
                    break;
                case 'l3':
                    await this._setInL3(key, value, ttl);
                    break;
            }

            // Update memory usage
            this.stats.memory.used += estimatedSize;
            if (this.stats.memory.used > this.stats.memory.peak) {
                this.stats.memory.peak = this.stats.memory.used;
            }

            // Trigger prefetch if enabled
            if (this.options.enablePrefetch && priority === 'high') {
                this._triggerPrefetch(key, value);
            }

            this.emit('set', { key, tier, size: estimatedSize });
            return true;

        } catch (error) {
            this.emit('error', { operation: 'set', key, error: error.message });
            return false;
        }
    }

    /**
     * Batch operations for better performance
     */
    async mget(keys) {
        const results = new Map();
        const misses = [];

        for (const key of keys) {
            const value = await this.get(key);
            if (value !== undefined) {
                results.set(key, value);
            } else {
                misses.push(key);
            }
        }

        return { results, misses };
    }

    async mset(entries) {
        const results = [];
        
        for (const [key, value, options] of entries) {
            const success = await this.set(key, value, options);
            results.push({ key, success });
        }

        return results;
    }

    /**
     * Delete from all cache tiers
     */
    async delete(key) {
        let deleted = false;

        // Remove from all tiers
        if (this.l1Cache.has(key)) {
            this._removeFromL1(key);
            deleted = true;
        }

        if (this.l2Cache.has(key)) {
            this.l2Cache.delete(key);
            this.l2AccessFreq.delete(key);
            this.stats.l2.size--;
            deleted = true;
        }

        if (this.l3Cache.has(key)) {
            this.l3Cache.delete(key);
            this.l3Queue = this.l3Queue.filter(k => k !== key);
            this.stats.l3.size--;
            deleted = true;
        }

        if (deleted) {
            this.emit('delete', { key });
        }

        return deleted;
    }

    /**
     * Clear all caches
     */
    async clear() {
        const clearedCount = this.l1Cache.size + this.l2Cache.size + this.l3Cache.size;

        this.l1Cache.clear();
        this.l1Head = null;
        this.l1Tail = null;
        this.l1Size = 0;

        this.l2Cache.clear();
        this.l2AccessFreq.clear();

        this.l3Cache.clear();
        this.l3Queue = [];

        // Reset stats
        this.stats.l1.size = 0;
        this.stats.l2.size = 0;
        this.stats.l3.size = 0;
        this.stats.memory.used = 0;

        this.emit('clear', { clearedCount });
        return clearedCount;
    }

    /**
     * Get comprehensive cache statistics
     */
    getStats() {
        const totalSize = this.stats.l1.size + this.stats.l2.size + this.stats.l3.size;
        const totalHits = this.stats.l1.hits + this.stats.l2.hits + this.stats.l3.hits;
        const totalMisses = this.stats.l1.misses + this.stats.l2.misses + this.stats.l3.misses;
        
        return {
            ...this.stats,
            computed: {
                totalSize,
                hitRate: totalHits / Math.max(1, totalHits + totalMisses),
                l1HitRate: this.stats.l1.hits / Math.max(1, this.stats.total.requests),
                l2HitRate: this.stats.l2.hits / Math.max(1, this.stats.total.requests),
                l3HitRate: this.stats.l3.hits / Math.max(1, this.stats.total.requests),
                memoryUtilization: this.stats.memory.used / (this.options.maxMemoryMB * 1024 * 1024),
                efficiency: totalHits / Math.max(1, this.stats.total.requests)
            },
            configuration: {
                l1MaxSize: this.options.l1MaxSize,
                l2MaxSize: this.options.l2MaxSize,
                l3MaxSize: this.options.l3MaxSize,
                maxMemoryMB: this.options.maxMemoryMB
            }
        };
    }

    /**
     * Cleanup expired entries and manage memory
     */
    _cleanup() {
        const startTime = Date.now();
        let cleaned = 0;

        // Cleanup L1
        cleaned += this._cleanupL1();

        // Cleanup L2
        cleaned += this._cleanupL2();

        // Cleanup L3
        cleaned += this._cleanupL3();

        // Memory pressure cleanup
        if (this._isMemoryPressureHigh()) {
            cleaned += this._emergencyCleanup();
        }

        if (cleaned > 0) {
            this.emit('cleanup', { 
                cleaned, 
                duration: Date.now() - startTime,
                memoryUsed: this.stats.memory.used 
            });
        }
    }

    // L1 Cache Methods (LRU)
    _getFromL1(key) {
        const node = this.l1Cache.get(key);
        if (!node || node.isExpired()) {
            if (node) {
                this._removeFromL1(key);
            }
            this.stats.l1.misses++;
            return undefined;
        }

        // Move to head (most recently used)
        this._moveToHead(node);
        node.touch();
        return node.value;
    }

    async _setInL1(key, value, ttl, priority) {
        const existing = this.l1Cache.get(key);
        
        if (existing) {
            existing.value = value;
            existing.ttl = ttl;
            existing.created = Date.now();
            this._moveToHead(existing);
            return;
        }

        const node = new LRUNode(key, value, ttl);
        
        // Check if we need to evict
        if (this.l1Size >= this.options.l1MaxSize) {
            const evicted = this._evictFromL1();
            if (evicted && priority !== 'high') {
                // Demote evicted item to L2
                await this._setInL2(evicted.key, evicted.value, evicted.ttl);
            }
        }

        this.l1Cache.set(key, node);
        this._addToHead(node);
        this.l1Size++;
        this.stats.l1.size++;
    }

    _removeFromL1(key) {
        const node = this.l1Cache.get(key);
        if (!node) return false;

        this.l1Cache.delete(key);
        this._removeNode(node);
        this.l1Size--;
        this.stats.l1.size--;
        return true;
    }

    _evictFromL1() {
        if (!this.l1Tail) return null;
        
        const evicted = this.l1Tail;
        this._removeFromL1(evicted.key);
        this.stats.l1.evictions++;
        
        return evicted;
    }

    // L2 Cache Methods (Frequency-based)
    _getFromL2(key) {
        const item = this.l2Cache.get(key);
        if (!item || item.isExpired()) {
            if (item) {
                this.l2Cache.delete(key);
                this.l2AccessFreq.delete(key);
                this.stats.l2.size--;
            }
            this.stats.l2.misses++;
            return undefined;
        }

        // Update access frequency
        const freq = this.l2AccessFreq.get(key) || 0;
        this.l2AccessFreq.set(key, freq + 1);
        item.touch();
        
        return item.value;
    }

    async _setInL2(key, value, ttl) {
        if (this.l2Cache.size >= this.options.l2MaxSize) {
            this._evictFromL2();
        }

        const node = new LRUNode(key, value, ttl);
        this.l2Cache.set(key, node);
        this.l2AccessFreq.set(key, 1);
        this.stats.l2.size++;
    }

    async _promoteToL1(key, value) {
        await this._setInL1(key, value, this.options.l1DefaultTTL, 'normal');
        this.l2Cache.delete(key);
        this.l2AccessFreq.delete(key);
        this.stats.l2.size--;
    }

    // L3 Cache Methods (FIFO)
    _getFromL3(key) {
        const item = this.l3Cache.get(key);
        if (!item || item.isExpired()) {
            if (item) {
                this.l3Cache.delete(key);
                this.l3Queue = this.l3Queue.filter(k => k !== key);
                this.stats.l3.size--;
            }
            this.stats.l3.misses++;
            return undefined;
        }

        item.touch();
        return item.value;
    }

    async _setInL3(key, value, ttl) {
        if (this.l3Cache.size >= this.options.l3MaxSize) {
            this._evictFromL3();
        }

        const node = new LRUNode(key, value, ttl);
        this.l3Cache.set(key, node);
        this.l3Queue.push(key);
        this.stats.l3.size++;
    }

    async _promoteToL2(key, value) {
        await this._setInL2(key, value, this.options.l2DefaultTTL);
        this.l3Cache.delete(key);
        this.l3Queue = this.l3Queue.filter(k => k !== key);
        this.stats.l3.size--;
    }

    // Utility methods
    _determineTier(key, value) {
        // Simple heuristic - can be made more sophisticated
        const size = this._estimateSize(value);
        
        if (size < 1000) return 'l1'; // Small objects in L1
        if (size < 10000) return 'l2'; // Medium objects in L2
        return 'l3'; // Large objects in L3
    }

    _estimateSize(value) {
        if (typeof value === 'string') return value.length * 2;
        if (Buffer.isBuffer(value)) return value.length;
        return JSON.stringify(value).length * 2;
    }

    _shouldRejectDueToMemory(size) {
        const maxBytes = this.options.maxMemoryMB * 1024 * 1024;
        return (this.stats.memory.used + size) > (maxBytes * this.options.gcThreshold);
    }

    _isMemoryPressureHigh() {
        const maxBytes = this.options.maxMemoryMB * 1024 * 1024;
        return this.stats.memory.used > (maxBytes * this.options.gcThreshold);
    }

    _recordAccess(key, tier, duration) {
        this.emit('access', { key, tier, duration });
    }

    _recordMiss(key, duration) {
        this.emit('miss', { key, duration });
    }

    _triggerPrefetch(key, value) {
        this.stats.prefetch.triggered++;
        this.emit('prefetch', { key, value });
    }

    _emitMetrics() {
        this.emit('metrics', this.getStats());
    }

    // Cleanup methods for each tier
    _cleanupL1() {
        let cleaned = 0;
        const toRemove = [];

        for (const [key, node] of this.l1Cache) {
            if (node.isExpired()) {
                toRemove.push(key);
            }
        }

        toRemove.forEach(key => {
            this._removeFromL1(key);
            cleaned++;
        });

        return cleaned;
    }

    _cleanupL2() {
        let cleaned = 0;
        const toRemove = [];

        for (const [key, item] of this.l2Cache) {
            if (item.isExpired()) {
                toRemove.push(key);
            }
        }

        toRemove.forEach(key => {
            this.l2Cache.delete(key);
            this.l2AccessFreq.delete(key);
            this.stats.l2.size--;
            cleaned++;
        });

        return cleaned;
    }

    _cleanupL3() {
        let cleaned = 0;
        const toRemove = [];

        for (const [key, item] of this.l3Cache) {
            if (item.isExpired()) {
                toRemove.push(key);
            }
        }

        toRemove.forEach(key => {
            this.l3Cache.delete(key);
            this.l3Queue = this.l3Queue.filter(k => k !== key);
            this.stats.l3.size--;
            cleaned++;
        });

        return cleaned;
    }

    _emergencyCleanup() {
        // Aggressive cleanup under memory pressure
        let cleaned = 0;
        
        // Remove least frequently used items from L2
        const l2Entries = Array.from(this.l2AccessFreq.entries())
            .sort((a, b) => a[1] - b[1])
            .slice(0, Math.floor(this.l2Cache.size * 0.2));
            
        l2Entries.forEach(([key]) => {
            this.l2Cache.delete(key);
            this.l2AccessFreq.delete(key);
            this.stats.l2.size--;
            cleaned++;
        });

        // Remove oldest items from L3
        const l3ToRemove = this.l3Queue.slice(0, Math.floor(this.l3Queue.length * 0.3));
        l3ToRemove.forEach(key => {
            this.l3Cache.delete(key);
            this.stats.l3.size--;
            cleaned++;
        });
        this.l3Queue = this.l3Queue.slice(l3ToRemove.length);

        return cleaned;
    }

    // LRU doubly-linked list operations
    _addToHead(node) {
        node.prev = null;
        node.next = this.l1Head;
        
        if (this.l1Head) {
            this.l1Head.prev = node;
        }
        
        this.l1Head = node;
        
        if (!this.l1Tail) {
            this.l1Tail = node;
        }
    }

    _removeNode(node) {
        if (node.prev) {
            node.prev.next = node.next;
        } else {
            this.l1Head = node.next;
        }
        
        if (node.next) {
            node.next.prev = node.prev;
        } else {
            this.l1Tail = node.prev;
        }
    }

    _moveToHead(node) {
        this._removeNode(node);
        this._addToHead(node);
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        
        if (this.metricsTimer) {
            clearInterval(this.metricsTimer);
        }

        this.clear();
        this.emit('cleanup-complete');
    }
}

module.exports = PerformanceCache;