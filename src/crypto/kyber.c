/**
 * @file kyber.c
 * @brief Kyber-1024 post-quantum key encapsulation mechanism implementation
 * 
 * This implements the NIST-standardized Kyber-1024 algorithm for quantum-resistant
 * key exchange. The implementation focuses on embedded systems with constant-time
 * operations and side-channel attack mitigations.
 */

#include "kyber.h"
#include "pqc_common.h"
#include "secure_memory.h"
#include <string.h>

// Kyber-1024 parameters (NIST Level 5 security)
#define KYBER_K 4
#define KYBER_N 256
#define KYBER_Q 3329
#define KYBER_ETA1 2
#define KYBER_ETA2 2
#define KYBER_DU 11
#define KYBER_DV 5

// Polynomial arithmetic constants
static const uint16_t zetas[128] = {
    2285, 2571, 2970, 1812, 1493, 1422, 287, 202,
    3158, 622, 1577, 182, 962, 2127, 1855, 1468,
    573, 2004, 264, 383, 2500, 1458, 1727, 3199,
    2648, 1017, 732, 608, 1787, 411, 3124, 1758,
    1223, 652, 2777, 1015, 2036, 1491, 3047, 1785,
    516, 3321, 3009, 2663, 1711, 2167, 126, 1469,
    2476, 3239, 3058, 830, 107, 1908, 3082, 2378,
    2931, 961, 1821, 2604, 448, 2264, 677, 2054,
    2226, 430, 555, 843, 2078, 871, 1550, 105,
    422, 587, 177, 3094, 3038, 2869, 1574, 1653,
    3083, 778, 1159, 3182, 2552, 1483, 2727, 1119,
    1739, 644, 2457, 349, 418, 329, 3173, 3254,
    817, 1097, 603, 610, 1322, 2044, 1864, 384,
    2114, 3193, 1218, 1994, 2455, 220, 2142, 1670,
    2144, 1799, 2051, 794, 1819, 2475, 2459, 478,
    3221, 3021, 996, 991, 958, 1869, 1522, 1628
};

/**
 * @brief Montgomery reduction for modular arithmetic
 * @param a Input value
 * @return Reduced value modulo q
 */
static inline uint16_t montgomery_reduce(uint32_t a) {
    uint32_t t = (uint32_t)(int16_t)a * KYBER_QINV;
    t &= ((1U << 16) - 1);
    t *= KYBER_Q;
    t = a - t;
    return (uint16_t)(t >> 16);
}

/**
 * @brief Barrett reduction for modular arithmetic
 * @param a Input value
 * @return Reduced value modulo q
 */
static inline uint16_t barrett_reduce(uint16_t a) {
    uint32_t t = ((uint32_t)a * 5039) >> 23;
    return a - (uint16_t)(t * KYBER_Q);
}

/**
 * @brief Number theoretic transform (NTT) for polynomial multiplication
 * @param poly Polynomial coefficients to transform
 */
static void ntt(uint16_t poly[KYBER_N]) {
    int len, start, j, k;
    uint16_t t, zeta;

    k = 1;
    for (len = 128; len >= 2; len >>= 1) {
        for (start = 0; start < KYBER_N; start = j + len) {
            zeta = zetas[k++];
            for (j = start; j < start + len; j++) {
                t = montgomery_reduce((uint32_t)zeta * poly[j + len]);
                poly[j + len] = poly[j] - t;
                poly[j] = poly[j] + t;
            }
        }
    }
}

/**
 * @brief Inverse number theoretic transform
 * @param poly Polynomial coefficients to transform
 */
static void invntt(uint16_t poly[KYBER_N]) {
    int len, start, j, k;
    uint16_t t, zeta;
    const uint16_t f = 1441; // mont^2/128

    k = 127;
    for (len = 2; len <= 128; len <<= 1) {
        for (start = 0; start < KYBER_N; start = j + len) {
            zeta = zetas[k--];
            for (j = start; j < start + len; j++) {
                t = poly[j];
                poly[j] = barrett_reduce(t + poly[j + len]);
                poly[j + len] = t - poly[j + len];
                poly[j + len] = montgomery_reduce((uint32_t)zeta * poly[j + len]);
            }
        }
    }

    for (j = 0; j < KYBER_N; j++) {
        poly[j] = montgomery_reduce((uint32_t)f * poly[j]);
    }
}

