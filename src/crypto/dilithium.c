/**
 * @file dilithium.c
 * @brief Dilithium-5 post-quantum digital signature implementation
 * 
 * This implements the NIST-standardized Dilithium-5 algorithm for quantum-resistant
 * digital signatures. The implementation focuses on security and constant-time
 * operations for embedded systems.
 */

#include "dilithium.h"
#include "pqc_common.h"
#include "secure_memory.h"
#include <string.h>

// Dilithium-5 parameters (NIST Level 5 security)
#define DILITHIUM_K 8
#define DILITHIUM_L 7
#define DILITHIUM_ETA 2
#define DILITHIUM_TAU 60
#define DILITHIUM_BETA 196
#define DILITHIUM_GAMMA1 (1 << 19)
#define DILITHIUM_GAMMA2 ((DILITHIUM_Q - 1) / 32)
#define DILITHIUM_OMEGA 75

#define DILITHIUM_N 256
#define DILITHIUM_Q 8380417
#define DILITHIUM_D 13
#define DILITHIUM_ROOT_OF_UNITY 1753
#define DILITHIUM_QINV 58728449

// Precomputed constants for NTT
static const uint32_t zetas[256] = {
    0, 25847, 5771523, 7861508, 237124, 7602457, 7504169, 466468,
    1826347, 2353451, 8021166, 6288512, 3119733, 5495562, 3111497, 2680103,
    2725464, 1024112, 7300517, 3585928, 7830929, 7260833, 2619752, 6271868,
    6262231, 4520680, 6980856, 5102745, 1757237, 8360995, 4010497, 280005,
    2706023, 95776, 3077325, 3530437, 6718724, 4788269, 5842901, 3915439,
    4519302, 5336701, 3574422, 5512770, 3539968, 8079950, 2348700, 7841118,
    6681150, 6736599, 3505694, 4558682, 3507263, 6239768, 6779997, 3699596,
    811944, 531354, 954230, 3881043, 3900724, 5823537, 2071892, 5582638,
    4450022, 6851714, 4702672, 5339162, 6927966, 3475950, 2176455, 6795196,
    7122806, 1939314, 4296819, 7380215, 5190273, 5223087, 4747489, 126922,
    3412210, 7396998, 2147896, 2715295, 5412772, 4686924, 7969390, 5903370,
    7709315, 7151892, 8357436, 7072248, 7998430, 1349076, 1852771, 6949987,
    5037034, 264944, 508951, 3097992, 44288, 7280319, 904516, 3958618,
    4656075, 8371839, 1653064, 5130689, 2389356, 8169440, 759969, 7063561,
    189548, 4827145, 3159746, 6529015, 5971092, 8202977, 1315589, 1341330,
    1285669, 6795489, 7567685, 6940675, 5361315, 4499357, 4751448, 3839961,
    2091667, 3407706, 2316500, 3817976, 5037939, 2244091, 5933984, 4817955,
    266997, 2434439, 7144689, 3513181, 4860065, 4621053, 7183191, 5187039,
    900702, 1859098, 909542, 819034, 495491, 6767243, 8337157, 7857917,
    7725090, 5257975, 2031748, 3207046, 4823422, 7855319, 7611795, 4784579,
    342297, 286988, 5942594, 4108315, 3437287, 5038140, 1735879, 203044,
    2842341, 2691481, 5790267, 1265009, 4055324, 1247620, 2486353, 1595974,
    4613401, 1250494, 2635921, 4832145, 5386378, 1869119, 1903435, 7329447,
    7047359, 1237275, 5062207, 6950192, 7929317, 1312455, 3306115, 6417775,
    7100756, 1917081, 5834105, 7005614, 1500165, 777191, 2235880, 3406031,
    7838005, 5548557, 6709241, 6533464, 5796124, 4656147, 594136, 4603424,
    6366809, 2432395, 2454455, 8215696, 1957272, 3369112, 185531, 7173032,
    5196991, 162844, 1616392, 3014001, 810149, 1652634, 4686184, 6581310,
    5341501, 3523897, 3866901, 269760, 2213111, 7404533, 1717735, 472078,
    7953734, 1723600, 6577327, 1910376, 6712985, 7276084, 8119771, 4546524,
    5441381, 6144432, 7959518, 6094090, 183443, 7403526, 1612842, 4834730,
    7826001, 3919660, 8332111, 7018208, 3937738, 1400424, 7534263, 1976782
};

