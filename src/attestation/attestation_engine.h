/**
 * @file attestation_engine.h
 * @brief Hardware attestation engine interface for IoT devices
 * 
 * This header defines the API for hardware-based device attestation using
 * TPM 2.0 and post-quantum cryptographic signatures.
 */

#ifndef ATTESTATION_ENGINE_H
#define ATTESTATION_ENGINE_H

#include "../crypto/pqc_common.h"
#include "../crypto/dilithium.h"
#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>
#include <time.h>

#ifdef __cplusplus
extern "C" {
#endif

// ============================================================================
// Constants and Limits
// ============================================================================

#define MAX_PCR_REGISTERS            8      /**< Maximum number of PCR registers */
#define MAX_MEASUREMENT_LOG_ENTRIES  256    /**< Maximum measurement log entries */
#define MAX_MEASUREMENTS_PER_REPORT  32     /**< Maximum measurements per report */
#define ATTESTATION_REPORT_VERSION   1      /**< Current report format version */
#define DEVICE_ID_LENGTH            32      /**< Device identifier length */
#define SERIAL_NUMBER_LENGTH        64      /**< Serial number string length */

// ============================================================================
// Device Types and Identification
// ============================================================================

/**
 * @brief Device types supported by the attestation framework
 */
typedef enum {
    DEVICE_TYPE_UNKNOWN = 0,                /**< Unknown device type */
    DEVICE_TYPE_SMART_METER = 1,            /**< Smart electricity meter */
    DEVICE_TYPE_EV_CHARGER = 2,             /**< Electric vehicle charger */
    DEVICE_TYPE_GRID_CONTROLLER = 3,        /**< Grid control system */
    DEVICE_TYPE_IOT_GATEWAY = 4,            /**< IoT aggregation gateway */
    DEVICE_TYPE_SENSOR_NODE = 5,            /**< Environmental sensor node */
    DEVICE_TYPE_DEVELOPMENT_BOARD = 99      /**< Development/testing board */
} device_type_t;

/**
 * @brief Measurement types for platform integrity
 */
typedef enum {
    MEASUREMENT_TYPE_FIRMWARE = 0,          /**< Firmware/bootloader measurement */
    MEASUREMENT_TYPE_CONFIGURATION = 1,     /**< Device configuration */
    MEASUREMENT_TYPE_RUNTIME = 2,           /**< Runtime application state */
    MEASUREMENT_TYPE_KEYS = 3,              /**< Cryptographic key material */
    MEASUREMENT_TYPE_NETWORK_CONFIG = 4,    /**< Network configuration */
    MEASUREMENT_TYPE_DEVICE_IDENTITY = 5,   /**< Device identity information */
    MEASUREMENT_TYPE_POLICY = 6,            /**< Security policy configuration */
    MEASUREMENT_TYPE_CUSTOM = 7,            /**< Custom measurement */
    MEASUREMENT_TYPE_MAX = 8                /**< Maximum measurement type */
} measurement_type_t;

/**
 * @brief Trust levels for attestation results
 */
typedef enum {
    TRUST_LEVEL_UNKNOWN = 0,                /**< Cannot determine trust level */
    TRUST_LEVEL_LOW = 1,                    /**< Low trust (warnings present) */
    TRUST_LEVEL_MEDIUM = 2,                 /**< Medium trust (minor issues) */
    TRUST_LEVEL_HIGH = 3,                   /**< High trust (all checks pass) */
    TRUST_LEVEL_CRITICAL = 4                /**< Critical trust (perfect state) */
} trust_level_t;

/**
 * @brief Attestation error codes
 */
typedef enum {
    ATTESTATION_ERROR_NONE = 0,             /**< No error */
    ATTESTATION_ERROR_INVALID_FORMAT = 1,   /**< Invalid report format */
    ATTESTATION_ERROR_SIGNATURE_INVALID = 2, /**< Invalid signature */
    ATTESTATION_ERROR_TIMESTAMP_INVALID = 3, /**< Invalid timestamp */
    ATTESTATION_ERROR_INVALID_PCR = 4,      /**< Invalid PCR value */
    ATTESTATION_ERROR_INVALID_MEASUREMENT = 5, /**< Invalid measurement */
    ATTESTATION_ERROR_POLICY_VIOLATION = 6, /**< Security policy violation */
    ATTESTATION_ERROR_EXPIRED = 7,          /**< Certificate or report expired */
    ATTESTATION_ERROR_REVOKED = 8,          /**< Certificate revoked */
    ATTESTATION_ERROR_UNKNOWN_DEVICE = 9    /**< Unknown device */
} attestation_error_t;

// ============================================================================
// Data Structures
// ============================================================================

/**
 * @brief Device information structure
 */
typedef struct {
    char serial_number[SERIAL_NUMBER_LENGTH]; /**< Device serial number */
    device_type_t device_type;                /**< Device type identifier */
    uint32_t hardware_version;                /**< Hardware version */
    uint32_t firmware_version;                /**< Firmware version */
    uint8_t manufacturer_id[16];              /**< Manufacturer identifier */
    uint8_t model_id[16];                     /**< Device model identifier */
} device_info_t;

/**
 * @brief Platform measurement structure
 */
typedef struct {
    uint8_t pcr_index;                        /**< PCR register index */
    measurement_type_t measurement_type;      /**< Type of measurement */
    uint8_t measurement_value[32];            /**< SHA-256 measurement value */
    uint64_t timestamp;                       /**< Measurement timestamp */
    uint32_t measurement_size;                /**< Size of measured data */
    char description[64];                     /**< Human-readable description */
} platform_measurement_t;

/**
 * @brief Measurement log structure
 */
typedef struct {
    size_t count;                             /**< Number of measurements */
    size_t capacity;                          /**< Maximum number of measurements */
    platform_measurement_t measurements[MAX_MEASUREMENT_LOG_ENTRIES]; /**< Measurement entries */
} measurement_log_t;

/**
 * @brief Attestation report structure
 */
typedef struct {
    uint8_t device_id[DEVICE_ID_LENGTH];     /**< Device identifier */
    uint64_t timestamp;                       /**< Report generation time */
    uint32_t report_version;                  /**< Report format version */
    uint32_t measurement_count;               /**< Number of measurements */
    uint8_t pcr_values[MAX_PCR_REGISTERS][32]; /**< PCR register values */
    platform_measurement_t measurements[MAX_MEASUREMENTS_PER_REPORT]; /**< Platform measurements */
    uint32_t signature_length;               /**< Signature length */
    uint8_t signature[DILITHIUM_SIGNATUREBYTES]; /**< PQC digital signature */
} attestation_report_t;

/**
 * @brief Device certificate structure
 */
typedef struct {
    dilithium_public_key_t public_key;       /**< Device public key */
    device_info_t device_info;               /**< Device information */
    uint32_t certificate_version;            /**< Certificate format version */
    uint64_t issued_timestamp;               /**< Certificate issue time */
    uint64_t expiry_timestamp;               /**< Certificate expiry time */
    pqc_algorithm_t algorithm_id;             /**< Signature algorithm used */
    uint32_t ca_signature_length;            /**< CA signature length */
    uint8_t ca_signature[DILITHIUM_SIGNATUREBYTES]; /**< CA signature */
} device_certificate_t;

/**
 * @brief Attestation verification result
 */
typedef struct {
    bool is_valid;                            /**< Overall validity */
    attestation_error_t error_code;          /**< Error code if invalid */
    trust_level_t trust_level;               /**< Computed trust level */
    uint8_t device_id[DEVICE_ID_LENGTH];     /**< Device identifier */
    uint64_t timestamp;                       /**< Report timestamp */
    uint32_t policies_met;                    /**< Bitmask of policies met */
    char error_description[128];              /**< Human-readable error */
} attestation_verification_result_t;

/**
 * @brief Attestation configuration
 */
typedef struct {
    device_type_t device_type;               /**< Device type */
    char device_serial[SERIAL_NUMBER_LENGTH]; /**< Device serial number */
    bool enable_continuous_monitoring;       /**< Enable continuous attestation */
    uint32_t attestation_interval_minutes;   /**< Attestation frequency */
    bool require_tpm_presence;               /**< Require TPM 2.0 hardware */
    bool enable_measurement_log;             /**< Enable measurement logging */
    uint32_t max_log_entries;                /**< Maximum log entries to keep */
} attestation_config_t;

/**
 * @brief Attestation context (internal)
 */
typedef struct {
    attestation_config_t config;             /**< Configuration settings */
    device_info_t device_info;               /**< Device information */
    dilithium_keypair_t device_keypair;      /**< Device key pair */
    bool device_keypair_valid;               /**< Whether keypair is valid */
    uint8_t pcr_values[MAX_PCR_REGISTERS][32]; /**< Cached PCR values */
    bool pcr_valid[MAX_PCR_REGISTERS];       /**< PCR validity flags */
    measurement_log_t measurement_log;       /**< Measurement history */
    uint64_t last_attestation_time;          /**< Last attestation timestamp */
} attestation_context_t;

// ============================================================================
// Core Attestation Functions
// ============================================================================

/**
 * @brief Initialize the attestation engine
 * 
 * This function initializes the attestation subsystem, including TPM interface,
 * device identification, and cryptographic key management.
 * 
 * @param[in] config Attestation configuration
 * @return PQC_SUCCESS on success, error code on failure
 * 
 * @note This function must be called before any other attestation operations.
 * @note TPM 2.0 hardware must be available and properly initialized.
 */
pqc_result_t attestation_init(const attestation_config_t *config);

/**
 * @brief Cleanup attestation engine resources
 * 
 * This function cleans up all attestation resources and securely clears
 * sensitive data from memory.
 */
void attestation_cleanup(void);

/**
 * @brief Collect platform measurements
 * 
 * This function collects integrity measurements from various platform
 * components and extends the appropriate PCR registers.
 * 
 * @return PQC_SUCCESS on success, error code on failure
 * 
 * @note This function should be called periodically or on security events.
 * @note Measurements are automatically logged if logging is enabled.
 */
pqc_result_t attestation_collect_measurements(void);

/**
 * @brief Generate attestation report
 * 
 * This function generates a complete attestation report including all
 * platform measurements, PCR values, and a cryptographic signature.
 * 
 * @param[out] report Generated attestation report
 * @return PQC_SUCCESS on success, error code on failure
 * 
 * @note The report is signed with the device's attestation key.
 * @note Current measurements are automatically collected if needed.
 */
pqc_result_t attestation_generate_report(attestation_report_t *report);

/**
 * @brief Verify attestation report
 * 
 * This function verifies the cryptographic signature and integrity of
 * an attestation report received from a device.
 * 
 * @param[in] report Attestation report to verify
 * @param[in] device_public_key Device's public key for verification
 * @param[out] result_out Verification result details
 * @return PQC_SUCCESS on success, error code on failure
 * 
 * @note This function performs cryptographic and policy validation.
 * @note The result structure contains detailed verification information.
 */
pqc_result_t attestation_verify_report(const attestation_report_t *report,
                                      const dilithium_public_key_t *device_public_key,
                                      attestation_verification_result_t *result_out);

// ============================================================================
// Certificate and Key Management
// ============================================================================

/**
 * @brief Get device certificate
 * 
 * This function generates or retrieves the device certificate containing
 * the device's public key and identifying information.
 * 
 * @param[out] cert Device certificate
 * @return PQC_SUCCESS on success, error code on failure
 * 
 * @note In production, certificates should be issued by a trusted CA.
 * @note This implementation creates self-signed certificates.
 */
pqc_result_t attestation_get_device_certificate(device_certificate_t *cert);

/**
 * @brief Load device certificate and key
 * 
 * This function loads a device certificate and private key from storage
 * for use in attestation operations.
 * 
 * @param[in] cert Device certificate
 * @param[in] private_key Device private key
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t attestation_load_device_credentials(const device_certificate_t *cert,
                                                const dilithium_secret_key_t *private_key);

// ============================================================================
// Measurement and PCR Functions
// ============================================================================

/**
 * @brief Get current PCR values
 * 
 * This function retrieves the current values of all Platform Configuration
 * Registers from the TPM.
 * 
 * @param[out] pcr_values Array of PCR values (32 bytes each)
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t attestation_get_pcr_values(uint8_t pcr_values[MAX_PCR_REGISTERS][32]);

/**
 * @brief Get measurement log
 * 
 * This function retrieves the complete measurement log containing all
 * platform measurements collected since initialization.
 * 
 * @param[out] log Measurement log structure
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t attestation_get_measurement_log(measurement_log_t *log);

/**
 * @brief Add custom measurement
 * 
 * This function allows applications to add custom measurements to the
 * attestation system for application-specific integrity verification.
 * 
 * @param[in] measurement_type Type of measurement
 * @param[in] data Data to measure
 * @param[in] data_size Size of data to measure
 * @param[in] description Human-readable description
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t attestation_add_custom_measurement(measurement_type_t measurement_type,
                                               const uint8_t *data,
                                               size_t data_size,
                                               const char *description);

// ============================================================================
// Policy and Verification
// ============================================================================

/**
 * @brief Set attestation policy
 * 
 * This function configures the attestation policy used for report verification
 * and trust level computation.
 * 
 * @param[in] policy Policy configuration
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t attestation_set_policy(const void *policy);

/**
 * @brief Evaluate measurement against policy
 * 
 * This function evaluates a single measurement against the configured
 * attestation policy to determine compliance.
 * 
 * @param[in] measurement Measurement to evaluate
 * @param[out] compliant Whether measurement meets policy
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t attestation_evaluate_measurement(const platform_measurement_t *measurement,
                                             bool *compliant);

// ============================================================================
// Utility and Status Functions
// ============================================================================

/**
 * @brief Check if attestation is initialized
 * 
 * @return true if initialized, false otherwise
 */
bool attestation_is_initialized(void);

/**
 * @brief Get attestation statistics
 * 
 * This function retrieves statistics about attestation operations including
 * success rates, timing information, and error counts.
 * 
 * @param[out] stats Statistics structure
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t attestation_get_statistics(void *stats);

/**
 * @brief Reset attestation statistics
 */
void attestation_reset_statistics(void);

/**
 * @brief Convert attestation error to string
 * 
 * @param[in] error Error code
 * @return Human-readable error description
 */
const char* attestation_error_to_string(attestation_error_t error);

/**
 * @brief Convert device type to string
 * 
 * @param[in] device_type Device type
 * @return Human-readable device type name
 */
const char* device_type_to_string(device_type_t device_type);

/**
 * @brief Convert measurement type to string
 * 
 * @param[in] measurement_type Measurement type
 * @return Human-readable measurement type name
 */
const char* measurement_type_to_string(measurement_type_t measurement_type);

// ============================================================================
// Testing and Debugging
// ============================================================================

#ifdef PQC_ENABLE_TESTING
/**
 * @brief Run attestation self-tests
 * 
 * @return PQC_SUCCESS if all tests pass, error code otherwise
 */
pqc_result_t attestation_self_test(void);

/**
 * @brief Generate test attestation report
 * 
 * @param[out] report Test report
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t attestation_generate_test_report(attestation_report_t *report);

/**
 * @brief Simulate measurement for testing
 * 
 * @param[in] measurement_type Type of measurement to simulate
 * @param[in] test_data Test data to measure
 * @param[in] data_size Size of test data
 * @return PQC_SUCCESS on success, error code on failure
 */
pqc_result_t attestation_simulate_measurement(measurement_type_t measurement_type,
                                             const uint8_t *test_data,
                                             size_t data_size);
#endif

#ifdef __cplusplus
}
#endif

#endif /* ATTESTATION_ENGINE_H */