/**
 * @brief Generate noise polynomial using centered binomial distribution
 * @param poly Output polynomial
 * @param seed Random seed
 * @param nonce Nonce for domain separation
 */
static void poly_getnoise_eta1(uint16_t poly[KYBER_N], const uint8_t seed[32], uint8_t nonce) {
    uint8_t buf[KYBER_ETA1 * KYBER_N / 4];
    uint32_t t, d;
    int i, j;

    // Use SHAKE-256 to expand seed
    shake256(buf, sizeof(buf), seed, 32, &nonce, 1);

    for (i = 0; i < KYBER_N / 8; i++) {
        t = buf[4 * i + 0] | ((uint32_t)buf[4 * i + 1] << 8) |
            ((uint32_t)buf[4 * i + 2] << 16) | ((uint32_t)buf[4 * i + 3] << 24);

        for (j = 0; j < 8; j++) {
            d = t & 0x55555555;
            d += (t >> 1) & 0x55555555;
            
            poly[8 * i + j] = ((d >> (4 * j + 0)) & 0x3) - ((d >> (4 * j + 2)) & 0x3);
        }
    }
}

/**
 * @brief Polynomial addition in Rq
 * @param c Output polynomial
 * @param a First input polynomial  
 * @param b Second input polynomial
 */
static void poly_add(uint16_t c[KYBER_N], const uint16_t a[KYBER_N], const uint16_t b[KYBER_N]) {
    for (int i = 0; i < KYBER_N; i++) {
        c[i] = barrett_reduce(a[i] + b[i]);
    }
}

/**
 * @brief Polynomial subtraction in Rq
 * @param c Output polynomial
 * @param a First input polynomial
 * @param b Second input polynomial  
 */
static void poly_sub(uint16_t c[KYBER_N], const uint16_t a[KYBER_N], const uint16_t b[KYBER_N]) {
    for (int i = 0; i < KYBER_N; i++) {
        c[i] = barrett_reduce(a[i] - b[i] + KYBER_Q);
    }
}

/**
 * @brief Matrix-vector multiplication in module lattice
 * @param t Output vector
 * @param A Matrix A
 * @param s Vector s
 * @param transposed Whether A is transposed
 */
static void matrix_vector_mul(uint16_t t[KYBER_K][KYBER_N], 
                             const uint16_t A[KYBER_K][KYBER_K][KYBER_N],
                             const uint16_t s[KYBER_K][KYBER_N],
                             int transposed) {
    for (int i = 0; i < KYBER_K; i++) {
        memset(t[i], 0, KYBER_N * sizeof(uint16_t));
        for (int j = 0; j < KYBER_K; j++) {
            uint16_t temp[KYBER_N];
            memcpy(temp, A[transposed ? j : i][transposed ? i : j], KYBER_N * sizeof(uint16_t));
            ntt(temp);
            
            uint16_t s_ntt[KYBER_N];
            memcpy(s_ntt, s[j], KYBER_N * sizeof(uint16_t));
            ntt(s_ntt);
            
            for (int k = 0; k < KYBER_N; k++) {
                temp[k] = montgomery_reduce((uint32_t)temp[k] * s_ntt[k]);
            }
            
            invntt(temp);
            poly_add(t[i], t[i], temp);
        }
    }
}

