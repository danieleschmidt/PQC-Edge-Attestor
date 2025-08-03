# PQC-Edge-Attestor Guides

This directory contains comprehensive guides for using, deploying, and maintaining the PQC-Edge-Attestor framework.

## Quick Start Guides

### For Developers
- [**Development Setup**](development-setup.md) - Set up your development environment
- [**Building from Source**](building-from-source.md) - Compile for different target platforms
- [**Running Tests**](running-tests.md) - Execute the test suite and verify functionality

### For System Integrators
- [**Device Integration**](device-integration.md) - Integrate PQC-Edge-Attestor with your hardware
- [**Network Configuration**](network-configuration.md) - Configure CoAP/MQTT with PQC extensions
- [**Backend Deployment**](backend-deployment.md) - Deploy attestation and key management services

### For Operations Teams
- [**Production Deployment**](production-deployment.md) - Deploy in production environments
- [**Monitoring and Alerting**](monitoring-alerting.md) - Set up comprehensive monitoring
- [**Incident Response**](incident-response.md) - Handle security incidents and failures

## Platform-Specific Guides

### Smart Meters
- [**Landis+Gyr E450 Integration**](smart-meters/landis-gyr-e450.md)
- [**Itron OpenWay Integration**](smart-meters/itron-openway.md)
- [**Generic Smart Meter Setup**](smart-meters/generic-setup.md)

### EV Chargers
- [**ABB Terra AC Integration**](ev-chargers/abb-terra-ac.md)
- [**Schneider EVlink Integration**](ev-chargers/schneider-evlink.md)
- [**OCPP 2.0.1 PQC Extensions**](ev-chargers/ocpp-pqc-extensions.md)

### Development Boards
- [**STM32L5 Discovery Kit**](dev-boards/stm32l5-discovery.md)
- [**Nordic nRF9160DK**](dev-boards/nordic-nrf9160dk.md)
- [**NXP i.MX RT1170 EVK**](dev-boards/nxp-imx-rt1170.md)

## Security Guides

### Cryptographic Implementation
- [**Post-Quantum Algorithms**](security/pqc-algorithms.md) - Understanding Kyber, Dilithium, and Falcon
- [**Key Management**](security/key-management.md) - Secure key generation, storage, and rotation
- [**Side-Channel Mitigation**](security/side-channel-mitigation.md) - Protecting against timing and power analysis
- [**Hardware Security Modules**](security/hsm-integration.md) - Integrating with quantum-safe HSMs

### Device Security
- [**Secure Boot Chain**](security/secure-boot.md) - Implementing quantum-resistant secure boot
- [**TPM 2.0 Integration**](security/tpm-integration.md) - Using TPM for attestation and key storage
- [**Remote Attestation**](security/remote-attestation.md) - Verifying device integrity remotely
- [**OTA Security**](security/ota-security.md) - Secure over-the-air firmware updates

### Network Security
- [**TLS 1.3 with PQC**](security/tls-pqc.md) - Configuring quantum-safe TLS
- [**CoAP Security**](security/coap-security.md) - Securing CoAP with post-quantum cryptography
- [**MQTT Security**](security/mqtt-security.md) - Quantum-safe MQTT implementations

## Migration Guides

### From Classical Cryptography
- [**ECDSA to Dilithium Migration**](migration/ecdsa-to-dilithium.md)
- [**ECDH to Kyber Migration**](migration/ecdh-to-kyber.md)
- [**RSA to Falcon Migration**](migration/rsa-to-falcon.md)
- [**Hybrid Mode Operation**](migration/hybrid-mode.md)

### Hardware Platform Migration
- [**ARM Cortex-M Migration**](migration/arm-cortex-m.md)
- [**RISC-V Platform Support**](migration/riscv-support.md)
- [**Legacy Hardware Compatibility**](migration/legacy-compatibility.md)

## Troubleshooting Guides