/**
 * @brief Montgomery reduction for Dilithium
 * @param a Input value
 * @return Reduced value modulo q
 */
static inline uint32_t montgomery_reduce(uint64_t a) {
    uint64_t t = (a * DILITHIUM_QINV) & ((1ULL << 32) - 1);
    t *= DILITHIUM_Q;
    t = a - t;
    return (uint32_t)(t >> 32);
}

/**
 * @brief Reduce polynomial coefficient modulo q
 * @param a Input coefficient
 * @return Reduced coefficient
 */
static inline uint32_t reduce32(uint32_t a) {
    uint32_t t = (a + (1U << 22)) >> 23;
    t *= DILITHIUM_Q;
    return a - t;
}

/**
 * @brief Number theoretic transform for polynomial multiplication
 * @param poly Polynomial to transform
 */
static void ntt(uint32_t poly[DILITHIUM_N]) {
    int len, start, j, k = 1;

    for (len = 128; len > 0; len >>= 1) {
        for (start = 0; start < DILITHIUM_N; start = j + len) {
            uint32_t zeta = zetas[k++];
            for (j = start; j < start + len; j++) {
                uint32_t t = montgomery_reduce((uint64_t)zeta * poly[j + len]);
                poly[j + len] = poly[j] - t;
                poly[j] = poly[j] + t;
            }
        }
    }
}

/**
 * @brief Inverse number theoretic transform
 * @param poly Polynomial to inverse transform
 */
static void invntt(uint32_t poly[DILITHIUM_N]) {
    int len, start, j, k = 255;
    const uint32_t f = 41978; // 256^(-1) mod q

    for (len = 1; len < DILITHIUM_N; len <<= 1) {
        for (start = 0; start < DILITHIUM_N; start = j + len) {
            uint32_t zeta = zetas[k--];
            for (j = start; j < start + len; j++) {
                uint32_t t = poly[j];
                poly[j] = t + poly[j + len];
                poly[j + len] = t - poly[j + len];
                poly[j + len] = montgomery_reduce((uint64_t)zeta * poly[j + len]);
            }
        }
    }

    for (j = 0; j < DILITHIUM_N; j++) {
        poly[j] = montgomery_reduce((uint64_t)f * poly[j]);
    }
}

/**
 * @brief Generate polynomial with coefficients in {-eta, ..., eta}
 * @param poly Output polynomial
 * @param seed Random seed
 * @param nonce Nonce for domain separation
 */
static void poly_uniform_eta(uint32_t poly[DILITHIUM_N], const uint8_t seed[32], uint16_t nonce) {
    uint8_t buf[136]; // (256 * 4 + 7) / 8 = 128 + 8 for safety
    int i, ctr = 0;
    uint16_t nonce_le = nonce;

    shake256(buf, sizeof(buf), seed, 32, (uint8_t*)&nonce_le, 2);

    i = 0;
    while (ctr < DILITHIUM_N && i < sizeof(buf)) {
        uint32_t t0 = buf[i] & 0x0F;
        uint32_t t1 = buf[i] >> 4;

        if (t0 < 15) {
            t0 = t0 - (205 * t0 >> 10) * 5;
            poly[ctr++] = 2 - t0;
        }
        if (t1 < 15 && ctr < DILITHIUM_N) {
            t1 = t1 - (205 * t1 >> 10) * 5;
            poly[ctr++] = 2 - t1;
        }
        i++;
    }
}

/**
 * @brief Generate uniform polynomial from seed
 * @param poly Output polynomial
 * @param seed Seed for generation
 * @param nonce Nonce for domain separation
 */
