/**
 * @file pqc_common.h
 * @brief Common definitions and utilities for post-quantum cryptography
 * 
 * This header provides common types, constants, and utility functions
 * used across all PQC algorithm implementations.
 */

#ifndef PQC_COMMON_H
#define PQC_COMMON_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

// ============================================================================
// Result Codes
// ============================================================================

/**
 * @brief PQC operation result codes
 */
typedef enum {
    PQC_SUCCESS = 0,                    /**< Operation completed successfully */
    PQC_ERROR_INVALID_PARAMETER = -1,   /**< Invalid parameter provided */
    PQC_ERROR_INSUFFICIENT_MEMORY = -2, /**< Insufficient memory available */
    PQC_ERROR_RANDOM_GENERATION = -3,   /**< Random number generation failed */
    PQC_ERROR_INVALID_SIGNATURE = -4,   /**< Signature verification failed */
    PQC_ERROR_INVALID_CIPHERTEXT = -5,  /**< Ciphertext decryption failed */
    PQC_ERROR_INVALID_KEY = -6,         /**< Key validation failed */
    PQC_ERROR_ALGORITHM_NOT_SUPPORTED = -7, /**< Algorithm not supported */
    PQC_ERROR_HARDWARE_FAILURE = -8,    /**< Hardware operation failed */
    PQC_ERROR_NOT_IMPLEMENTED = -9,     /**< Function not implemented */
    PQC_ERROR_INTERNAL = -10            /**< Internal error occurred */
} pqc_result_t;

// ============================================================================
// Algorithm Identifiers
// ============================================================================

/**
 * @brief Supported PQC algorithms
 */
typedef enum {
    PQC_ALG_KYBER_512 = 1,              /**< Kyber-512 (NIST Level 1) */
    PQC_ALG_KYBER_768 = 2,              /**< Kyber-768 (NIST Level 3) */
    PQC_ALG_KYBER_1024 = 3,             /**< Kyber-1024 (NIST Level 5) */
    PQC_ALG_DILITHIUM_2 = 4,            /**< Dilithium-2 (NIST Level 1) */
    PQC_ALG_DILITHIUM_3 = 5,            /**< Dilithium-3 (NIST Level 3) */
    PQC_ALG_DILITHIUM_5 = 6,            /**< Dilithium-5 (NIST Level 5) */
    PQC_ALG_FALCON_512 = 7,             /**< Falcon-512 (NIST Level 1) */
    PQC_ALG_FALCON_1024 = 8,            /**< Falcon-1024 (NIST Level 5) */
    PQC_ALG_SPHINCS_SHA256_128F = 9,    /**< SPHINCS+ SHA256 128f */
    PQC_ALG_SPHINCS_SHA256_256F = 10,   /**< SPHINCS+ SHA256 256f */
} pqc_algorithm_t;

/**
 * @brief Algorithm categories
 */
typedef enum {
    PQC_CATEGORY_KEM = 1,               /**< Key Encapsulation Mechanism */
    PQC_CATEGORY_SIGNATURE = 2,         /**< Digital Signature */
    PQC_CATEGORY_HYBRID = 3             /**< Hybrid classical + PQC */
} pqc_category_t;

/**
 * @brief Security levels (NIST)
 */
typedef enum {
    PQC_SECURITY_LEVEL_1 = 1,           /**< AES-128 equivalent (128-bit) */
    PQC_SECURITY_LEVEL_3 = 3,           /**< AES-192 equivalent (192-bit) */
    PQC_SECURITY_LEVEL_5 = 5            /**< AES-256 equivalent (256-bit) */
} pqc_security_level_t;

// ============================================================================
// Algorithm Information
// ============================================================================

/**
 * @brief Algorithm information structure
 */
typedef struct {
    pqc_algorithm_t algorithm;          /**< Algorithm identifier */
    pqc_category_t category;            /**< Algorithm category */
    pqc_security_level_t security_level; /**< NIST security level */
    const char *name;                   /**< Human-readable name */
    const char *description;            /**< Algorithm description */
    size_t public_key_bytes;            /**< Public key size in bytes */
    size_t secret_key_bytes;            /**< Secret key size in bytes */
    size_t signature_bytes;             /**< Signature size in bytes (0 for KEM) */
    size_t ciphertext_bytes;            /**< Ciphertext size in bytes (0 for signatures) */
    size_t shared_secret_bytes;         /**< Shared secret size in bytes (0 for signatures) */
    bool constant_time;                 /**< Whether implementation is constant-time */
    bool side_channel_resistant;       /**< Whether implementation resists side-channels */
} pqc_algorithm_info_t;

