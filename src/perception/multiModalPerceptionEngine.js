/**
 * @file multiModalPerceptionEngine.js
 * @brief Generation 5+: Multi-Modal Perception and Understanding Engine
 * 
 * Advanced multi-modal perception system that processes and integrates
 * information from multiple sensory channels to create comprehensive
 * understanding of system state and environmental context.
 * 
 * Features:
 * - Multi-sensory data integration
 * - Cross-modal attention mechanisms
 * - Perception-action feedback loops
 * - Contextual understanding synthesis
 * - Temporal perception patterns
 * - Emergent concept formation
 * - Adaptive sensory weighting
 * - Predictive perception modeling
 */

const winston = require('winston');
const EventEmitter = require('events');

// Create multi-modal perception logger
const logger = winston.createLogger({
  level: process.env.PERCEPTION_LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'multi-modal-perception' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize ? winston.format.colorize() : winston.format.simple(),
        winston.format.simple ? winston.format.simple() : winston.format.printf(info => 
          `${info.timestamp} [${info.level}] ${info.message}`
        )
      )
    })
  ]
});

/**
 * Sensory Channel Processor
 * Processes data from individual sensory channels
 */
class SensoryChannelProcessor {
  constructor(channelType, options = {}) {
    this.channelType = channelType;
    this.options = {
      bufferSize: options.bufferSize || 100,
      noiseThreshold: options.noiseThreshold || 0.1,
      adaptiveWeighting: options.adaptiveWeighting !== false,
      temporalSmoothing: options.temporalSmoothing || 0.8,
      ...options
    };
    
    this.dataBuffer = [];
    this.processedData = [];
    this.features = new Map();
    this.patterns = [];
    this.channelWeight = 1.0;
    this.processingStats = {
      totalProcessed: 0,
      averageSignalStrength: 0,
      noiseLevel: 0,
      patternCount: 0
    };
    
    this.initializeChannelProcessor();
  }

  initializeChannelProcessor() {
    // Initialize channel-specific processing parameters
    switch (this.channelType) {
      case 'system_metrics':
        this.features.set('cpu_utilization', { weight: 0.8, threshold: 0.7 });
        this.features.set('memory_usage', { weight: 0.9, threshold: 0.8 });
        this.features.set('network_latency', { weight: 0.7, threshold: 0.5 });
        this.features.set('error_rate', { weight: 0.95, threshold: 0.05 });
        break;
        
      case 'security_events':
        this.features.set('threat_level', { weight: 0.95, threshold: 0.3 });
        this.features.set('anomaly_score', { weight: 0.85, threshold: 0.6 });
        this.features.set('access_patterns', { weight: 0.7, threshold: 0.8 });
        break;
        
      case 'user_behavior':
        this.features.set('interaction_frequency', { weight: 0.6, threshold: 0.7 });
        this.features.set('satisfaction_score', { weight: 0.8, threshold: 0.6 });
        this.features.set('task_completion', { weight: 0.9, threshold: 0.8 });
        break;
        
      case 'environmental':
        this.features.set('system_load', { weight: 0.8, threshold: 0.7 });
        this.features.set('resource_availability', { weight: 0.7, threshold: 0.5 });
        this.features.set('external_dependencies', { weight: 0.6, threshold: 0.8 });
        break;
        
      default:
        // Generic feature set
        this.features.set('signal_strength', { weight: 0.7, threshold: 0.5 });
        this.features.set('noise_ratio', { weight: 0.5, threshold: 0.3 });
    }
    
    logger.debug('Initialized sensory channel processor', {
      channelType: this.channelType,
      features: Array.from(this.features.keys())
    });
  }

  processRawData(rawData) {
    // Process incoming raw sensory data
    const processedEntry = {
      timestamp: new Date(),
      rawData: rawData,
      processedFeatures: new Map(),
      signalStrength: 0,
      noiseLevel: 0,
      anomalies: []
    };
    
    // Extract features based on channel type
    processedEntry.processedFeatures = this.extractFeatures(rawData);
    
    // Calculate signal strength
    processedEntry.signalStrength = this.calculateSignalStrength(processedEntry.processedFeatures);
    
    // Detect noise
    processedEntry.noiseLevel = this.detectNoise(rawData);
    
    // Identify anomalies
    processedEntry.anomalies = this.detectAnomalies(processedEntry.processedFeatures);
    
    // Apply temporal smoothing if enabled
    if (this.options.temporalSmoothing > 0 && this.processedData.length > 0) {
      processedEntry.processedFeatures = this.applyTemporalSmoothing(
        processedEntry.processedFeatures,
        this.processedData[this.processedData.length - 1].processedFeatures
      );
    }
    
    // Update buffers
    this.dataBuffer.push(rawData);
    this.processedData.push(processedEntry);
    
    // Maintain buffer size
    if (this.dataBuffer.length > this.options.bufferSize) {
      this.dataBuffer.shift();
      this.processedData.shift();
    }
    
    // Update statistics
    this.updateProcessingStats(processedEntry);
    
    // Detect patterns
    if (this.processedData.length >= 5) {
      const newPatterns = this.detectPatterns();
      this.patterns.push(...newPatterns);
      
      // Limit pattern history
      if (this.patterns.length > 50) {
        this.patterns = this.patterns.slice(-50);
      }
    }
    
    return processedEntry;
  }

  extractFeatures(rawData) {
    const extractedFeatures = new Map();
    
    switch (this.channelType) {
      case 'system_metrics':
        extractedFeatures.set('cpu_utilization', this.normalizeValue(rawData.cpu || 0, 0, 100));
        extractedFeatures.set('memory_usage', this.normalizeValue(rawData.memory || 0, 0, 100));
        extractedFeatures.set('network_latency', this.normalizeValue(rawData.latency || 0, 0, 1000));
        extractedFeatures.set('error_rate', this.normalizeValue(rawData.errors || 0, 0, 10));
        break;
        
      case 'security_events':
        extractedFeatures.set('threat_level', rawData.threatLevel || 0);
        extractedFeatures.set('anomaly_score', rawData.anomalyScore || 0);
        extractedFeatures.set('access_patterns', this.analyzeAccessPatterns(rawData.accessLogs || []));
        break;
        
      case 'user_behavior':
        extractedFeatures.set('interaction_frequency', rawData.interactions || 0);
        extractedFeatures.set('satisfaction_score', rawData.satisfaction || 0.5);
        extractedFeatures.set('task_completion', rawData.completionRate || 0);
        break;
        
      case 'environmental':
        extractedFeatures.set('system_load', rawData.load || 0);
        extractedFeatures.set('resource_availability', rawData.resources || 1);
        extractedFeatures.set('external_dependencies', rawData.dependencies || 1);
        break;
        
      default:
        // Generic feature extraction
        extractedFeatures.set('signal_strength', this.calculateGenericSignalStrength(rawData));
        extractedFeatures.set('noise_ratio', this.calculateGenericNoiseRatio(rawData));
    }
    
    return extractedFeatures;
  }

  normalizeValue(value, min, max) {
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
  }