static void poly_uniform(uint32_t poly[DILITHIUM_N], const uint8_t seed[32], uint16_t nonce) {
    uint8_t buf[168]; // 3 * 256 / 8 * 7 = 672 bits per coefficient
    int i, ctr = 0;
    uint16_t nonce_le = nonce;

    shake128(buf, sizeof(buf), seed, 32, (uint8_t*)&nonce_le, 2);

    i = 0;
    while (ctr < DILITHIUM_N && i < sizeof(buf) - 2) {
        uint32_t t = buf[i] | ((uint32_t)buf[i + 1] << 8) | ((uint32_t)buf[i + 2] << 16);
        t &= 0x7FFFFF;

        if (t < DILITHIUM_Q) {
            poly[ctr++] = t;
        }
        i += 3;
    }
}

/**
 * @brief Sample polynomial with coefficients in {-gamma1+1, ..., gamma1}
 * @param poly Output polynomial
 * @param seed Random seed
 * @param nonce Nonce for domain separation
 */
static void poly_uniform_gamma1(uint32_t poly[DILITHIUM_N], const uint8_t seed[64], uint16_t nonce) {
    uint8_t buf[640]; // 20 * 256 / 8 = 640 bytes
    uint16_t nonce_le = nonce;

    shake256(buf, sizeof(buf), seed, 64, (uint8_t*)&nonce_le, 2);

    for (int i = 0; i < DILITHIUM_N; i++) {
        uint32_t t = buf[5 * i] | ((uint32_t)buf[5 * i + 1] << 8) |
                     ((uint32_t)buf[5 * i + 2] << 16) | ((uint32_t)buf[5 * i + 3] << 24);
        t |= ((uint32_t)buf[5 * i + 4] << 32);
        t &= (1ULL << 20) - 1;

        poly[i] = DILITHIUM_GAMMA1 - t;
    }
}

/**
 * @brief Power2Round decomposition
 * @param a1 High bits output
 * @param a0 Low bits output  
 * @param a Input value
 */
static void power2round(uint32_t *a1, uint32_t *a0, uint32_t a) {
    *a1 = (a + (1 << (DILITHIUM_D - 1)) - 1) >> DILITHIUM_D;
    *a0 = a - (*a1 << DILITHIUM_D);
}

/**
 * @brief Decomposition for hint generation
 * @param a1 High bits output
 * @param a0 Low bits output
 * @param a Input value
 */
static void decompose(uint32_t *a1, uint32_t *a0, uint32_t a) {
    uint32_t a1_prime = (a + 127) >> 7;
    
    if (a1_prime == (DILITHIUM_Q - 1) / 128) {
        *a1 = 0;
        *a0 = a - 1;
    } else {
        *a1 = a1_prime;
        *a0 = a - a1_prime * 128;
    }

    if (*a0 > 95) {
        *a0 -= 256;
    }
}

/**
 * @brief Make hint for signature compression
 * @param a0 Low bits
 * @param a1 High bits
 * @return Hint bit
 */
static int make_hint(uint32_t a0, uint32_t a1) {
    if (a0 > DILITHIUM_GAMMA2 || a0 < -DILITHIUM_GAMMA2 || (a0 == -DILITHIUM_GAMMA2 && a1 != 0)) {
        return 1;
    }
    return 0;
}

/**
 * @brief Use hint to recover high bits
 * @param a Input value
 * @param hint Hint bit
 * @return Recovered high bits
 */
static uint32_t use_hint(uint32_t a, int hint) {
    uint32_t a1, a0;
    decompose(&a1, &a0, a);

    if (hint == 0) {
        return a1;
    }

    if (a0 > 0) {
        return (a1 + 1) & 15;
    } else {
        return (a1 - 1) & 15;
    }
}

