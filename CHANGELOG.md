# Changelog

All notable changes to the PQC-Edge-Attestor project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial project foundation and architecture documentation
- Post-quantum cryptographic algorithm implementations
- Hardware attestation engine with TPM 2.0 support
- Device management and provisioning system
- OTA firmware update framework
- Comprehensive security hardening measures

### Security
- Implementation of NIST-standardized post-quantum algorithms
- Hardware-based device attestation
- Secure boot chain with cryptographic verification
- Quantum-safe firmware update mechanisms

## [1.0.0] - 2025-Q1 (Planned)

### Added
- Core PQC cryptographic engine (Kyber-1024, Dilithium-5, Falcon-1024)
- TPM 2.0 integration for hardware root of trust
- Platform measurement collection (PCRs 0-7)
- Attestation report generation and signing
- Basic certificate chain validation
- GSMA IoT SAFE profile compliance
- STM32L5, nRF9160, ARM Cortex-M4/M33 platform support

### Security
- NIST Level 5 quantum-resistant security
- Side-channel attack mitigations
- Constant-time cryptographic implementations
- Hardware-based secure key storage

## [1.1.0] - 2025-Q2 (Planned)

### Added
- Secure boot chain with Falcon-1024 signatures
- Anti-rollback protection for firmware updates
- Hardware security module (HSM) integration
- Certificate pinning and validation
- Device provisioning automation
- Bulk key generation and deployment

### Changed
- Performance optimizations for Cortex-M platforms
- Memory usage optimization (< 128KB RAM target)
- Power consumption optimization for battery devices

### Security
- Enhanced memory protection and isolation
- Improved secure storage mechanisms

## [1.5.0] - 2025-Q3 (Planned)

### Added
- Smart meter integration (Landis+Gyr E450, Itron OpenWay Riva)
- ANSI C12.22/C12.19 protocol extensions
- Advanced Metering Infrastructure (AMI) integration
- IEEE 2030.5 Smart Energy Profile 2.0 support
- DNP3 Secure Authentication v5 with PQC
- Mesh networking security (802.15.4g)

### Security
- NIST Cybersecurity Framework alignment
- NERC CIP compliance documentation
- IEC 62351 power system communication security

## [2.0.0] - 2025-Q4 (Planned)

### Added
- OCPP 2.0.1 with PQC security extensions
- EV charging station support (ABB Terra AC, Schneider EVlink)
- ISO 15118 Vehicle-to-Grid (V2G) communication
- Dynamic load balancing with PQC security
- Vehicle-to-Grid bidirectional charging support

### Security
- Payment Card Industry (PCI) compliance
- Enhanced grid integration security protocols

## [2.5.0] - 2026-Q1 (Planned)

### Added
- Multi-tenant backend architecture
- Horizontal scaling to 10M+ devices
- Runtime application measurement
- Continuous integrity monitoring
- Cloud integration (AWS IoT Core, Azure IoT Hub, Google Cloud IoT)

### Changed
- Enhanced scalability and performance optimizations
- Behavioral anomaly detection with machine learning

## [3.0.0] - 2026-Q2 (Planned)

### Added
- ML-KEM (FIPS 203) migration from Kyber
- ML-DSA (FIPS 204) migration from Dilithium
- SLH-DSA integration for stateless signatures
- Stateful hash-based signatures (XMSS/LMS)
- Hardware acceleration support

### Changed
- Migration to next-generation NIST PQC standards
- Enhanced algorithm agility framework

### Security
- Quantum-safe TLS 1.3 cipher suites
- Advanced cryptographic protocol implementations

---

## Security Advisories

### Critical Security Updates
All critical security updates are documented here with CVE identifiers when applicable.

### Vulnerability Disclosure
Security vulnerabilities are disclosed through our responsible disclosure process. See [SECURITY.md](SECURITY.md) for details.

---

## Release Notes

### Version Numbering
- **Major versions** (x.0.0): Breaking changes, major new features
- **Minor versions** (x.y.0): New features, backward compatible
- **Patch versions** (x.y.z): Bug fixes, security updates

### Support Policy
- **Current major version**: Full support with security updates
- **Previous major version**: Security updates for 24 months
- **Older versions**: Critical security updates only

### Migration Guides
Migration guides are provided for all major version upgrades:
- [Migration to v2.0](docs/migration/v1-to-v2.md) (Planned)
- [Migration to v3.0](docs/migration/v2-to-v3.md) (Planned)

---

*For detailed information about each release, see the corresponding release notes and documentation.*