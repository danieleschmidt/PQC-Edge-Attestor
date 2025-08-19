/**
 * @file tmp2_interface.h
 * @brief TPM 2.0 interface for hardware attestation
 * 
 * This header defines the interface for TPM 2.0 operations used in the
 * attestation engine. Generation 1 provides a simplified simulation.
 */

#ifndef TMP2_INTERFACE_H
#define TMP2_INTERFACE_H

#include "../crypto/pqc_common.h"
#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

// ============================================================================
// Constants and Definitions
// ============================================================================

#define MAX_PCR_REGISTERS        8      /**< Maximum number of PCR registers */
#define TMP2_DIGEST_SIZE        32      /**< SHA-256 digest size */
#define TMP2_MAX_SIGNATURE_SIZE 256     /**< Maximum signature size */
#define TMP2_MAX_KEY_SIZE       512     /**< Maximum key size */

/**
 * @brief TPM 2.0 key types
 */
typedef enum {
    TMP2_KEY_TYPE_RSA_2048 = 1,         /**< RSA 2048-bit key */
    TMP2_KEY_TYPE_RSA_3072 = 2,         /**< RSA 3072-bit key */
    TMP2_KEY_TYPE_ECC_P256 = 3,         /**< ECC P-256 key */
    TMP2_KEY_TYPE_ECC_P384 = 4,         /**< ECC P-384 key */
    TMP2_KEY_TYPE_HMAC = 5,             /**< HMAC key */
    TMP2_KEY_TYPE_SYMMETRIC = 6         /**< Symmetric encryption key */
} tpm2_key_type_t;

/**
 * @brief TPM 2.0 algorithm identifiers
 */
typedef enum {
    TMP2_ALG_SHA1 = 0x0004,             /**< SHA-1 algorithm */
    TMP2_ALG_SHA256 = 0x000B,           /**< SHA-256 algorithm */
    TMP2_ALG_SHA384 = 0x000C,           /**< SHA-384 algorithm */
    TMP2_ALG_SHA512 = 0x000D,           /**< SHA-512 algorithm */
    TMP2_ALG_RSA = 0x0001,              /**< RSA algorithm */
    TMP2_ALG_ECC = 0x0018,              /**< ECC algorithm */
    TMP2_ALG_HMAC = 0x0005,             /**< HMAC algorithm */
    TMP2_ALG_AES = 0x0006               /**< AES algorithm */
} tmp2_algorithm_t;

/**
 * @brief TPM 2.0 capability types
 */
typedef enum {
    TMP2_CAP_TPM_PROPERTIES = 1,        /**< TPM properties */
    TMP2_CAP_ALGORITHMS = 2,            /**< Supported algorithms */
    TMP2_CAP_COMMANDS = 3,              /**< Supported commands */
    TMP2_CAP_PCR_PROPERTIES = 4,        /**< PCR properties */
    TMP2_CAP_HANDLES = 5                /**< Active handles */
} tmp2_capability_t;

/**
 * @brief TPM 2.0 key handle type
 */
typedef uint32_t tmp2_key_handle_t;

// ============================================================================
// Data Structures
// ============================================================================

/**
 * @brief TPM properties structure
 */
typedef struct {
    uint32_t family;                    /**< TPM family (2.0) */
    uint32_t level;                     /**< TPM level */
    uint32_t revision;                  /**< TPM revision */
    uint32_t manufacturer;              /**< Manufacturer ID */
    char vendor_string[64];             /**< Vendor identification string */
} tpm2_tpm_properties_t;

/**
 * @brief Algorithm list structure
 */
typedef struct {
    uint32_t count;                     /**< Number of algorithms */
    tmp2_algorithm_t algorithms[32];    /**< Algorithm list */
} tmp2_algorithm_list_t;

/**
 * @brief PCR properties structure
 */
typedef struct {
    uint32_t pcr_count;                 /**< Number of PCRs */
    uint32_t pcr_sizes[MAX_PCR_REGISTERS]; /**< Size of each PCR */
} tmp2_pcr_properties_t;

/**
 * @brief TPM quote structure
 */
typedef struct {
    uint8_t pcr_selection;              /**< Selected PCRs */
    uint8_t pcr_digest[TMP2_DIGEST_SIZE]; /**< Digest of selected PCRs */
    uint64_t clock;                     /**< TPM clock */
    uint32_t reset_count;               /**< Reset count */
    uint32_t restart_count;             /**< Restart count */
    uint8_t signature[TMP2_MAX_SIGNATURE_SIZE]; /**< Quote signature */
    uint32_t signature_size;            /**< Signature size */
} tmp2_quote_t;

// Core function declarations
pqc_result_t tmp2_init(void);
void tmp2_cleanup(void);
bool tmp2_is_present(void);
pqc_result_t tmp2_self_test(void);
pqc_result_t tmp2_get_capability(tpm2_capability_t capability, void *capability_data);
pqc_result_t tmp2_read_pcr(uint8_t pcr_index, uint8_t pcr_value[32]);
pqc_result_t tmp2_extend_pcr(uint8_t pcr_index, const uint8_t measurement[32]);
pqc_result_t tmp2_quote(uint8_t pcr_mask, uint8_t *quote_data, size_t *quote_size);
uint32_t tmp2_get_extend_count(uint8_t pcr_index);
void tmp2_reset_pcr(uint8_t pcr_index);
pqc_result_t tmp2_create_key(tpm2_key_type_t key_type, tmp2_key_handle_t *key_handle);
pqc_result_t tmp2_load_key(const uint8_t *key_data, size_t key_size, tmp2_key_handle_t *key_handle);
pqc_result_t tmp2_unload_key(tmp2_key_handle_t key_handle);
pqc_result_t tmp2_sign(tpm2_key_handle_t key_handle, const uint8_t *data, size_t data_size, uint8_t *signature, size_t *signature_size);
pqc_result_t tmp2_verify(tmp2_key_handle_t key_handle, const uint8_t *data, size_t data_size, const uint8_t *signature, size_t signature_size);
pqc_result_t tmp2_random(uint8_t *buffer, size_t size);
const char* tmp2_error_to_string(pqc_result_t error);

#ifdef __cplusplus
}
#endif

#endif /* TMP2_INTERFACE_H */