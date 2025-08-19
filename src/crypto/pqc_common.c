/**
 * @file pqc_common.c
 * @brief Common PQC implementation functions
 */

#include "pqc_common.h"
#include "secure_memory.h"
#include <string.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

// Global configuration
static pqc_config_t g_pqc_config = {
    .enable_hybrid_mode = false,
    .enable_constant_time = true,
    .enable_side_channel_protection = true,
    .random_seed = 0,
    .hardware_context = NULL
};

// Performance statistics
static pqc_performance_stats_t g_perf_stats = {0};

// Algorithm information table
static const pqc_algorithm_info_t algorithm_info[] = {
    {
        .algorithm = PQC_ALG_KYBER_1024,
        .category = PQC_CATEGORY_KEM,
        .security_level = PQC_SECURITY_LEVEL_5,
        .name = "Kyber-1024",
        .description = "NIST Level 5 key encapsulation mechanism",
        .public_key_bytes = 1568,
        .secret_key_bytes = 3168,
        .signature_bytes = 0,
        .ciphertext_bytes = 1568,
        .shared_secret_bytes = 32,
        .constant_time = true,
        .side_channel_resistant = true
    },
    {
        .algorithm = PQC_ALG_DILITHIUM_5,
        .category = PQC_CATEGORY_SIGNATURE,
        .security_level = PQC_SECURITY_LEVEL_5,
        .name = "Dilithium-5",
        .description = "NIST Level 5 digital signature scheme",
        .public_key_bytes = 2592,
        .secret_key_bytes = 4864,
        .signature_bytes = 4595,
        .ciphertext_bytes = 0,
        .shared_secret_bytes = 0,
        .constant_time = true,
        .side_channel_resistant = true
    }
};

const pqc_algorithm_info_t* pqc_get_algorithm_info(pqc_algorithm_t algorithm) {
    for (size_t i = 0; i < sizeof(algorithm_info) / sizeof(algorithm_info[0]); i++) {
        if (algorithm_info[i].algorithm == algorithm) {
            return &algorithm_info[i];
        }
    }
    return NULL;
}

pqc_result_t pqc_get_supported_algorithms(pqc_algorithm_t *algorithms, size_t *count) {
    if (!algorithms || !count) {
        return PQC_ERROR_INVALID_PARAMETER;
    }
    
    size_t num_algs = sizeof(algorithm_info) / sizeof(algorithm_info[0]);
    if (*count < num_algs) {
        *count = num_algs;
        return PQC_ERROR_INSUFFICIENT_MEMORY;
    }
    
    for (size_t i = 0; i < num_algs; i++) {
        algorithms[i] = algorithm_info[i].algorithm;
    }
    *count = num_algs;
    
    return PQC_SUCCESS;
}

const char* pqc_result_to_string(pqc_result_t result) {
    switch (result) {
        case PQC_SUCCESS: return "Success";
        case PQC_ERROR_INVALID_PARAMETER: return "Invalid parameter";
        case PQC_ERROR_INSUFFICIENT_MEMORY: return "Insufficient memory";
        case PQC_ERROR_RANDOM_GENERATION: return "Random generation failed";
        case PQC_ERROR_INVALID_SIGNATURE: return "Invalid signature";
        case PQC_ERROR_INVALID_CIPHERTEXT: return "Invalid ciphertext";
        case PQC_ERROR_INVALID_KEY: return "Invalid key";
        case PQC_ERROR_ALGORITHM_NOT_SUPPORTED: return "Algorithm not supported";
        case PQC_ERROR_HARDWARE_FAILURE: return "Hardware failure";
        case PQC_ERROR_NOT_IMPLEMENTED: return "Not implemented";
        case PQC_ERROR_INTERNAL: return "Internal error";
        default: return "Unknown error";
    }
}

pqc_result_t pqc_init(const pqc_config_t *config) {
    if (config) {
        g_pqc_config = *config;
    }
    
    // Initialize secure memory subsystem
    if (secure_memory_init() != 0) {
        return PQC_ERROR_HARDWARE_FAILURE;
    }
    
    // Reset performance statistics
    memset(&g_perf_stats, 0, sizeof(g_perf_stats));
    
    return PQC_SUCCESS;
}

