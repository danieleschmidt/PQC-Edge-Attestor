"""FastAPI endpoints for PQC Edge Attestation service."""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import time

from pqc_edge.attestation import DeviceAttestor, RemoteVerifier, AttestationReport

app = FastAPI(title="PQC Edge Attestation API", version="1.0.0")

# In-memory state (demo)
_attestors: dict = {}
_verifier = RemoteVerifier()


class AttestRequest(BaseModel):
    device_id: str
    firmware_version: str = "1.0.0"


class VerifyRequest(BaseModel):
    device_id: str
    nonce_hex: str
    firmware_hash: str
    platform_config: dict
    signature_hex: str
    timestamp: float
    encapsulated_key_hex: str = ""


@app.post("/attest")
def attest(req: AttestRequest):
    """Generate attestation nonce and report for a device."""
    if req.device_id not in _attestors:
        _attestors[req.device_id] = DeviceAttestor(
            req.device_id,
            f"firmware-{req.firmware_version}".encode()
        )
    attestor = _attestors[req.device_id]
    nonce = attestor.generate_nonce()
    report = attestor.sign_report(nonce)
    return {
        "device_id": report.device_id,
        "nonce_hex": report.nonce_hex,
        "firmware_hash": report.firmware_hash,
        "platform_config": report.platform_config,
        "signature_hex": report.signature_hex,
        "timestamp": report.timestamp,
        "encapsulated_key_hex": report.encapsulated_key_hex,
        "public_key_hex": attestor.get_public_key_hex()[:64]
    }


@app.post("/verify")
def verify(req: VerifyRequest):
    """Verify an attestation report."""
    if req.device_id not in _attestors:
        raise HTTPException(status_code=404, detail=f"Device {req.device_id} not found")

    attestor = _attestors[req.device_id]
    report = AttestationReport(
        device_id=req.device_id,
        nonce_hex=req.nonce_hex,
        firmware_hash=req.firmware_hash,
        platform_config=req.platform_config,
        signature_hex=req.signature_hex,
        timestamp=req.timestamp,
        encapsulated_key_hex=req.encapsulated_key_hex
    )
    result = _verifier.verify_report(report, attestor.firmware_hash, attestor._secret_key)
    return {
        "valid": result.valid,
        "device_id": result.device_id,
        "reason": result.reason,
        "timestamp": result.timestamp
    }


@app.get("/health")
def health():
    return {"status": "ok", "service": "pqc-edge-attestor"}
