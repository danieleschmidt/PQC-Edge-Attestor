# Getting Started with PQC-Edge-Attestor

## Overview

PQC-Edge-Attestor provides quantum-resistant security for IoT edge devices in critical infrastructure. This guide will help you get started with integrating the framework into your smart meters, EV chargers, or other IoT devices.

## Prerequisites

### Hardware Requirements
- ARM Cortex-M4/M33 or RISC-V microcontroller
- Minimum 128KB RAM, 512KB Flash
- TPM 2.0 or secure element for hardware root of trust
- Network connectivity (Ethernet, Wi-Fi, or cellular)

### Software Requirements
- ARM GNU Toolchain 12.2+
- CMake 3.25+
- Python 3.9+ (for provisioning tools)
- OpenOCD or J-Link (for firmware flashing)

## Quick Start

### 1. Clone and Setup

```bash
git clone https://github.com/terragonlabs/PQC-Edge-Attestor
cd PQC-Edge-Attestor

# Install dependencies
pip install -r requirements.txt
npm install

# Configure for your target platform
./configure.sh --platform stm32l5 --pqc-level 5
```

### 2. Build Firmware

```bash
mkdir build && cd build
cmake .. -DCMAKE_TOOLCHAIN_FILE=../cmake/arm-none-eabi.cmake
make -j8
```

### 3. Flash to Device

```bash
# Using OpenOCD
make flash

# Or using J-Link
make flash-jlink
```

### 4. Provision Device

```python
from pqc_attestor import DeviceProvisioner

provisioner = DeviceProvisioner(
    backend_url="https://your-backend.example.com",
    root_ca_cert="certs/root-ca-pqc.pem"
)

device_id = provisioner.provision_device(
    serial_port="/dev/ttyUSB0",
    device_type="smart_meter",
    algorithms={
        "kem": "kyber1024",
        "signature": "dilithium5"
    }
)
```

## Platform-Specific Guides

### STM32L5 Security Microcontroller

The STM32L5 provides hardware security features ideal for PQC-Edge-Attestor:

```bash
# Configure for STM32L5
./configure.sh --platform stm32l5 --use-trustzone

# Enable hardware acceleration
cmake .. -DENABLE_CRYPTO_ACCEL=ON -DUSE_STM32_PKA=ON
```

**Hardware Features**:
- ARM TrustZone for secure/non-secure separation
- Hardware random number generator
- Public key accelerator (PKA) for cryptographic operations
- Secure boot with immutable bootloader

### nRF9160 Cellular IoT

For cellular IoT deployments with the nRF9160:

```bash
# Configure for nRF9160
./configure.sh --platform nrf9160 --connectivity cellular

# Build with modem integration
cmake .. -DENABLE_LTE_MODEM=ON -DUSE_BSD_SOCKETS=ON
```

**Features**:
- Integrated LTE-M/NB-IoT modem
- ARM CryptoCell-310 for hardware crypto
- Secure Processing Unit (SPU) for isolation
- Low power operation for battery devices

### Generic ARM Cortex-M

For other ARM Cortex-M platforms:

```bash
# Configure for generic ARM
./configure.sh --platform cortex-m4 --mcu-family custom

# Specify your MCU details
cmake .. -DMCU_FAMILY=custom -DCPU_TYPE=cortex-m4
```

## Configuration Options

### Security Levels

| Level | Algorithms | Security | Performance | Memory |
|-------|------------|----------|-------------|---------|
| 3 | Kyber-768, Dilithium-3 | 192-bit | Fast | 96KB |
| 5 | Kyber-1024, Dilithium-5 | 256-bit | Slower | 128KB |

### Hybrid Mode

During transition period, enable hybrid classical + PQC:

```c
pqc_config_t config = {
    .mode = PQC_HYBRID_MODE,
    .classical_kem = PQC_ECDH_P384,
    .pqc_kem = PQC_KYBER_1024,
    .classical_sig = PQC_ECDSA_P384,
    .pqc_sig = PQC_DILITHIUM_5
};
```

## Integration Examples

### Device Attestation

