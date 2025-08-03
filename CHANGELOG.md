# Changelog

All notable changes to the PQC-Edge-Attestor project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial project foundation and documentation
- Core PQC cryptographic engine implementation
- Device attestation framework
- OTA update system with quantum-safe signatures
- REST API for device and attestation management
- Comprehensive test suite with hardware-in-loop testing
- Development environment with containerized toolchain
- CI/CD pipeline with security scanning
- Performance benchmarking and optimization tools

### Security
- Implementation of NIST Level 5 post-quantum cryptography
- Constant-time cryptographic operations to prevent side-channel attacks
- Hardware-based root of trust with TPM 2.0 integration
- Secure boot chain with quantum-resistant signatures
- End-to-end encrypted communication protocols
- Input validation and sanitization across all endpoints
- Comprehensive security testing and fuzzing

## [1.0.0-alpha.1] - 2025-08-03

### Added
- Project charter and architecture documentation
- Initial ADR (Architecture Decision Records) framework
- Community guidelines and contribution standards
- Basic project structure and development tooling

### Security
- Established security-first development practices
- Created security vulnerability disclosure process
- Implemented code review requirements for cryptographic components

---

## Release Types

### Security Releases
Security releases contain fixes for security vulnerabilities and are marked with a `🔒` icon. These releases should be deployed immediately.

### Feature Releases  
Feature releases add new functionality while maintaining backward compatibility (minor version bumps).

### Breaking Changes
Breaking changes are reserved for major version bumps and will include a comprehensive migration guide.

## Migration Guides

### Upgrading from Classical Cryptography
See [docs/guides/migration-from-classical.md](docs/guides/migration-from-classical.md) for detailed steps to migrate from ECDSA/RSA to post-quantum signatures.

### Hardware Platform Migration
Platform-specific migration guides are available in:
- [docs/guides/stm32-migration.md](docs/guides/stm32-migration.md)
- [docs/guides/nordic-migration.md](docs/guides/nordic-migration.md)
- [docs/guides/nxp-migration.md](docs/guides/nxp-migration.md)

## Security Advisories

Security advisories are published at:
- GitHub Security Advisories
- Project security mailing list
- vendor-specific security bulletins

## Support

### Supported Versions

| Version | Supported          | End of Life |
| ------- | ------------------ | ----------- |
| 1.x.x   | ✅ Active support  | TBD         |
| 0.x.x   | ⚠️ Security fixes only | 2026-01-01  |

### Security Updates
Security updates are provided for all supported versions. Critical vulnerabilities receive immediate patches.

### Long-Term Support (LTS)
LTS versions are designated every 18 months and receive extended support for critical infrastructure deployments.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on contributing to this project.

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.