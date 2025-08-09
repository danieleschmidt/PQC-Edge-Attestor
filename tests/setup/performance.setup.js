/**
 * @file performance.setup.js
 * @brief Performance test setup configuration
 */

// Performance test specific setup
beforeAll(async () => {
  // Prepare performance testing environment
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';
  
  // Initialize performance monitoring
  if (typeof performance === 'undefined') {
    global.performance = require('perf_hooks').performance;
  }
});

// Add performance testing utilities
global.performanceTest = async (testFn, options = {}) => {
  const iterations = options.iterations || 100;
  const warmup = options.warmup || 10;
  const results = [];
  
  // Warmup runs
  for (let i = 0; i < warmup; i++) {
    await testFn();
  }
  
  // Actual test runs
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await testFn();
    const end = performance.now();
    results.push(end - start);
  }
  
  return {
    mean: results.reduce((sum, val) => sum + val, 0) / results.length,
    min: Math.min(...results),
    max: Math.max(...results),
    stdDev: Math.sqrt(results.reduce((sum, val) => sum + Math.pow(val - results.reduce((s, v) => s + v, 0) / results.length, 2), 0) / results.length),
    results
  };
};