  analyzeAccessPatterns(accessLogs) {
    // Simplified access pattern analysis
    if (!Array.isArray(accessLogs) || accessLogs.length === 0) return 0;
    
    const uniqueUsers = new Set(accessLogs.map(log => log.userId)).size;
    const timeSpread = accessLogs.length > 1 ? 
      (accessLogs[accessLogs.length - 1].timestamp - accessLogs[0].timestamp) / 1000 : 0;
    
    return Math.min(1, uniqueUsers * timeSpread / 100);
  }

  calculateGenericSignalStrength(rawData) {
    if (typeof rawData === 'number') {
      return Math.min(1, Math.abs(rawData));
    } else if (typeof rawData === 'object') {
      const values = Object.values(rawData).filter(v => typeof v === 'number');
      if (values.length === 0) return 0;
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      return Math.min(1, Math.abs(avg));
    }
    return 0;
  }

  calculateGenericNoiseRatio(rawData) {
    // Simple noise estimation
    return Math.random() * 0.1; // Placeholder
  }

  calculateSignalStrength(features) {
    let totalStrength = 0;
    let totalWeight = 0;
    
    for (const [featureName, value] of features.entries()) {
      const featureConfig = this.features.get(featureName);
      if (featureConfig) {
        totalStrength += value * featureConfig.weight;
        totalWeight += featureConfig.weight;
      }
    }
    
    return totalWeight > 0 ? totalStrength / totalWeight : 0;
  }

  detectNoise(rawData) {
    // Simple noise detection based on signal variation
    if (this.dataBuffer.length < 5) return 0;
    
    const recentData = this.dataBuffer.slice(-5);
    const variation = this.calculateDataVariation(recentData);
    
    return Math.min(1, variation);
  }

  calculateDataVariation(dataSet) {
    if (dataSet.length < 2) return 0;
    
    // Calculate variation for numeric data
    const numericValues = [];
    for (const data of dataSet) {
      if (typeof data === 'number') {
        numericValues.push(data);
      } else if (typeof data === 'object') {
        const objValues = Object.values(data).filter(v => typeof v === 'number');
        numericValues.push(...objValues);
      }
    }
    
    if (numericValues.length < 2) return 0;
    
    const mean = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
    const variance = numericValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / numericValues.length;
    
    return Math.sqrt(variance) / (Math.abs(mean) + 0.001);
  }

  detectAnomalies(features) {
    const anomalies = [];
    
    for (const [featureName, value] of features.entries()) {
      const featureConfig = this.features.get(featureName);
      if (featureConfig) {
        // Check threshold violations
        if (featureName.includes('error') || featureName.includes('threat')) {
          if (value > featureConfig.threshold) {
            anomalies.push({
              type: 'threshold_exceeded',
              feature: featureName,
              value: value,
              threshold: featureConfig.threshold,
              severity: (value - featureConfig.threshold) / (1 - featureConfig.threshold)
            });
          }
        } else {
          // For performance metrics, both high and low values can be anomalous
          if (value < featureConfig.threshold * 0.5 || value > featureConfig.threshold * 1.5) {
            anomalies.push({
              type: 'performance_anomaly',
              feature: featureName,
              value: value,
              expectedRange: [featureConfig.threshold * 0.5, featureConfig.threshold * 1.5],
              severity: Math.abs(value - featureConfig.threshold) / featureConfig.threshold
            });
          }
        }
      }
    }
    
    return anomalies;
  }

  applyTemporalSmoothing(currentFeatures, previousFeatures) {
    const smoothedFeatures = new Map();
    const smoothing = this.options.temporalSmoothing;
    
    for (const [featureName, currentValue] of currentFeatures.entries()) {
      const previousValue = previousFeatures.get(featureName) || currentValue;
      const smoothedValue = previousValue * smoothing + currentValue * (1 - smoothing);
      smoothedFeatures.set(featureName, smoothedValue);
    }
    
    return smoothedFeatures;
  }

  detectPatterns() {
    if (this.processedData.length < 5) return [];
    
    const patterns = [];
    const recentData = this.processedData.slice(-10);
    
    // Detect trend patterns
    const trendPatterns = this.detectTrendPatterns(recentData);
    patterns.push(...trendPatterns);
    
    // Detect cyclic patterns
    const cyclicPatterns = this.detectCyclicPatterns(recentData);
    patterns.push(...cyclicPatterns);
    
    // Detect anomaly clusters
    const anomalyPatterns = this.detectAnomalyPatterns(recentData);
    patterns.push(...anomalyPatterns);
    
    return patterns;
  }

  detectTrendPatterns(data) {
    const patterns = [];
    
    for (const [featureName] of this.features.entries()) {
      const values = data.map(d => d.processedFeatures.get(featureName)).filter(v => v !== undefined);
      if (values.length < 3) continue;
      
      const trend = this.calculateTrend(values);
      
      if (Math.abs(trend) > 0.1) {
        patterns.push({
          type: 'trend',
          feature: featureName,
          direction: trend > 0 ? 'increasing' : 'decreasing',
          strength: Math.abs(trend),
          confidence: this.calculateTrendConfidence(values)
        });
      }
    }
    
    return patterns;
  }

  detectCyclicPatterns(data) {
    const patterns = [];
    
    for (const [featureName] of this.features.entries()) {
      const values = data.map(d => d.processedFeatures.get(featureName)).filter(v => v !== undefined);
      if (values.length < 5) continue;
      
      const cyclicity = this.detectCyclicity(values);
      
      if (cyclicity.strength > 0.6) {
        patterns.push({
          type: 'cyclic',
          feature: featureName,
          period: cyclicity.period,
          strength: cyclicity.strength,
          phase: cyclicity.phase
        });
      }
    }
    
    return patterns;
  }

  detectAnomalyPatterns(data) {
    const patterns = [];
    
    const anomalyCounts = new Map();
    for (const entry of data) {
      for (const anomaly of entry.anomalies) {
        const key = anomaly.feature;
        anomalyCounts.set(key, (anomalyCounts.get(key) || 0) + 1);
      }
    }
    
    for (const [feature, count] of anomalyCounts.entries()) {
      if (count >= 3) { // Cluster threshold
        patterns.push({
          type: 'anomaly_cluster',
          feature: feature,
          frequency: count / data.length,
          severity: this.calculateClusterSeverity(data, feature)
        });
      }
    }
    
    return patterns;
  }

  calculateTrend(values) {
    if (values.length < 2) return 0;
    
    const n = values.length;
    const sumX = n * (n + 1) / 2;
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = values.reduce((sum, y, i) => sum + (i + 1) * y, 0);
    const sumX2 = n * (n + 1) * (2 * n + 1) / 6;
    
    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  }

  calculateTrendConfidence(values) {
    // Simple confidence based on data consistency
    const trend = this.calculateTrend(values);
    const expectedValues = values.map((_, i) => values[0] + trend * i);
    
    let totalError = 0;
    for (let i = 0; i < values.length; i++) {
      totalError += Math.abs(values[i] - expectedValues[i]);
    }
    
    const avgError = totalError / values.length;
    return Math.max(0, 1 - avgError);
  }