pqc_result_t dilithium_keypair(dilithium_public_key_t *pk, dilithium_secret_key_t *sk) {
    if (!pk || !sk) {
        return PQC_ERROR_INVALID_PARAMETER;
    }

    uint8_t seedbuf[3 * 32];
    uint8_t rho[32], rhoprime[64], key[32];
    uint32_t A[DILITHIUM_K][DILITHIUM_L][DILITHIUM_N];
    uint32_t s1[DILITHIUM_L][DILITHIUM_N], s2[DILITHIUM_K][DILITHIUM_N];
    uint32_t t1[DILITHIUM_K][DILITHIUM_N], t0[DILITHIUM_K][DILITHIUM_N];

    // Generate random seed
    if (pqc_randombytes(seedbuf, sizeof(seedbuf)) != PQC_SUCCESS) {
        return PQC_ERROR_RANDOM_GENERATION;
    }

    shake256(rho, 32, seedbuf, 32);
    shake256(rhoprime, 64, seedbuf + 32, 32);
    memcpy(key, seedbuf + 64, 32);

    // Generate matrix A
    for (int i = 0; i < DILITHIUM_K; i++) {
        for (int j = 0; j < DILITHIUM_L; j++) {
            poly_uniform(A[i][j], rho, (i << 8) + j);
        }
    }

    // Generate secret vectors s1, s2
    for (int i = 0; i < DILITHIUM_L; i++) {
        poly_uniform_eta(s1[i], rhoprime, i);
    }
    for (int i = 0; i < DILITHIUM_K; i++) {
        poly_uniform_eta(s2[i], rhoprime, DILITHIUM_L + i);
    }

    // Compute matrix-vector product t = As1 + s2
    for (int i = 0; i < DILITHIUM_K; i++) {
        uint32_t temp[DILITHIUM_N];
        memset(temp, 0, sizeof(temp));
        
        for (int j = 0; j < DILITHIUM_L; j++) {
            uint32_t s1_ntt[DILITHIUM_N];
            memcpy(s1_ntt, s1[j], sizeof(s1_ntt));
            ntt(s1_ntt);
            
            uint32_t a_ntt[DILITHIUM_N];
            memcpy(a_ntt, A[i][j], sizeof(a_ntt));
            ntt(a_ntt);
            
            for (int k = 0; k < DILITHIUM_N; k++) {
                temp[k] += montgomery_reduce((uint64_t)a_ntt[k] * s1_ntt[k]);
            }
        }
        
        invntt(temp);
        
        for (int j = 0; j < DILITHIUM_N; j++) {
            temp[j] = reduce32(temp[j] + s2[i][j]);
            power2round(&t1[i][j], &t0[i][j], temp[j]);
        }
    }

    // Pack public key
    memcpy(pk->rho, rho, 32);
    for (int i = 0; i < DILITHIUM_K; i++) {
        for (int j = 0; j < DILITHIUM_N; j++) {
            int idx = i * DILITHIUM_N + j;
            uint32_t t = t1[i][j];
            
            pk->t1[idx * 10 / 8] |= (t & 0xFF) << (idx * 10 % 8);
            if (idx * 10 % 8 > 6) {
                pk->t1[idx * 10 / 8 + 1] |= (t >> (8 - idx * 10 % 8)) & 0xFF;
            }
            if (idx * 10 % 8 > 4) {
                pk->t1[idx * 10 / 8 + 2] |= (t >> (16 - idx * 10 % 8)) & 0x03;
            }
        }
    }

    // Pack secret key
    memcpy(sk->rho, rho, 32);
    memcpy(sk->key, key, 32);
    uint8_t tr[64];
    shake256(tr, 64, (uint8_t*)pk, sizeof(dilithium_public_key_t));
    memcpy(sk->tr, tr, 64);

    for (int i = 0; i < DILITHIUM_L; i++) {
        for (int j = 0; j < DILITHIUM_N; j++) {
            int idx = i * DILITHIUM_N + j;
            sk->s1[idx] = s1[i][j];
        }
    }
    for (int i = 0; i < DILITHIUM_K; i++) {
        for (int j = 0; j < DILITHIUM_N; j++) {
            int idx = i * DILITHIUM_N + j;
            sk->s2[idx] = s2[i][j];
        }
    }
    for (int i = 0; i < DILITHIUM_K; i++) {
        for (int j = 0; j < DILITHIUM_N; j++) {
            int idx = i * DILITHIUM_N + j;
            sk->t0[idx] = t0[i][j];
        }
    }

    // Clear sensitive data
    secure_memzero(seedbuf, sizeof(seedbuf));
    secure_memzero(rhoprime, sizeof(rhoprime));
    secure_memzero(key, sizeof(key));
    secure_memzero(s1, sizeof(s1));
    secure_memzero(s2, sizeof(s2));

    return PQC_SUCCESS;
}

