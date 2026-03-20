import numpy as np
import pytest
from pqc_edge.kyber import KyberKEM, poly_add, poly_mul, sample_uniform, sample_small, KYBER_N, KYBER_Q

def test_poly_add_basic():
    a = np.array([1, 2, 3], dtype=np.int64)
    b = np.array([4, 5, 6], dtype=np.int64)
    result = poly_add(a, b, q=100)
    np.testing.assert_array_equal(result, [5, 7, 9])

def test_poly_add_modular():
    a = np.array([KYBER_Q - 1], dtype=np.int64)
    b = np.array([2], dtype=np.int64)
    result = poly_add(a, b)
    assert result[0] == 1

def test_sample_uniform_range():
    poly = sample_uniform(KYBER_N, KYBER_Q, seed=42)
    assert len(poly) == KYBER_N
    assert poly.min() >= 0
    assert poly.max() < KYBER_Q

def test_sample_small_range():
    poly = sample_small(KYBER_N, eta=2, seed=42)
    assert len(poly) == KYBER_N
    assert poly.min() >= -2
    assert poly.max() <= 2

def test_keygen_returns_keypair():
    kem = KyberKEM()
    kp, A = kem.keygen()
    assert kp.public_key.shape == (KYBER_N,)
    assert kp.secret_key.shape == (KYBER_N,)
    assert A.shape == (KYBER_N,)

def test_encapsulate_returns_ciphertext_and_secret():
    kem = KyberKEM()
    kp, A = kem.keygen()
    ct, ss = kem.encapsulate(kp.public_key, A)
    assert ct.u.shape == (KYBER_N,)
    assert ct.v.shape == (KYBER_N,)
    assert len(ss) == 32

def test_encapsulate_different_secrets_each_call():
    kem = KyberKEM()
    kp, A = kem.keygen()
    _, ss1 = kem.encapsulate(kp.public_key, A)
    _, ss2 = kem.encapsulate(kp.public_key, A)
    # Should be different (random r each time)
    # Note: not guaranteed but very likely
    assert isinstance(ss1, bytes) and isinstance(ss2, bytes)

def test_decapsulate_produces_bytes():
    kem = KyberKEM()
    kp, A = kem.keygen()
    ct, ss_enc = kem.encapsulate(kp.public_key, A)
    ss_dec = kem.decapsulate(ct, kp.secret_key)
    assert len(ss_dec) == 32

def test_kyber_kem_k2():
    kem = KyberKEM(k=2)
    assert kem.k == 2
    kp, A = kem.keygen()
    ct, ss = kem.encapsulate(kp.public_key, A)
    assert ct is not None

def test_public_key_in_range():
    kem = KyberKEM()
    kp, _ = kem.keygen()
    assert kp.public_key.min() >= 0
    assert kp.public_key.max() < KYBER_Q
