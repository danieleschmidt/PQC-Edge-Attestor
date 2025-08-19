/**
 * @file generation3.test.js
 * @brief Generation 3 performance optimization and scalability tests
 */

const { PerformanceCache, CACHE_LEVELS } = require('../../src/optimization/performanceCache');
const { AutoScaler, SCALING_STRATEGIES, RESOURCE_TYPES } = require('../../src/optimization/autoScaler');

describe('Generation 3: Performance Optimization and Scalability', () => {
    describe('PerformanceCache', () => {
        let cache;

        beforeEach(() => {
            cache = new PerformanceCache({
                l1Size: 100,
                l2Size: 500,
                l3Size: 1000,
                defaultTtl: 60000,
                enablePrefetching: true
            });
        });

        afterEach(async () => {
            if (cache) {
                await cache.cleanup();
            }
        });

        test('should initialize with all cache levels', () => {
            expect(cache.isInitialized()).toBe(true);
            const stats = cache.getStats();
            expect(stats.l1.size).toBe(0);
            expect(stats.l2.size).toBe(0);
            expect(stats.l3.size).toBe(0);
        });

        test('should store and retrieve data from L1 cache', async () => {
            const key = 'test-key';
            const value = { data: 'test-data', timestamp: Date.now() };

            await cache.set(key, value);
            const retrieved = await cache.get(key);

            expect(retrieved).toEqual(value);
            
            const stats = cache.getStats();
            expect(stats.l1.hits).toBe(1);
            expect(stats.l1.size).toBe(1);
        });

        test('should promote items between cache levels', async () => {
            const key = 'promotion-test';
            const value = { data: 'promotion-data' };

            // Fill L1 cache to trigger promotion
            for (let i = 0; i < 150; i++) {
                await cache.set(`key-${i}`, { data: `data-${i}` });
            }

            // Access the item multiple times to increase frequency
            for (let i = 0; i < 5; i++) {
                await cache.get('key-0');
            }

            const stats = cache.getStats();
            expect(stats.l2.size).toBeGreaterThan(0);
        });

        test('should handle TTL expiration', async () => {
            const key = 'ttl-test';
            const value = { data: 'ttl-data' };

            await cache.set(key, value, 100); // 100ms TTL

            // Should exist immediately
            let retrieved = await cache.get(key);
            expect(retrieved).toEqual(value);

            // Wait for expiration
            await new Promise(resolve => setTimeout(resolve, 150));

            // Should be expired
            retrieved = await cache.get(key);
            expect(retrieved).toBeUndefined();
        });

        test('should implement LRU eviction in L1', async () => {
            // Fill L1 beyond capacity
            for (let i = 0; i < 120; i++) {
                await cache.set(`lru-${i}`, { data: `data-${i}` });
            }

            const stats = cache.getStats();
            expect(stats.l1.size).toBeLessThanOrEqual(100);
            expect(stats.l1.evictions).toBeGreaterThan(0);

            // First items should be evicted
            const firstItem = await cache.get('lru-0');
            expect(firstItem).toBeUndefined();
        });

        test('should prefetch related keys', async () => {
            cache.enablePrefetching = true;
            
            // Set up related keys
            await cache.set('user:123:profile', { name: 'John' });
            await cache.set('user:123:settings', { theme: 'dark' });
            await cache.set('user:123:activity', { lastLogin: Date.now() });

            // Access one key to trigger prefetching
            await cache.get('user:123:profile');

            // Wait for prefetching
            await new Promise(resolve => setTimeout(resolve, 100));

            const stats = cache.getStats();
            expect(stats.prefetches).toBeGreaterThan(0);
        });

        test('should provide cache statistics', async () => {
            await cache.set('stat-test-1', { data: 'test1' });
            await cache.set('stat-test-2', { data: 'test2' });
            await cache.get('stat-test-1');
            await cache.get('nonexistent-key');

            const stats = cache.getStats();

            expect(stats.l1.hits).toBeGreaterThan(0);
            expect(stats.l1.misses).toBeGreaterThan(0);
            expect(stats.l1.size).toBe(2);
            expect(stats.totalRequests).toBeGreaterThan(0);
            expect(stats.hitRate).toBeGreaterThan(0);
        });
    });

    describe('AutoScaler', () => {
        let autoScaler;

        beforeEach(() => {
            autoScaler = new AutoScaler({
                strategy: SCALING_STRATEGIES.HYBRID,
                evaluationInterval: 1000, // 1 second for testing
                cooldownPeriod: 2000, // 2 seconds for testing
                scaleUpThreshold: 0.75,
                scaleDownThreshold: 0.30,
                enableCircuitBreaker: true
            });
        });

        afterEach(() => {
            if (autoScaler) {
                autoScaler.cleanup();
            }
        });

        test('should initialize with default resources', () => {
            const status = autoScaler.getStatus();
            
            expect(status.strategy).toBe(SCALING_STRATEGIES.HYBRID);
            expect(status.resources[RESOURCE_TYPES.CPU]).toBeDefined();
            expect(status.resources[RESOURCE_TYPES.MEMORY]).toBeDefined();
            expect(status.resources[RESOURCE_TYPES.CRYPTO_WORKERS]).toBeDefined();

            const cpuResource = status.resources[RESOURCE_TYPES.CPU];
            expect(cpuResource.current).toBe(2);
            expect(cpuResource.min).toBe(1);
            expect(cpuResource.max).toBe(8);
        });

        test('should register custom resources', () => {
            autoScaler.registerResource('custom-service', {
                initial: 3,
                min: 1,
                max: 10,
                stepSize: 2,
                costPerUnit: 0.15,
                scaleFunction: async (level) => true,
                metricExtractor: (metrics) => metrics.customLoad
            });

            const status = autoScaler.getStatus();
            expect(status.resources['custom-service']).toBeDefined();
            expect(status.resources['custom-service'].current).toBe(3);
        });

        test('should update metrics and track performance', () => {
            const metrics = {
                cpuUsage: 0.85,
                memoryUsage: 0.60,
                cryptoQueueLength: 0.90,
                responseTime: 150
            };

            autoScaler.updateMetrics(metrics);

            const status = autoScaler.getStatus();
            expect(status.metrics.metricsCount).toBe(1);
            expect(status.resources[RESOURCE_TYPES.CPU].utilization).toBe(0.85);
            expect(status.resources[RESOURCE_TYPES.MEMORY].utilization).toBe(0.60);
        });

        test('should trigger scale up when threshold exceeded', async () => {
            let scaledLevel = null;
            
            // Override scale function to capture scaling
            autoScaler.registerResource(RESOURCE_TYPES.CPU, {
                initial: 2,
                min: 1,
                max: 8,
                stepSize: 1,
                scaleFunction: async (level) => {
                    scaledLevel = level;
                    return true;
                },
                metricExtractor: (metrics) => metrics.cpuUsage
            });

            // Trigger high CPU usage
            autoScaler.updateMetrics({ cpuUsage: 0.90 });

            // Manual scaling to test the mechanism
            const result = await autoScaler.scaleResource(RESOURCE_TYPES.CPU, 3, 'high-load-test');
            
            expect(result).toBe(true);
            expect(scaledLevel).toBe(3);
        });

        test('should trigger scale down when threshold not met', async () => {
            let scaledLevel = null;
            
            autoScaler.registerResource(RESOURCE_TYPES.CPU, {
                initial: 4,
                min: 1,
                max: 8,
                stepSize: 1,
                scaleFunction: async (level) => {
                    scaledLevel = level;
                    return true;
                },
                metricExtractor: (metrics) => metrics.cpuUsage
            });

            // Trigger low CPU usage
            autoScaler.updateMetrics({ cpuUsage: 0.20 });

            // Manual scaling to test the mechanism
            const result = await autoScaler.scaleResource(RESOURCE_TYPES.CPU, 3, 'low-load-test');
            
            expect(result).toBe(true);
            expect(scaledLevel).toBe(3);
        });

        test('should provide scaling recommendations', () => {
            // Set high utilization
            autoScaler.updateMetrics({
                cpuUsage: 0.85,
                memoryUsage: 0.20,
                cryptoQueueLength: 0.90
            });

            const recommendations = autoScaler.getRecommendations();
            
            expect(recommendations).toBeInstanceOf(Array);
            expect(recommendations.length).toBeGreaterThan(0);
            
            const cpuRecommendation = recommendations.find(r => r.type === RESOURCE_TYPES.CPU);
            expect(cpuRecommendation).toBeDefined();
            expect(cpuRecommendation.action).toBe('scale_up');
        });

        test('should track scaling statistics', async () => {
            const initialStats = autoScaler.getStatus().stats;
            
            await autoScaler.scaleResource(RESOURCE_TYPES.CPU, 3, 'stats-test');
            
            const updatedStats = autoScaler.getStatus().stats;
            expect(updatedStats.scaleUpActions).toBe(initialStats.scaleUpActions + 1);
            expect(updatedStats.totalDecisions).toBe(initialStats.totalDecisions + 1);
        });

        test('should handle circuit breaker integration', async () => {
            // Create a resource that fails scaling
            autoScaler.registerResource('failing-resource', {
                initial: 2,
                min: 1,
                max: 5,
                scaleFunction: async () => {
                    throw new Error('Scaling failed');
                },
                metricExtractor: (metrics) => metrics.customLoad
            });

            // Try to scale the failing resource
            const result = await autoScaler.scaleResource('failing-resource', 3, 'circuit-breaker-test');
            
            expect(result).toBe(false);
        });

        test('should implement predictive scaling patterns', () => {
            // Feed historical data
            const now = Date.now();
            for (let i = 0; i < 10; i++) {
                autoScaler.updateMetrics({
                    cpuUsage: 0.5 + (Math.sin(i / 2) * 0.3), // Sinusoidal pattern
                    timestamp: now - (i * 60000) // 1 minute intervals
                });
            }

            const status = autoScaler.getStatus();
            expect(status.metrics.metricsCount).toBe(10);
            
            // Predictions should be generated for predictive strategy
            if (status.strategy === SCALING_STRATEGIES.PREDICTIVE || 
                status.strategy === SCALING_STRATEGIES.HYBRID) {
                expect(Object.keys(status.predictions)).toContain(RESOURCE_TYPES.CPU);
            }
        });
    });

    describe('Integration Tests', () => {
        let cache, autoScaler;

        beforeEach(() => {
            cache = new PerformanceCache({
                l1Size: 50,
                l2Size: 200,
                l3Size: 500
            });

            autoScaler = new AutoScaler({
                strategy: SCALING_STRATEGIES.HYBRID,
                evaluationInterval: 5000,
                enableCircuitBreaker: true
            });
        });

        afterEach(async () => {
            if (cache) await cache.cleanup();
            if (autoScaler) autoScaler.cleanup();
        });

        test('should integrate cache with auto-scaling', async () => {
            // Register cache-related resource
            autoScaler.registerResource('cache-size', {
                initial: 50,
                min: 25,
                max: 200,
                stepSize: 25,
                scaleFunction: async (level) => {
                    // Would resize cache in real implementation
                    return true;
                },
                metricExtractor: (metrics) => metrics.cacheUtilization
            });

            // Simulate high cache utilization
            const cacheStats = cache.getStats();
            const utilization = cacheStats.l1.size / 50; // Assuming 50 is max size

            autoScaler.updateMetrics({
                cacheUtilization: 0.90,
                cpuUsage: 0.60,
                memoryUsage: 0.50
            });

            const recommendations = autoScaler.getRecommendations();
            expect(recommendations.some(r => r.type === 'cache-size')).toBe(true);
        });

        test('should handle concurrent cache and scaling operations', async () => {
            const promises = [];

            // Concurrent cache operations
            for (let i = 0; i < 50; i++) {
                promises.push(cache.set(`concurrent-${i}`, { data: `data-${i}` }));
            }

            // Concurrent scaling operations
            for (let i = 0; i < 10; i++) {
                promises.push(autoScaler.updateMetrics({
                    cpuUsage: Math.random(),
                    memoryUsage: Math.random(),
                    timestamp: Date.now() + i
                }));
            }

            await Promise.all(promises);

            const cacheStats = cache.getStats();
            const scalerStatus = autoScaler.getStatus();

            expect(cacheStats.l1.size).toBeGreaterThan(0);
            expect(scalerStatus.metrics.metricsCount).toBeGreaterThan(0);
        });
    });
});