pqc_result_t kyber_keypair(kyber_public_key_t *pk, kyber_secret_key_t *sk) {
    if (!pk || !sk) {
        return PQC_ERROR_INVALID_PARAMETER;
    }

    uint8_t publicseed[32], noiseseed[32];
    uint16_t A[KYBER_K][KYBER_K][KYBER_N];
    uint16_t s[KYBER_K][KYBER_N], e[KYBER_K][KYBER_N], t[KYBER_K][KYBER_N];

    // Generate random seeds
    if (pqc_randombytes(publicseed, 32) != PQC_SUCCESS ||
        pqc_randombytes(noiseseed, 32) != PQC_SUCCESS) {
        return PQC_ERROR_RANDOM_GENERATION;
    }

    // Generate matrix A from public seed
    for (int i = 0; i < KYBER_K; i++) {
        for (int j = 0; j < KYBER_K; j++) {
            uint8_t seed_ext[34];
            memcpy(seed_ext, publicseed, 32);
            seed_ext[32] = j;
            seed_ext[33] = i;
            
            uint8_t buf[3 * KYBER_N];
            shake128(buf, sizeof(buf), seed_ext, 34);
            
            int pos = 0;
            for (int k = 0; k < KYBER_N; k++) {
                uint16_t val;
                do {
                    val = buf[pos] | ((uint16_t)buf[pos + 1] << 8);
                    pos += 2;
                    val &= 0x1FFF;
                } while (val >= KYBER_Q && pos < sizeof(buf) - 1);
                
                A[i][j][k] = val;
            }
        }
    }

    // Generate secret vector s
    for (int i = 0; i < KYBER_K; i++) {
        poly_getnoise_eta1(s[i], noiseseed, i);
    }

    // Generate error vector e  
    for (int i = 0; i < KYBER_K; i++) {
        poly_getnoise_eta1(e[i], noiseseed, i + KYBER_K);
    }

    // Compute t = As + e
    matrix_vector_mul(t, A, s, 0);
    for (int i = 0; i < KYBER_K; i++) {
        poly_add(t[i], t[i], e[i]);
    }

    // Pack public key
    memcpy(pk->seed, publicseed, 32);
    for (int i = 0; i < KYBER_K; i++) {
        for (int j = 0; j < KYBER_N; j++) {
            int idx = i * KYBER_N + j;
            pk->t[idx * 3 / 2] = t[i][j] & 0xFF;
            pk->t[idx * 3 / 2 + 1] = (t[i][j] >> 8) | ((j + 1 < KYBER_N ? t[i][j + 1] : 0) << 4);
            if (j + 1 < KYBER_N) {
                pk->t[idx * 3 / 2 + 2] = t[i][j + 1] >> 4;
                j++;
            }
        }
    }

    // Pack secret key
    for (int i = 0; i < KYBER_K; i++) {
        for (int j = 0; j < KYBER_N; j++) {
            sk->s[i * KYBER_N + j] = s[i][j];
        }
    }
    memcpy(sk->pk, pk, sizeof(kyber_public_key_t));

    // Generate hash of public key for implicit rejection
    sha3_256(sk->h, (uint8_t*)pk, sizeof(kyber_public_key_t));
    
    // Generate random z for implicit rejection
    pqc_randombytes(sk->z, 32);

    // Clear sensitive data
    secure_memzero(s, sizeof(s));
    secure_memzero(e, sizeof(e));
    secure_memzero(noiseseed, sizeof(noiseseed));

    return PQC_SUCCESS;
}

