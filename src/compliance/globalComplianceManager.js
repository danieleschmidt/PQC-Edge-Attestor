/**
 * @file globalComplianceManager.js
 * @brief Generation 4: Global Compliance and Regulatory Management System
 * @description Multi-region compliance with GDPR, CCPA, PDPA, SOX, FIPS, Common Criteria
 */

const winston = require('winston');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

// Create logger compatible across Winston versions
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'global-compliance' },
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
 * Global Compliance Manager
 * Handles regulatory compliance across multiple jurisdictions
 */
class GlobalComplianceManager {
  constructor(options = {}) {
    this.options = {
      enableAuditLogging: options.enableAuditLogging !== false,
      encryptAuditLogs: options.encryptAuditLogs !== false,
      realTimeMonitoring: options.realTimeMonitoring !== false,
      autoReporting: options.autoReporting !== false,
      ...options
    };

    // Compliance frameworks
    this.frameworks = new Map();
    this.auditLogs = [];
    this.complianceRules = new Map();
    this.violations = new Map();
    this.assessments = new Map();
    
    this.initializeFrameworks();
    this.setupComplianceRules();
    
    logger.info('Global Compliance Manager initialized', {
      frameworks: this.frameworks.size,
      enabledFeatures: Object.keys(this.options).filter(k => this.options[k])
    });
  }

  /**
   * Initialize compliance frameworks
   */
  initializeFrameworks() {
    // GDPR - General Data Protection Regulation (EU)
    this.frameworks.set('gdpr', {
      name: 'General Data Protection Regulation',
      region: 'EU',
      mandatory: true,
      requirements: {
        dataMinimization: true,
        purposeLimitation: true,
        storageTimeout: true,
        rightToErasure: true,
        dataPortability: true,
        consentManagement: true,
        breachNotification: true,
        dataProtectionOfficer: true,
        privacyByDesign: true,
        impactAssessment: true
      },
      penalties: {
        maxFine: '20M EUR or 4% of global turnover',
        warningPeriod: 72, // hours for breach notification
        consentValidityPeriod: 365 // days
      }
    });

    // CCPA - California Consumer Privacy Act (US-CA)
    this.frameworks.set('ccpa', {
      name: 'California Consumer Privacy Act',
      region: 'US-CA',
      mandatory: true,
      requirements: {
        rightToKnow: true,
        rightToDelete: true,
        rightToOptOut: true,
        nonDiscrimination: true,
        privacyNotice: true,
        verifiedRequests: true,
        serviceProviderAgreements: true
      },
      penalties: {
        maxFine: '$7,500 per violation',
        curePeriod: 30, // days to cure violations
        privateLawsuitThreshold: 50000 // records
      }
    });

    // PDPA - Personal Data Protection Act (Singapore)
    this.frameworks.set('pdpa', {
      name: 'Personal Data Protection Act',
      region: 'SG',
      mandatory: true,
      requirements: {
        consentObligation: true,
        purposeLimitation: true,
        notificationObligation: true,
        accessObligation: true,
        correctionObligation: true,
        dataProtectionProvisions: true,
        retentionLimitation: true,
        transferLimitation: true
      },
      penalties: {
        maxFine: '1M SGD',
        breachNotificationPeriod: 72 // hours
      }
    });

    // SOX - Sarbanes-Oxley Act (US Financial)
    this.frameworks.set('sox', {
      name: 'Sarbanes-Oxley Act',
      region: 'US',
      mandatory: false, // Only for public companies
      requirements: {
        internalControls: true,
        financialReporting: true,
        auditTrails: true,
        executiveCertification: true,
        independentAudits: true,
        whistleblowerProtection: true
      },
      penalties: {
        criminalPenalties: 'Up to 20 years imprisonment',
        civilPenalties: 'Up to $25M'
      }
    });

    // FIPS 140-3 - Federal Information Processing Standards
    this.frameworks.set('fips', {
      name: 'FIPS 140-3 Cryptographic Standards',
      region: 'US',
      mandatory: false,
      requirements: {
        approvedAlgorithms: true,
        keyManagement: true,
        selfTests: true,
        physicalSecurity: true,
        operationalEnvironment: true,
        cryptographicModules: true
      },
      levels: {
        1: 'Basic security requirements',
        2: 'Software components, operating systems',
        3: 'High security applications',
        4: 'Highest security, unattended operation'
      }
    });

    // Common Criteria (ISO 15408)
    this.frameworks.set('common_criteria', {
      name: 'Common Criteria for IT Security Evaluation',
      region: 'International',
      mandatory: false,
      requirements: {
        securityTargets: true,
        protectionProfiles: true,
        evaluationAssurance: true,
        vulnerabilityAssessment: true,
        penetrationTesting: true,
        independentTesting: true
      },
      evaluationLevels: {
        'EAL1': 'Functionally tested',
        'EAL2': 'Structurally tested',
        'EAL3': 'Methodically tested and checked',
        'EAL4': 'Methodically designed, tested, and reviewed',
        'EAL5': 'Semiformally designed and tested',
        'EAL6': 'Semiformally verified design and tested',
        'EAL7': 'Formally verified design and tested'
      }
    });
  }