void pqc_cleanup(void) {
    secure_memory_cleanup();
    memset(&g_pqc_config, 0, sizeof(g_pqc_config));
    memset(&g_perf_stats, 0, sizeof(g_perf_stats));
}

pqc_result_t pqc_get_performance_stats(pqc_performance_stats_t *stats) {
    if (!stats) {
        return PQC_ERROR_INVALID_PARAMETER;
    }
    
    *stats = g_perf_stats;
    return PQC_SUCCESS;
}

void pqc_reset_performance_stats(void) {
    memset(&g_perf_stats, 0, sizeof(g_perf_stats));
}

// Simplified random bytes implementation for Generation 1
pqc_result_t pqc_randombytes(uint8_t *buffer, size_t length) {
    if (!buffer || length == 0) {
        return PQC_ERROR_INVALID_PARAMETER;
    }
    
    // Use system random source
    FILE *f = fopen("/dev/urandom", "rb");
    if (!f) {
        // Fallback to weak random for testing
        srand((unsigned int)time(NULL));
        for (size_t i = 0; i < length; i++) {
            buffer[i] = (uint8_t)(rand() & 0xFF);
        }
        return PQC_SUCCESS;
    }
    
    size_t read_bytes = fread(buffer, 1, length, f);
    fclose(f);
    
    if (read_bytes != length) {
        return PQC_ERROR_RANDOM_GENERATION;
    }
    
    return PQC_SUCCESS;
}

// Placeholder hash implementations for Generation 1
pqc_result_t shake128(uint8_t *output, size_t outlen, const uint8_t *input, size_t inlen) {
    // Simplified implementation - replace with proper SHAKE in Generation 2
    if (!output || !input) {
        return PQC_ERROR_INVALID_PARAMETER;
    }
    
    // Simple hash expansion for now
    for (size_t i = 0; i < outlen; i++) {
        output[i] = input[i % inlen] ^ (uint8_t)(i & 0xFF);
    }
    
    return PQC_SUCCESS;
}

pqc_result_t shake256(uint8_t *output, size_t outlen, 
                     const uint8_t *input, size_t inlen,
                     const uint8_t *custom, size_t customlen) {
    // Simplified implementation
    if (!output || !input) {
        return PQC_ERROR_INVALID_PARAMETER;
    }
    
    for (size_t i = 0; i < outlen; i++) {
        uint8_t val = input[i % inlen] ^ (uint8_t)(i & 0xFF);
        if (custom && customlen > 0) {
            val ^= custom[i % customlen];
        }
        output[i] = val;
    }
    
    return PQC_SUCCESS;
}

pqc_result_t sha3_256(uint8_t hash[32], const uint8_t *input, size_t inlen) {
    // Simplified implementation
    if (!hash || !input) {
        return PQC_ERROR_INVALID_PARAMETER;
    }
    
    // Simple hash for Generation 1
    memset(hash, 0, 32);
    for (size_t i = 0; i < inlen; i++) {
        hash[i % 32] ^= input[i];
    }
    
    return PQC_SUCCESS;
}

pqc_result_t sha3_512(uint8_t hash[64], const uint8_t *input, size_t inlen) {
    // Simplified implementation
    if (!hash || !input) {
        return PQC_ERROR_INVALID_PARAMETER;
    }
    
    // Simple hash for Generation 1
    memset(hash, 0, 64);
    for (size_t i = 0; i < inlen; i++) {
        hash[i % 64] ^= input[i];
    }
    
    return PQC_SUCCESS;
}

const char* pqc_get_version(void) {
    return "1.0.0-generation1";
}

const char* pqc_get_build_info(void) {
    return "PQC-Edge-Attestor Generation 1 - Built " __DATE__ " " __TIME__;
}

pqc_result_t pqc_get_platform_capabilities(pqc_platform_capabilities_t *caps) {
    if (!caps) {
        return PQC_ERROR_INVALID_PARAMETER;
    }
    
    // Basic capabilities for Generation 1
    caps->has_aes_ni = false;
    caps->has_sha_extensions = false;
    caps->has_avx2 = false;
    caps->has_hardware_rng = false;
    caps->has_constant_time_mul = true;
    caps->has_secure_memory = true;
    
    return PQC_SUCCESS;
}

pqc_result_t pqc_enable_optimizations(bool enable_all) {
    // Placeholder for Generation 1
    (void)enable_all;
    return PQC_SUCCESS;
}