```c
#include "pqc_attestor.h"

void perform_attestation(void) {
    attestation_report_t report;
    pqc_result_t result;
    
    // Collect platform measurements
    result = pqc_collect_measurements(&report);
    if (result != PQC_SUCCESS) {
        log_error("Failed to collect measurements");
        return;
    }
    
    // Sign with device key
    result = pqc_sign_report(&report, &device_keypair);
    if (result != PQC_SUCCESS) {
        log_error("Failed to sign attestation report");
        return;
    }
    
    // Send to backend
    network_send_attestation(&report);
}
```

### Key Exchange

```c
void establish_session_key(void) {
    kyber_ciphertext_t ciphertext;
    uint8_t shared_secret[KYBER_SHARED_SECRET_BYTES];
    
    // Perform Kyber key encapsulation
    pqc_result_t result = kyber_encapsulate(
        &ciphertext, 
        shared_secret, 
        &server_public_key
    );
    
    if (result == PQC_SUCCESS) {
        // Derive session keys from shared secret
        derive_session_keys(shared_secret);
    }
}
```

### Firmware Update

```c
bool verify_firmware_update(const uint8_t *firmware, size_t len) {
    falcon_signature_t signature;
    
    // Extract signature from firmware package
    extract_signature(firmware, &signature);
    
    // Verify with trusted public key
    pqc_result_t result = falcon_verify(
        firmware, 
        len - FALCON_SIGNATURE_BYTES,
        &signature,
        &trusted_pubkey
    );
    
    return (result == PQC_SUCCESS);
}
```

## Backend Setup

### Attestation Server

```python
from pqc_attestor.server import AttestationServer

server = AttestationServer(
    ca_certs_path="certs/",
    policies_path="policies/",
    hsm_config="config/hsm.yaml"
)

@server.route('/api/v1/attest', methods=['POST'])
def verify_attestation():
    report = request.get_json()
    result = server.verify_report(report)
    
    return {
        'valid': result.is_valid,
        'trust_level': result.trust_level,
        'policies_met': result.policies_met
    }
```

### Key Management

```python
from pqc_attestor.keymanager import QuantumSafeHSM

hsm = QuantumSafeHSM(
    provider="pkcs11",
    library_path="/usr/lib/libpkcs11.so"
)

# Generate device keypair
device_keypair = hsm.generate_keypair(
    algorithm="dilithium5",
    key_usage=["digital_signature", "key_agreement"]
)

# Issue device certificate
cert = hsm.issue_certificate(
    subject="CN=SmartMeter001,O=Utility Corp",
    public_key=device_keypair.public_key,
    validity_days=3650
)
```

## Testing and Validation

### Unit Tests

```bash
# Run crypto tests
cd tests && ./run_tests.sh --suite crypto

# Hardware-in-loop tests
./run_tests.sh --suite hil --device /dev/ttyUSB0
```

### Performance Benchmarks

```bash
# Benchmark crypto operations
./benchmark.sh --platform stm32l5 --iterations 1000

# Memory usage analysis
./analyze_memory.sh --build-dir build/
```

### Security Validation

```bash
# Side-channel analysis
python tools/side_channel_test.py --device /dev/ttyUSB0

# Compliance checking
pqc-compliance --standard nist-pqc --device-config device.yaml
```

## Troubleshooting

### Common Issues

**Build Errors**:
```bash
# Missing toolchain
sudo apt-get install gcc-arm-none-eabi

# CMake configuration issues
rm -rf build/ && mkdir build && cd build
```

**Flashing Issues**:
```bash
# Permission denied
sudo usermod -a -G dialout $USER

# Wrong OpenOCD config
openocd -f interface/stlink.cfg -f target/stm32l5x.cfg
```

**Runtime Errors**:
```bash
# Enable debug logging
export PQC_LOG_LEVEL=DEBUG

# Check hardware connections
./tools/hardware_check.py --port /dev/ttyUSB0
```

## Next Steps

1. **Read the [Architecture Guide](../ARCHITECTURE.md)**
2. **Review [Security Best Practices](security-best-practices.md)**
3. **Explore [Example Applications](../examples/)**
4. **Join the [Community Discussions](https://github.com/terragonlabs/PQC-Edge-Attestor/discussions)**

## Support

- **Documentation**: https://docs.terragonlabs.com/pqc-edge-attestor
- **Community**: https://github.com/terragonlabs/PQC-Edge-Attestor/discussions
- **Issues**: https://github.com/terragonlabs/PQC-Edge-Attestor/issues
- **Email**: support@terragonlabs.com