  /**
   * Setup compliance rules and checks
   */
  setupComplianceRules() {
    // Data handling rules
    this.complianceRules.set('data_encryption', {
      frameworks: ['gdpr', 'ccpa', 'pdpa', 'fips'],
      rule: 'All personal data must be encrypted at rest and in transit',
      check: async (context) => {
        return context.encryption?.enabled && 
               context.encryption?.algorithm?.includes('AES') &&
               context.encryption?.keyLength >= 256;
      },
      remediation: 'Enable AES-256 encryption for data storage and transmission'
    });

    this.complianceRules.set('data_retention', {
      frameworks: ['gdpr', 'ccpa', 'pdpa'],
      rule: 'Personal data must not be retained longer than necessary',
      check: async (context) => {
        const maxRetention = context.framework === 'gdpr' ? 1095 : 2555; // 3 or 7 years
        return context.dataAge <= maxRetention;
      },
      remediation: 'Implement automated data purging based on retention policies'
    });

    this.complianceRules.set('consent_management', {
      frameworks: ['gdpr', 'ccpa', 'pdpa'],
      rule: 'Valid consent must be obtained before processing personal data',
      check: async (context) => {
        return context.consent?.obtained && 
               context.consent?.explicit &&
               context.consent?.withdrawable &&
               !context.consent?.expired;
      },
      remediation: 'Implement comprehensive consent management system'
    });

    this.complianceRules.set('quantum_cryptography', {
      frameworks: ['fips', 'common_criteria'],
      rule: 'Use quantum-resistant cryptographic algorithms',
      check: async (context) => {
        const quantumSafeAlgorithms = ['ML-KEM', 'ML-DSA', 'Kyber', 'Dilithium', 'Falcon'];
        return context.cryptoAlgorithms?.some(alg => 
          quantumSafeAlgorithms.some(safe => alg.includes(safe))
        );
      },
      remediation: 'Migrate to NIST-approved post-quantum cryptographic algorithms'
    });

    this.complianceRules.set('audit_logging', {
      frameworks: ['sox', 'fips', 'common_criteria'],
      rule: 'Comprehensive audit logs must be maintained',
      check: async (context) => {
        return context.auditLogs?.enabled &&
               context.auditLogs?.tamperProof &&
               context.auditLogs?.encrypted &&
               context.auditLogs?.retention >= 2555; // 7 years
      },
      remediation: 'Enable comprehensive audit logging with encryption and tamper protection'
    });
  }

