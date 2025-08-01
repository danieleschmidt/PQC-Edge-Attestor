# ADR-0001: Post-Quantum Cryptographic Algorithm Selection

## Status

Accepted

## Context

The PQC-Edge-Attestor framework requires selection of post-quantum cryptographic algorithms to provide quantum-resistant security for IoT edge devices. The selection must balance security, performance, and standardization while considering the resource constraints of embedded systems.

NIST has standardized several post-quantum algorithms through its PQC standardization process:
- **ML-KEM** (Module-Lattice-Based Key Encapsulation Mechanism) - formerly Kyber
- **ML-DSA** (Module-Lattice-Based Digital Signature Algorithm) - formerly Dilithium  
- **SLH-DSA** (Stateless Hash-Based Digital Signature Algorithm) - formerly SPHINCS+

Additionally, Falcon (lattice-based signatures) remains under consideration for future standardization.

## Decision

We will implement a hybrid approach using the following algorithms:

### Primary Post-Quantum Algorithms
- **Key Encapsulation**: Kyber-1024 (transitioning to ML-KEM when available)
- **Digital Signatures**: Dilithium-5 (transitioning to ML-DSA when available)
- **Alternative Signatures**: Falcon-1024 (for size-constrained scenarios)

### Hybrid Classical Support
During the transition period, we will support hybrid modes:
- **ECDH P-384 + Kyber-1024** for key exchange
- **ECDSA P-384 + Dilithium-5** for signatures

### Algorithm Agility
The framework will support runtime algorithm selection to enable:
- Gradual migration from classical to post-quantum
- Algorithm updates as standards evolve
- Device-specific optimization based on capabilities

## Consequences

### Positive
- **Standards Alignment**: Using NIST-standardized algorithms ensures regulatory compliance
- **Security**: Provides quantum-resistant security at NIST Level 5
- **Flexibility**: Hybrid mode supports gradual transition and interoperability
- **Future-Proof**: Algorithm agility enables adaptation to evolving standards

### Negative
- **Performance Impact**: PQC algorithms have larger key sizes and computational overhead
- **Memory Usage**: Increased RAM and flash requirements for cryptographic operations
- **Implementation Complexity**: Supporting multiple algorithms increases codebase complexity
- **Battery Life**: Higher computational requirements may impact battery-powered devices

### Neutral
- **Migration Path**: Clear roadmap from classical to post-quantum cryptography
- **Standardization**: Alignment with industry best practices and NIST recommendations

## Alternatives Considered

### SPHINCS+ Only
- **Pros**: Hash-based signatures are well-understood and conservative
- **Cons**: Very large signature sizes (17KB+) unsuitable for constrained devices

### SIKE (Supersingular Isogeny)
- **Pros**: Smallest key sizes among PQC algorithms
- **Cons**: Broken by classical attacks in 2022, removed from consideration

### Classic McEliece
- **Pros**: Conservative code-based approach with long security history
- **Cons**: Extremely large public keys (1MB+) impractical for IoT devices

### NewHope (early Kyber variant)
- **Pros**: Earlier adoption possible
- **Cons**: Not standardized by NIST, superseded by Kyber/ML-KEM

## Implementation Notes

### Algorithm Parameters
```c
// Kyber-1024 (NIST Level 5)
#define KYBER_PUBLICKEYBYTES  1568
#define KYBER_SECRETKEYBYTES  3168  
#define KYBER_CIPHERTEXTBYTES 1568
#define KYBER_SSBYTES         32

// Dilithium-5 (NIST Level 5)  
#define DILITHIUM_PUBLICKEYBYTES  2592
#define DILITHIUM_SECRETKEYBYTES  4864
#define DILITHIUM_SIGNATUREBYTES  4595

// Falcon-1024 (Compact alternative)
#define FALCON_PUBLICKEYBYTES     1793
#define FALCON_SECRETKEYBYTES     2305
#define FALCON_SIGNATUREBYTES     1330
```

### Performance Targets
- **Key Generation**: < 100ms on Cortex-M4 @ 100MHz
- **Signature Generation**: < 50ms including random number generation
- **Signature Verification**: < 20ms for attestation validation
- **Key Exchange**: < 10ms for session establishment

### Migration Timeline
- **Phase 1 (2025)**: Hybrid classical + PQC support
- **Phase 2 (2026)**: PQC-primary with classical fallback
- **Phase 3 (2027)**: PQC-only deployment for new devices
- **Phase 4 (2030)**: Classical algorithm sunset

## Related Decisions

- ADR-0002: Hardware Security Module Integration
- ADR-0003: Device Attestation Protocol Design
- ADR-0004: Over-the-Air Update Security Model

## Date

2025-08-01

## Authors

- Daniel Schmidt <daniel@terragonlabs.com>
- PQC Architecture Team <pqc-team@terragonlabs.com>