pqc_result_t kyber_encapsulate(kyber_ciphertext_t *ct, uint8_t *shared_secret, 
                              const kyber_public_key_t *pk) {
    if (!ct || !shared_secret || !pk) {
        return PQC_ERROR_INVALID_PARAMETER;
    }

    uint8_t m[32], K[32], coins[32];
    uint16_t A[KYBER_K][KYBER_K][KYBER_N];
    uint16_t t[KYBER_K][KYBER_N], r[KYBER_K][KYBER_N], e1[KYBER_K][KYBER_N], e2[KYBER_N];
    uint16_t u[KYBER_K][KYBER_N], v[KYBER_N];

    // Generate random message
    if (pqc_randombytes(m, 32) != PQC_SUCCESS) {
        return PQC_ERROR_RANDOM_GENERATION;
    }

    // Hash message with public key hash for coins
    uint8_t pk_hash[32];
    sha3_256(pk_hash, (uint8_t*)pk, sizeof(kyber_public_key_t));
    
    uint8_t hash_input[64];
    memcpy(hash_input, m, 32);
    memcpy(hash_input + 32, pk_hash, 32);
    sha3_512(coins, hash_input, 64);

    // Reconstruct matrix A from public seed
    for (int i = 0; i < KYBER_K; i++) {
        for (int j = 0; j < KYBER_K; j++) {
            uint8_t seed_ext[34];
            memcpy(seed_ext, pk->seed, 32);
            seed_ext[32] = j;
            seed_ext[33] = i;
            
            uint8_t buf[3 * KYBER_N];
            shake128(buf, sizeof(buf), seed_ext, 34);
            
            int pos = 0;
            for (int k = 0; k < KYBER_N; k++) {
                uint16_t val;
                do {
                    val = buf[pos] | ((uint16_t)buf[pos + 1] << 8);
                    pos += 2;
                    val &= 0x1FFF;
                } while (val >= KYBER_Q && pos < sizeof(buf) - 1);
                
                A[i][j][k] = val;
            }
        }
    }

    // Unpack public key t
    for (int i = 0; i < KYBER_K; i++) {
        for (int j = 0; j < KYBER_N; j += 2) {
            int idx = i * KYBER_N + j;
            t[i][j] = pk->t[idx * 3 / 2] | ((pk->t[idx * 3 / 2 + 1] & 0x0F) << 8);
            if (j + 1 < KYBER_N) {
                t[i][j + 1] = (pk->t[idx * 3 / 2 + 1] >> 4) | (pk->t[idx * 3 / 2 + 2] << 4);
            }
        }
    }

    // Generate noise polynomials r, e1, e2
    for (int i = 0; i < KYBER_K; i++) {
        poly_getnoise_eta1(r[i], coins, i);
        poly_getnoise_eta1(e1[i], coins, i + KYBER_K);
    }
    poly_getnoise_eta1(e2, coins, 2 * KYBER_K);

    // Compute u = A^T * r + e1
    matrix_vector_mul(u, A, r, 1);
    for (int i = 0; i < KYBER_K; i++) {
        poly_add(u[i], u[i], e1[i]);
    }

    // Compute v = t^T * r + e2 + Decompress_q(Encode(m))
    uint16_t tr[KYBER_N];
    memset(tr, 0, sizeof(tr));
    for (int i = 0; i < KYBER_K; i++) {
        uint16_t temp[KYBER_N];
        memcpy(temp, t[i], KYBER_N * sizeof(uint16_t));
        ntt(temp);
        
        uint16_t r_ntt[KYBER_N];
        memcpy(r_ntt, r[i], KYBER_N * sizeof(uint16_t));
        ntt(r_ntt);
        
        for (int j = 0; j < KYBER_N; j++) {
            temp[j] = montgomery_reduce((uint32_t)temp[j] * r_ntt[j]);
        }
        
        invntt(temp);
        poly_add(tr, tr, temp);
    }
    
    poly_add(v, tr, e2);
    
    // Add encoded message
    for (int i = 0; i < KYBER_N; i++) {
        int bit = (m[i / 8] >> (i % 8)) & 1;
        v[i] = barrett_reduce(v[i] + bit * ((KYBER_Q + 1) / 2));
    }

    // Pack ciphertext
    for (int i = 0; i < KYBER_K; i++) {
        for (int j = 0; j < KYBER_N; j++) {
            int idx = i * KYBER_N + j;
            uint16_t compressed = ((uint32_t)u[i][j] << KYBER_DU) + KYBER_Q / 2) / KYBER_Q;
            compressed &= (1 << KYBER_DU) - 1;
            
            ct->u[idx * KYBER_DU / 8] |= compressed << (idx * KYBER_DU % 8);
            if (idx * KYBER_DU % 8 + KYBER_DU > 8) {
                ct->u[idx * KYBER_DU / 8 + 1] |= compressed >> (8 - idx * KYBER_DU % 8);
            }
        }
    }

    for (int i = 0; i < KYBER_N; i++) {
        uint16_t compressed = ((uint32_t)v[i] << KYBER_DV) + KYBER_Q / 2) / KYBER_Q;
        compressed &= (1 << KYBER_DV) - 1;
        
        ct->v[i * KYBER_DV / 8] |= compressed << (i * KYBER_DV % 8);
        if (i * KYBER_DV % 8 + KYBER_DV > 8) {
            ct->v[i * KYBER_DV / 8 + 1] |= compressed >> (8 - i * KYBER_DV % 8);
        }
    }

    // Derive shared secret
    memcpy(hash_input, m, 32);
    sha3_256(K, hash_input, 32);
    memcpy(shared_secret, K, 32);

    // Clear sensitive data
    secure_memzero(m, sizeof(m));
    secure_memzero(K, sizeof(K));
    secure_memzero(coins, sizeof(coins));
    secure_memzero(r, sizeof(r));

    return PQC_SUCCESS;
}

