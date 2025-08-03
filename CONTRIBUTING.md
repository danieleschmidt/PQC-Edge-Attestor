# Contributing to PQC-Edge-Attestor

Thank you for your interest in contributing to PQC-Edge-Attestor! This project aims to provide quantum-resistant security for critical IoT infrastructure.

## Security First

This is a security-critical project. All contributions must follow strict security guidelines:

- **Security Reviews**: All cryptographic code requires review by qualified security experts
- **No Malicious Code**: Any contribution containing malicious, backdoored, or intentionally vulnerable code will be rejected immediately
- **Vulnerability Disclosure**: Report security issues privately to security@terragonlabs.com

## Development Guidelines

### Prerequisites

- ARM GNU Toolchain 12.2+
- CMake 3.25+
- Python 3.9+
- Node.js 18+ (for documentation and tools)

### Setting Up Development Environment

```bash
git clone https://github.com/terragonlabs/PQC-Edge-Attestor
cd PQC-Edge-Attestor

# Install development dependencies
npm install

# Setup development container (recommended)
code .devcontainer
```

### Code Standards

#### Cryptographic Implementation
- **Constant-Time**: All cryptographic operations must be constant-time
- **Side-Channel Resistance**: Implement DPA/SPA mitigations
- **Memory Safety**: Use safe memory management, zero sensitive data
- **NIST Compliance**: Follow NIST PQC implementation guidelines

#### Code Quality
- **Static Analysis**: Code must pass all static analysis checks
- **Test Coverage**: Minimum 90% test coverage for new code
- **Documentation**: All public APIs must be documented
- **Error Handling**: Comprehensive error handling and logging

### Contribution Process

1. **Fork and Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Changes**
   - Follow existing code style and patterns
   - Add tests for new functionality
   - Update documentation as needed

3. **Test Thoroughly**
   ```bash
   # Run full test suite
   npm test
   
   # Hardware-in-loop tests (if available)
   npm run test:hil
   
   # Security validation
   npm run test:security
   ```

4. **Submit Pull Request**
   - Clear description of changes and motivation
   - Reference any related issues
   - Include test results and validation steps

### Code Review Process

All contributions go through multiple review stages:

1. **Automated Checks**: CI/CD pipeline validation
2. **Code Review**: Peer review by maintainers
3. **Security Review**: Cryptographic and security expert review
4. **Hardware Testing**: Hardware-in-loop validation (for hardware changes)

### Types of Contributions

#### High Priority
- Bug fixes in cryptographic implementations
- Performance optimizations for embedded platforms
- Hardware platform support additions
- Security vulnerability fixes

#### Medium Priority
- Documentation improvements
- Testing framework enhancements
- Developer tooling improvements
- Example applications

#### Specialized Areas

**Cryptography**
- Must have demonstrated expertise in post-quantum cryptography
- Knowledge of side-channel attack mitigations
- Experience with embedded cryptographic implementations

**Hardware Integration**
- Experience with ARM Cortex-M/RISC-V platforms
- TPM/TEE integration experience
- Hardware security module integration

**Standards Compliance**
- Knowledge of NIST PQC standards
- GSMA IoT SAFE expertise
- Grid/EV charging protocol experience

## Licensing

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.

## Community

- **Discussions**: Use GitHub Discussions for general questions
- **Issues**: Use GitHub Issues for bug reports and feature requests
- **Security**: Email security@terragonlabs.com for security issues
- **Standards**: Join our technical advisory board for standards work

## Recognition

Contributors are recognized in:
- CHANGELOG.md for each release
- Annual contributor acknowledgments
- Conference presentations and papers
- Standards submissions

## Questions?

- Read the [Architecture Documentation](ARCHITECTURE.md)
- Check [Frequently Asked Questions](docs/FAQ.md)
- Join our community discussions
- Contact the maintainers at dev@terragonlabs.com

Thank you for helping secure the future of IoT infrastructure!