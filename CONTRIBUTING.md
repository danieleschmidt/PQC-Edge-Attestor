# Contributing to PQC-Edge-Attestor

Thank you for your interest in contributing to the PQC-Edge-Attestor project! This framework is critical for securing IoT infrastructure against quantum threats.

## Security First Development

**⚠️ CRITICAL: This project implements cryptographic security for critical infrastructure. All contributions must undergo rigorous security review.**

### Security Guidelines

1. **No Security Vulnerabilities**: Never introduce code that could compromise device security
2. **Constant-Time Operations**: All cryptographic operations must be constant-time to prevent side-channel attacks
3. **Memory Safety**: Prevent buffer overflows, use-after-free, and other memory safety issues
4. **Input Validation**: Validate all inputs, especially from untrusted sources
5. **Secrets Management**: Never commit private keys, passwords, or sensitive configuration

## Development Workflow

### Prerequisites

- ARM GNU Toolchain 12.2+
- CMake 3.25+
- Python 3.9+ (for tools and testing)
- Node.js 18+ (for backend services)
- Docker and Docker Compose

### Setting Up Development Environment

```bash
# Clone the repository
git clone https://github.com/your-org/PQC-Edge-Attestor
cd PQC-Edge-Attestor

# Install dependencies
npm install

# Set up development container (recommended)
code .devcontainer

# Or install native dependencies
./scripts/install-deps.sh
```

### Making Changes

1. **Fork the Repository**
   ```bash
   gh repo fork your-org/PQC-Edge-Attestor
   ```

2. **Create Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Implement Changes**
   - Follow coding standards below
   - Add comprehensive tests
   - Update documentation

4. **Run Tests Locally**
   ```bash
   npm test
   npm run test:security
   npm run test:hardware
   ```

5. **Submit Pull Request**
   - Use descriptive commit messages
   - Reference related issues
   - Ensure CI passes

## Coding Standards

### C/C++ (Embedded Code)

```c
// Use secure coding practices
void secure_memzero(void *ptr, size_t len) {
    volatile uint8_t *p = ptr;
    while (len--) *p++ = 0;
}

// Constant-time comparison
int secure_compare(const uint8_t *a, const uint8_t *b, size_t len) {
    uint8_t result = 0;
    for (size_t i = 0; i < len; i++) {
        result |= a[i] ^ b[i];
    }
    return result == 0 ? 0 : -1;
}
```

### JavaScript/Node.js (Backend Services)

```javascript
// Use async/await with proper error handling
async function verifyAttestation(report) {
    try {
        validateInput(report);
        const result = await crypto.verify(report);
        return result;
    } catch (error) {
        logger.error('Attestation verification failed', { error, reportId: report.id });
        throw new AttestationError('Verification failed');
    }
}
```

### Documentation Standards

- All public APIs must have JSDoc/Doxygen comments
- Include usage examples for complex functions
- Document security considerations
- Explain cryptographic parameters and choices

## Testing Requirements

### Unit Tests
```bash
# Run unit tests for crypto functions
npm run test:crypto

# Test specific algorithms
npm run test:kyber
npm run test:dilithium
npm run test:falcon
```

### Integration Tests
```bash
# Hardware-in-loop testing
npm run test:hil

# End-to-end attestation flow
npm run test:e2e
```

### Security Testing
```bash
# Side-channel analysis
npm run test:sidechannel

# Fuzzing tests
npm run test:fuzz

# Static analysis
npm run test:static
```

## Code Review Process

### Automated Checks
- ✅ All tests pass
- ✅ Code coverage > 90%
- ✅ No security vulnerabilities detected
- ✅ Performance benchmarks within limits
- ✅ Documentation updated

### Security Review Requirements

**For Cryptographic Code:**
- Two independent security engineer reviews
- Side-channel analysis report
- Formal verification (where applicable)
- Comparison against reference implementations

**For Critical Infrastructure Code:**
- Security architect approval
- Threat model review
- Failure mode analysis

## Issue Reporting

### Bug Reports

Use the bug report template and include:
- Device information (hardware, firmware version)
- Reproduction steps
- Expected vs actual behavior
- Logs and error messages
- Security impact assessment

### Security Vulnerabilities

**🔒 PRIVATE DISCLOSURE REQUIRED**

Email security issues to: security@example.com (PGP: 0xDEADBEEF)

Do not open public issues for security vulnerabilities.

### Feature Requests

- Clearly describe the use case
- Explain security implications
- Consider backward compatibility
- Provide implementation suggestions

## Architecture Decision Records (ADRs)

For significant changes, create an ADR in `docs/adr/`:

```
docs/adr/NNNN-your-decision-title.md
```

Template:
```markdown
# ADR-NNNN: Your Decision Title

## Status
Proposed | Accepted | Deprecated | Superseded

## Context
Describe the forces at play and the environment.

## Decision
State the decision clearly.

## Consequences
What becomes easier or more difficult.
```

## Release Process

### Version Numbering
We follow semantic versioning with security considerations:
- MAJOR: Breaking changes or major security updates
- MINOR: New features, backward compatible
- PATCH: Bug fixes, security patches

### Release Criteria
- All tests pass on target hardware
- Security audit completed
- Documentation updated
- Performance benchmarks verified
- Backward compatibility maintained (except MAJOR releases)

## Hardware Testing

### Supported Platforms
- STM32L5 Discovery Kit
- Nordic nRF9160DK
- NXP i.MX RT1170 EVK
- Custom smart meter hardware
- EV charger test platforms

### Test Procedures
1. Flash firmware to device
2. Run attestation test suite
3. Measure performance metrics
4. Verify power consumption
5. Test OTA update process

## Community Guidelines

### Code of Conduct
We follow the [Contributor Covenant](CODE_OF_CONDUCT.md).

### Communication Channels
- GitHub Discussions: General questions and design discussions
- GitHub Issues: Bug reports and feature requests
- Security Email: Private security disclosures only

### Getting Help
- Check existing documentation
- Search closed issues
- Ask in GitHub Discussions
- Attend monthly community calls (details in calendar)

## Legal Considerations

### Export Control
This project implements cryptographic software. Ensure compliance with your local export control regulations.

### Patent Policy
Contributors grant patent licenses for their contributions. See LICENSE file for details.

### Certificate of Origin
All commits must include a Signed-off-by line:
```bash
git commit -s -m "Your commit message"
```

## Recognition

Contributors are recognized in:
- CONTRIBUTORS.md file
- Release notes
- Annual security report
- Conference presentations

Thank you for helping secure critical infrastructure against quantum threats!