  detectCyclicity(values) {
    // Simple autocorrelation-based cyclicity detection
    let maxCorrelation = 0;
    let bestPeriod = 1;
    
    for (let period = 2; period <= Math.floor(values.length / 2); period++) {
      const correlation = this.calculateAutocorrelation(values, period);
      if (correlation > maxCorrelation) {
        maxCorrelation = correlation;
        bestPeriod = period;
      }
    }
    
    return {
      strength: maxCorrelation,
      period: bestPeriod,
      phase: this.calculatePhase(values, bestPeriod)
    };
  }

  calculateAutocorrelation(values, lag) {
    const n = values.length - lag;
    if (n <= 0) return 0;
    
    let correlation = 0;
    for (let i = 0; i < n; i++) {
      correlation += values[i] * values[i + lag];
    }
    
    return correlation / n;
  }

  calculatePhase(values, period) {
    // Simplified phase calculation
    const firstCycleMax = Math.max(...values.slice(0, period));
    const firstCycleMaxIndex = values.indexOf(firstCycleMax);
    
    return firstCycleMaxIndex / period;
  }

  calculateClusterSeverity(data, feature) {
    const anomalies = data.flatMap(d => d.anomalies).filter(a => a.feature === feature);
    if (anomalies.length === 0) return 0;
    
    const avgSeverity = anomalies.reduce((sum, a) => sum + a.severity, 0) / anomalies.length;
    return avgSeverity;
  }

  updateProcessingStats(processedEntry) {
    this.processingStats.totalProcessed++;
    
    // Update running averages
    const alpha = 0.1; // Learning rate for running average
    this.processingStats.averageSignalStrength = 
      this.processingStats.averageSignalStrength * (1 - alpha) + processedEntry.signalStrength * alpha;
    
    this.processingStats.noiseLevel = 
      this.processingStats.noiseLevel * (1 - alpha) + processedEntry.noiseLevel * alpha;
    
    this.processingStats.patternCount = this.patterns.length;
  }

  adaptChannelWeight(globalContext) {
    if (!this.options.adaptiveWeighting) return;
    
    // Adapt channel weight based on relevance and signal quality
    const signalQuality = Math.max(0, 1 - this.processingStats.noiseLevel);
    const relevance = this.calculateChannelRelevance(globalContext);
    const reliability = this.calculateChannelReliability();
    
    this.channelWeight = (signalQuality * 0.4 + relevance * 0.4 + reliability * 0.2);
    
    logger.debug('Adapted channel weight', {
      channel: this.channelType,
      weight: this.channelWeight,
      factors: { signalQuality, relevance, reliability }
    });
  }

  calculateChannelRelevance(globalContext) {
    // Calculate how relevant this channel is to the current context
    const contextPriorities = globalContext.priorities || {};
    
    switch (this.channelType) {
      case 'system_metrics':
        return contextPriorities.performance || 0.7;
      case 'security_events':
        return contextPriorities.security || 0.9;
      case 'user_behavior':
        return contextPriorities.user_experience || 0.6;
      case 'environmental':
        return contextPriorities.stability || 0.5;
      default:
        return 0.5;
    }
  }

  calculateChannelReliability() {
    // Calculate channel reliability based on historical performance
    if (this.processedData.length < 10) return 0.5;
    
    const recentData = this.processedData.slice(-10);
    const consistentSignal = recentData.filter(d => d.signalStrength > 0.3).length / recentData.length;
    const lowNoise = recentData.filter(d => d.noiseLevel < 0.3).length / recentData.length;
    
    return (consistentSignal + lowNoise) / 2;
  }

  getChannelReport() {
    return {
      channelType: this.channelType,
      currentWeight: this.channelWeight,
      statistics: this.processingStats,
      recentPatterns: this.patterns.slice(-5),
      features: Object.fromEntries(this.features),
      bufferUtilization: this.dataBuffer.length / this.options.bufferSize,
      lastProcessed: this.processedData.length > 0 ? 
        this.processedData[this.processedData.length - 1].timestamp : null
    };
  }
}

/**
 * Cross-Modal Attention Mechanism
 * Manages attention across different sensory channels
 */
class CrossModalAttentionMechanism {
  constructor(channels) {
    this.channels = channels;
    this.attentionWeights = new Map();
    this.attentionHistory = [];
    this.focusContext = new Map();
    this.attentionPatterns = [];
    
    this.initializeAttentionWeights();
  }

  initializeAttentionWeights() {
    // Initialize equal attention weights
    for (const channel of this.channels) {
      this.attentionWeights.set(channel.channelType, {
        weight: 1.0 / this.channels.length,
        salience: 0.5,
        relevance: 0.5,
        confidence: 0.5
      });
    }
  }

  updateAttention(channelData, globalContext) {
    const attentionUpdate = {
      timestamp: new Date(),
      channelSaliences: new Map(),
      totalAttention: 0,
      focusShifts: []
    };
    
    // Calculate salience for each channel
    for (const [channelType, data] of channelData.entries()) {
      const salience = this.calculateChannelSalience(data, globalContext);
      attentionUpdate.channelSaliences.set(channelType, salience);
      
      const currentAttention = this.attentionWeights.get(channelType);
      if (currentAttention) {
        currentAttention.salience = salience;
        currentAttention.relevance = this.calculateChannelRelevance(channelType, globalContext);
        currentAttention.confidence = this.calculateChannelConfidence(data);
      }
    }
    
    // Update attention weights using competitive dynamics
    this.updateCompetitiveAttention(attentionUpdate.channelSaliences);
    
    // Detect attention shifts
    attentionUpdate.focusShifts = this.detectFocusShifts();
    
    // Calculate total attention (should sum to 1)
    for (const attention of this.attentionWeights.values()) {
      attentionUpdate.totalAttention += attention.weight;
    }
    
    // Record attention history
    this.attentionHistory.push(attentionUpdate);
    if (this.attentionHistory.length > 100) {
      this.attentionHistory.shift();
    }
    
    // Detect attention patterns
    this.updateAttentionPatterns();
    
    return attentionUpdate;
  }

  calculateChannelSalience(channelData, globalContext) {
    if (!channelData || !channelData.processedFeatures) return 0;
    
    let salience = 0;
    let featureCount = 0;
    
    // Base salience from signal strength
    salience += channelData.signalStrength || 0;
    featureCount++;
    
    // Increase salience for anomalies
    if (channelData.anomalies && channelData.anomalies.length > 0) {
      const anomalySalience = Math.min(1, channelData.anomalies.length * 0.3);
      salience += anomalySalience;
      featureCount++;
    }
    
    // Contextual salience boost
    const contextualBoost = this.calculateContextualSalienceBoost(channelData, globalContext);
    salience += contextualBoost;
    featureCount++;
    
    return featureCount > 0 ? salience / featureCount : 0;
  }

  calculateContextualSalienceBoost(channelData, globalContext) {
    // Boost salience based on global context priorities
    let boost = 0;
    
    const priorities = globalContext.priorities || {};
    const channelType = this.getChannelTypeFromData(channelData);
    
    switch (channelType) {
      case 'security_events':
        boost = priorities.security || 0;
        break;
      case 'system_metrics':
        boost = priorities.performance || 0;
        break;
      case 'user_behavior':
        boost = priorities.user_experience || 0;
        break;
      case 'environmental':
        boost = priorities.stability || 0;
        break;
    }
    
    // Additional boost for urgent situations
    if (globalContext.urgency && globalContext.urgency > 0.7) {
      boost *= 1.5;
    }
    
    return Math.min(1, boost);
  }