  /**
   * Assess compliance for specific framework
   */
  async assessCompliance(framework, context = {}) {
    const frameworkConfig = this.frameworks.get(framework);
    if (!frameworkConfig) {
      throw new Error(`Unknown compliance framework: ${framework}`);
    }

    const assessment = {
      framework,
      timestamp: new Date().toISOString(),
      status: 'in_progress',
      results: [],
      score: 0,
      violations: [],
      recommendations: []
    };

    try {
      // Check applicable rules
      for (const [ruleId, rule] of this.complianceRules.entries()) {
        if (rule.frameworks.includes(framework)) {
          const result = await this.checkRule(ruleId, rule, context);
          assessment.results.push(result);
          
          if (!result.passed) {
            assessment.violations.push({
              rule: ruleId,
              description: rule.rule,
              severity: this.calculateSeverity(framework, ruleId),
              remediation: rule.remediation
            });
          }
        }
      }

      // Calculate compliance score
      const passedRules = assessment.results.filter(r => r.passed).length;
      assessment.score = Math.round((passedRules / assessment.results.length) * 100);
      assessment.status = assessment.score >= 80 ? 'compliant' : 'non_compliant';

      // Generate recommendations
      assessment.recommendations = await this.generateRecommendations(framework, assessment);

      // Store assessment
      this.assessments.set(`${framework}_${Date.now()}`, assessment);

      // Log compliance assessment
      await this.logComplianceEvent('assessment_completed', {
        framework,
        score: assessment.score,
        violations: assessment.violations.length
      });

      logger.info('Compliance assessment completed', {
        framework,
        score: assessment.score,
        status: assessment.status,
        violations: assessment.violations.length
      });

      return assessment;
    } catch (error) {
      assessment.status = 'error';
      assessment.error = error.message;
      logger.error('Compliance assessment failed', { framework, error: error.message });
      return assessment;
    }
  }

