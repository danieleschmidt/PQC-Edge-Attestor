/**
 * @file tpm2_interface.h
 * @brief TPM 2.0 hardware interface for attestation operations
 * 
 * This header defines the interface for TPM 2.0 operations required
 * for hardware-based attestation and secure key storage.
 */

#ifndef TPM2_INTERFACE_H
#define TPM2_INTERFACE_H

#include "../crypto/pqc_common.h"
#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

// ============================================================================
// TPM 2.0 Constants
// ============================================================================

#define TPM2_MAX_PCR_REGISTERS      24      /**< Maximum PCR registers in TPM 2.0 */
#define TPM2_DIGEST_SIZE           32      /**< SHA-256 digest size */
#define TPM2_MAX_KEY_SIZE          512     /**< Maximum key size in bytes */
#define TPM2_MAX_RANDOM_SIZE       32      /**< Maximum random bytes per request */

// TPM 2.0 Algorithm IDs (subset used in this implementation)
#define TPM2_ALG_SHA256            0x000B  /**< SHA-256 hash algorithm */
#define TPM2_ALG_RSA               0x0001  /**< RSA algorithm */
#define TPM2_ALG_ECC               0x0018  /**< Elliptic Curve algorithm */
#define TPM2_ALG_HMAC              0x0005  /**< HMAC algorithm */

// TPM 2.0 Object Types
#define TPM2_ST_HASHCHECK          0x8000  /**< Hash check session */
#define TPM2_ST_NO_SESSIONS        0x8001  /**< No sessions */

// ============================================================================
// TPM 2.0 Structures
// ============================================================================

/**
 * @brief TPM 2.0 capability information
 */
typedef struct {
    bool present;                           /**< TPM present and accessible */
    uint32_t manufacturer_id;               /**< TPM manufacturer ID */
    uint32_t firmware_version;              /**< TPM firmware version */
    uint32_t max_pcr_banks;                 /**< Number of PCR banks */
    bool sha256_supported;                  /**< SHA-256 support */
    bool rsa_supported;                     /**< RSA support */
    bool ecc_supported;                     /**< ECC support */
    bool random_supported;                  /**< Random number generation */
} tpm2_capability_t;

/**
 * @brief TPM 2.0 PCR bank information
 */
typedef struct {
    uint16_t hash_algorithm;                /**< Hash algorithm ID */
    uint8_t pcr_values[TPM2_MAX_PCR_REGISTERS][TPM2_DIGEST_SIZE]; /**< PCR values */
    bool pcr_valid[TPM2_MAX_PCR_REGISTERS]; /**< PCR validity flags */
} tpm2_pcr_bank_t;

/**
 * @brief TPM 2.0 attestation quote
 */
typedef struct {
    uint8_t pcr_digest[TPM2_DIGEST_SIZE];   /**< Digest of selected PCRs */
    uint8_t signature[256];                 /**< TPM signature */
    uint16_t signature_length;              /**< Signature length */
    uint8_t nonce[16];                      /**< Anti-replay nonce */
    uint64_t timestamp;                     /**< Quote timestamp */
} tmp2_quote_t;

/**
 * @brief TPM 2.0 key information
 */
typedef struct {
    uint32_t key_handle;                    /**< TPM key handle */
    uint16_t key_algorithm;                 /**< Key algorithm */
    uint16_t key_size;                      /**< Key size in bits */
    uint8_t public_key[TPM2_MAX_KEY_SIZE];  /**< Public key data */
    uint16_t public_key_length;             /**< Public key length */
    bool persistent;                        /**< Persistent key flag */
} tpm2_key_info_t;

// ============================================================================
// Core TPM 2.0 Functions
// ============================================================================

/**
 * @brief Initialize TPM 2.0 interface
 * 
 * This function initializes the TPM 2.0 hardware interface and performs
 * basic capability detection and self-tests.
 * 
 * @return PQC_SUCCESS on success, error code on failure
 * 
 * @note This function must be called before any TPM operations.
 * @note TPM 2.0 hardware must be present and accessible.
 */
pqc_result_t tpm2_init(void);

/**
 * @brief Cleanup TPM 2.0 interface
 * 
 * This function cleans up TPM resources and closes the hardware interface.
 */
void tmp2_cleanup(void);