// ============================================================================
// Configuration and Runtime Options
// ============================================================================

/**
 * @brief PQC runtime configuration
 */
typedef struct {
    bool enable_hybrid_mode;            /**< Enable classical + PQC hybrid */
    bool enable_constant_time;          /**< Enforce constant-time operations */
    bool enable_side_channel_protection; /**< Enable side-channel mitigations */
    uint32_t random_seed;               /**< Random seed for deterministic testing */
    void *hardware_context;             /**< Hardware-specific context */
} pqc_config_t;

/**
 * @brief Performance statistics
 */
typedef struct {
    uint64_t cycles_keygen;             /**< CPU cycles for key generation */
    uint64_t cycles_sign_encaps;        /**< CPU cycles for sign/encapsulation */
    uint64_t cycles_verify_decaps;      /**< CPU cycles for verify/decapsulation */
    uint32_t stack_usage_bytes;         /**< Maximum stack usage in bytes */
    uint32_t heap_usage_bytes;          /**< Heap memory usage in bytes */
    uint32_t operations_count;          /**< Number of operations performed */
} pqc_performance_stats_t;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * @brief Get algorithm information by identifier
 * 
 * @param[in] algorithm Algorithm identifier
 * @return Pointer to algorithm info, or NULL if not found
 */
const pqc_algorithm_info_t* pqc_get_algorithm_info(pqc_algorithm_t algorithm);

/**
 * @brief Get list of supported algorithms
 * 
 * @param[out] algorithms Array to fill with algorithm identifiers
 * @param[in,out] count Input: size of array, Output: number of algorithms
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t pqc_get_supported_algorithms(pqc_algorithm_t *algorithms, size_t *count);

/**
 * @brief Convert result code to human-readable string
 * 
 * @param[in] result Result code to convert
 * @return String description of result code
 */
const char* pqc_result_to_string(pqc_result_t result);

/**
 * @brief Initialize PQC library with configuration
 * 
 * @param[in] config Configuration options (NULL for defaults)
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t pqc_init(const pqc_config_t *config);

/**
 * @brief Cleanup PQC library resources
 */
void pqc_cleanup(void);

/**
 * @brief Get current performance statistics
 * 
 * @param[out] stats Performance statistics structure
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t pqc_get_performance_stats(pqc_performance_stats_t *stats);

/**
 * @brief Reset performance statistics
 */
void pqc_reset_performance_stats(void);

// ============================================================================
// Cryptographic Utilities
// ============================================================================

/**
 * @brief Generate cryptographically secure random bytes
 * 
 * This function provides a secure source of randomness for cryptographic
 * operations. The implementation uses the best available entropy source
 * on the target platform.
 * 
 * @param[out] buffer Buffer to fill with random bytes
 * @param[in] length Number of random bytes to generate
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t pqc_randombytes(uint8_t *buffer, size_t length);

/**
 * @brief SHAKE-128 extendable output function
 * 
 * @param[out] output Output buffer
 * @param[in] outlen Length of output in bytes
 * @param[in] input Input data
 * @param[in] inlen Length of input in bytes
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t shake128(uint8_t *output, size_t outlen, const uint8_t *input, size_t inlen);

/**
 * @brief SHAKE-256 extendable output function
 * 
 * @param[out] output Output buffer
 * @param[in] outlen Length of output in bytes
 * @param[in] input Input data
 * @param[in] inlen Length of input in bytes
 * @param[in] custom Customization string (optional)
 * @param[in] customlen Length of customization string
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t shake256(uint8_t *output, size_t outlen, 
                     const uint8_t *input, size_t inlen,
                     const uint8_t *custom, size_t customlen);

/**
 * @brief SHA3-256 hash function
 * 
 * @param[out] hash Output hash (32 bytes)
 * @param[in] input Input data
 * @param[in] inlen Length of input in bytes
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t sha3_256(uint8_t hash[32], const uint8_t *input, size_t inlen);

/**
 * @brief SHA3-512 hash function
 * 
 * @param[out] hash Output hash (64 bytes)
 * @param[in] input Input data
 * @param[in] inlen Length of input in bytes
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t sha3_512(uint8_t hash[64], const uint8_t *input, size_t inlen);

// ============================================================================
// Memory Management
// ============================================================================

/**
 * @brief Secure memory comparison (constant-time)
 * 
 * This function compares two memory regions in constant time to prevent
 * timing attacks. It should be used for comparing cryptographic values.
 * 
 * @param[in] a First memory region
 * @param[in] b Second memory region
 * @param[in] length Number of bytes to compare
 * @return 0 if equal, non-zero if different
 */