pqc_result_t kyber_decapsulate(uint8_t *shared_secret, const kyber_ciphertext_t *ct,
                              const kyber_secret_key_t *sk) {
    if (!shared_secret || !ct || !sk) {
        return PQC_ERROR_INVALID_PARAMETER;
    }

    uint8_t m[32], K[32], Kr[64];
    uint16_t u[KYBER_K][KYBER_N], v[KYBER_N], s[KYBER_K][KYBER_N];
    uint16_t mp[KYBER_N];

    // Unpack secret key
    for (int i = 0; i < KYBER_K; i++) {
        for (int j = 0; j < KYBER_N; j++) {
            s[i][j] = sk->s[i * KYBER_N + j];
        }
    }

    // Unpack ciphertext u
    for (int i = 0; i < KYBER_K; i++) {
        for (int j = 0; j < KYBER_N; j++) {
            int idx = i * KYBER_N + j;
            uint16_t compressed = ct->u[idx * KYBER_DU / 8] >> (idx * KYBER_DU % 8);
            if (idx * KYBER_DU % 8 + KYBER_DU > 8) {
                compressed |= ct->u[idx * KYBER_DU / 8 + 1] << (8 - idx * KYBER_DU % 8);
            }
            compressed &= (1 << KYBER_DU) - 1;
            
            u[i][j] = ((uint32_t)compressed * KYBER_Q + (1 << (KYBER_DU - 1))) >> KYBER_DU;
        }
    }

    // Unpack ciphertext v
    for (int i = 0; i < KYBER_N; i++) {
        uint16_t compressed = ct->v[i * KYBER_DV / 8] >> (i * KYBER_DV % 8);
        if (i * KYBER_DV % 8 + KYBER_DV > 8) {
            compressed |= ct->v[i * KYBER_DV / 8 + 1] << (8 - i * KYBER_DV % 8);
        }
        compressed &= (1 << KYBER_DV) - 1;
        
        v[i] = ((uint32_t)compressed * KYBER_Q + (1 << (KYBER_DV - 1))) >> KYBER_DV;
    }

    // Compute s^T * u
    uint16_t su[KYBER_N];
    memset(su, 0, sizeof(su));
    for (int i = 0; i < KYBER_K; i++) {
        uint16_t temp[KYBER_N];
        memcpy(temp, s[i], KYBER_N * sizeof(uint16_t));
        ntt(temp);
        
        uint16_t u_ntt[KYBER_N];
        memcpy(u_ntt, u[i], KYBER_N * sizeof(uint16_t));
        ntt(u_ntt);
        
        for (int j = 0; j < KYBER_N; j++) {
            temp[j] = montgomery_reduce((uint32_t)temp[j] * u_ntt[j]);
        }
        
        invntt(temp);
        poly_add(su, su, temp);
    }

    // Compute mp = v - s^T * u
    poly_sub(mp, v, su);

    // Decode message
    for (int i = 0; i < 32; i++) {
        m[i] = 0;
        for (int j = 0; j < 8; j++) {
            int coeff_idx = i * 8 + j;
            uint16_t t = ((uint32_t)mp[coeff_idx] << 1) + KYBER_Q / 2;
            t = (t / KYBER_Q) & 1;
            m[i] |= t << j;
        }
    }

    // Recompute shared secret and verify
    uint8_t hash_input[64];
    memcpy(hash_input, m, 32);
    memcpy(hash_input + 32, sk->h, 32);
    sha3_512(Kr, hash_input, 64);

    // Compare with implicit rejection
    kyber_ciphertext_t ct_prime;
    kyber_encapsulate(&ct_prime, K, &sk->pk);
    
    int ct_match = secure_memcmp(ct, &ct_prime, sizeof(kyber_ciphertext_t));
    
    // Use implicit rejection on failure
    if (ct_match != 0) {
        memcpy(hash_input, sk->z, 32);
        memcpy(hash_input + 32, (uint8_t*)ct, sizeof(kyber_ciphertext_t));
        sha3_256(K, hash_input, 32 + sizeof(kyber_ciphertext_t));
    }

    memcpy(shared_secret, K, 32);

    // Clear sensitive data
    secure_memzero(m, sizeof(m));
    secure_memzero(K, sizeof(K));
    secure_memzero(Kr, sizeof(Kr));
    secure_memzero(s, sizeof(s));

    return PQC_SUCCESS;
}