/**
 * @brief Get TPM 2.0 capabilities
 * 
 * This function retrieves TPM capabilities including supported algorithms,
 * PCR banks, and hardware features.
 * 
 * @param[out] capabilities TPM capability information
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t tpm2_get_capabilities(tpm2_capability_t *capabilities);

// ============================================================================
// PCR Operations
// ============================================================================

/**
 * @brief Read PCR value
 * 
 * This function reads the current value of a Platform Configuration Register.
 * 
 * @param[in] pcr_index PCR index (0-23)
 * @param[out] pcr_value PCR value (32 bytes)
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t tpm2_read_pcr(uint8_t pcr_index, uint8_t pcr_value[TPM2_DIGEST_SIZE]);

/**
 * @brief Extend PCR value
 * 
 * This function extends a PCR with a measurement value using the formula:
 * PCR_new = SHA-256(PCR_old || measurement)
 * 
 * @param[in] pcr_index PCR index (0-23)
 * @param[in] measurement Measurement value to extend (32 bytes)
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t tpm2_extend_pcr(uint8_t pcr_index, const uint8_t measurement[TPM2_DIGEST_SIZE]);

/**
 * @brief Reset PCR value
 * 
 * This function resets a PCR to its default value (all zeros).
 * 
 * @param[in] pcr_index PCR index (0-23)
 * @return PQC_SUCCESS on success, error code on failure
 * 
 * @note Not all PCRs can be reset depending on platform policy.
 */
pqc_result_t tpm2_reset_pcr(uint8_t pcr_index);

/**
 * @brief Read multiple PCR values
 * 
 * This function reads values from multiple PCRs in a single operation.
 * 
 * @param[in] pcr_mask Bitmask of PCRs to read
 * @param[out] pcr_bank PCR bank with values
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t tpm2_read_pcr_bank(uint32_t pcr_mask, tpm2_pcr_bank_t *pcr_bank);

// ============================================================================
// Attestation Operations
// ============================================================================

/**
 * @brief Generate attestation quote
 * 
 * This function generates a TPM attestation quote containing PCR values
 * and a cryptographic signature for remote verification.
 * 
 * @param[in] pcr_mask Bitmask of PCRs to include
 * @param[in] nonce Anti-replay nonce
 * @param[in] nonce_size Nonce size in bytes
 * @param[out] quote Generated attestation quote
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t tpm2_generate_quote(uint32_t pcr_mask, 
                                const uint8_t *nonce, 
                                size_t nonce_size,
                                tmp2_quote_t *quote);

/**
 * @brief Verify attestation quote
 * 
 * This function verifies a TPM attestation quote using the TPM's public
 * attestation key.
 * 
 * @param[in] quote Attestation quote to verify
 * @param[in] public_key TPM public key for verification
 * @return PQC_SUCCESS if valid, error code if invalid
 */
pqc_result_t tpm2_verify_quote(const tmp2_quote_t *quote,
                              const tmp2_key_info_t *public_key);

// ============================================================================
// Key Management
// ============================================================================

/**
 * @brief Generate TPM key
 * 
 * This function generates a new cryptographic key within the TPM.
 * 
 * @param[in] algorithm Key algorithm (RSA, ECC, etc.)
 * @param[in] key_size Key size in bits
 * @param[in] persistent Whether to make key persistent
 * @param[out] key_info Generated key information
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t tpm2_generate_key(uint16_t algorithm,
                              uint16_t key_size,
                              bool persistent,
                              tpm2_key_info_t *key_info);

/**
 * @brief Load TPM key
 * 
 * This function loads a previously generated key into the TPM.
 * 
 * @param[in] key_data Key data to load
 * @param[in] key_size Key data size
 * @param[out] key_info Loaded key information
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t tpm2_load_key(const uint8_t *key_data,
                          size_t key_size,
                          tpm2_key_info_t *key_info);

/**
 * @brief Delete TPM key
 * 
 * This function deletes a key from the TPM.
 * 
 * @param[in] key_handle Key handle to delete
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t tpm2_delete_key(uint32_t key_handle);

/**
 * @brief Get public key
 * 
 * This function retrieves the public portion of a TPM key.
 * 
 * @param[in] key_handle Key handle
 * @param[out] public_key Public key data
 * @param[in,out] key_size Input: buffer size, Output: actual size
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t tpm2_get_public_key(uint32_t key_handle,
                                uint8_t *public_key,
                                size_t *key_size);

// ============================================================================
// Cryptographic Operations
// ============================================================================

/**
 * @brief Generate random bytes
 * 
 * This function generates cryptographically secure random bytes using
 * the TPM's hardware random number generator.
 * 
 * @param[out] buffer Buffer for random bytes
 * @param[in] size Number of random bytes to generate
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t tpm2_get_random(uint8_t *buffer, size_t size);

/**
 * @brief Compute hash
 * 
 * This function computes a hash using the TPM's hash engine.
 * 
 * @param[in] algorithm Hash algorithm
 * @param[in] data Data to hash
 * @param[in] data_size Size of data
 * @param[out] hash Computed hash
 * @param[in,out] hash_size Input: buffer size, Output: actual size
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t tpm2_hash(uint16_t algorithm,
                      const uint8_t *data,
                      size_t data_size,
                      uint8_t *hash,
                      size_t *hash_size);

/**
 * @brief Sign data with TPM key
 * 
 * This function signs data using a TPM-resident key.
 * 
 * @param[in] key_handle Key handle for signing
 * @param[in] data Data to sign
 * @param[in] data_size Size of data
 * @param[out] signature Computed signature
 * @param[in,out] sig_size Input: buffer size, Output: actual size
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t tpm2_sign(uint32_t key_handle,
                      const uint8_t *data,
                      size_t data_size,
                      uint8_t *signature,
                      size_t *sig_size);

/**
 * @brief Verify signature with TPM key
 * 
 * This function verifies a signature using a TPM-resident key.
 * 
 * @param[in] key_handle Key handle for verification
 * @param[in] data Original data
 * @param[in] data_size Size of data
 * @param[in] signature Signature to verify
 * @param[in] sig_size Signature size
 * @return PQC_SUCCESS if valid, error code if invalid
 */