  getChannelTypeFromData(channelData) {
    // Infer channel type from data characteristics
    if (channelData.processedFeatures) {
      const features = Array.from(channelData.processedFeatures.keys());
      
      if (features.some(f => f.includes('threat') || f.includes('security'))) {
        return 'security_events';
      } else if (features.some(f => f.includes('cpu') || f.includes('memory'))) {
        return 'system_metrics';
      } else if (features.some(f => f.includes('user') || f.includes('interaction'))) {
        return 'user_behavior';
      }
    }
    
    return 'environmental';
  }

  calculateChannelRelevance(channelType, globalContext) {
    const taskType = globalContext.currentTask || 'general';
    const urgency = globalContext.urgency || 0.5;
    
    // Base relevance scores for different tasks
    const relevanceMatrix = {
      'security_analysis': {
        'security_events': 0.9,
        'system_metrics': 0.6,
        'user_behavior': 0.4,
        'environmental': 0.3
      },
      'performance_optimization': {
        'system_metrics': 0.9,
        'environmental': 0.7,
        'user_behavior': 0.5,
        'security_events': 0.3
      },
      'user_support': {
        'user_behavior': 0.9,
        'system_metrics': 0.6,
        'environmental': 0.4,
        'security_events': 0.3
      },
      'general': {
        'security_events': 0.7,
        'system_metrics': 0.7,
        'user_behavior': 0.6,
        'environmental': 0.5
      }
    };
    
    const baseRelevance = relevanceMatrix[taskType]?.[channelType] || 0.5;
    
    // Adjust for urgency
    const urgencyAdjustment = channelType === 'security_events' ? urgency * 0.2 : 0;
    
    return Math.min(1, baseRelevance + urgencyAdjustment);
  }

  calculateChannelConfidence(channelData) {
    if (!channelData) return 0;
    
    const signalStrength = channelData.signalStrength || 0;
    const noiseLevel = channelData.noiseLevel || 1;
    const anomalyRatio = channelData.anomalies ? 
      Math.min(1, channelData.anomalies.length * 0.1) : 0;
    
    const confidence = signalStrength * (1 - noiseLevel) * (1 - anomalyRatio * 0.5);
    return Math.max(0, Math.min(1, confidence));
  }

  updateCompetitiveAttention(channelSaliences) {
    // Implement competitive attention dynamics (winner-take-more)
    const totalSalience = Array.from(channelSaliences.values()).reduce((a, b) => a + b, 0);
    
    if (totalSalience === 0) return; // No competition if no salience
    
    const competitionStrength = 0.3; // How much competition affects weights
    const baseWeight = 1.0 / this.attentionWeights.size;
    
    for (const [channelType, salience] of channelSaliences.entries()) {
      const attention = this.attentionWeights.get(channelType);
      if (attention) {
        // Competitive update: higher salience gets more attention
        const salienceRatio = salience / totalSalience;
        const competitiveWeight = baseWeight * (1 - competitionStrength) + 
                                 salienceRatio * competitionStrength;
        
        // Smooth weight update
        attention.weight = attention.weight * 0.7 + competitiveWeight * 0.3;
      }
    }
    
    // Normalize weights to sum to 1
    const totalWeight = Array.from(this.attentionWeights.values())
      .reduce((sum, att) => sum + att.weight, 0);
    
    if (totalWeight > 0) {
      for (const attention of this.attentionWeights.values()) {
        attention.weight /= totalWeight;
      }
    }
  }

  detectFocusShifts() {
    if (this.attentionHistory.length < 2) return [];
    
    const current = this.attentionHistory[this.attentionHistory.length - 1];
    const previous = this.attentionHistory[this.attentionHistory.length - 2];
    
    const shifts = [];
    
    for (const [channelType, currentAtt] of this.attentionWeights.entries()) {
      const prevHistory = previous.channelSaliences.get(channelType) || 0;
      const currHistory = current.channelSaliences.get(channelType) || 0;
      
      const attentionChange = Math.abs(currHistory - prevHistory);
      
      if (attentionChange > 0.3) { // Significant shift threshold
        shifts.push({
          channel: channelType,
          magnitude: attentionChange,
          direction: currHistory > prevHistory ? 'increased' : 'decreased',
          from: prevHistory,
          to: currHistory
        });
      }
    }
    
    return shifts;
  }

  updateAttentionPatterns() {
    if (this.attentionHistory.length < 10) return;
    
    const recentHistory = this.attentionHistory.slice(-10);
    
    // Detect sustained attention patterns
    const sustainedPatterns = this.detectSustainedAttention(recentHistory);
    
    // Detect oscillatory attention patterns
    const oscillatoryPatterns = this.detectOscillatoryAttention(recentHistory);
    
    // Update pattern collection
    this.attentionPatterns = [
      ...sustainedPatterns,
      ...oscillatoryPatterns
    ].slice(-20); // Keep recent patterns
  }

  detectSustainedAttention(history) {
    const patterns = [];
    
    for (const [channelType] of this.attentionWeights.entries()) {
      const attentionValues = history.map(h => h.channelSaliences.get(channelType) || 0);
      const avgAttention = attentionValues.reduce((a, b) => a + b, 0) / attentionValues.length;
      const stability = this.calculateAttentionStability(attentionValues);
      
      if (avgAttention > 0.6 && stability > 0.7) {
        patterns.push({
          type: 'sustained_attention',
          channel: channelType,
          averageLevel: avgAttention,
          stability: stability,
          duration: history.length
        });
      }
    }
    
    return patterns;
  }

  detectOscillatoryAttention(history) {
    const patterns = [];
    
    for (const [channelType] of this.attentionWeights.entries()) {
      const attentionValues = history.map(h => h.channelSaliences.get(channelType) || 0);
      const oscillation = this.detectOscillation(attentionValues);
      
      if (oscillation.strength > 0.6) {
        patterns.push({
          type: 'oscillatory_attention',
          channel: channelType,
          period: oscillation.period,
          strength: oscillation.strength,
          amplitude: oscillation.amplitude
        });
      }
    }
    
    return patterns;
  }

  calculateAttentionStability(values) {
    if (values.length < 2) return 1;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    
    return Math.max(0, 1 - Math.sqrt(variance));
  }

  detectOscillation(values) {
    // Simple oscillation detection
    let peakCount = 0;
    let totalAmplitude = 0;
    
    for (let i = 1; i < values.length - 1; i++) {
      if ((values[i] > values[i-1] && values[i] > values[i+1]) || 
          (values[i] < values[i-1] && values[i] < values[i+1])) {
        peakCount++;
        totalAmplitude += Math.abs(values[i] - (values[i-1] + values[i+1]) / 2);
      }
    }
    
    const avgPeriod = values.length / (peakCount / 2 + 0.001);
    const avgAmplitude = totalAmplitude / (peakCount + 0.001);
    const strength = Math.min(1, peakCount / (values.length * 0.3));
    
    return {
      period: avgPeriod,
      amplitude: avgAmplitude,
      strength: strength
    };
  }

