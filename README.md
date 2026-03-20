# PQC-Edge-Attestor

Post-Quantum Cryptography (PQC) + Remote Attestation for IoT edge devices.

## Overview

This library implements:
- **Kyber-like KEM**: A simplified lattice-based key encapsulation mechanism using polynomial arithmetic over Z_q[x]/(x^n+1). Correctly documented as a **demonstration implementation** — for production use [liboqs](https://github.com/open-quantum-safe/liboqs).
- **TPM-style Attestation**: Device generates nonce, signs firmware+platform state, remote verifier checks signature and firmware integrity.
- **FastAPI service**: `/attest` and `/verify` REST endpoints.

## Usage

```python
from pqc_edge.kyber import KyberKEM
from pqc_edge.attestation import DeviceAttestor, RemoteVerifier

# Key encapsulation
kem = KyberKEM()
keypair, A = kem.keygen()
ciphertext, shared_secret = kem.encapsulate(keypair.public_key, A)
recovered = kem.decapsulate(ciphertext, keypair.secret_key)

# Attestation
attestor = DeviceAttestor("iot-device-001", b"firmware-v1.2.3")
nonce = attestor.generate_nonce()
report = attestor.sign_report(nonce)

verifier = RemoteVerifier()
result = verifier.verify_report(report, attestor.firmware_hash, attestor._secret_key)
print(result.valid)  # True
```

## Run API

```bash
pip install -r requirements.txt
uvicorn pqc_edge.api:app --reload
```

## Tests

```bash
pytest tests/ -v
```

## ⚠️ Security Notice

The Kyber implementation here is a simplified pedagogical demo using numpy polynomial arithmetic. It is **NOT cryptographically secure**. For production PQC, use NIST-approved implementations.
