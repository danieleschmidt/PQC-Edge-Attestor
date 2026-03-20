import pytest
import time
from pqc_edge.attestation import DeviceAttestor, RemoteVerifier, AttestationNonce

def test_device_attestor_init():
    attestor = DeviceAttestor("device-001")
    assert attestor.device_id == "device-001"
    assert len(attestor.firmware_hash) == 64

def test_generate_nonce():
    attestor = DeviceAttestor("device-001")
    nonce = attestor.generate_nonce()
    assert len(nonce.value) == 32
    assert nonce.device_id == "device-001"
    assert nonce.timestamp > 0

def test_sign_report():
    attestor = DeviceAttestor("device-002")
    nonce = attestor.generate_nonce()
    report = attestor.sign_report(nonce)
    assert report.device_id == "device-002"
    assert len(report.signature_hex) == 64
    assert report.firmware_hash == attestor.firmware_hash

def test_verify_valid_report():
    attestor = DeviceAttestor("device-003", b"test-firmware")
    nonce = attestor.generate_nonce()
    report = attestor.sign_report(nonce)
    verifier = RemoteVerifier()
    result = verifier.verify_report(report, attestor.firmware_hash, attestor._secret_key)
    assert result.valid
    assert result.reason == "Attestation valid"

def test_verify_invalid_signature():
    import os
    attestor = DeviceAttestor("device-004", b"fw")
    nonce = attestor.generate_nonce()
    report = attestor.sign_report(nonce)
    report.signature_hex = "deadbeef" * 8
    verifier = RemoteVerifier()
    result = verifier.verify_report(report, attestor.firmware_hash, attestor._secret_key)
    assert not result.valid

def test_verify_firmware_mismatch():
    attestor = DeviceAttestor("device-005", b"fw-v1")
    nonce = attestor.generate_nonce()
    report = attestor.sign_report(nonce)
    verifier = RemoteVerifier()
    result = verifier.verify_report(report, "wrong_hash", attestor._secret_key)
    assert not result.valid
    assert "mismatch" in result.reason

def test_verify_stale_timestamp():
    attestor = DeviceAttestor("device-006", b"fw")
    nonce = attestor.generate_nonce()
    report = attestor.sign_report(nonce)
    report.timestamp = time.time() - 600  # 10 minutes ago
    verifier = RemoteVerifier()
    result = verifier.verify_report(report, attestor.firmware_hash, attestor._secret_key)
    assert not result.valid
    assert "Stale" in result.reason

def test_issue_challenge():
    verifier = RemoteVerifier()
    nonce = verifier.issue_challenge("device-007")
    assert nonce.device_id == "device-007"
    assert len(nonce.value) == 32

def test_get_public_key_hex():
    attestor = DeviceAttestor("device-008")
    pk_hex = attestor.get_public_key_hex()
    assert len(pk_hex) > 0
    assert all(c in "0123456789abcdef" for c in pk_hex)

def test_platform_config_included():
    attestor = DeviceAttestor("device-009")
    nonce = attestor.generate_nonce()
    report = attestor.sign_report(nonce)
    assert "boot_mode" in report.platform_config
    assert report.platform_config["tee_enabled"] is True
