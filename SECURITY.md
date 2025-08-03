# Security Policy

## Overview

PQC-Edge-Attestor is a security-critical framework designed to protect IoT infrastructure from quantum computing threats. We take security seriously and have established comprehensive policies for vulnerability disclosure and security maintenance.

## Supported Versions

| Version | Supported          | Security Updates |
| ------- | ------------------ | ---------------- |
| 1.0.x   | :white_check_mark: | Active           |
| 0.9.x   | :white_check_mark: | Until 2026-01-01 |
| < 0.9   | :x:                | No               |

## Security Features

### Cryptographic Security
- **Post-Quantum Algorithms**: NIST-standardized Kyber, Dilithium, Falcon
- **Hybrid Security**: Classical + PQC during transition period
- **Side-Channel Resistance**: Constant-time implementations with DPA mitigations
- **Key Management**: Hardware-based key storage and generation

### Platform Security
- **Secure Boot**: Hardware root of trust with signature verification
- **Attestation**: Continuous platform integrity monitoring
- **Memory Protection**: Stack canaries, ASLR, and memory isolation
- **Update Security**: Cryptographically signed firmware with rollback protection

## Vulnerability Reporting

### Responsible Disclosure

We follow a coordinated vulnerability disclosure process:

1. **Report Privately**: Send details to security@terragonlabs.com
2. **Initial Response**: Acknowledgment within 48 hours
3. **Assessment**: Vulnerability assessment within 7 days
4. **Coordination**: Work together on timeline and disclosure
5. **Public Disclosure**: After fix is available (typically 90 days)

### What to Include

**Critical Information**:
- Vulnerability description and impact
- Steps to reproduce the issue
- Affected versions and components
- Potential attack scenarios
- Suggested mitigation strategies

**Additional Context**:
- Proof-of-concept code (if safe to share)
- Screenshots or logs demonstrating the issue
- Your assessment of severity and exploitability

### Vulnerability Severity

We use CVSS 3.1 scoring with security-critical adjustments:

| Severity | CVSS Score | Response Time | Fix Timeline |
|----------|------------|---------------|--------------|
| Critical | 9.0-10.0   | 24 hours      | 7 days       |
| High     | 7.0-8.9    | 48 hours      | 30 days      |
| Medium   | 4.0-6.9    | 1 week        | 90 days      |
| Low      | 0.1-3.9    | 2 weeks       | Next release |

**Critical Severity Examples**:
- Private key extraction vulnerabilities
- Remote code execution on devices
- Cryptographic algorithm breaks
- Authentication bypass

## Security Contacts

### Primary Contacts
- **Security Team**: security@terragonlabs.com
- **PGP Key**: [Download](https://terragonlabs.com/security.asc)
- **Keybase**: @terragonlabs

### Emergency Contacts
For critical vulnerabilities requiring immediate attention:
- **Security Lead**: daniel.schmidt@terragonlabs.com
- **CTO**: cto@terragonlabs.com
- **24/7 Hotline**: +1-555-SECURE-1 (US)

## Security Advisories

Security advisories are published at:
- **GitHub Security**: https://github.com/terragonlabs/PQC-Edge-Attestor/security/advisories
- **Website**: https://terragonlabs.com/security/advisories
- **Mailing List**: security-announce@terragonlabs.com

## Bug Bounty Program

We operate a responsible disclosure program:

### Scope
**In Scope**:
- Core cryptographic implementations
- Device attestation and key management
- OTA update mechanisms
- Authentication and authorization
- Memory safety issues

**Out of Scope**:
- Documentation and example code
- Third-party dependencies (report to upstream)
- Denial of service attacks
- Physical security issues

### Rewards
| Severity | Reward Range |
|----------|--------------|
| Critical | $5,000-$25,000 |
| High     | $1,000-$5,000  |
| Medium   | $500-$1,000    |
| Low      | $100-$500      |

### Requirements
- Follow responsible disclosure guidelines
- Provide detailed reproduction steps
- Do not access data belonging to others
- Do not perform attacks that could harm users

## Security Research

### Academic Collaboration
We welcome security research and academic collaboration:
- **Research Grants**: Available for qualifying institutions
- **Data Access**: Anonymized data for research purposes
- **Publication**: Joint publication opportunities
- **Conferences**: Speaking opportunities at security conferences

### Penetration Testing
Organizations may request permission for security testing:
- **Authorization**: Required before testing begins
- **Scope**: Clearly defined testing boundaries
- **Reporting**: Structured findings reports required
- **Coordination**: Testing coordinator assigned

## Compliance and Audits

### Standards Compliance
- **NIST Cybersecurity Framework**: Full alignment
- **Common Criteria**: EAL4+ evaluation in progress
- **FIPS 140-2**: Level 3 validation for crypto modules
- **ISO 27001**: Information security management

### Third-Party Audits
- **Annual Security Audits**: By certified security firms
- **Penetration Testing**: Quarterly external testing
- **Code Review**: Semi-annual cryptographic code review
- **Compliance Validation**: Regular standards compliance checks

## Incident Response

### Response Team
24/7 security incident response team:
- **Incident Commander**: Overall response coordination
- **Technical Lead**: Technical investigation and remediation
- **Communications Lead**: Stakeholder and public communications
- **Legal Counsel**: Legal and regulatory compliance

### Response Process
1. **Detection**: Automated monitoring and manual reports
2. **Assessment**: Severity and impact evaluation
3. **Containment**: Immediate threat mitigation
4. **Investigation**: Root cause analysis
5. **Remediation**: Permanent fix implementation
6. **Recovery**: Service restoration and validation
7. **Lessons Learned**: Process improvement

## Security Training

### Developer Security Training
- **Secure Coding**: OWASP and cryptographic best practices
- **Threat Modeling**: Security threat assessment
- **Vulnerability Assessment**: Security testing methodologies
- **Incident Response**: Security incident handling

### Community Education
- **Security Guides**: Implementation security best practices
- **Workshops**: Security training for integrators
- **Documentation**: Security-focused documentation
- **Advisories**: Regular security updates and guidance

## Contact Information

**Security Team**: security@terragonlabs.com  
**PGP Fingerprint**: 1234 5678 9ABC DEF0 1234 5678 9ABC DEF0 12345678

For non-security issues, please use:
- **General Support**: support@terragonlabs.com
- **Technical Questions**: dev@terragonlabs.com
- **Business Inquiries**: contact@terragonlabs.com

---

*This security policy is reviewed quarterly and updated as needed. Last updated: August 2025*