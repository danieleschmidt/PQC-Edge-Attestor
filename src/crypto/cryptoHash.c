/**
 * @file cryptoHash.c
 * @brief Enhanced cryptographic hash implementations for Generation 2
 * 
 * This implements proper SHA-3/SHAKE functions to replace the simplified
 * placeholder implementations from Generation 1.
 */

#include "pqc_common.h"
#include "secure_memory.h"
#include <string.h>
#include <stdint.h>

// SHA-3/Keccak constants
#define KECCAK_ROUNDS 24
#define KECCAK_RATE_SHA3_256 136
#define KECCAK_RATE_SHA3_512 72
#define KECCAK_RATE_SHAKE128 168
#define KECCAK_RATE_SHAKE256 136

// Keccak round constants
static const uint64_t keccak_round_constants[KECCAK_ROUNDS] = {
    0x0000000000000001ULL, 0x0000000000008082ULL, 0x800000000000808aULL,
    0x8000000080008000ULL, 0x000000000000808bULL, 0x0000000080000001ULL,
    0x8000000080008081ULL, 0x8000000000008009ULL, 0x000000000000008aULL,
    0x0000000000000088ULL, 0x0000000080008009ULL, 0x000000008000000aULL,
    0x000000008000808bULL, 0x800000000000008bULL, 0x8000000000008089ULL,
    0x8000000000008003ULL, 0x8000000000008002ULL, 0x8000000000000080ULL,
    0x000000000000800aULL, 0x800000008000000aULL, 0x8000000080008081ULL,
    0x8000000000008080ULL, 0x0000000080000001ULL, 0x8000000080008008ULL
};

// Keccak rho constants
static const unsigned int keccak_rho_offsets[25] = {
     0,  1, 62, 28, 27, 36, 44,  6, 55, 20,
     3, 10, 43, 25, 39, 41, 45, 15, 21,  8,
    18,  2, 61, 56, 14
};

/**
 * @brief Keccak state structure
 */
typedef struct {
    uint64_t state[25];
    size_t rate;
    size_t capacity;
    size_t pos;
    uint8_t suffix;
} keccak_state_t;

/**
 * @brief ROL64 - rotate left 64-bit
 */
static inline uint64_t rol64(uint64_t x, unsigned int n) {
    return (x << n) | (x >> (64 - n));
}

/**
 * @brief Keccak-f[1600] permutation function
 */
