"""
Simplified Kyber-like Key Encapsulation Mechanism (KEM).
This is a DEMONSTRATION implementation using polynomial arithmetic
to simulate lattice-based operations. NOT cryptographically secure.
For production use NIST-approved implementations like liboqs.
"""
import numpy as np
import hashlib
import os
from dataclasses import dataclass

KYBER_N = 256
KYBER_Q = 3329

@dataclass
class KyberKeyPair:
    public_key: np.ndarray
    secret_key: np.ndarray

@dataclass
class KyberCiphertext:
    u: np.ndarray
    v: np.ndarray

def poly_add(a, b, q=KYBER_Q):
    return (a + b) % q

def poly_mul(a, b, q=KYBER_Q, n=KYBER_N):
    """Polynomial multiplication mod (x^n + 1)"""
    result = np.zeros(n, dtype=np.int64)
    for i in range(n):
        for j in range(n):
            idx = (i + j) % n
            sign = -1 if (i + j) >= n else 1
            result[idx] = (result[idx] + sign * int(a[i]) * int(b[j])) % q
    return result

def sample_uniform(n=KYBER_N, q=KYBER_Q, seed=None):
    rng = np.random.default_rng(seed)
    return rng.integers(0, q, size=n)

def sample_small(n=KYBER_N, eta=2, seed=None):
    """Sample from centered binomial distribution (small errors)"""
    rng = np.random.default_rng(seed)
    a = rng.integers(0, 2, size=(n, eta))
    b = rng.integers(0, 2, size=(n, eta))
    return (a.sum(axis=1) - b.sum(axis=1)).astype(np.int64)

class KyberKEM:
    """
    Kyber-like Key Encapsulation Mechanism.
    DEMO ONLY - simplified ring-LWE based construction.
    """
    def __init__(self, k=2, n=KYBER_N, q=KYBER_Q):
        self.k = k
        self.n = n
        self.q = q

    def keygen(self):
        seed = int.from_bytes(os.urandom(4), 'big')
        A = sample_uniform(self.n, self.q, seed=seed)
        s = sample_small(self.n, seed=seed+1)
        e = sample_small(self.n, seed=seed+2)
        # pk = A*s + e
        pk = poly_add(poly_mul(A, s, self.q, self.n), e, self.q)
        return KyberKeyPair(public_key=pk, secret_key=s), A

    def encapsulate(self, public_key, A):
        r = sample_small(self.n, seed=int.from_bytes(os.urandom(4), 'big'))
        e1 = sample_small(self.n, seed=int.from_bytes(os.urandom(4), 'big'))
        e2 = sample_small(self.n, seed=int.from_bytes(os.urandom(4), 'big'))
        # u = A^T * r + e1
        u = poly_add(poly_mul(A, r, self.q, self.n), e1, self.q)
        # v = pk^T * r + e2 + encode(m)
        m = sample_small(self.n, seed=42)
        encoded_m = ((m % 2) * (self.q // 2)).astype(np.int64)
        v = poly_add(poly_add(poly_mul(public_key, r, self.q, self.n), e2, self.q), encoded_m, self.q)
        # shared secret from m
        shared_secret = hashlib.sha256(m.tobytes()).digest()
        return KyberCiphertext(u=u, v=v), shared_secret

    def decapsulate(self, ciphertext, secret_key):
        # w = v - s^T * u
        su = poly_mul(secret_key, ciphertext.u, self.q, self.n)
        w = (ciphertext.v - su) % self.q
        # Decode: round to nearest 0 or q/2
        decoded = ((w > self.q // 4) & (w < 3 * self.q // 4)).astype(np.int64)
        shared_secret = hashlib.sha256(decoded.tobytes()).digest()
        return shared_secret