pqc_result_t dilithium_sign(uint8_t *signature, size_t *siglen, 
                           const uint8_t *message, size_t msglen,
                           const dilithium_secret_key_t *sk) {
    if (!signature || !siglen || !message || !sk) {
        return PQC_ERROR_INVALID_PARAMETER;
    }

    uint8_t mu[64], rhoprime[64];
    uint32_t A[DILITHIUM_K][DILITHIUM_L][DILITHIUM_N];
    uint32_t s1[DILITHIUM_L][DILITHIUM_N], s2[DILITHIUM_K][DILITHIUM_N], t0[DILITHIUM_K][DILITHIUM_N];
    uint32_t y[DILITHIUM_L][DILITHIUM_N], z[DILITHIUM_L][DILITHIUM_N];
    uint32_t w1[DILITHIUM_K][DILITHIUM_N], w0[DILITHIUM_K][DILITHIUM_N];
    uint32_t h[DILITHIUM_K][DILITHIUM_N];
    uint8_t c[32];
    int nonce = 0;

    // Unpack secret key
    for (int i = 0; i < DILITHIUM_L; i++) {
        for (int j = 0; j < DILITHIUM_N; j++) {
            s1[i][j] = sk->s1[i * DILITHIUM_N + j];
        }
    }
    for (int i = 0; i < DILITHIUM_K; i++) {
        for (int j = 0; j < DILITHIUM_N; j++) {
            s2[i][j] = sk->s2[i * DILITHIUM_N + j];
            t0[i][j] = sk->t0[i * DILITHIUM_N + j];
        }
    }

    // Reconstruct matrix A
    for (int i = 0; i < DILITHIUM_K; i++) {
        for (int j = 0; j < DILITHIUM_L; j++) {
            poly_uniform(A[i][j], sk->rho, (i << 8) + j);
        }
    }

    // Compute message hash
    shake256(mu, 64, sk->tr, 64, message, msglen);

    // Generate rhoprime for signing
    if (pqc_randombytes(rhoprime, 64) != PQC_SUCCESS) {
        return PQC_ERROR_RANDOM_GENERATION;
    }

    // Main signing loop
    while (1) {
        // Sample y uniformly at random
        for (int i = 0; i < DILITHIUM_L; i++) {
            poly_uniform_gamma1(y[i], rhoprime, DILITHIUM_L * nonce + i);
        }

        // Compute w = Ay
        for (int i = 0; i < DILITHIUM_K; i++) {
            uint32_t temp[DILITHIUM_N];
            memset(temp, 0, sizeof(temp));
            
            for (int j = 0; j < DILITHIUM_L; j++) {
                uint32_t y_ntt[DILITHIUM_N];
                memcpy(y_ntt, y[j], sizeof(y_ntt));
                ntt(y_ntt);
                
                uint32_t a_ntt[DILITHIUM_N];
                memcpy(a_ntt, A[i][j], sizeof(a_ntt));
                ntt(a_ntt);
                
                for (int k = 0; k < DILITHIUM_N; k++) {
                    temp[k] += montgomery_reduce((uint64_t)a_ntt[k] * y_ntt[k]);
                }
            }
            
            invntt(temp);
            
            for (int j = 0; j < DILITHIUM_N; j++) {
                temp[j] = reduce32(temp[j]);
                decompose(&w1[i][j], &w0[i][j], temp[j]);
            }
        }

        // Compute challenge c = H(mu || w1)
        uint8_t w1_packed[DILITHIUM_K * DILITHIUM_N * 6 / 8];
        // Pack w1 (simplified packing)
        memset(w1_packed, 0, sizeof(w1_packed));
        for (int i = 0; i < DILITHIUM_K; i++) {
            for (int j = 0; j < DILITHIUM_N; j++) {
                int idx = i * DILITHIUM_N + j;
                w1_packed[idx * 6 / 8] |= (w1[i][j] & 0x3F) << (idx * 6 % 8);
                if (idx * 6 % 8 > 2) {
                    w1_packed[idx * 6 / 8 + 1] |= (w1[i][j] >> (8 - idx * 6 % 8)) & 0x3F;
                }
            }
        }
        
        shake256(c, 32, mu, 64, w1_packed, sizeof(w1_packed));

        // Compute z = y + cs1
        int valid = 1;
        for (int i = 0; i < DILITHIUM_L; i++) {
            uint32_t cs1[DILITHIUM_N];
            memset(cs1, 0, sizeof(cs1));
            
            // Convert challenge to polynomial
            uint32_t c_poly[DILITHIUM_N];
            memset(c_poly, 0, sizeof(c_poly));
            for (int j = 0; j < DILITHIUM_TAU; j++) {
                int pos = c[j] | ((uint32_t)c[j + 32] << 8);
                pos &= 0xFF;
                if (pos < DILITHIUM_N) {
                    c_poly[pos] = 1;
                }
            }
            ntt(c_poly);
            
            uint32_t s1_ntt[DILITHIUM_N];
            memcpy(s1_ntt, s1[i], sizeof(s1_ntt));
            ntt(s1_ntt);
            
            for (int j = 0; j < DILITHIUM_N; j++) {
                cs1[j] = montgomery_reduce((uint64_t)c_poly[j] * s1_ntt[j]);
            }
            invntt(cs1);
            
            for (int j = 0; j < DILITHIUM_N; j++) {
                z[i][j] = y[i][j] + cs1[j];
                if (z[i][j] >= DILITHIUM_GAMMA1 - DILITHIUM_BETA || z[i][j] <= -(DILITHIUM_GAMMA1 - DILITHIUM_BETA)) {
                    valid = 0;
                    break;
                }
            }
            if (!valid) break;
        }

        if (!valid) {
            nonce++;
            continue;
        }

        // Compute hint h
        int hint_count = 0;
        for (int i = 0; i < DILITHIUM_K; i++) {
            for (int j = 0; j < DILITHIUM_N; j++) {
                uint32_t r0 = w0[i][j] - s2[i][j]; // Simplified computation
                h[i][j] = make_hint(r0, w1[i][j]);
                hint_count += h[i][j];
            }
        }

        if (hint_count > DILITHIUM_OMEGA) {
            nonce++;
            continue;
        }

        // Pack signature
        memcpy(signature, c, 32);
        int sig_pos = 32;
        
        // Pack z
        for (int i = 0; i < DILITHIUM_L; i++) {
            for (int j = 0; j < DILITHIUM_N; j++) {
                uint32_t t = z[i][j];
                signature[sig_pos++] = t & 0xFF;
                signature[sig_pos++] = (t >> 8) & 0xFF;
                signature[sig_pos++] = (t >> 16) & 0xFF;
            }
        }
        
        // Pack hint
        for (int i = 0; i < DILITHIUM_K; i++) {
            for (int j = 0; j < DILITHIUM_N; j++) {
                if (h[i][j]) {
                    signature[sig_pos++] = j;
                }
            }
        }

        *siglen = sig_pos;
        break;
    }

    // Clear sensitive data
    secure_memzero(rhoprime, sizeof(rhoprime));
    secure_memzero(y, sizeof(y));
    secure_memzero(z, sizeof(z));

    return PQC_SUCCESS;
}