static void keccak_f1600(uint64_t state[25]) {
    uint64_t C[5], D[5], B[25];
    
    for (int round = 0; round < KECCAK_ROUNDS; round++) {
        // Theta step
        for (int x = 0; x < 5; x++) {
            C[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
        }
        
        for (int x = 0; x < 5; x++) {
            D[x] = C[(x + 4) % 5] ^ rol64(C[(x + 1) % 5], 1);
        }
        
        for (int x = 0; x < 5; x++) {
            for (int y = 0; y < 5; y++) {
                state[x + 5 * y] ^= D[x];
            }
        }
        
        // Rho and Pi steps
        static const unsigned int pi_indices[25] = {
            0, 6, 12, 18, 24, 3, 9, 10, 16, 22, 1, 7, 13, 19, 20,
            4, 5, 11, 17, 23, 2, 8, 14, 15, 21
        };
        
        for (int i = 0; i < 25; i++) {
            B[pi_indices[i]] = rol64(state[i], keccak_rho_offsets[i]);
        }
        
        // Chi step
        for (int y = 0; y < 5; y++) {
            for (int x = 0; x < 5; x++) {
                state[x + 5 * y] = B[x + 5 * y] ^ 
                    ((~B[((x + 1) % 5) + 5 * y]) & B[((x + 2) % 5) + 5 * y]);
            }
        }
        
        // Iota step
        state[0] ^= keccak_round_constants[round];
    }
}

/**
 * @brief Initialize Keccak state
 */
static void keccak_init(keccak_state_t *ctx, size_t rate, uint8_t suffix) {
    memset(ctx->state, 0, sizeof(ctx->state));
    ctx->rate = rate;
    ctx->capacity = 1600 - rate;
    ctx->pos = 0;
    ctx->suffix = suffix;
}

/**
 * @brief Update Keccak state with input data
 */
static void keccak_update(keccak_state_t *ctx, const uint8_t *input, size_t len) {
    uint8_t *state_bytes = (uint8_t *)ctx->state;
    
    while (len > 0) {
        size_t chunk = (ctx->rate - ctx->pos < len) ? ctx->rate - ctx->pos : len;
        
        for (size_t i = 0; i < chunk; i++) {
            state_bytes[ctx->pos + i] ^= input[i];
        }
        
        ctx->pos += chunk;
        input += chunk;
        len -= chunk;
        
        if (ctx->pos == ctx->rate) {
            keccak_f1600(ctx->state);
            ctx->pos = 0;
        }
    }
}

/**
 * @brief Finalize Keccak and produce output
 */
static void keccak_final(keccak_state_t *ctx, uint8_t *output, size_t outlen) {
    uint8_t *state_bytes = (uint8_t *)ctx->state;
    
    // Padding
    state_bytes[ctx->pos] ^= ctx->suffix;
    state_bytes[ctx->rate - 1] ^= 0x80;
    
    keccak_f1600(ctx->state);
    
    // Extract output
    size_t extracted = 0;
    while (extracted < outlen) {
        size_t chunk = (ctx->rate < outlen - extracted) ? ctx->rate : outlen - extracted;
        memcpy(output + extracted, state_bytes, chunk);
        extracted += chunk;
        
        if (extracted < outlen) {
            keccak_f1600(ctx->state);
        }
    }
}

// Enhanced SHA-3 and SHAKE implementations

pqc_result_t sha3_256_enhanced(uint8_t hash[32], const uint8_t *input, size_t inlen) {
    if (!hash || !input) {
        return PQC_ERROR_INVALID_PARAMETER;
    }
    
    keccak_state_t ctx;
    keccak_init(&ctx, KECCAK_RATE_SHA3_256, 0x06);
    keccak_update(&ctx, input, inlen);
    keccak_final(&ctx, hash, 32);
    
    // Secure cleanup
    secure_memzero(&ctx, sizeof(ctx));
    
    return PQC_SUCCESS;
}

pqc_result_t sha3_512_enhanced(uint8_t hash[64], const uint8_t *input, size_t inlen) {
    if (!hash || !input) {
        return PQC_ERROR_INVALID_PARAMETER;
    }
    
    keccak_state_t ctx;
    keccak_init(&ctx, KECCAK_RATE_SHA3_512, 0x06);
    keccak_update(&ctx, input, inlen);
    keccak_final(&ctx, hash, 64);
    
    // Secure cleanup
    secure_memzero(&ctx, sizeof(ctx));
    
    return PQC_SUCCESS;
}

pqc_result_t shake128_enhanced(uint8_t *output, size_t outlen, 
                              const uint8_t *input, size_t inlen) {
    if (!output || !input) {
        return PQC_ERROR_INVALID_PARAMETER;
    }
    
    if (outlen == 0 || outlen > 65536) { // Reasonable output limit
        return PQC_ERROR_INVALID_PARAMETER;
    }
    
    keccak_state_t ctx;
    keccak_init(&ctx, KECCAK_RATE_SHAKE128, 0x1F);
    keccak_update(&ctx, input, inlen);
    keccak_final(&ctx, output, outlen);
    
    // Secure cleanup
    secure_memzero(&ctx, sizeof(ctx));
    
    return PQC_SUCCESS;
}

pqc_result_t shake256_enhanced(uint8_t *output, size_t outlen, 
                              const uint8_t *input, size_t inlen,
                              const uint8_t *custom, size_t customlen) {
    if (!output || !input) {
        return PQC_ERROR_INVALID_PARAMETER;
    }
    
    if (outlen == 0 || outlen > 65536) { // Reasonable output limit
        return PQC_ERROR_INVALID_PARAMETER;
    }
    
    keccak_state_t ctx;
    keccak_init(&ctx, KECCAK_RATE_SHAKE256, 0x1F);
    
    // Update with main input
    keccak_update(&ctx, input, inlen);
    
    // Update with custom input if provided
    if (custom && customlen > 0) {
        keccak_update(&ctx, custom, customlen);
    }
    
    keccak_final(&ctx, output, outlen);
    
    // Secure cleanup
    secure_memzero(&ctx, sizeof(ctx));
    
    return PQC_SUCCESS;
}

// Convenience wrappers that replace the simplified Generation 1 implementations
pqc_result_t sha3_256(uint8_t hash[32], const uint8_t *input, size_t inlen) {
    return sha3_256_enhanced(hash, input, inlen);
}

pqc_result_t sha3_512(uint8_t hash[64], const uint8_t *input, size_t inlen) {
    return sha3_512_enhanced(hash, input, inlen);
}

pqc_result_t shake128(uint8_t *output, size_t outlen, const uint8_t *input, size_t inlen) {
    return shake128_enhanced(output, outlen, input, inlen);
}

pqc_result_t shake256(uint8_t *output, size_t outlen, 
                     const uint8_t *input, size_t inlen,
                     const uint8_t *custom, size_t customlen) {
    return shake256_enhanced(output, outlen, input, inlen, custom, customlen);
}

// Additional security-focused hash utilities

pqc_result_t secure_hash_with_salt(uint8_t hash[32], 
                                  const uint8_t *input, size_t inlen,
                                  const uint8_t *salt, size_t saltlen) {
    if (!hash || !input || !salt) {
        return PQC_ERROR_INVALID_PARAMETER;
    }
    
    if (saltlen < 16) { // Minimum salt length
        return PQC_ERROR_INVALID_PARAMETER;
    }
    
    keccak_state_t ctx;
    keccak_init(&ctx, KECCAK_RATE_SHA3_256, 0x06);
    
    // Salt-first construction for better security
    keccak_update(&ctx, salt, saltlen);
    keccak_update(&ctx, input, inlen);
    
    keccak_final(&ctx, hash, 32);
    
    // Secure cleanup
    secure_memzero(&ctx, sizeof(ctx));
    
    return PQC_SUCCESS;
}

pqc_result_t key_derivation_function(uint8_t *output, size_t outlen,
                                    const uint8_t *key, size_t keylen,
                                    const uint8_t *info, size_t infolen,
                                    const uint8_t *salt, size_t saltlen) {
    if (!output || !key) {
        return PQC_ERROR_INVALID_PARAMETER;
    }
    
    if (outlen == 0 || outlen > 8192) { // Reasonable output limit
        return PQC_ERROR_INVALID_PARAMETER;
    }
    
    // HKDF-like construction using SHAKE256
    keccak_state_t ctx;
    keccak_init(&ctx, KECCAK_RATE_SHAKE256, 0x1F);
    
    // Extract phase equivalent
    if (salt && saltlen > 0) {
        keccak_update(&ctx, salt, saltlen);
    }
    keccak_update(&ctx, key, keylen);
    
    // Expand phase equivalent
    if (info && infolen > 0) {
        keccak_update(&ctx, info, infolen);
    }
    
    keccak_final(&ctx, output, outlen);
    
    // Secure cleanup
    secure_memzero(&ctx, sizeof(ctx));
    
    return PQC_SUCCESS;
}

// Self-test function for hash implementations
#ifdef PQC_ENABLE_TESTING
pqc_result_t hash_self_test(void) {
    // Test vectors for SHA3-256
    const char *test_input = "abc";
    const uint8_t expected_sha3_256[32] = {
        0x3a, 0x98, 0x5d, 0xa7, 0x4f, 0xe2, 0x25, 0xb2,
        0x04, 0x5c, 0x17, 0x2d, 0x6b, 0xd3, 0x90, 0xbd,
        0x85, 0x5f, 0x08, 0x6e, 0x3e, 0x9d, 0x52, 0x5b,
        0x46, 0xbf, 0xe2, 0x45, 0x11, 0x43, 0x15, 0x32
    };
    
    uint8_t result[32];
    pqc_result_t status = sha3_256(result, (const uint8_t*)test_input, strlen(test_input));
    
    if (status != PQC_SUCCESS) {
        return status;
    }
    
    if (secure_memcmp(result, expected_sha3_256, 32) != 0) {
        return PQC_ERROR_INTERNAL;
    }
    
    // Test SHAKE128
    uint8_t shake_result[32];
    status = shake128(shake_result, 32, (const uint8_t*)test_input, strlen(test_input));
    
    if (status != PQC_SUCCESS) {
        return status;
    }
    
    // Basic sanity check - output should not be all zeros
    bool all_zero = true;
    for (int i = 0; i < 32; i++) {
        if (shake_result[i] != 0) {
            all_zero = false;
            break;
        }
    }
    
    if (all_zero) {
        return PQC_ERROR_INTERNAL;
    }
    
    return PQC_SUCCESS;
}
#endif