pqc_result_t tpm2_verify(uint32_t key_handle,
                        const uint8_t *data,
                        size_t data_size,
                        const uint8_t *signature,
                        size_t sig_size);

// ============================================================================
// Secure Storage
// ============================================================================

/**
 * @brief Store data in TPM NVRAM
 * 
 * This function stores data in TPM non-volatile memory.
 * 
 * @param[in] index NVRAM index
 * @param[in] data Data to store
 * @param[in] data_size Size of data
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t tpm2_nv_write(uint32_t index,
                          const uint8_t *data,
                          size_t data_size);

/**
 * @brief Read data from TPM NVRAM
 * 
 * This function reads data from TPM non-volatile memory.
 * 
 * @param[in] index NVRAM index
 * @param[out] data Buffer for data
 * @param[in,out] data_size Input: buffer size, Output: actual size
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t tpm2_nv_read(uint32_t index,
                         uint8_t *data,
                         size_t *data_size);

/**
 * @brief Define NVRAM space
 * 
 * This function defines a new NVRAM space in the TPM.
 * 
 * @param[in] index NVRAM index
 * @param[in] size Size of space in bytes
 * @param[in] attributes Access attributes
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t tpm2_nv_define(uint32_t index,
                           size_t size,
                           uint32_t attributes);

/**
 * @brief Undefine NVRAM space
 * 
 * This function removes an NVRAM space from the TPM.
 * 
 * @param[in] index NVRAM index
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t tpm2_nv_undefine(uint32_t index);

// ============================================================================
// Platform Security
// ============================================================================

/**
 * @brief Get TPM clock
 * 
 * This function retrieves the TPM's secure clock value.
 * 
 * @param[out] clock_value Current clock value
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t tpm2_get_clock(uint64_t *clock_value);

/**
 * @brief Perform TPM self-test
 * 
 * This function performs TPM self-tests to verify correct operation.
 * 
 * @return PQC_SUCCESS if tests pass, error code on failure
 */
pqc_result_t tpm2_self_test(void);

/**
 * @brief Check TPM status
 * 
 * This function checks the current TPM status and health.
 * 
 * @param[out] status_ok True if TPM is healthy
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t tpm2_get_status(bool *status_ok);

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * @brief Check if TPM is present
 * 
 * @return true if TPM is present and accessible
 */
bool tpm2_is_present(void);

/**
 * @brief Get TPM error string
 * 
 * @param[in] error_code TPM error code
 * @return Human-readable error description
 */
const char* tpm2_error_to_string(uint32_t error_code);

/**
 * @brief Enable TPM debug logging
 * 
 * @param[in] enable True to enable debug logging
 */
void tpm2_set_debug(bool enable);

// ============================================================================
// Testing Functions
// ============================================================================

#ifdef PQC_ENABLE_TESTING
/**
 * @brief Run TPM self-tests
 * 
 * @return PQC_SUCCESS if all tests pass
 */
pqc_result_t tpm2_run_tests(void);

/**
 * @brief Simulate TPM for testing
 * 
 * @param[in] enable True to enable TPM simulation
 * @return PQC_SUCCESS on success
 */
pqc_result_t tpm2_enable_simulation(bool enable);
#endif

#ifdef __cplusplus
}
#endif

#endif /* TPM2_INTERFACE_H */