  getFocusedChannels(threshold = 0.3) {
    // Return channels with attention above threshold
    const focused = [];
    
    for (const [channelType, attention] of this.attentionWeights.entries()) {
      if (attention.weight > threshold) {
        focused.push({
          channel: channelType,
          attention: attention.weight,
          salience: attention.salience,
          confidence: attention.confidence
        });
      }
    }
    
    return focused.sort((a, b) => b.attention - a.attention);
  }

  getAttentionReport() {
    return {
      currentWeights: Object.fromEntries(this.attentionWeights),
      recentHistory: this.attentionHistory.slice(-5),
      patterns: this.attentionPatterns,
      focusedChannels: this.getFocusedChannels(),
      totalChannels: this.channels.length
    };
  }
}

/**
 * Multi-Modal Perception Engine
 * Main orchestrator for multi-modal perception and understanding
 */
class MultiModalPerceptionEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      enabledChannels: options.enabledChannels || [
        'system_metrics', 'security_events', 'user_behavior', 'environmental'
      ],
      perceptionInterval: options.perceptionInterval || 1000,
      integrationWindow: options.integrationWindow || 10,
      adaptiveWeighting: options.adaptiveWeighting !== false,
      contextualFiltering: options.contextualFiltering !== false,
      ...options
    };
    
    this.sensoryChannels = new Map();
    this.attentionMechanism = null;
    this.perceptionHistory = [];
    this.integratedUnderstanding = new Map();
    this.conceptFormation = new Map();
    this.perceptionPatterns = [];
    this.isPerceiving = false;
    this.perceptionInterval = null;
    
    this.initializePerceptionEngine();
    
    logger.info('Multi-Modal Perception Engine initialized', {
      channels: this.options.enabledChannels,
      interval: this.options.perceptionInterval
    });
  }

  initializePerceptionEngine() {
    // Initialize sensory channels
    for (const channelType of this.options.enabledChannels) {
      const processor = new SensoryChannelProcessor(channelType, {
        adaptiveWeighting: this.options.adaptiveWeighting
      });
      
      this.sensoryChannels.set(channelType, processor);
    }
    
    // Initialize attention mechanism
    const channelArray = Array.from(this.sensoryChannels.values());
    this.attentionMechanism = new CrossModalAttentionMechanism(channelArray);
  }

  startPerception() {
    if (this.isPerceiving) {
      logger.warn('Perception already active');
      return;
    }
    
    this.isPerceiving = true;
    logger.info('Starting multi-modal perception');
    
    this.perceptionInterval = setInterval(() => {
      this.performPerceptionCycle();
    }, this.options.perceptionInterval);
    
    this.emit('perception_started');
  }

  stopPerception() {
    if (!this.isPerceiving) return;
    
    if (this.perceptionInterval) {
      clearInterval(this.perceptionInterval);
      this.perceptionInterval = null;
    }
    
    this.isPerceiving = false;
    this.emit('perception_stopped');
    
    logger.info('Multi-modal perception stopped');
  }

  async performPerceptionCycle() {
    const cycleStart = Date.now();
    const perceptionCycle = {
      timestamp: new Date(),
      channelData: new Map(),
      attentionUpdate: null,
      integratedPerception: null,
      emergentConcepts: [],
      actionRecommendations: []
    };
    
    try {
      // Simulate data collection from various sources
      const rawData = await this.collectRawData();
      
      // Process data through sensory channels
      for (const [channelType, rawChannelData] of rawData.entries()) {
        const processor = this.sensoryChannels.get(channelType);
        if (processor) {
          const processedData = processor.processRawData(rawChannelData);
          perceptionCycle.channelData.set(channelType, processedData);
        }
      }
      
      // Update attention mechanism
      const globalContext = this.getCurrentGlobalContext();
      perceptionCycle.attentionUpdate = this.attentionMechanism.updateAttention(
        perceptionCycle.channelData,
        globalContext
      );
      
      // Integrate multi-modal perception
      perceptionCycle.integratedPerception = this.integrateMultiModalData(
        perceptionCycle.channelData,
        perceptionCycle.attentionUpdate
      );
      
      // Form emergent concepts
      perceptionCycle.emergentConcepts = this.formEmergentConcepts(
        perceptionCycle.integratedPerception
      );
      
      // Generate action recommendations
      perceptionCycle.actionRecommendations = this.generateActionRecommendations(
        perceptionCycle.integratedPerception,
        perceptionCycle.emergentConcepts
      );
      
      // Update understanding
      this.updateIntegratedUnderstanding(perceptionCycle);
      
      // Record perception history
      this.perceptionHistory.push(perceptionCycle);
      if (this.perceptionHistory.length > 1000) {
        this.perceptionHistory.shift();
      }
      
      // Emit perception cycle completed
      this.emit('perception_cycle', perceptionCycle);
      
      const cycleDuration = Date.now() - cycleStart;
      if (cycleDuration > this.options.perceptionInterval * 0.8) {
        logger.warn('Slow perception cycle', { duration: cycleDuration });
      }
      
    } catch (error) {
      logger.error('Perception cycle error', { error: error.message });
      this.emit('perception_error', error);
    }
  }

  async collectRawData() {
    // Simulate raw data collection from various sources
    const rawData = new Map();
    
    // System metrics simulation
    rawData.set('system_metrics', {
      cpu: Math.random() * 100,
      memory: Math.random() * 100,
      latency: Math.random() * 200,
      errors: Math.random() * 5,
      timestamp: Date.now()
    });
    
    // Security events simulation
    rawData.set('security_events', {
      threatLevel: Math.random(),
      anomalyScore: Math.random(),
      accessLogs: this.generateMockAccessLogs(),
      timestamp: Date.now()
    });
    
    // User behavior simulation
    rawData.set('user_behavior', {
      interactions: Math.floor(Math.random() * 20),
      satisfaction: Math.random(),
      completionRate: Math.random(),
      timestamp: Date.now()
    });
    
    // Environmental data simulation
    rawData.set('environmental', {
      load: Math.random(),
      resources: Math.random(),
      dependencies: Math.random() > 0.8 ? 0.5 : 1.0, // Occasional dependency issues
      timestamp: Date.now()
    });
    
    return rawData;
  }

  generateMockAccessLogs() {
    const logCount = Math.floor(Math.random() * 10);
    const logs = [];
    
    for (let i = 0; i < logCount; i++) {
      logs.push({
        userId: `user_${Math.floor(Math.random() * 100)}`,
        timestamp: Date.now() - Math.random() * 3600000, // Last hour
        action: ['login', 'access_data', 'modify_config', 'logout'][Math.floor(Math.random() * 4)]
      });
    }
    
    return logs;
  }

  getCurrentGlobalContext() {
    // Generate current global context
    return {
      currentTask: ['security_analysis', 'performance_optimization', 'user_support', 'general'][
        Math.floor(Math.random() * 4)
      ],
      urgency: Math.random(),
      priorities: {
        security: Math.random(),
        performance: Math.random(),
        user_experience: Math.random(),
        stability: Math.random()
      },
      systemState: 'operational',
      timeOfDay: new Date().getHours(),
      workload: Math.random()
    };
  }

  integrateMultiModalData(channelData, attentionUpdate) {
    const integration = {
      timestamp: new Date(),
      weightedFeatures: new Map(),
      crossModalCorrelations: new Map(),
      consensusState: new Map(),
      conflictingSignals: [],
      overallCoherence: 0
    };
    
    // Weight features by attention
    for (const [channelType, data] of channelData.entries()) {
      const attention = this.attentionMechanism.attentionWeights.get(channelType);
      const weight = attention ? attention.weight : 0;
      
      if (data.processedFeatures) {
        for (const [featureName, value] of data.processedFeatures.entries()) {
          const weightedFeatureName = `${channelType}_${featureName}`;
          integration.weightedFeatures.set(weightedFeatureName, value * weight);
        }
      }
    }
    
    // Calculate cross-modal correlations
    integration.crossModalCorrelations = this.calculateCrossModalCorrelations(channelData);
    
    // Establish consensus state
    integration.consensusState = this.establishConsensusState(channelData, attentionUpdate);
    
    // Detect conflicting signals
    integration.conflictingSignals = this.detectConflictingSignals(channelData);
    
    // Calculate overall coherence
    integration.overallCoherence = this.calculateOverallCoherence(integration);
    
    return integration;
  }

  calculateCrossModalCorrelations(channelData) {
    const correlations = new Map();
    const channels = Array.from(channelData.keys());
    
    // Compare each pair of channels
    for (let i = 0; i < channels.length; i++) {
      for (let j = i + 1; j < channels.length; j++) {
        const channel1 = channels[i];
        const channel2 = channels[j];
        
        const correlation = this.calculateChannelCorrelation(
          channelData.get(channel1),
          channelData.get(channel2)
        );
        
        correlations.set(`${channel1}_${channel2}`, correlation);
      }
    }
    
    return correlations;
  }

  calculateChannelCorrelation(data1, data2) {
    // Simplified correlation calculation
    if (!data1 || !data2 || !data1.processedFeatures || !data2.processedFeatures) {
      return 0;
    }
    
    // Find common feature types (normalized names)
    const features1 = Array.from(data1.processedFeatures.keys());
    const features2 = Array.from(data2.processedFeatures.keys());
    
    // Calculate correlation based on signal strengths and anomaly patterns
    const signal1 = data1.signalStrength || 0;
    const signal2 = data2.signalStrength || 0;
    const anomaly1 = data1.anomalies ? data1.anomalies.length : 0;
    const anomaly2 = data2.anomalies ? data2.anomalies.length : 0;
    
    const signalCorrelation = 1 - Math.abs(signal1 - signal2);
    const anomalyCorrelation = 1 - Math.abs(anomaly1 - anomaly2) / 5; // Normalized
    
    return (signalCorrelation + anomalyCorrelation) / 2;
  }

  establishConsensusState(channelData, attentionUpdate) {
    const consensus = new Map();
    
    // System health consensus
    let healthVotes = [];
    for (const [channelType, data] of channelData.entries()) {
      const weight = this.attentionMechanism.attentionWeights.get(channelType)?.weight || 0;
      
      if (channelType === 'system_metrics') {
        const health = (data.signalStrength || 0) * (1 - (data.noiseLevel || 0));
        healthVotes.push({ vote: health, weight });
      } else if (channelType === 'security_events') {
        const health = 1 - Math.min(1, (data.anomalies?.length || 0) * 0.2);
        healthVotes.push({ vote: health, weight });
      }
    }
    
    if (healthVotes.length > 0) {
      const weightedHealth = healthVotes.reduce((sum, v) => sum + v.vote * v.weight, 0) /
                            healthVotes.reduce((sum, v) => sum + v.weight, 0);
      consensus.set('system_health', weightedHealth);
    }
    
    // Threat level consensus
    let threatVotes = [];
    for (const [channelType, data] of channelData.entries()) {
      const weight = this.attentionMechanism.attentionWeights.get(channelType)?.weight || 0;
      
      if (channelType === 'security_events') {
        const threat = data.processedFeatures?.get('threat_level') || 0;
        threatVotes.push({ vote: threat, weight });
      } else {
        const threat = Math.min(1, (data.anomalies?.length || 0) * 0.1);
        threatVotes.push({ vote: threat, weight: weight * 0.5 }); // Lower weight for non-security
      }
    }
    
    if (threatVotes.length > 0) {
      const weightedThreat = threatVotes.reduce((sum, v) => sum + v.vote * v.weight, 0) /
                            threatVotes.reduce((sum, v) => sum + v.weight, 0);
      consensus.set('threat_level', weightedThreat);
    }
    
    // User satisfaction consensus
    const userChannel = channelData.get('user_behavior');
    if (userChannel && userChannel.processedFeatures) {
      consensus.set('user_satisfaction', 
        userChannel.processedFeatures.get('satisfaction_score') || 0.5);
    }
    
    return consensus;
  }

  detectConflictingSignals(channelData) {
    const conflicts = [];
    
    // Check for conflicting system health signals
    const healthSignals = [];
    for (const [channelType, data] of channelData.entries()) {
      if (channelType === 'system_metrics' || channelType === 'environmental') {
        const health = (data.signalStrength || 0) * (1 - (data.noiseLevel || 0));
        healthSignals.push({ channel: channelType, health, data });
      }
    }
    
    for (let i = 0; i < healthSignals.length; i++) {
      for (let j = i + 1; j < healthSignals.length; j++) {
        const signal1 = healthSignals[i];
        const signal2 = healthSignals[j];
        
        if (Math.abs(signal1.health - signal2.health) > 0.4) {
          conflicts.push({
            type: 'health_conflict',
            channels: [signal1.channel, signal2.channel],
            values: [signal1.health, signal2.health],
            severity: Math.abs(signal1.health - signal2.health)
          });
        }
      }
    }
    
    return conflicts;
  }

  calculateOverallCoherence(integration) {
    // Calculate how coherent the integrated perception is
    let coherenceFactors = [];
    
    // Feature coherence (how well features align)
    const featureVariance = this.calculateFeatureVariance(integration.weightedFeatures);
    coherenceFactors.push(1 - Math.min(1, featureVariance));
    
    // Cross-modal correlation coherence
    const avgCorrelation = Array.from(integration.crossModalCorrelations.values())
      .reduce((sum, corr) => sum + corr, 0) / Math.max(1, integration.crossModalCorrelations.size);
    coherenceFactors.push(avgCorrelation);
    
    // Conflict coherence (fewer conflicts = higher coherence)
    const conflictPenalty = Math.min(1, integration.conflictingSignals.length * 0.2);
    coherenceFactors.push(1 - conflictPenalty);
    
    return coherenceFactors.reduce((sum, factor) => sum + factor, 0) / coherenceFactors.length;
  }

  calculateFeatureVariance(weightedFeatures) {
    const values = Array.from(weightedFeatures.values());
    if (values.length === 0) return 0;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    
    return Math.sqrt(variance);
  }

  formEmergentConcepts(integratedPerception) {
    const concepts = [];
    
    // System state concept
    const systemConcept = this.formSystemStateConcept(integratedPerception);
    if (systemConcept) concepts.push(systemConcept);
    
    // Security posture concept
    const securityConcept = this.formSecurityPostureConcept(integratedPerception);
    if (securityConcept) concepts.push(securityConcept);
    
    // User experience concept
    const userConcept = this.formUserExperienceConcept(integratedPerception);
    if (userConcept) concepts.push(userConcept);
    
    // Operational stability concept
    const stabilityConcept = this.formStabilityConcept(integratedPerception);
    if (stabilityConcept) concepts.push(stabilityConcept);
    
    return concepts;
  }

  formSystemStateConcept(perception) {
    const healthLevel = perception.consensusState.get('system_health') || 0.5;
    const coherence = perception.overallCoherence || 0.5;
    
    let state = 'unknown';
    if (healthLevel > 0.8 && coherence > 0.7) {
      state = 'optimal';
    } else if (healthLevel > 0.6 && coherence > 0.5) {
      state = 'stable';
    } else if (healthLevel > 0.4) {
      state = 'degraded';
    } else {
      state = 'critical';
    }
    
    return {
      type: 'system_state',
      concept: state,
      confidence: (healthLevel + coherence) / 2,
      evidence: {
        health: healthLevel,
        coherence: coherence,
        conflicts: perception.conflictingSignals.length
      }
    };
  }

  formSecurityPostureConcept(perception) {
    const threatLevel = perception.consensusState.get('threat_level') || 0;
    
    let posture = 'unknown';
    if (threatLevel < 0.2) {
      posture = 'secure';
    } else if (threatLevel < 0.5) {
      posture = 'monitored';
    } else if (threatLevel < 0.8) {
      posture = 'elevated';
    } else {
      posture = 'critical';
    }
    
    return {
      type: 'security_posture',
      concept: posture,
      confidence: 1 - Math.abs(0.5 - threatLevel),
      evidence: {
        threatLevel: threatLevel,
        anomalies: this.countAnomaliesInPerception(perception)
      }
    };
  }

  formUserExperienceConcept(perception) {
    const satisfaction = perception.consensusState.get('user_satisfaction') || 0.5;
    
    let experience = 'neutral';
    if (satisfaction > 0.8) {
      experience = 'excellent';
    } else if (satisfaction > 0.6) {
      experience = 'good';
    } else if (satisfaction < 0.3) {
      experience = 'poor';
    }
    
    return {
      type: 'user_experience',
      concept: experience,
      confidence: Math.abs(satisfaction - 0.5) * 2,
      evidence: {
        satisfaction: satisfaction
      }
    };
  }

  formStabilityConcept(perception) {
    const conflicts = perception.conflictingSignals.length;
    const coherence = perception.overallCoherence;
    
    let stability = 'unstable';
    if (conflicts === 0 && coherence > 0.8) {
      stability = 'stable';
    } else if (conflicts <= 1 && coherence > 0.6) {
      stability = 'mostly_stable';
    } else if (conflicts <= 2) {
      stability = 'somewhat_unstable';
    }
    
    return {
      type: 'operational_stability',
      concept: stability,
      confidence: coherence,
      evidence: {
        conflicts: conflicts,
        coherence: coherence
      }
    };
  }

  countAnomaliesInPerception(perception) {
    let totalAnomalies = 0;
    
    // This would need to be implemented to count anomalies from the integrated perception
    // For now, return a placeholder
    return Math.floor(Math.random() * 5);
  }

  generateActionRecommendations(integratedPerception, emergentConcepts) {
    const recommendations = [];
    
    for (const concept of emergentConcepts) {
      switch (concept.type) {
        case 'system_state':
          if (concept.concept === 'critical' || concept.concept === 'degraded') {
            recommendations.push({
              type: 'system_intervention',
              priority: concept.concept === 'critical' ? 'urgent' : 'high',
              action: 'investigate_system_performance',
              reason: `System state is ${concept.concept}`,
              confidence: concept.confidence
            });
          }
          break;
          
        case 'security_posture':
          if (concept.concept === 'critical' || concept.concept === 'elevated') {
            recommendations.push({
              type: 'security_response',
              priority: concept.concept === 'critical' ? 'urgent' : 'high',
              action: 'activate_security_protocols',
              reason: `Security posture is ${concept.concept}`,
              confidence: concept.confidence
            });
          }
          break;
          
        case 'user_experience':
          if (concept.concept === 'poor') {
            recommendations.push({
              type: 'user_support',
              priority: 'medium',
              action: 'improve_user_experience',
              reason: 'User experience is poor',
              confidence: concept.confidence
            });
          }
          break;
          
        case 'operational_stability':
          if (concept.concept === 'unstable' || concept.concept === 'somewhat_unstable') {
            recommendations.push({
              type: 'stability_improvement',
              priority: 'medium',
              action: 'resolve_conflicting_signals',
              reason: `Operational stability is ${concept.concept}`,
              confidence: concept.confidence
            });
          }
          break;
      }
    }
    
    // Sort recommendations by priority
    const priorityOrder = { 'urgent': 3, 'high': 2, 'medium': 1, 'low': 0 };
    recommendations.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
    
    return recommendations;
  }

  updateIntegratedUnderstanding(perceptionCycle) {
    // Update long-term integrated understanding
    const understanding = {
      timestamp: perceptionCycle.timestamp,
      systemState: this.updateSystemStateUnderstanding(perceptionCycle),
      patterns: this.updatePatternUnderstanding(perceptionCycle),
      predictions: this.generatePredictions(perceptionCycle)
    };
    
    this.integratedUnderstanding.set('current', understanding);
    
    // Maintain history of understanding
    const historyKey = perceptionCycle.timestamp.toISOString().substring(0, 10); // Daily key
    this.integratedUnderstanding.set(historyKey, understanding);
    
    // Limit understanding history
    if (this.integratedUnderstanding.size > 30) { // Keep 30 days
      const oldestKey = Array.from(this.integratedUnderstanding.keys())
        .filter(k => k !== 'current')
        .sort()[0];
      this.integratedUnderstanding.delete(oldestKey);
    }
  }

  updateSystemStateUnderstanding(perceptionCycle) {
    const concepts = perceptionCycle.emergentConcepts;
    const systemConcept = concepts.find(c => c.type === 'system_state');
    
    return {
      currentState: systemConcept?.concept || 'unknown',
      confidence: systemConcept?.confidence || 0,
      trend: this.calculateSystemTrend(),
      stability: this.calculateSystemStability()
    };
  }

  calculateSystemTrend() {
    if (this.perceptionHistory.length < 5) return 'unknown';
    
    const recentCycles = this.perceptionHistory.slice(-5);
    const healthValues = recentCycles
      .map(cycle => cycle.integratedPerception?.consensusState?.get('system_health') || 0.5);
    
    const trend = this.calculateTrendFromValues(healthValues);
    
    if (trend > 0.05) return 'improving';
    if (trend < -0.05) return 'declining';
    return 'stable';
  }

  calculateSystemStability() {
    if (this.perceptionHistory.length < 5) return 0.5;
    
    const recentCycles = this.perceptionHistory.slice(-5);
    const coherenceValues = recentCycles
      .map(cycle => cycle.integratedPerception?.overallCoherence || 0.5);
    
    const avgCoherence = coherenceValues.reduce((a, b) => a + b, 0) / coherenceValues.length;
    const variance = coherenceValues.reduce((sum, val) => sum + Math.pow(val - avgCoherence, 2), 0) / coherenceValues.length;
    
    return Math.max(0, avgCoherence - Math.sqrt(variance));
  }

  calculateTrendFromValues(values) {
    if (values.length < 2) return 0;
    
    const n = values.length;
    const sumX = n * (n + 1) / 2;
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = values.reduce((sum, y, i) => sum + (i + 1) * y, 0);
    const sumX2 = n * (n + 1) * (2 * n + 1) / 6;
    
    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  }

  updatePatternUnderstanding(perceptionCycle) {
    // Update understanding of recurring patterns
    const patterns = [];
    
    // Collect patterns from all channels
    for (const [channelType, processor] of this.sensoryChannels.entries()) {
      patterns.push(...processor.patterns.map(p => ({ ...p, channel: channelType })));
    }
    
    // Add attention patterns
    patterns.push(...this.attentionMechanism.attentionPatterns.map(p => ({ ...p, channel: 'attention' })));
    
    return {
      currentPatterns: patterns,
      patternCount: patterns.length,
      dominantPatterns: this.identifyDominantPatterns(patterns)
    };
  }

  identifyDominantPatterns(patterns) {
    // Group patterns by type and identify dominant ones
    const patternGroups = new Map();
    
    for (const pattern of patterns) {
      const key = `${pattern.type}_${pattern.channel}`;
      if (!patternGroups.has(key)) {
        patternGroups.set(key, []);
      }
      patternGroups.get(key).push(pattern);
    }
    
    const dominantPatterns = [];
    for (const [key, groupPatterns] of patternGroups.entries()) {
      if (groupPatterns.length >= 2) { // Recurring pattern threshold
        const avgStrength = groupPatterns.reduce((sum, p) => sum + (p.strength || 0.5), 0) / groupPatterns.length;
        dominantPatterns.push({
          patternType: key,
          occurrences: groupPatterns.length,
          averageStrength: avgStrength,
          lastSeen: Math.max(...groupPatterns.map(p => p.timestamp?.getTime() || 0))
        });
      }
    }
    
    return dominantPatterns.sort((a, b) => b.averageStrength - a.averageStrength);
  }

  generatePredictions(perceptionCycle) {
    // Generate predictions based on current perception and historical patterns
    const predictions = [];
    
    // System health prediction
    const healthPrediction = this.predictSystemHealth();
    if (healthPrediction) predictions.push(healthPrediction);
    
    // Security threat prediction
    const threatPrediction = this.predictSecurityThreats();
    if (threatPrediction) predictions.push(threatPrediction);
    
    // User behavior prediction
    const userPrediction = this.predictUserBehavior();
    if (userPrediction) predictions.push(userPrediction);
    
    return predictions;
  }

  predictSystemHealth() {
    if (this.perceptionHistory.length < 3) return null;
    
    const recentHealth = this.perceptionHistory.slice(-3)
      .map(cycle => cycle.integratedPerception?.consensusState?.get('system_health') || 0.5);
    
    const trend = this.calculateTrendFromValues(recentHealth);
    const currentHealth = recentHealth[recentHealth.length - 1];
    
    // Simple linear prediction
    const predictedHealth = Math.max(0, Math.min(1, currentHealth + trend));
    
    return {
      type: 'system_health',
      currentValue: currentHealth,
      predictedValue: predictedHealth,
      trend: trend,
      confidence: Math.max(0, 0.8 - Math.abs(trend)),
      timeHorizon: '5_minutes'
    };
  }

  predictSecurityThreats() {
    if (this.perceptionHistory.length < 3) return null;
    
    const recentThreats = this.perceptionHistory.slice(-3)
      .map(cycle => cycle.integratedPerception?.consensusState?.get('threat_level') || 0);
    
    const trend = this.calculateTrendFromValues(recentThreats);
    const currentThreat = recentThreats[recentThreats.length - 1];
    
    const predictedThreat = Math.max(0, Math.min(1, currentThreat + trend));
    
    return {
      type: 'security_threat',
      currentValue: currentThreat,
      predictedValue: predictedThreat,
      trend: trend,
      confidence: Math.max(0, 0.7 - Math.abs(trend)),
      timeHorizon: '10_minutes'
    };
  }

  predictUserBehavior() {
    if (this.perceptionHistory.length < 3) return null;
    
    const recentSatisfaction = this.perceptionHistory.slice(-3)
      .map(cycle => cycle.integratedPerception?.consensusState?.get('user_satisfaction') || 0.5);
    
    const trend = this.calculateTrendFromValues(recentSatisfaction);
    const currentSatisfaction = recentSatisfaction[recentSatisfaction.length - 1];
    
    const predictedSatisfaction = Math.max(0, Math.min(1, currentSatisfaction + trend));
    
    return {
      type: 'user_satisfaction',
      currentValue: currentSatisfaction,
      predictedValue: predictedSatisfaction,
      trend: trend,
      confidence: Math.max(0, 0.6 - Math.abs(trend)),
      timeHorizon: '15_minutes'
    };
  }

  getPerceptionReport() {
    const currentUnderstanding = this.integratedUnderstanding.get('current');
    
    return {
      isActive: this.isPerceiving,
      sensoryChannels: Object.fromEntries(
        Array.from(this.sensoryChannels.entries()).map(([type, processor]) => [
          type, processor.getChannelReport()
        ])
      ),
      attention: this.attentionMechanism.getAttentionReport(),
      currentUnderstanding: currentUnderstanding,
      recentPerception: this.perceptionHistory.slice(-3),
      totalCycles: this.perceptionHistory.length,
      uptime: this.isPerceiving && this.perceptionHistory.length > 0 ? 
        new Date() - this.perceptionHistory[0].timestamp : 0
    };
  }

  processExternalInput(inputType, inputData) {
    // Process external input and integrate with perception
    logger.info('Processing external input', { type: inputType });
    
    const relevantChannel = this.findRelevantChannel(inputType);
    if (relevantChannel) {
      relevantChannel.processRawData(inputData);
      
      // Boost attention to relevant channel
      const attention = this.attentionMechanism.attentionWeights.get(relevantChannel.channelType);
      if (attention) {
        attention.salience = Math.min(1, attention.salience + 0.2);
      }
      
      return {
        processed: true,
        channel: relevantChannel.channelType,
        attentionBoosted: true
      };
    }
    
    return {
      processed: false,
      reason: 'No relevant channel found'
    };
  }

  findRelevantChannel(inputType) {
    const channelMapping = {
      'system_alert': 'system_metrics',
      'security_incident': 'security_events',
      'user_feedback': 'user_behavior',
      'environmental_change': 'environmental'
    };
    
    const channelType = channelMapping[inputType];
    return channelType ? this.sensoryChannels.get(channelType) : null;
  }

  destroy() {
    this.stopPerception();
    this.removeAllListeners();
    logger.info('Multi-Modal Perception Engine destroyed');
  }
}

module.exports = {
  MultiModalPerceptionEngine,
  SensoryChannelProcessor,
  CrossModalAttentionMechanism
};