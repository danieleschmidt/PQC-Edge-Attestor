/**
 * @file security-scan.js
 * @brief Security vulnerability scanner for PQC Edge Attestor
 * @description Quality Gates implementation - Security scanning component
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class SecurityScanner {
    constructor() {
        this.vulnerabilities = [];
        this.warnings = [];
        this.recommendations = [];
        
        // Security patterns to detect
        this.patterns = {
            // Sensitive information patterns
            secrets: [
                /password\s*=\s*['"][^'"]{1,}['"]/gi,
                /api[_-]?key\s*=\s*['"][^'"]{1,}['"]/gi,
                /secret\s*=\s*['"][^'"]{1,}['"]/gi,
                /token\s*=\s*['"][^'"]{1,}['"]/gi,
                /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/gi
            ],
            
            // Crypto anti-patterns
            cryptoIssues: [
                /createCipher\(/gi, // Deprecated
                /createDecipher\(/gi, // Deprecated
                /md5|sha1(?![0-9])/gi, // Weak hashes
                /des|rc4|rc2/gi, // Weak ciphers
                /Math\.random\(\)/gi // Weak randomness
            ],
            
            // SQL injection patterns
            sqlInjection: [
                /query\s*\(\s*['"][^'"]*\+/gi,
                /execute\s*\(\s*['"][^'"]*\+/gi
            ],
            
            // Command injection patterns
            commandInjection: [
                /exec\s*\(\s*[^)]*\+/gi,
                /spawn\s*\(\s*[^)]*\+/gi,
                /system\s*\(\s*[^)]*\+/gi
            ],
            
            // Path traversal patterns
            pathTraversal: [
                /\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e%5c/gi
            ],
            
            // Hardcoded URLs
            hardcodedUrls: [
                /https?:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi
            ]
        };
        
        // File extensions to scan
        this.scanExtensions = ['.js', '.json', '.ts', '.jsx', '.tsx'];
        
        // Directories to exclude
        this.excludeDirs = ['node_modules', '.git', 'coverage', 'dist', 'build', '.jest-cache'];
    }

    async scanProject(projectPath = '.') {
        console.log('🔍 Starting security vulnerability scan...');
        const startTime = Date.now();
        
        try {
            // Scan all files
            await this._scanDirectory(projectPath);
            
            // Check dependencies
            await this._checkDependencies(projectPath);
            
            // Check configurations
            await this._checkConfigurations(projectPath);
            
            // Generate report
            const report = this._generateReport();
            const scanTime = Date.now() - startTime;
            
            console.log(`✅ Security scan completed in ${scanTime}ms`);
            console.log(`📊 Found: ${this.vulnerabilities.length} vulnerabilities, ${this.warnings.length} warnings`);
            
            return report;
            
        } catch (error) {
            console.error('❌ Security scan failed:', error.message);
            throw error;
        }
    }

    async _scanDirectory(dirPath) {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            
            if (entry.isDirectory()) {
                if (!this.excludeDirs.includes(entry.name)) {
                    await this._scanDirectory(fullPath);
                }
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name);
                if (this.scanExtensions.includes(ext)) {
                    await this._scanFile(fullPath);
                }
            }
        }
    }

    async _scanFile(filePath) {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const lines = content.split('\n');
            
            // Scan for various security issues
            this._scanForSecrets(filePath, content, lines);
            this._scanForCryptoIssues(filePath, content, lines);
            this._scanForInjectionVulns(filePath, content, lines);
            this._scanForPathTraversal(filePath, content, lines);
            this._scanForHardcodedUrls(filePath, content, lines);
            
        } catch (error) {
            this.warnings.push({
                type: 'file_read_error',
                file: filePath,
                message: `Could not read file: ${error.message}`,
                severity: 'low'
            });
        }
    }

    _scanForSecrets(filePath, content, lines) {
        this.patterns.secrets.forEach(pattern => {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const lineNumber = this._getLineNumber(content, match.index);
                
                this.vulnerabilities.push({
                    type: 'exposed_secret',
                    file: filePath,
                    line: lineNumber,
                    message: 'Potential secret or credential found',
                    evidence: match[0].substring(0, 50) + '...',
                    severity: 'high',
                    recommendation: 'Move secrets to environment variables or secure configuration'
                });
            }
        });
    }

    _scanForCryptoIssues(filePath, content, lines) {
        this.patterns.cryptoIssues.forEach(pattern => {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const lineNumber = this._getLineNumber(content, match.index);
                let severity = 'medium';
                let message = 'Potential cryptographic weakness detected';
                
                if (match[0].toLowerCase().includes('md5') || match[0].toLowerCase().includes('sha1')) {
                    severity = 'high';
                    message = 'Weak cryptographic hash function detected';
                } else if (match[0].toLowerCase().includes('math.random')) {
                    severity = 'high';
                    message = 'Cryptographically insecure random number generation';
                }
                
                this.vulnerabilities.push({
                    type: 'crypto_weakness',
                    file: filePath,
                    line: lineNumber,
                    message,
                    evidence: match[0],
                    severity,
                    recommendation: 'Use cryptographically secure alternatives (crypto.randomBytes, SHA-256+)'
                });
            }
        });
    }

    _scanForInjectionVulns(filePath, content, lines) {
        // SQL injection
        this.patterns.sqlInjection.forEach(pattern => {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const lineNumber = this._getLineNumber(content, match.index);
                
                this.vulnerabilities.push({
                    type: 'sql_injection',
                    file: filePath,
                    line: lineNumber,
                    message: 'Potential SQL injection vulnerability',
                    evidence: match[0],
                    severity: 'high',
                    recommendation: 'Use parameterized queries or prepared statements'
                });
            }
        });
        
        // Command injection
        this.patterns.commandInjection.forEach(pattern => {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const lineNumber = this._getLineNumber(content, match.index);
                
                this.vulnerabilities.push({
                    type: 'command_injection',
                    file: filePath,
                    line: lineNumber,
                    message: 'Potential command injection vulnerability',
                    evidence: match[0],
                    severity: 'high',
                    recommendation: 'Validate and sanitize all inputs, use execFile instead of exec'
                });
            }
        });
    }

    _scanForPathTraversal(filePath, content, lines) {
        this.patterns.pathTraversal.forEach(pattern => {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const lineNumber = this._getLineNumber(content, match.index);
                
                this.vulnerabilities.push({
                    type: 'path_traversal',
                    file: filePath,
                    line: lineNumber,
                    message: 'Potential path traversal vulnerability',
                    evidence: match[0],
                    severity: 'medium',
                    recommendation: 'Validate and sanitize file paths, use path.resolve()'
                });
            }
        });
    }

    _scanForHardcodedUrls(filePath, content, lines) {
        // Skip if it's a test file or configuration
        if (filePath.includes('.test.') || filePath.includes('config') || filePath.includes('spec.')) {
            return;
        }
        
        this.patterns.hardcodedUrls.forEach(pattern => {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const lineNumber = this._getLineNumber(content, match.index);
                
                // Skip localhost and common development URLs
                if (match[0].includes('localhost') || match[0].includes('127.0.0.1') || 
                    match[0].includes('example.com') || match[0].includes('test.com')) {
                    return;
                }
                
                this.warnings.push({
                    type: 'hardcoded_url',
                    file: filePath,
                    line: lineNumber,
                    message: 'Hardcoded URL found',
                    evidence: match[0],
                    severity: 'low',
                    recommendation: 'Move URLs to configuration files'
                });
            }
        });
    }

    async _checkDependencies(projectPath) {
        try {
            const packageJsonPath = path.join(projectPath, 'package.json');
            const packageContent = await fs.readFile(packageJsonPath, 'utf8');
            const packageJson = JSON.parse(packageContent);
            
            // Check for known vulnerable packages
            const vulnerablePackages = [
                'lodash', 'moment', 'request', 'node-fetch'
            ];
            
            const allDeps = {
                ...packageJson.dependencies || {},
                ...packageJson.devDependencies || {}
            };
            
            vulnerablePackages.forEach(pkg => {
                if (allDeps[pkg]) {
                    this.warnings.push({
                        type: 'vulnerable_dependency',
                        file: 'package.json',
                        message: `Package ${pkg} may have known vulnerabilities`,
                        evidence: `${pkg}: ${allDeps[pkg]}`,
                        severity: 'medium',
                        recommendation: 'Run npm audit and update to latest secure version'
                    });
                }
            });
            
        } catch (error) {
            this.warnings.push({
                type: 'dependency_check_failed',
                file: 'package.json',
                message: `Could not analyze dependencies: ${error.message}`,
                severity: 'low'
            });
        }
    }

    async _checkConfigurations(projectPath) {
        // Check for exposed .env files
        try {
            await fs.access(path.join(projectPath, '.env'));
            this.warnings.push({
                type: 'exposed_env',
                file: '.env',
                message: 'Environment file found in project root',
                severity: 'medium',
                recommendation: 'Ensure .env is in .gitignore and not committed'
            });
        } catch (error) {
            // File doesn't exist, which is good
        }
        
        // Check for debug configurations
        const configFiles = ['config.js', 'config.json', '.eslintrc.js'];
        
        for (const configFile of configFiles) {
            try {
                const configPath = path.join(projectPath, configFile);
                const configContent = await fs.readFile(configPath, 'utf8');
                
                if (configContent.includes('debug: true') || configContent.includes('"debug": true')) {
                    this.warnings.push({
                        type: 'debug_enabled',
                        file: configFile,
                        message: 'Debug mode appears to be enabled',
                        severity: 'low',
                        recommendation: 'Ensure debug mode is disabled in production'
                    });
                }
            } catch (error) {
                // File doesn't exist, skip
            }
        }
    }

    _getLineNumber(content, index) {
        const beforeMatch = content.substring(0, index);
        return beforeMatch.split('\n').length;
    }

    _generateReport() {
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                totalVulnerabilities: this.vulnerabilities.length,
                totalWarnings: this.warnings.length,
                riskLevel: this._calculateRiskLevel()
            },
            vulnerabilities: this.vulnerabilities.sort((a, b) => {
                const severityOrder = { high: 3, medium: 2, low: 1 };
                return severityOrder[b.severity] - severityOrder[a.severity];
            }),
            warnings: this.warnings.sort((a, b) => {
                const severityOrder = { high: 3, medium: 2, low: 1 };
                return severityOrder[b.severity] - severityOrder[a.severity];
            }),
            recommendations: this._generateRecommendations()
        };
        
        return report;
    }

    _calculateRiskLevel() {
        const highVulns = this.vulnerabilities.filter(v => v.severity === 'high').length;
        const mediumVulns = this.vulnerabilities.filter(v => v.severity === 'medium').length;
        
        if (highVulns > 5) return 'CRITICAL';
        if (highVulns > 0) return 'HIGH';
        if (mediumVulns > 10) return 'HIGH';
        if (mediumVulns > 0) return 'MEDIUM';
        return 'LOW';
    }

    _generateRecommendations() {
        const recommendations = [
            'Implement automated dependency scanning (npm audit)',
            'Use environment variables for all configuration',
            'Enable Content Security Policy (CSP) headers',
            'Implement proper input validation and sanitization',
            'Use HTTPS for all external communications',
            'Enable security headers (HSTS, X-Frame-Options, etc.)',
            'Implement proper authentication and authorization',
            'Use cryptographically secure random number generation',
            'Regularly update dependencies to latest secure versions',
            'Implement security monitoring and alerting'
        ];
        
        return recommendations;
    }
}

// Main execution
async function main() {
    const scanner = new SecurityScanner();
    
    try {
        const report = await scanner.scanProject('.');
        
        // Write report to file
        await fs.writeFile(
            'security-report.json', 
            JSON.stringify(report, null, 2)
        );
        
        // Print summary
        console.log('\n📋 SECURITY SCAN SUMMARY');
        console.log('========================');
        console.log(`Risk Level: ${report.summary.riskLevel}`);
        console.log(`Vulnerabilities: ${report.summary.totalVulnerabilities}`);
        console.log(`Warnings: ${report.summary.totalWarnings}`);
        
        if (report.vulnerabilities.length > 0) {
            console.log('\n🚨 HIGH PRIORITY VULNERABILITIES:');
            report.vulnerabilities
                .filter(v => v.severity === 'high')
                .slice(0, 5)
                .forEach(vuln => {
                    console.log(`  • ${vuln.type} in ${vuln.file}:${vuln.line}`);
                    console.log(`    ${vuln.message}`);
                });
        }
        
        console.log('\n💡 TOP RECOMMENDATIONS:');
        report.recommendations.slice(0, 5).forEach((rec, i) => {
            console.log(`  ${i + 1}. ${rec}`);
        });
        
        console.log('\n📄 Full report saved to: security-report.json');
        
        // Exit with appropriate code
        const exitCode = report.summary.riskLevel === 'CRITICAL' ? 1 : 0;
        process.exit(exitCode);
        
    } catch (error) {
        console.error('❌ Security scan failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { SecurityScanner };