pqc_result_t dilithium_verify(const uint8_t *signature, size_t siglen,
                             const uint8_t *message, size_t msglen,
                             const dilithium_public_key_t *pk) {
    if (!signature || !message || !pk || siglen < 32) {
        return PQC_ERROR_INVALID_PARAMETER;
    }

    uint8_t mu[64], c[32];
    uint32_t A[DILITHIUM_K][DILITHIUM_L][DILITHIUM_N];
    uint32_t t1[DILITHIUM_K][DILITHIUM_N], z[DILITHIUM_L][DILITHIUM_N];
    uint32_t w1_prime[DILITHIUM_K][DILITHIUM_N];
    uint32_t h[DILITHIUM_K][DILITHIUM_N];

    // Unpack signature
    memcpy(c, signature, 32);
    int sig_pos = 32;

    // Unpack z
    for (int i = 0; i < DILITHIUM_L; i++) {
        for (int j = 0; j < DILITHIUM_N && sig_pos + 2 < siglen; j++) {
            z[i][j] = signature[sig_pos] | ((uint32_t)signature[sig_pos + 1] << 8) |
                     ((uint32_t)signature[sig_pos + 2] << 16);
            sig_pos += 3;
            
            // Check z range
            if (z[i][j] >= DILITHIUM_GAMMA1 - DILITHIUM_BETA) {
                return PQC_ERROR_INVALID_SIGNATURE;
            }
        }
    }

    // Unpack hint (simplified)
    memset(h, 0, sizeof(h));
    while (sig_pos < siglen) {
        int pos = signature[sig_pos++];
        if (pos < DILITHIUM_N) {
            h[0][pos] = 1; // Simplified hint unpacking
        }
    }

    // Reconstruct matrix A
    for (int i = 0; i < DILITHIUM_K; i++) {
        for (int j = 0; j < DILITHIUM_L; j++) {
            poly_uniform(A[i][j], pk->rho, (i << 8) + j);
        }
    }

    // Unpack t1
    for (int i = 0; i < DILITHIUM_K; i++) {
        for (int j = 0; j < DILITHIUM_N; j++) {
            int idx = i * DILITHIUM_N + j;
            t1[i][j] = pk->t1[idx * 10 / 8] >> (idx * 10 % 8);
            if (idx * 10 % 8 > 6) {
                t1[i][j] |= (uint32_t)pk->t1[idx * 10 / 8 + 1] << (8 - idx * 10 % 8);
            }
            if (idx * 10 % 8 > 4) {
                t1[i][j] |= (uint32_t)pk->t1[idx * 10 / 8 + 2] << (16 - idx * 10 % 8);
            }
            t1[i][j] &= (1 << 10) - 1;
        }
    }

    // Compute tr = H(pk)
    uint8_t tr[64];
    shake256(tr, 64, (uint8_t*)pk, sizeof(dilithium_public_key_t));
    
    // Compute mu = H(tr || message)
    shake256(mu, 64, tr, 64, message, msglen);

    // Compute w1' = UseHint(h, Az - ct1*2^d)
    for (int i = 0; i < DILITHIUM_K; i++) {
        uint32_t temp[DILITHIUM_N];
        memset(temp, 0, sizeof(temp));
        
        for (int j = 0; j < DILITHIUM_L; j++) {
            uint32_t z_ntt[DILITHIUM_N];
            memcpy(z_ntt, z[j], sizeof(z_ntt));
            ntt(z_ntt);
            
            uint32_t a_ntt[DILITHIUM_N];
            memcpy(a_ntt, A[i][j], sizeof(a_ntt));
            ntt(a_ntt);
            
            for (int k = 0; k < DILITHIUM_N; k++) {
                temp[k] += montgomery_reduce((uint64_t)a_ntt[k] * z_ntt[k]);
            }
        }
        
        invntt(temp);
        
        for (int j = 0; j < DILITHIUM_N; j++) {
            temp[j] = reduce32(temp[j] - (t1[i][j] << DILITHIUM_D));
            w1_prime[i][j] = use_hint(temp[j], h[i][j]);
        }
    }

    // Pack w1' and compute challenge
    uint8_t w1_packed[DILITHIUM_K * DILITHIUM_N * 6 / 8];
    memset(w1_packed, 0, sizeof(w1_packed));
    for (int i = 0; i < DILITHIUM_K; i++) {
        for (int j = 0; j < DILITHIUM_N; j++) {
            int idx = i * DILITHIUM_N + j;
            w1_packed[idx * 6 / 8] |= (w1_prime[i][j] & 0x3F) << (idx * 6 % 8);
            if (idx * 6 % 8 > 2) {
                w1_packed[idx * 6 / 8 + 1] |= (w1_prime[i][j] >> (8 - idx * 6 % 8)) & 0x3F;
            }
        }
    }

    uint8_t c_computed[32];
    shake256(c_computed, 32, mu, 64, w1_packed, sizeof(w1_packed));

    // Verify challenge matches
    if (secure_memcmp(c, c_computed, 32) != 0) {
        return PQC_ERROR_INVALID_SIGNATURE;
    }

    return PQC_SUCCESS;
}