"""
TPM-style Remote Attestation for IoT Edge Devices.
Simulates a trust chain: device nonce → sign with device key → verifier checks.
"""
import hashlib
import hmac
import os
import time
import json
from dataclasses import dataclass, asdict, field
from typing import Optional
from pqc_edge.kyber import KyberKEM

@dataclass
class DeviceIdentity:
    device_id: str
    firmware_hash: str
    platform_config: dict = field(default_factory=dict)

@dataclass
class AttestationNonce:
    value: bytes
    timestamp: float
    device_id: str

@dataclass
class AttestationReport:
    device_id: str
    nonce_hex: str
    firmware_hash: str
    platform_config: dict
    signature_hex: str
    timestamp: float
    encapsulated_key_hex: str = ""

@dataclass
class VerificationResult:
    valid: bool
    device_id: str
    reason: str
    timestamp: float

class DeviceAttestor:
    """Simulates a TPM/secure enclave on the IoT device side."""

    def __init__(self, device_id: str, firmware_data: bytes = b"firmware-v1.0"):
        self.device_id = device_id
        self.firmware_hash = hashlib.sha256(firmware_data).hexdigest()
        self._secret_key = os.urandom(32)
        self.kem = KyberKEM()
        self.keypair, self._A = self.kem.keygen()
        self.platform_config = {
            "boot_mode": "secure",
            "tee_enabled": True,
            "firmware_version": "1.0.0"
        }

    def generate_nonce(self) -> AttestationNonce:
        return AttestationNonce(
            value=os.urandom(32),
            timestamp=time.time(),
            device_id=self.device_id
        )

    def sign_report(self, nonce: AttestationNonce) -> AttestationReport:
        """Create a signed attestation report."""
        payload = json.dumps({
            "device_id": self.device_id,
            "nonce": nonce.value.hex(),
            "firmware_hash": self.firmware_hash,
            "platform_config": self.platform_config,
            "timestamp": nonce.timestamp
        }, sort_keys=True).encode()

        signature = hmac.new(self._secret_key, payload, hashlib.sha256).digest()
        # Also encapsulate a session key using post-quantum KEM
        ct, shared_secret = self.kem.encapsulate(self.keypair.public_key, self._A)

        return AttestationReport(
            device_id=self.device_id,
            nonce_hex=nonce.value.hex(),
            firmware_hash=self.firmware_hash,
            platform_config=self.platform_config,
            signature_hex=signature.hex(),
            timestamp=nonce.timestamp,
            encapsulated_key_hex=ct.u.tobytes().hex()[:64]
        )

    def get_public_key_hex(self) -> str:
        return self.keypair.public_key.tobytes().hex()


class RemoteVerifier:
    """Verifies attestation reports from edge devices."""

    def __init__(self):
        self._registered_devices: dict = {}
        self._active_nonces: dict = {}

    def register_device(self, device_id: str, secret_key: bytes, firmware_hash: str):
        self._registered_devices[device_id] = {
            "secret_key": secret_key,
            "firmware_hash": firmware_hash,
            "registered_at": time.time()
        }

    def issue_challenge(self, device_id: str) -> AttestationNonce:
        nonce = AttestationNonce(
            value=os.urandom(32),
            timestamp=time.time(),
            device_id=device_id
        )
        self._active_nonces[device_id] = nonce
        return nonce

    def verify_report(self, report: AttestationReport, expected_firmware_hash: str,
                      secret_key: bytes) -> VerificationResult:
        """Verify an attestation report."""
        now = time.time()
        # Check timestamp freshness (within 5 minutes)
        if abs(now - report.timestamp) > 300:
            return VerificationResult(False, report.device_id, "Stale timestamp", now)

        # Reconstruct payload for signature verification
        payload = json.dumps({
            "device_id": report.device_id,
            "nonce": report.nonce_hex,
            "firmware_hash": report.firmware_hash,
            "platform_config": report.platform_config,
            "timestamp": report.timestamp
        }, sort_keys=True).encode()

        expected_sig = hmac.new(secret_key, payload, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected_sig, report.signature_hex):
            return VerificationResult(False, report.device_id, "Invalid signature", now)

        if report.firmware_hash != expected_firmware_hash:
            return VerificationResult(False, report.device_id,
                                      f"Firmware mismatch: expected {expected_firmware_hash}", now)

        return VerificationResult(True, report.device_id, "Attestation valid", now)