### Common Issues
- [**Attestation Failures**](troubleshooting/attestation-failures.md)
- [**Performance Issues**](troubleshooting/performance-issues.md)
- [**Memory Constraints**](troubleshooting/memory-constraints.md)
- [**Network Connectivity**](troubleshooting/network-connectivity.md)

### Debugging Tools
- [**Debug Console**](troubleshooting/debug-console.md)
- [**Log Analysis**](troubleshooting/log-analysis.md)
- [**Hardware Debugging**](troubleshooting/hardware-debugging.md)
- [**Cryptographic Verification**](troubleshooting/crypto-verification.md)

## Compliance and Certification

### Standards Compliance
- [**NIST Post-Quantum Standards**](compliance/nist-pqc-standards.md)
- [**GSMA IoT SAFE**](compliance/gsma-iot-safe.md)
- [**IEEE 2030.5 Smart Energy**](compliance/ieee-2030-5.md)
- [**IEC 62351 Power Systems Security**](compliance/iec-62351.md)

### Certification Guides
- [**Common Criteria Evaluation**](compliance/common-criteria.md)
- [**FIPS 140-2 Certification**](compliance/fips-140-2.md)
- [**UL 2089 IoT Security**](compliance/ul-2089.md)
- [**Regulatory Compliance**](compliance/regulatory-compliance.md)

## API Documentation

### Device Management API
- [**REST API Reference**](api/rest-api-reference.md)
- [**GraphQL Schema**](api/graphql-schema.md)
- [**WebSocket Events**](api/websocket-events.md)

### SDK and Libraries
- [**JavaScript SDK**](api/javascript-sdk.md)
- [**Python SDK**](api/python-sdk.md)
- [**C/C++ Library**](api/c-cpp-library.md)
- [**Go Module**](api/go-module.md)

## Performance and Optimization

### Benchmarking
- [**Performance Benchmarks**](performance/benchmarks.md)
- [**Memory Usage Analysis**](performance/memory-analysis.md)
- [**Power Consumption**](performance/power-consumption.md)
- [**Throughput Optimization**](performance/throughput-optimization.md)

### Tuning Guides
- [**Algorithm Parameter Tuning**](performance/algorithm-tuning.md)
- [**Hardware Acceleration**](performance/hardware-acceleration.md)
- [**Compiler Optimizations**](performance/compiler-optimizations.md)
- [**Resource Pooling**](performance/resource-pooling.md)

## Advanced Topics

### Research and Development
- [**Quantum Computing Threat Assessment**](advanced/quantum-threat-assessment.md)
- [**Algorithm Agility Implementation**](advanced/algorithm-agility.md)
- [**Formal Verification**](advanced/formal-verification.md)
- [**Zero-Knowledge Attestation**](advanced/zero-knowledge-attestation.md)

### Integration Patterns
- [**Microservices Architecture**](advanced/microservices-architecture.md)
- [**Event-Driven Design**](advanced/event-driven-design.md)
- [**Multi-Tenant Deployment**](advanced/multi-tenant-deployment.md)
- [**Edge Computing Integration**](advanced/edge-computing.md)

## Community Resources

### Getting Help
- [**FAQ**](community/faq.md) - Frequently asked questions
- [**Community Forum**](community/forum.md) - Discussion and support
- [**Office Hours**](community/office-hours.md) - Weekly developer sessions
- [**Training Programs**](community/training.md) - Certification and education

### Contributing
- [**Writing Documentation**](community/writing-docs.md)
- [**Testing Guidelines**](community/testing-guidelines.md)
- [**Code Review Process**](community/code-review.md)
- [**Security Research**](community/security-research.md)

## Document Maintenance

This documentation is actively maintained by the PQC-Edge-Attestor team. 

**Last Updated**: August 2025  
**Review Cycle**: Monthly  
**Feedback**: Create an issue or discussion on GitHub

For urgent documentation issues or security-related concerns, contact: docs@example.com