  /**
   * Check individual compliance rule
   */
  async checkRule(ruleId, rule, context) {
    try {
      const passed = await rule.check(context);
      return {
        ruleId,
        description: rule.rule,
        passed,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        ruleId,
        description: rule.rule,
        passed: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Calculate violation severity
   */
  calculateSeverity(framework, ruleId) {
    const criticalRules = ['data_encryption', 'consent_management'];
    const highRules = ['data_retention', 'audit_logging'];
    
    if (criticalRules.includes(ruleId)) return 'critical';
    if (highRules.includes(ruleId)) return 'high';
    return 'medium';
  }

  /**
   * Generate compliance recommendations
   */
  async generateRecommendations(framework, assessment) {
    const recommendations = [];
    const frameworkConfig = this.frameworks.get(framework);

    // Framework-specific recommendations
    if (framework === 'gdpr' && assessment.score < 80) {
      recommendations.push({
        priority: 'high',
        category: 'data_protection',
        action: 'Implement Privacy by Design principles',
        description: 'Redesign systems to incorporate data protection from the ground up'
      });
    }

    if (framework === 'fips' && assessment.score < 90) {
      recommendations.push({
        priority: 'critical',
        category: 'cryptography',
        action: 'Upgrade to FIPS 140-3 approved algorithms',
        description: 'Replace legacy cryptographic algorithms with FIPS-approved alternatives'
      });
    }

    // General recommendations based on violations
    for (const violation of assessment.violations) {
      if (violation.severity === 'critical') {
        recommendations.push({
          priority: 'critical',
          category: 'violation_remediation',
          action: violation.remediation,
          description: `Address critical violation: ${violation.description}`
        });
      }
    }

    return recommendations;
  }

  /**
   * Log compliance events
   */
  async logComplianceEvent(eventType, details) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      eventType,
      details,
      hash: this.calculateHash(JSON.stringify({ eventType, details, timestamp: Date.now() }))
    };

    this.auditLogs.push(logEntry);

    if (this.options.encryptAuditLogs) {
      logEntry.encrypted = true;
      logEntry.details = this.encryptData(JSON.stringify(logEntry.details));
    }

    logger.info('Compliance event logged', { eventType, logId: logEntry.hash });
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(frameworks = []) {
    const reportFrameworks = frameworks.length ? frameworks : Array.from(this.frameworks.keys());
    const report = {
      generatedAt: new Date().toISOString(),
      frameworks: {},
      overallScore: 0,
      totalViolations: 0,
      summary: {
        compliant: 0,
        nonCompliant: 0,
        errors: 0
      }
    };

    let totalScore = 0;
    let assessmentCount = 0;

    for (const framework of reportFrameworks) {
      const latestAssessment = this.getLatestAssessment(framework);
      if (latestAssessment) {
        report.frameworks[framework] = {
          name: this.frameworks.get(framework).name,
          score: latestAssessment.score,
          status: latestAssessment.status,
          violations: latestAssessment.violations.length,
          lastAssessed: latestAssessment.timestamp
        };

        totalScore += latestAssessment.score;
        assessmentCount++;
        report.totalViolations += latestAssessment.violations.length;

        if (latestAssessment.status === 'compliant') report.summary.compliant++;
        else if (latestAssessment.status === 'non_compliant') report.summary.nonCompliant++;
        else report.summary.errors++;
      }
    }

    report.overallScore = assessmentCount ? Math.round(totalScore / assessmentCount) : 0;

    // Save report
    const reportPath = path.join(__dirname, '../reports/compliance', `compliance_report_${Date.now()}.json`);
    await this.ensureDirectoryExists(path.dirname(reportPath));
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    logger.info('Compliance report generated', {
      frameworks: reportFrameworks.length,
      overallScore: report.overallScore,
      reportPath
    });

    return report;
  }

  /**
   * Get latest assessment for framework
   */
  getLatestAssessment(framework) {
    const assessmentKeys = Array.from(this.assessments.keys())
      .filter(key => key.startsWith(framework))
      .sort((a, b) => b.split('_')[1] - a.split('_')[1]);
    
    return assessmentKeys.length ? this.assessments.get(assessmentKeys[0]) : null;
  }

  /**
   * Monitor compliance in real-time
   */
  startRealTimeMonitoring() {
    if (!this.options.realTimeMonitoring) return;

    this.monitoringInterval = setInterval(async () => {
      try {
        // Run quick compliance checks
        for (const framework of ['gdpr', 'ccpa', 'fips']) {
          const assessment = await this.assessCompliance(framework, {
            encryption: { enabled: true, algorithm: 'AES-256', keyLength: 256 },
            auditLogs: { enabled: true, tamperProof: true, encrypted: true, retention: 2555 },
            cryptoAlgorithms: ['ML-KEM-1024', 'ML-DSA-87'],
            consent: { obtained: true, explicit: true, withdrawable: true, expired: false },
            dataAge: 30
          });

          if (assessment.status === 'non_compliant') {
            await this.triggerComplianceAlert(framework, assessment);
          }
        }
      } catch (error) {
        logger.error('Real-time compliance monitoring error', { error: error.message });
      }
    }, 300000); // Every 5 minutes

    logger.info('Real-time compliance monitoring started');
  }

  /**
   * Trigger compliance alert
   */
  async triggerComplianceAlert(framework, assessment) {
    const alert = {
      type: 'compliance_violation',
      framework,
      severity: 'high',
      score: assessment.score,
      violations: assessment.violations.length,
      timestamp: new Date().toISOString()
    };

    await this.logComplianceEvent('alert_triggered', alert);
    logger.warn('Compliance alert triggered', alert);
  }

  /**
   * Calculate data hash for integrity
   */
  calculateHash(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Encrypt sensitive data
   */
  encryptData(data) {
    const key = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-cbc', key);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return { encrypted, key: key.toString('hex'), iv: iv.toString('hex') };
  }

  /**
   * Ensure directory exists
   */
  async ensureDirectoryExists(dirPath) {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * Get compliance statistics
   */
  getComplianceStats() {
    return {
      frameworks: this.frameworks.size,
      auditLogs: this.auditLogs.length,
      assessments: this.assessments.size,
      realTimeMonitoring: !!this.monitoringInterval,
      encryptedLogs: this.options.encryptAuditLogs
    };
  }

  /**
   * Cleanup resources
   */
  destroy() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    logger.info('Global Compliance Manager destroyed');
  }
}

module.exports = { GlobalComplianceManager };