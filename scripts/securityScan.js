#!/usr/bin/env node

/**
 * @file securityScan.js
 * @brief Comprehensive security scanning and vulnerability assessment
 * 
 * This script performs automated security scanning including:
 * - Static code analysis
 * - Dependency vulnerability scanning
 * - PQC-specific security validation
 * - Compliance verification
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Security scan configuration
const SCAN_CONFIG = {
  severity: {
    CRITICAL: 'critical',
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low',
    INFO: 'info'
  },
  scanTypes: [
    'static_analysis',
    'dependency_scan',
    'pqc_validation',
    'compliance_check',
    'secret_detection',
    'configuration_review'
  ],
  outputFormats: ['json', 'html', 'sarif'],
  excludePatterns: [
    'node_modules/',
    'logs/',
    'coverage/',
    '.git/',
    'research_output/'
  ]
};

// Known vulnerability patterns for PQC implementations
const PQC_SECURITY_PATTERNS = {
  // Timing attack vulnerabilities
  timing_attacks: [
    /(?:if|while)\s*\([^)]*(?:key|secret|private).*?==.*?\)/gi,
    /memcmp\s*\([^)]*(?:key|secret|signature)/gi,
    /strcmp\s*\([^)]*(?:key|secret)/gi
  ],
  
  // Side-channel vulnerabilities
  sidechannel: [
    /(?:for|while)\s*\([^)]*(?:key|secret).*?length/gi,
    /\w+\s*\[\s*(?:key|secret)\s*\[\s*\w+\s*\]\s*\]/gi
  ],
  
  // Memory safety issues
  memory_safety: [
    /malloc\s*\([^)]*(?:key|secret)/gi,
    /strcpy\s*\([^)]*(?:key|secret)/gi,
    /sprintf\s*\([^)]*(?:key|secret)/gi,
    /gets\s*\(/gi
  ],
  
  // Cryptographic implementation issues
  crypto_issues: [
    /rand\(\)/gi,
    /srand\s*\(\s*time/gi,
    /Math\.random\(\)/gi,
    /new\s+Date\(\)\.getTime\(\)/gi
  ],
  
  // Secret exposure
  secret_exposure: [
    /console\.log\s*\([^)]*(?:key|secret|password|token)/gi,
    /printf\s*\([^)]*(?:key|secret|password)/gi,
    /Logger.*(?:key|secret|password|token)/gi
  ]
};

// Compliance frameworks to validate
const COMPLIANCE_FRAMEWORKS = [
  {
    name: 'NIST_PQC',
    rules: [
      'must_use_approved_algorithms',
      'must_implement_side_channel_protection',
      'must_use_secure_random_generation',
      'must_implement_key_zeroization'
    ]
  },
  {
    name: 'FIPS_140_2',
    rules: [
      'cryptographic_module_validation',
      'role_based_authentication',
      'finite_state_model',
      'physical_security_requirements'
    ]
  },
  {
    name: 'Common_Criteria',
    rules: [
      'security_target_definition',
      'vulnerability_assessment',
      'penetration_testing',
      'configuration_management'
    ]
  }
];

class SecurityScanner {
  constructor() {
    this.scanResults = {
      overview: {
        timestamp: Date.now(),
        scanId: crypto.randomUUID(),
        totalIssues: 0,
        criticalIssues: 0,
        highIssues: 0,
        mediumIssues: 0,
        lowIssues: 0
      },
      staticAnalysis: [],
      dependencyVulnerabilities: [],
      pqcValidation: [],
      complianceIssues: [],
      secretsFound: [],
      configurationIssues: [],
      recommendations: []
    };
    
    this.scannedFiles = new Set();
    this.excludePatterns = SCAN_CONFIG.excludePatterns.map(pattern => new RegExp(pattern));
  }

  /**
   * Run comprehensive security scan
   */
  async runComprehensiveScan() {
    console.log('🔍 Starting comprehensive security scan...');
    console.log(`📋 Scan ID: ${this.scanResults.overview.scanId}`);
    
    try {
      // Phase 1: Static Code Analysis
      console.log('\n📊 Phase 1: Static Code Analysis');
      await this.runStaticAnalysis();
      
      // Phase 2: Dependency Vulnerability Scan
      console.log('\n🔍 Phase 2: Dependency Vulnerability Scan');
      await this.runDependencyScan();
      
      // Phase 3: PQC-Specific Validation
      console.log('\n🔐 Phase 3: PQC-Specific Security Validation');
      await this.runPQCValidation();
      
      // Phase 4: Compliance Verification
      console.log('\n⚖️ Phase 4: Compliance Verification');
      await this.runComplianceCheck();
      
      // Phase 5: Secret Detection
      console.log('\n🕵️ Phase 5: Secret and Credential Detection');
      await this.runSecretDetection();
      
      // Phase 6: Configuration Review
      console.log('\n⚙️ Phase 6: Security Configuration Review');
      await this.runConfigurationReview();
      
      // Phase 7: Generate Recommendations
      console.log('\n💡 Phase 7: Generating Security Recommendations');
      await this.generateRecommendations();
      
      // Calculate final statistics
      this.calculateFinalStatistics();
      
      // Generate reports
      await this.generateReports();
      
      console.log('\n✅ Security scan completed successfully!');
      return this.scanResults;
      
    } catch (error) {
      console.error('❌ Security scan failed:', error.message);
      throw error;
    }
  }

  /**
   * Run static code analysis
   */
  async runStaticAnalysis() {
    const sourceFiles = await this.findSourceFiles();
    console.log(`📁 Scanning ${sourceFiles.length} source files...`);
    
    for (const filePath of sourceFiles) {
      if (this.shouldExcludeFile(filePath)) {
        continue;
      }
      
      try {
        const content = await fs.readFile(filePath, 'utf8');
        await this.analyzeFile(filePath, content);
        this.scannedFiles.add(filePath);
      } catch (error) {
        console.warn(`⚠️ Could not scan file ${filePath}: ${error.message}`);
      }
    }
    
    console.log(`✅ Static analysis completed: ${this.scanResults.staticAnalysis.length} issues found`);
  }

  /**
   * Analyze individual file for security issues
   */
  async analyzeFile(filePath, content) {
    const fileExtension = path.extname(filePath);
    const issues = [];
    
    // Check for PQC-specific security patterns
    for (const [category, patterns] of Object.entries(PQC_SECURITY_PATTERNS)) {
      for (const pattern of patterns) {
        const matches = content.matchAll(pattern);
        
        for (const match of matches) {
          const lineNumber = content.substring(0, match.index).split('\n').length;
          
          issues.push({
            file: filePath,
            line: lineNumber,
            column: match.index - content.lastIndexOf('\n', match.index - 1),
            severity: this.getSeverityForPattern(category),
            category,
            description: this.getDescriptionForPattern(category),
            evidence: match[0],
            remediation: this.getRemediationForPattern(category)
          });
        }
      }
    }
    
    // Language-specific analysis
    if (fileExtension === '.js' || fileExtension === '.ts') {
      issues.push(...await this.analyzeJavaScript(filePath, content));
    } else if (fileExtension === '.c' || fileExtension === '.h') {
      issues.push(...await this.analyzeCCode(filePath, content));
    }
    
    this.scanResults.staticAnalysis.push(...issues);
  }

  /**
   * Analyze JavaScript/TypeScript files
   */
  async analyzeJavaScript(filePath, content) {
    const issues = [];
    
    // Check for eval usage
    const evalPattern = /eval\s*\(/gi;
    const evalMatches = content.matchAll(evalPattern);
    for (const match of evalMatches) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      issues.push({
        file: filePath,
        line: lineNumber,
        severity: SCAN_CONFIG.severity.HIGH,
        category: 'code_injection',
        description: 'Use of eval() can lead to code injection vulnerabilities',
        evidence: match[0],
        remediation: 'Avoid using eval(). Use JSON.parse() for data or proper function calls.'
      });
    }
    
    // Check for weak random number generation
    const weakRandomPattern = /Math\.random\(\)/gi;
    const randomMatches = content.matchAll(weakRandomPattern);
    for (const match of randomMatches) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      issues.push({
        file: filePath,
        line: lineNumber,
        severity: SCAN_CONFIG.severity.MEDIUM,
        category: 'weak_cryptography',
        description: 'Math.random() is not cryptographically secure',
        evidence: match[0],
        remediation: 'Use crypto.randomBytes() or crypto.getRandomValues() for cryptographic purposes.'
      });
    }
    
    // Check for hardcoded secrets
    const secretPatterns = [
      /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{8,}/gi,
      /(?:api[_-]?key|apikey)\s*[:=]\s*['"][^'"]{20,}/gi,
      /(?:secret|token)\s*[:=]\s*['"][^'"]{16,}/gi
    ];
    
    for (const pattern of secretPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const lineNumber = content.substring(0, match.index).split('\n').length;
        issues.push({
          file: filePath,
          line: lineNumber,
          severity: SCAN_CONFIG.severity.HIGH,
          category: 'hardcoded_secrets',
          description: 'Potential hardcoded secret or credential detected',
          evidence: match[0].replace(/['"][^'"]+['"]/, '"***REDACTED***"'),
          remediation: 'Move secrets to environment variables or secure configuration.'
        });
      }
    }
    
    return issues;
  }

  /**
   * Analyze C/C++ code files
   */
  async analyzeCCode(filePath, content) {
    const issues = [];
    
    // Check for buffer overflow vulnerabilities
    const bufferOverflowPatterns = [
      /strcpy\s*\(/gi,
      /strcat\s*\(/gi,
      /sprintf\s*\(/gi,
      /gets\s*\(/gi
    ];
    
    for (const pattern of bufferOverflowPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const lineNumber = content.substring(0, match.index).split('\n').length;
        issues.push({
          file: filePath,
          line: lineNumber,
          severity: SCAN_CONFIG.severity.CRITICAL,
          category: 'buffer_overflow',
          description: 'Use of unsafe string function that can cause buffer overflow',
          evidence: match[0],
          remediation: 'Use safe alternatives like strncpy, strncat, snprintf, or fgets.'
        });
      }
    }
    
    // Check for memory leaks
    const mallocPattern = /malloc\s*\([^)]+\)/gi;
    const freePattern = /free\s*\([^)]+\)/gi;
    const mallocCount = (content.match(mallocPattern) || []).length;
    const freeCount = (content.match(freePattern) || []).length;
    
    if (mallocCount > freeCount) {
      issues.push({
        file: filePath,
        line: 1,
        severity: SCAN_CONFIG.severity.MEDIUM,
        category: 'memory_leak',
        description: `Potential memory leak: ${mallocCount} malloc calls vs ${freeCount} free calls`,
        evidence: `malloc: ${mallocCount}, free: ${freeCount}`,
        remediation: 'Ensure every malloc has a corresponding free call.'
      });
    }
    
    return issues;
  }

  /**
   * Run dependency vulnerability scan
   */
  async runDependencyScan() {
    try {
      // Check if package.json exists
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
      
      console.log('📦 Analyzing dependencies...');
      
      // Run npm audit if available
      try {
        const { stdout, stderr } = await execAsync('npm audit --json', { 
          cwd: process.cwd(),
          timeout: 30000 
        });
        
        const auditResult = JSON.parse(stdout);
        
        if (auditResult.vulnerabilities) {
          for (const [packageName, vulnerability] of Object.entries(auditResult.vulnerabilities)) {
            this.scanResults.dependencyVulnerabilities.push({
              package: packageName,
              severity: vulnerability.severity,
              title: vulnerability.title,
              description: vulnerability.overview || 'No description available',
              version: vulnerability.version,
              fixAvailable: vulnerability.fixAvailable || false,
              remediation: vulnerability.fixAvailable 
                ? `Update to version ${vulnerability.fixAvailable.name}` 
                : 'No fix available'
            });
          }
        }
        
      } catch (auditError) {
        console.warn('⚠️ npm audit failed, performing manual dependency check');
        await this.performManualDependencyCheck(packageJson);
      }
      
      console.log(`✅ Dependency scan completed: ${this.scanResults.dependencyVulnerabilities.length} vulnerabilities found`);
      
    } catch (error) {
      console.warn('⚠️ Could not perform dependency scan:', error.message);
    }
  }

  /**
   * Perform manual dependency vulnerability check
   */
  async performManualDependencyCheck(packageJson) {
    // Known vulnerable package patterns
    const knownVulnerabilities = [
      {
        package: 'lodash',
        versions: ['<4.17.21'],
        severity: 'high',
        description: 'Prototype pollution vulnerability'
      },
      {
        package: 'moment',
        versions: ['*'],
        severity: 'medium',
        description: 'Package is deprecated and has security considerations'
      }
    ];
    
    const allDependencies = {
      ...packageJson.dependencies || {},
      ...packageJson.devDependencies || {}
    };
    
    for (const [depName, depVersion] of Object.entries(allDependencies)) {
      const vulnerability = knownVulnerabilities.find(v => v.package === depName);
      if (vulnerability) {
        this.scanResults.dependencyVulnerabilities.push({
          package: depName,
          severity: vulnerability.severity,
          title: `Known vulnerability in ${depName}`,
          description: vulnerability.description,
          version: depVersion,
          fixAvailable: true,
          remediation: 'Update to latest version or find alternative package'
        });
      }
    }
  }

  /**
   * Run PQC-specific security validation
   */
  async runPQCValidation() {
    const pqcIssues = [];
    
    // Check for proper PQC algorithm usage
    const sourceFiles = await this.findSourceFiles();
    
    for (const filePath of sourceFiles) {
      if (this.shouldExcludeFile(filePath)) continue;
      
      try {
        const content = await fs.readFile(filePath, 'utf8');
        
        // Check for deprecated algorithms
        const deprecatedAlgorithms = ['rsa', 'ecdsa', 'ecdh'];
        for (const algorithm of deprecatedAlgorithms) {
          const pattern = new RegExp(`\\b${algorithm}\\b`, 'gi');
          const matches = content.matchAll(pattern);
          
          for (const match of matches) {
            const lineNumber = content.substring(0, match.index).split('\n').length;
            pqcIssues.push({
              file: filePath,
              line: lineNumber,
              severity: SCAN_CONFIG.severity.MEDIUM,
              category: 'deprecated_algorithm',
              description: `Use of quantum-vulnerable algorithm: ${algorithm.toUpperCase()}`,
              evidence: match[0],
              remediation: 'Replace with post-quantum resistant algorithms (Kyber, Dilithium, Falcon)'
            });
          }
        }
        
        // Check for proper key size usage
        const keySizePattern = /(?:key.?size|keySize)\s*[:=]\s*(\d+)/gi;
        const keySizeMatches = content.matchAll(keySizePattern);
        
        for (const match of keySizeMatches) {
          const keySize = parseInt(match[1]);
          const lineNumber = content.substring(0, match.index).split('\n').length;
          
          if (keySize < 2048) {
            pqcIssues.push({
              file: filePath,
              line: lineNumber,
              severity: SCAN_CONFIG.severity.HIGH,
              category: 'insufficient_key_size',
              description: `Key size ${keySize} is insufficient for quantum resistance`,
              evidence: match[0],
              remediation: 'Use minimum 3072-bit keys or switch to post-quantum algorithms'
            });
          }
        }
        
        // Check for proper random number generation
        const weakRandomPatterns = [
          /rand\(\)/gi,
          /srand\(/gi,
          /Math\.random\(\)/gi
        ];
        
        for (const pattern of weakRandomPatterns) {
          const matches = content.matchAll(pattern);
          for (const match of matches) {
            const lineNumber = content.substring(0, match.index).split('\n').length;
            pqcIssues.push({
              file: filePath,
              line: lineNumber,
              severity: SCAN_CONFIG.severity.HIGH,
              category: 'weak_random_generation',
              description: 'Use of non-cryptographic random number generator',
              evidence: match[0],
              remediation: 'Use cryptographically secure random number generators'
            });
          }
        }
        
      } catch (error) {
        console.warn(`⚠️ Could not validate PQC security in ${filePath}: ${error.message}`);
      }
    }
    
    this.scanResults.pqcValidation = pqcIssues;
    console.log(`✅ PQC validation completed: ${pqcIssues.length} issues found`);
  }

  /**
   * Run compliance verification
   */
  async runComplianceCheck() {
    const complianceIssues = [];
    
    for (const framework of COMPLIANCE_FRAMEWORKS) {
      const frameworkIssues = await this.checkFrameworkCompliance(framework);
      complianceIssues.push(...frameworkIssues);
    }
    
    this.scanResults.complianceIssues = complianceIssues;
    console.log(`✅ Compliance check completed: ${complianceIssues.length} issues found`);
  }

  /**
   * Check compliance with specific framework
   */
  async checkFrameworkCompliance(framework) {
    const issues = [];
    
    // This is a simplified compliance check
    // In production, this would involve more sophisticated analysis
    
    if (framework.name === 'NIST_PQC') {
      // Check for approved PQC algorithms
      const sourceFiles = await this.findSourceFiles();
      let hasApprovedAlgorithms = false;
      
      for (const filePath of sourceFiles.slice(0, 5)) { // Sample check
        if (this.shouldExcludeFile(filePath)) continue;
        
        try {
          const content = await fs.readFile(filePath, 'utf8');
          
          const approvedAlgorithms = ['kyber', 'dilithium', 'falcon', 'sphincs'];
          const hasApproved = approvedAlgorithms.some(alg => 
            content.toLowerCase().includes(alg)
          );
          
          if (hasApproved) {
            hasApprovedAlgorithms = true;
            break;
          }
        } catch (error) {
          // Continue checking other files
        }
      }
      
      if (!hasApprovedAlgorithms) {
        issues.push({
          framework: framework.name,
          rule: 'must_use_approved_algorithms',
          severity: SCAN_CONFIG.severity.HIGH,
          description: 'No NIST-approved post-quantum algorithms detected',
          remediation: 'Implement NIST-standardized PQC algorithms (Kyber, Dilithium, Falcon)'
        });
      }
    }
    
    return issues;
  }

  /**
   * Run secret detection scan
   */
  async runSecretDetection() {
    const secretPatterns = [
      {
        name: 'Private Key',
        pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/gi,
        severity: SCAN_CONFIG.severity.CRITICAL
      },
      {
        name: 'API Key',
        pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][a-zA-Z0-9]{20,}['""]/gi,
        severity: SCAN_CONFIG.severity.HIGH
      },
      {
        name: 'Password',
        pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{8,}['""]/gi,
        severity: SCAN_CONFIG.severity.HIGH
      },
      {
        name: 'JWT Token',
        pattern: /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+\/=]*/gi,
        severity: SCAN_CONFIG.severity.MEDIUM
      }
    ];
    
    const sourceFiles = await this.findSourceFiles();
    
    for (const filePath of sourceFiles) {
      if (this.shouldExcludeFile(filePath)) continue;
      
      try {
        const content = await fs.readFile(filePath, 'utf8');
        
        for (const secretPattern of secretPatterns) {
          const matches = content.matchAll(secretPattern.pattern);
          
          for (const match of matches) {
            const lineNumber = content.substring(0, match.index).split('\n').length;
            
            this.scanResults.secretsFound.push({
              file: filePath,
              line: lineNumber,
              type: secretPattern.name,
              severity: secretPattern.severity,
              evidence: '***REDACTED***',
              remediation: 'Remove secret from code and use secure configuration management'
            });
          }
        }
        
      } catch (error) {
        // Continue with other files
      }
    }
    
    console.log(`✅ Secret detection completed: ${this.scanResults.secretsFound.length} potential secrets found`);
  }

  /**
   * Run configuration security review
   */
  async runConfigurationReview() {
    const configIssues = [];
    
    // Check package.json for security configurations
    try {
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
      
      // Check for security-related scripts
      if (!packageJson.scripts?.['security:audit']) {
        configIssues.push({
          file: 'package.json',
          category: 'missing_security_script',
          severity: SCAN_CONFIG.severity.LOW,
          description: 'Missing security audit script',
          remediation: 'Add "security:audit": "npm audit && npm run security:scan" to scripts'
        });
      }
      
      // Check for development dependencies in production
      if (packageJson.devDependencies && Object.keys(packageJson.devDependencies).length > 0) {
        configIssues.push({
          file: 'package.json',
          category: 'dev_dependencies',
          severity: SCAN_CONFIG.severity.LOW,
          description: 'Development dependencies detected',
          remediation: 'Ensure dev dependencies are not installed in production'
        });
      }
      
    } catch (error) {
      console.warn('⚠️ Could not review package.json configuration');
    }
    
    // Check for Docker security configurations
    try {
      const dockerfilePath = path.join(process.cwd(), 'Dockerfile');
      const dockerContent = await fs.readFile(dockerfilePath, 'utf8');
      
      // Check for running as root
      if (!dockerContent.includes('USER ') || dockerContent.includes('USER root')) {
        configIssues.push({
          file: 'Dockerfile',
          category: 'privileged_user',
          severity: SCAN_CONFIG.severity.MEDIUM,
          description: 'Container may be running as root user',
          remediation: 'Add USER directive to run container as non-root user'
        });
      }
      
    } catch (error) {
      // Dockerfile might not exist
    }
    
    this.scanResults.configurationIssues = configIssues;
    console.log(`✅ Configuration review completed: ${configIssues.length} issues found`);
  }

  /**
   * Generate security recommendations
   */
  async generateRecommendations() {
    const recommendations = [];
    
    // Analyze scan results and generate recommendations
    const totalCritical = this.scanResults.overview.criticalIssues;
    const totalHigh = this.scanResults.overview.highIssues;
    
    if (totalCritical > 0) {
      recommendations.push({
        priority: 'IMMEDIATE',
        category: 'critical_vulnerabilities',
        title: 'Address Critical Security Issues',
        description: `${totalCritical} critical security issues require immediate attention`,
        actions: [
          'Review all critical findings in detail',
          'Implement fixes for buffer overflows and code injection vulnerabilities',
          'Remove any hardcoded secrets or credentials',
          'Update vulnerable dependencies'
        ]
      });
    }
    
    if (totalHigh > 0) {
      recommendations.push({
        priority: 'HIGH',
        category: 'high_priority_issues',
        title: 'Resolve High Priority Security Issues',
        description: `${totalHigh} high priority security issues should be resolved`,
        actions: [
          'Replace weak cryptographic implementations',
          'Implement proper input validation',
          'Review and update authentication mechanisms',
          'Ensure secure coding practices'
        ]
      });
    }
    
    // PQC-specific recommendations
    if (this.scanResults.pqcValidation.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        category: 'quantum_readiness',
        title: 'Enhance Quantum Resistance',
        description: 'Post-quantum cryptography implementation needs improvement',
        actions: [
          'Replace classical cryptographic algorithms with PQC alternatives',
          'Implement proper key sizes for quantum resistance',
          'Use cryptographically secure random number generators',
          'Add side-channel attack protections'
        ]
      });
    }
    
    // General security recommendations
    recommendations.push({
      priority: 'MEDIUM',
      category: 'general_security',
      title: 'Implement Security Best Practices',
      description: 'General security hardening recommendations',
      actions: [
        'Implement comprehensive logging and monitoring',
        'Add rate limiting and DoS protection',
        'Regular security audits and penetration testing',
        'Security awareness training for development team',
        'Implement secure CI/CD pipelines',
        'Regular dependency updates and vulnerability scanning'
      ]
    });
    
    // Compliance recommendations
    if (this.scanResults.complianceIssues.length > 0) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'compliance',
        title: 'Ensure Regulatory Compliance',
        description: 'Address compliance requirements for security standards',
        actions: [
          'Implement NIST cybersecurity framework',
          'Ensure GDPR/CCPA compliance for data handling',
          'Document security procedures and policies',
          'Regular compliance audits and assessments'
        ]
      });
    }
    
    this.scanResults.recommendations = recommendations;
    console.log(`✅ Generated ${recommendations.length} security recommendations`);
  }

  /**
   * Calculate final scan statistics
   */
  calculateFinalStatistics() {
    const allIssues = [
      ...this.scanResults.staticAnalysis,
      ...this.scanResults.dependencyVulnerabilities.map(v => ({ severity: v.severity })),
      ...this.scanResults.pqcValidation,
      ...this.scanResults.complianceIssues,
      ...this.scanResults.secretsFound,
      ...this.scanResults.configurationIssues
    ];
    
    this.scanResults.overview.totalIssues = allIssues.length;
    this.scanResults.overview.criticalIssues = allIssues.filter(
      i => i.severity === SCAN_CONFIG.severity.CRITICAL
    ).length;
    this.scanResults.overview.highIssues = allIssues.filter(
      i => i.severity === SCAN_CONFIG.severity.HIGH
    ).length;
    this.scanResults.overview.mediumIssues = allIssues.filter(
      i => i.severity === SCAN_CONFIG.severity.MEDIUM
    ).length;
    this.scanResults.overview.lowIssues = allIssues.filter(
      i => i.severity === SCAN_CONFIG.severity.LOW
    ).length;
    
    this.scanResults.overview.filesScanned = this.scannedFiles.size;
    this.scanResults.overview.scanDuration = Date.now() - this.scanResults.overview.timestamp;
  }

  /**
   * Generate security scan reports
   */
  async generateReports() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportsDir = path.join(process.cwd(), 'security-reports');
    
    // Create reports directory
    await fs.mkdir(reportsDir, { recursive: true });
    
    // Generate JSON report
    const jsonReport = JSON.stringify(this.scanResults, null, 2);
    await fs.writeFile(
      path.join(reportsDir, `security-scan-${timestamp}.json`),
      jsonReport
    );
    
    // Generate HTML report
    const htmlReport = this.generateHTMLReport();
    await fs.writeFile(
      path.join(reportsDir, `security-scan-${timestamp}.html`),
      htmlReport
    );
    
    // Generate SARIF report for CI/CD integration
    const sarifReport = this.generateSARIFReport();
    await fs.writeFile(
      path.join(reportsDir, `security-scan-${timestamp}.sarif`),
      JSON.stringify(sarifReport, null, 2)
    );
    
    console.log(`📄 Reports generated in: ${reportsDir}`);
    console.log(`   • JSON: security-scan-${timestamp}.json`);
    console.log(`   • HTML: security-scan-${timestamp}.html`);
    console.log(`   • SARIF: security-scan-${timestamp}.sarif`);
  }

  /**
   * Generate HTML report
   */
  generateHTMLReport() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PQC-Edge-Attestor Security Scan Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
        .overview { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; border-left: 4px solid #007bff; }
        .critical { border-left-color: #dc3545; background: #fff5f5; }
        .high { border-left-color: #fd7e14; background: #fff8f0; }
        .medium { border-left-color: #ffc107; background: #fffbf0; }
        .low { border-left-color: #28a745; background: #f8fff8; }
        .section { margin-bottom: 30px; }
        .issue { background: #f8f9fa; border-left: 4px solid #007bff; padding: 15px; margin: 10px 0; border-radius: 4px; }
        .issue.critical { border-left-color: #dc3545; background: #fff5f5; }
        .issue.high { border-left-color: #fd7e14; background: #fff8f0; }
        .issue.medium { border-left-color: #ffc107; background: #fffbf0; }
        .issue.low { border-left-color: #28a745; background: #f8fff8; }
        .recommendations { background: #e3f2fd; padding: 20px; border-radius: 8px; }
        code { background: #f1f3f4; padding: 2px 4px; border-radius: 3px; font-family: monospace; }
        .badge { padding: 2px 8px; border-radius: 12px; font-size: 0.8em; font-weight: bold; color: white; }
        .badge.critical { background: #dc3545; }
        .badge.high { background: #fd7e14; }
        .badge.medium { background: #ffc107; color: #000; }
        .badge.low { background: #28a745; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 PQC-Edge-Attestor Security Scan Report</h1>
            <p><strong>Scan ID:</strong> ${this.scanResults.overview.scanId}</p>
            <p><strong>Timestamp:</strong> ${new Date(this.scanResults.overview.timestamp).toLocaleString()}</p>
            <p><strong>Files Scanned:</strong> ${this.scanResults.overview.filesScanned}</p>
            <p><strong>Scan Duration:</strong> ${(this.scanResults.overview.scanDuration / 1000).toFixed(2)}s</p>
        </div>
        
        <div class="overview">
            <div class="stat-card">
                <h3>Total Issues</h3>
                <h2>${this.scanResults.overview.totalIssues}</h2>
            </div>
            <div class="stat-card critical">
                <h3>Critical</h3>
                <h2>${this.scanResults.overview.criticalIssues}</h2>
            </div>
            <div class="stat-card high">
                <h3>High</h3>
                <h2>${this.scanResults.overview.highIssues}</h2>
            </div>
            <div class="stat-card medium">
                <h3>Medium</h3>
                <h2>${this.scanResults.overview.mediumIssues}</h2>
            </div>
            <div class="stat-card low">
                <h3>Low</h3>
                <h2>${this.scanResults.overview.lowIssues}</h2>
            </div>
        </div>
        
        <div class="section">
            <h2>📋 Security Recommendations</h2>
            <div class="recommendations">
                ${this.scanResults.recommendations.map(rec => `
                    <div style="margin-bottom: 20px;">
                        <h3>${rec.title}</h3>
                        <p><strong>Priority:</strong> <span class="badge ${rec.priority.toLowerCase()}">${rec.priority}</span></p>
                        <p>${rec.description}</p>
                        <ul>
                            ${rec.actions.map(action => `<li>${action}</li>`).join('')}
                        </ul>
                    </div>
                `).join('')}
            </div>
        </div>
        
        <div class="section">
            <h2>🔍 Scan Results Summary</h2>
            <ul>
                <li><strong>Static Analysis:</strong> ${this.scanResults.staticAnalysis.length} issues</li>
                <li><strong>Dependency Vulnerabilities:</strong> ${this.scanResults.dependencyVulnerabilities.length} issues</li>
                <li><strong>PQC Validation:</strong> ${this.scanResults.pqcValidation.length} issues</li>
                <li><strong>Compliance Issues:</strong> ${this.scanResults.complianceIssues.length} issues</li>
                <li><strong>Secrets Found:</strong> ${this.scanResults.secretsFound.length} issues</li>
                <li><strong>Configuration Issues:</strong> ${this.scanResults.configurationIssues.length} issues</li>
            </ul>
        </div>
    </div>
</body>
</html>`;
  }

  /**
   * Generate SARIF report for CI/CD integration
   */
  generateSARIFReport() {
    const results = [];
    
    // Convert all issues to SARIF format
    const allIssues = [
      ...this.scanResults.staticAnalysis.map(i => ({ ...i, tool: 'static_analysis' })),
      ...this.scanResults.pqcValidation.map(i => ({ ...i, tool: 'pqc_validation' })),
      ...this.scanResults.secretsFound.map(i => ({ ...i, tool: 'secret_detection' })),
      ...this.scanResults.configurationIssues.map(i => ({ ...i, tool: 'config_review' }))
    ];
    
    for (const issue of allIssues) {
      results.push({
        ruleId: issue.category || 'security_issue',
        level: this.severityToSarifLevel(issue.severity),
        message: {
          text: issue.description || 'Security issue detected'
        },
        locations: [{
          physicalLocation: {
            artifactLocation: {
              uri: issue.file || 'unknown'
            },
            region: {
              startLine: issue.line || 1,
              startColumn: issue.column || 1
            }
          }
        }]
      });
    }
    
    return {
      version: '2.1.0',
      $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
      runs: [{
        tool: {
          driver: {
            name: 'PQC Security Scanner',
            version: '1.0.0',
            informationUri: 'https://github.com/terragonlabs/PQC-Edge-Attestor'
          }
        },
        results
      }]
    };
  }

  // Utility methods

  async findSourceFiles() {
    const files = [];
    
    const searchExtensions = ['.js', '.ts', '.c', '.h', '.cpp', '.hpp', '.py', '.java'];
    const searchDirs = ['src', 'lib', 'app', 'tests', 'scripts'];
    
    for (const dir of searchDirs) {
      try {
        await this.walkDirectory(path.join(process.cwd(), dir), files, searchExtensions);
      } catch (error) {
        // Directory might not exist, continue
      }
    }
    
    return files;
  }

  async walkDirectory(dirPath, files, extensions) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          await this.walkDirectory(fullPath, files, extensions);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      // Skip directories that can't be read
    }
  }

  shouldExcludeFile(filePath) {
    return this.excludePatterns.some(pattern => pattern.test(filePath));
  }

  getSeverityForPattern(category) {
    const severityMap = {
      timing_attacks: SCAN_CONFIG.severity.HIGH,
      sidechannel: SCAN_CONFIG.severity.HIGH,
      memory_safety: SCAN_CONFIG.severity.CRITICAL,
      crypto_issues: SCAN_CONFIG.severity.HIGH,
      secret_exposure: SCAN_CONFIG.severity.CRITICAL
    };
    
    return severityMap[category] || SCAN_CONFIG.severity.MEDIUM;
  }

  getDescriptionForPattern(category) {
    const descriptions = {
      timing_attacks: 'Potential timing attack vulnerability detected',
      sidechannel: 'Potential side-channel attack vulnerability detected',
      memory_safety: 'Memory safety issue that could lead to buffer overflow',
      crypto_issues: 'Weak or insecure cryptographic implementation',
      secret_exposure: 'Potential secret or credential exposure'
    };
    
    return descriptions[category] || 'Security issue detected';
  }

  getRemediationForPattern(category) {
    const remediations = {
      timing_attacks: 'Use constant-time algorithms and avoid conditional branches based on secret data',
      sidechannel: 'Implement side-channel resistant algorithms and add countermeasures',
      memory_safety: 'Use safe string functions and proper bounds checking',
      crypto_issues: 'Use cryptographically secure algorithms and implementations',
      secret_exposure: 'Remove secrets from code and use secure configuration management'
    };
    
    return remediations[category] || 'Review and fix the security issue';
  }

  severityToSarifLevel(severity) {
    const levelMap = {
      [SCAN_CONFIG.severity.CRITICAL]: 'error',
      [SCAN_CONFIG.severity.HIGH]: 'error',
      [SCAN_CONFIG.severity.MEDIUM]: 'warning',
      [SCAN_CONFIG.severity.LOW]: 'note',
      [SCAN_CONFIG.severity.INFO]: 'note'
    };
    
    return levelMap[severity] || 'warning';
  }
}

// Main execution
async function main() {
  try {
    const scanner = new SecurityScanner();
    const results = await scanner.runComprehensiveScan();
    
    // Print summary
    console.log('\n📊 Security Scan Summary:');
    console.log(`   Total Issues: ${results.overview.totalIssues}`);
    console.log(`   Critical: ${results.overview.criticalIssues}`);
    console.log(`   High: ${results.overview.highIssues}`);
    console.log(`   Medium: ${results.overview.mediumIssues}`);
    console.log(`   Low: ${results.overview.lowIssues}`);
    console.log(`   Files Scanned: ${results.overview.filesScanned}`);
    console.log(`   Scan Duration: ${(results.overview.scanDuration / 1000).toFixed(2)}s`);
    
    // Exit with appropriate code
    const hasHighPriorityIssues = results.overview.criticalIssues + results.overview.highIssues;
    process.exit(hasHighPriorityIssues > 0 ? 1 : 0);
    
  } catch (error) {
    console.error('❌ Security scan failed:', error.message);
    process.exit(1);
  }
}

// Run the script if called directly
if (require.main === module) {
  main();
}

module.exports = { SecurityScanner, SCAN_CONFIG };