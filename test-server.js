/**
 * @file test-server.js
 * @brief Simple server test for Generation 3 features
 */

const express = require('express');
const { performance } = require('./src/middleware/performanceOptimization');
const { cacheManager } = require('./src/middleware/caching');
const { healthCheckManager } = require('./src/middleware/healthCheck');

const app = express();

// Basic middleware
app.use(express.json());
app.use(performance.requestTimer());

// Test endpoints
app.get('/', (req, res) => {
  res.json({
    name: 'PQC-Edge-Attestor Generation 3 Test',
    version: '1.0.0',
    generation: 3,
    status: 'operational',
    timestamp: new Date().toISOString()
  });
});

app.get('/health/live', (req, res) => {
  res.json({
    alive: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/api/v1/performance', (req, res) => {
  res.json({
    success: true,
    data: performance.getPerformanceMetrics(),
    timestamp: new Date().toISOString()
  });
});

app.get('/api/v1/cache/stats', (req, res) => {
  res.json({
    success: true,
    data: cacheManager.getAllStats(),
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`Generation 3 test server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  server.close(() => {
    console.log('Test server shutdown complete');
    process.exit(0);
  });
});

module.exports = { app, server };