int secure_memcmp(const void *a, const void *b, size_t length);

/**
 * @brief Secure memory zeroing
 * 
 * This function zeros memory in a way that cannot be optimized away by
 * the compiler. It should be used to clear sensitive data.
 * 
 * @param[out] ptr Memory to zero
 * @param[in] length Number of bytes to zero
 */
void secure_memzero(void *ptr, size_t length);

/**
 * @brief Secure memory allocation
 * 
 * @param[in] size Number of bytes to allocate
 * @return Pointer to allocated memory, or NULL on failure
 */
void* secure_malloc(size_t size);

/**
 * @brief Secure memory deallocation
 * 
 * @param[in] ptr Pointer to memory to free
 * @param[in] size Size of memory region to zero before freeing
 */
void secure_free(void *ptr, size_t size);

// ============================================================================
// Error Handling and Logging
// ============================================================================

/**
 * @brief Log levels for PQC operations
 */
typedef enum {
    PQC_LOG_ERROR = 1,                  /**< Error conditions */
    PQC_LOG_WARNING = 2,                /**< Warning conditions */
    PQC_LOG_INFO = 3,                   /**< Informational messages */
    PQC_LOG_DEBUG = 4                   /**< Debug messages */
} pqc_log_level_t;

/**
 * @brief Log callback function type
 * 
 * @param[in] level Log level
 * @param[in] message Log message
 * @param[in] context User-provided context
 */
typedef void (*pqc_log_callback_t)(pqc_log_level_t level, const char *message, void *context);

/**
 * @brief Set log callback function
 * 
 * @param[in] callback Log callback function (NULL to disable logging)
 * @param[in] context User context passed to callback
 */
void pqc_set_log_callback(pqc_log_callback_t callback, void *context);

/**
 * @brief Set minimum log level
 * 
 * @param[in] level Minimum level to log
 */
void pqc_set_log_level(pqc_log_level_t level);

// ============================================================================
// Platform-Specific Optimizations
// ============================================================================

/**
 * @brief Platform capabilities
 */
typedef struct {
    bool has_aes_ni;                    /**< AES-NI instruction support */
    bool has_sha_extensions;            /**< SHA instruction support */
    bool has_avx2;                      /**< AVX2 instruction support */
    bool has_hardware_rng;              /**< Hardware random number generator */
    bool has_constant_time_mul;         /**< Constant-time multiplication */
    bool has_secure_memory;             /**< Secure memory regions */
} pqc_platform_capabilities_t;

/**
 * @brief Get platform capabilities
 * 
 * @param[out] caps Platform capabilities structure
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t pqc_get_platform_capabilities(pqc_platform_capabilities_t *caps);

/**
 * @brief Enable platform-specific optimizations
 * 
 * @param[in] enable_all Enable all available optimizations
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t pqc_enable_optimizations(bool enable_all);

// ============================================================================
// Version Information
// ============================================================================

#define PQC_VERSION_MAJOR 1             /**< Major version number */
#define PQC_VERSION_MINOR 0             /**< Minor version number */
#define PQC_VERSION_PATCH 0             /**< Patch version number */

/**
 * @brief Get library version string
 * 
 * @return Version string (e.g., "1.0.0")
 */
const char* pqc_get_version(void);

/**
 * @brief Get library build information
 * 
 * @return Build information string
 */
const char* pqc_get_build_info(void);

#ifdef __cplusplus
}
#endif

#endif /* PQC_COMMON_H */