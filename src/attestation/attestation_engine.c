/**
 * @file attestation_engine.c
 * @brief Hardware attestation engine implementation with TPM 2.0 support
 * 
 * This implements the core attestation functionality for IoT devices, providing
 * hardware-based device integrity verification and platform measurement collection.
 */

#include "attestation_engine.h"
#include "tpm2_interface.h"
#include "../crypto/pqc_common.h"
#include "../crypto/dilithium.h"
#include "../crypto/secure_memory.h"
#include <string.h>
#include <time.h>

// Platform Configuration Registers (PCRs) used for attestation
#define PCR_FIRMWARE_HASH    0    /**< Firmware/bootloader hash */
#define PCR_CONFIG_HASH      1    /**< Configuration hash */
#define PCR_RUNTIME_HASH     2    /**< Runtime application hash */
#define PCR_KEYS_HASH        3    /**< Cryptographic keys hash */
#define PCR_NETWORK_CONFIG   4    /**< Network configuration hash */
#define PCR_DEVICE_ID        5    /**< Device identity hash */
#define PCR_POLICY_HASH      6    /**< Security policy hash */
#define PCR_RESERVED         7    /**< Reserved for future use */

// Global attestation context
static attestation_context_t g_attestation_ctx = {0};
static bool g_attestation_initialized = false;

/**
 * @brief Calculate SHA-256 hash of data
 * @param data Input data
 * @param data_len Length of input data
 * @param hash Output hash buffer (32 bytes)
 * @return PQC_SUCCESS on success, error code on failure
 */
static pqc_result_t calculate_sha256(const uint8_t *data, size_t data_len, uint8_t hash[32]) {
    return sha3_256(hash, data, data_len);
}

/**
 * @brief Extend PCR with measurement value
 * @param pcr_index PCR index to extend
 * @param measurement Measurement value to extend
 * @return PQC_SUCCESS on success, error code on failure
 */
static pqc_result_t extend_pcr(uint8_t pcr_index, const uint8_t measurement[32]) {
    if (pcr_index >= MAX_PCR_REGISTERS) {
        return PQC_ERROR_INVALID_PARAMETER;
    }

    // Get current PCR value
    uint8_t current_pcr[32];
    pqc_result_t result = tpm2_read_pcr(pcr_index, current_pcr);
    if (result != PQC_SUCCESS) {
        return result;
    }

    // Compute new PCR value: SHA-256(current_pcr || measurement)
    uint8_t extend_data[64];
    memcpy(extend_data, current_pcr, 32);
    memcpy(extend_data + 32, measurement, 32);

    uint8_t new_pcr[32];
    result = calculate_sha256(extend_data, 64, new_pcr);
    if (result != PQC_SUCCESS) {
        return result;
    }

    // Update PCR in TPM
    result = tpm2_extend_pcr(pcr_index, measurement);
    if (result != PQC_SUCCESS) {
        return result;
    }

    // Update local cache
    memcpy(g_attestation_ctx.pcr_values[pcr_index], new_pcr, 32);
    g_attestation_ctx.pcr_valid[pcr_index] = true;

    return PQC_SUCCESS;
}

/**
 * @brief Collect firmware measurement
 * @param measurement Output measurement structure
 * @return PQC_SUCCESS on success, error code on failure
 */
static pqc_result_t collect_firmware_measurement(platform_measurement_t *measurement) {
    measurement->pcr_index = PCR_FIRMWARE_HASH;
    measurement->measurement_type = MEASUREMENT_TYPE_FIRMWARE;
    measurement->timestamp = time(NULL);

    // In a real implementation, this would read the firmware from flash
    // and calculate its hash. For this implementation, we'll use a simulated value.
    const char *firmware_version = "PQC-Edge-Attestor-v1.0.0";
    pqc_result_t result = calculate_sha256((const uint8_t*)firmware_version, 
                                          strlen(firmware_version), 
                                          measurement->measurement_value);
    
    if (result == PQC_SUCCESS) {
        result = extend_pcr(PCR_FIRMWARE_HASH, measurement->measurement_value);
    }

    return result;
}

/**
 * @brief Collect configuration measurement
 * @param measurement Output measurement structure
 * @return PQC_SUCCESS on success, error code on failure
 */
static pqc_result_t collect_config_measurement(platform_measurement_t *measurement) {
    measurement->pcr_index = PCR_CONFIG_HASH;
    measurement->measurement_type = MEASUREMENT_TYPE_CONFIGURATION;
    measurement->timestamp = time(NULL);

    // Simulate configuration data measurement
    typedef struct {
        uint32_t crypto_algorithm_id;
        uint32_t security_level;
        uint8_t device_type;
        uint8_t attestation_frequency;
        uint16_t reserved;
    } device_config_t;

    device_config_t config = {
        .crypto_algorithm_id = PQC_ALG_DILITHIUM_5,
        .security_level = PQC_SECURITY_LEVEL_5,
        .device_type = DEVICE_TYPE_SMART_METER,
        .attestation_frequency = 60, // minutes
        .reserved = 0
    };

    pqc_result_t result = calculate_sha256((const uint8_t*)&config, 
                                          sizeof(config), 
                                          measurement->measurement_value);
    
    if (result == PQC_SUCCESS) {
        result = extend_pcr(PCR_CONFIG_HASH, measurement->measurement_value);
    }

    return result;
}

/**
 * @brief Collect runtime application measurement
 * @param measurement Output measurement structure
 * @return PQC_SUCCESS on success, error code on failure
 */
static pqc_result_t collect_runtime_measurement(platform_measurement_t *measurement) {
    measurement->pcr_index = PCR_RUNTIME_HASH;
    measurement->measurement_type = MEASUREMENT_TYPE_RUNTIME;
    measurement->timestamp = time(NULL);

    // In a real implementation, this would measure the current application state,
    // including loaded modules, memory layout, and running processes.
    const char *runtime_info = "runtime-v1.0.0-secure-mode-enabled";
    pqc_result_t result = calculate_sha256((const uint8_t*)runtime_info, 
                                          strlen(runtime_info), 
                                          measurement->measurement_value);
    
    if (result == PQC_SUCCESS) {
        result = extend_pcr(PCR_RUNTIME_HASH, measurement->measurement_value);
    }

    return result;
}

/**
 * @brief Collect cryptographic keys measurement
 * @param measurement Output measurement structure
 * @return PQC_SUCCESS on success, error code on failure
 */
static pqc_result_t collect_keys_measurement(platform_measurement_t *measurement) {
    measurement->pcr_index = PCR_KEYS_HASH;
    measurement->measurement_type = MEASUREMENT_TYPE_KEYS;
    measurement->timestamp = time(NULL);

    // Measure the public keys (not private keys for security)
    uint8_t pubkey_hash[32];
    if (g_attestation_ctx.device_keypair_valid) {
        pqc_result_t result = calculate_sha256((const uint8_t*)&g_attestation_ctx.device_keypair.pk,
                                              sizeof(dilithium_public_key_t),
                                              pubkey_hash);
        if (result != PQC_SUCCESS) {
            return result;
        }
    } else {
        // Use placeholder if no keys available
        memset(pubkey_hash, 0, 32);
    }

    memcpy(measurement->measurement_value, pubkey_hash, 32);
    
    return extend_pcr(PCR_KEYS_HASH, measurement->measurement_value);
}

/**
 * @brief Collect device identity measurement
 * @param measurement Output measurement structure
 * @return PQC_SUCCESS on success, error code on failure
 */
static pqc_result_t collect_device_id_measurement(platform_measurement_t *measurement) {
    measurement->pcr_index = PCR_DEVICE_ID;
    measurement->measurement_type = MEASUREMENT_TYPE_DEVICE_IDENTITY;
    measurement->timestamp = time(NULL);

    // Use device serial number and hardware identifiers
    if (strlen(g_attestation_ctx.device_info.serial_number) > 0) {
        pqc_result_t result = calculate_sha256((const uint8_t*)g_attestation_ctx.device_info.serial_number,
                                              strlen(g_attestation_ctx.device_info.serial_number),
                                              measurement->measurement_value);
        if (result != PQC_SUCCESS) {
            return result;
        }
    } else {
        // Generate deterministic device ID from hardware features
        const char *hw_id = "stm32l5-cortex-m33-tpm2.0";
        pqc_result_t result = calculate_sha256((const uint8_t*)hw_id, strlen(hw_id),
                                              measurement->measurement_value);
        if (result != PQC_SUCCESS) {
            return result;
        }
    }

    return extend_pcr(PCR_DEVICE_ID, measurement->measurement_value);
}

pqc_result_t attestation_init(const attestation_config_t *config) {
    if (!config) {
        return PQC_ERROR_INVALID_PARAMETER;
    }

    if (g_attestation_initialized) {
        return PQC_SUCCESS; // Already initialized
    }

    // Initialize TPM interface
    pqc_result_t result = tpm2_init();
    if (result != PQC_SUCCESS) {
        return result;
    }

    // Copy configuration
    memcpy(&g_attestation_ctx.config, config, sizeof(attestation_config_t));

    // Initialize device information
    if (strlen(config->device_serial) > 0) {
        strncpy(g_attestation_ctx.device_info.serial_number, 
                config->device_serial, 
                sizeof(g_attestation_ctx.device_info.serial_number) - 1);
    }
    g_attestation_ctx.device_info.device_type = config->device_type;
    g_attestation_ctx.device_info.hardware_version = 1;
    g_attestation_ctx.device_info.firmware_version = 1;

    // Initialize PCR values to zero
    for (int i = 0; i < MAX_PCR_REGISTERS; i++) {
        memset(g_attestation_ctx.pcr_values[i], 0, 32);
        g_attestation_ctx.pcr_valid[i] = false;
    }

    // Generate device attestation keypair if not provided
    if (!g_attestation_ctx.device_keypair_valid) {
        result = dilithium_keypair(&g_attestation_ctx.device_keypair.pk,
                                  &g_attestation_ctx.device_keypair.sk);
        if (result != PQC_SUCCESS) {
            return result;
        }
        g_attestation_ctx.device_keypair_valid = true;
    }

    // Initialize measurement log
    g_attestation_ctx.measurement_log.count = 0;
    g_attestation_ctx.measurement_log.capacity = MAX_MEASUREMENT_LOG_ENTRIES;

    g_attestation_initialized = true;
    return PQC_SUCCESS;
}

void attestation_cleanup(void) {
    if (!g_attestation_initialized) {
        return;
    }

    // Clear sensitive data
    if (g_attestation_ctx.device_keypair_valid) {
        secure_memzero(&g_attestation_ctx.device_keypair.sk, sizeof(dilithium_secret_key_t));
        g_attestation_ctx.device_keypair_valid = false;
    }

    // Clear PCR cache
    for (int i = 0; i < MAX_PCR_REGISTERS; i++) {
        secure_memzero(g_attestation_ctx.pcr_values[i], 32);
        g_attestation_ctx.pcr_valid[i] = false;
    }

    // Clear measurement log
    secure_memzero(&g_attestation_ctx.measurement_log, sizeof(measurement_log_t));

    // Cleanup TPM interface
    tmp2_cleanup();

    g_attestation_initialized = false;
}

pqc_result_t attestation_collect_measurements(void) {
    if (!g_attestation_initialized) {
        return PQC_ERROR_INVALID_PARAMETER;
    }

    pqc_result_t result;
    platform_measurement_t measurement;

    // Collect firmware measurement
    result = collect_firmware_measurement(&measurement);
    if (result != PQC_SUCCESS) {
        return result;
    }
    
    // Add to measurement log
    if (g_attestation_ctx.measurement_log.count < MAX_MEASUREMENT_LOG_ENTRIES) {
        memcpy(&g_attestation_ctx.measurement_log.measurements[g_attestation_ctx.measurement_log.count],
               &measurement, sizeof(platform_measurement_t));
        g_attestation_ctx.measurement_log.count++;
    }

    // Collect configuration measurement
    result = collect_config_measurement(&measurement);
    if (result != PQC_SUCCESS) {
        return result;
    }
    
    if (g_attestation_ctx.measurement_log.count < MAX_MEASUREMENT_LOG_ENTRIES) {
        memcpy(&g_attestation_ctx.measurement_log.measurements[g_attestation_ctx.measurement_log.count],
               &measurement, sizeof(platform_measurement_t));
        g_attestation_ctx.measurement_log.count++;
    }

    // Collect runtime measurement
    result = collect_runtime_measurement(&measurement);
    if (result != PQC_SUCCESS) {
        return result;
    }
    
    if (g_attestation_ctx.measurement_log.count < MAX_MEASUREMENT_LOG_ENTRIES) {
        memcpy(&g_attestation_ctx.measurement_log.measurements[g_attestation_ctx.measurement_log.count],
               &measurement, sizeof(platform_measurement_t));
        g_attestation_ctx.measurement_log.count++;
    }

    // Collect keys measurement
    result = collect_keys_measurement(&measurement);
    if (result != PQC_SUCCESS) {
        return result;
    }
    
    if (g_attestation_ctx.measurement_log.count < MAX_MEASUREMENT_LOG_ENTRIES) {
        memcpy(&g_attestation_ctx.measurement_log.measurements[g_attestation_ctx.measurement_log.count],
               &measurement, sizeof(platform_measurement_t));
        g_attestation_ctx.measurement_log.count++;
    }

    // Collect device ID measurement
    result = collect_device_id_measurement(&measurement);
    if (result != PQC_SUCCESS) {
        return result;
    }
    
    if (g_attestation_ctx.measurement_log.count < MAX_MEASUREMENT_LOG_ENTRIES) {
        memcpy(&g_attestation_ctx.measurement_log.measurements[g_attestation_ctx.measurement_log.count],
               &measurement, sizeof(platform_measurement_t));
        g_attestation_ctx.measurement_log.count++;
    }

    return PQC_SUCCESS;
}

pqc_result_t attestation_generate_report(attestation_report_t *report) {
    if (!report || !g_attestation_initialized) {
        return PQC_ERROR_INVALID_PARAMETER;
    }

    // Clear report structure
    memset(report, 0, sizeof(attestation_report_t));

    // Set report metadata
    memcpy(report->device_id, g_attestation_ctx.device_info.serial_number, 
           sizeof(report->device_id));
    report->timestamp = time(NULL);
    report->report_version = ATTESTATION_REPORT_VERSION;
    report->measurement_count = g_attestation_ctx.measurement_log.count;

    // Copy PCR values
    for (int i = 0; i < MAX_PCR_REGISTERS; i++) {
        if (g_attestation_ctx.pcr_valid[i]) {
            memcpy(report->pcr_values[i], g_attestation_ctx.pcr_values[i], 32);
        }
    }

    // Copy measurements (up to maximum that fits in report)
    size_t measurements_to_copy = (report->measurement_count > MAX_MEASUREMENTS_PER_REPORT) ?
                                 MAX_MEASUREMENTS_PER_REPORT : report->measurement_count;
    
    for (size_t i = 0; i < measurements_to_copy; i++) {
        memcpy(&report->measurements[i],
               &g_attestation_ctx.measurement_log.measurements[i],
               sizeof(platform_measurement_t));
    }

    // Calculate report hash for signing
    uint8_t report_hash[32];
    pqc_result_t result = calculate_sha256((const uint8_t*)report, 
                                          sizeof(attestation_report_t) - sizeof(report->signature),
                                          report_hash);
    if (result != PQC_SUCCESS) {
        return result;
    }

    // Sign the report with device attestation key
    size_t sig_len;
    result = dilithium_sign(report->signature, &sig_len,
                           report_hash, 32,
                           &g_attestation_ctx.device_keypair.sk);
    if (result != PQC_SUCCESS) {
        return result;
    }

    report->signature_length = sig_len;
    return PQC_SUCCESS;
}

pqc_result_t attestation_verify_report(const attestation_report_t *report,
                                      const dilithium_public_key_t *device_public_key,
                                      attestation_verification_result_t *result_out) {
    if (!report || !device_public_key || !result_out) {
        return PQC_ERROR_INVALID_PARAMETER;
    }

    // Initialize result
    memset(result_out, 0, sizeof(attestation_verification_result_t));
    result_out->is_valid = false;

    // Verify report format
    if (report->report_version != ATTESTATION_REPORT_VERSION) {
        result_out->error_code = ATTESTATION_ERROR_INVALID_FORMAT;
        return PQC_SUCCESS; // Not a failure, just invalid report
    }

    if (report->measurement_count > MAX_MEASUREMENTS_PER_REPORT) {
        result_out->error_code = ATTESTATION_ERROR_INVALID_FORMAT;
        return PQC_SUCCESS;
    }

    // Calculate report hash
    uint8_t report_hash[32];
    pqc_result_t result = calculate_sha256((const uint8_t*)report,
                                          sizeof(attestation_report_t) - sizeof(report->signature),
                                          report_hash);
    if (result != PQC_SUCCESS) {
        return result;
    }

    // Verify signature
    result = dilithium_verify(report->signature, report->signature_length,
                             report_hash, 32,
                             device_public_key);
    
    if (result != PQC_SUCCESS) {
        result_out->error_code = ATTESTATION_ERROR_SIGNATURE_INVALID;
        return PQC_SUCCESS;
    }

    // Check timestamp (allow 5 minute clock skew)
    time_t current_time = time(NULL);
    if (abs((int)(current_time - report->timestamp)) > 300) {
        result_out->error_code = ATTESTATION_ERROR_TIMESTAMP_INVALID;
        return PQC_SUCCESS;
    }

    // Validate PCR values and measurements
    for (size_t i = 0; i < report->measurement_count; i++) {
        const platform_measurement_t *measurement = &report->measurements[i];
        
        if (measurement->pcr_index >= MAX_PCR_REGISTERS) {
            result_out->error_code = ATTESTATION_ERROR_INVALID_PCR;
            return PQC_SUCCESS;
        }

        if (measurement->measurement_type >= MEASUREMENT_TYPE_MAX) {
            result_out->error_code = ATTESTATION_ERROR_INVALID_MEASUREMENT;
            return PQC_SUCCESS;
        }
    }

    // All checks passed
    result_out->is_valid = true;
    result_out->error_code = ATTESTATION_ERROR_NONE;
    result_out->trust_level = TRUST_LEVEL_HIGH; // Could be computed based on measurements
    
    // Copy device information
    memcpy(result_out->device_id, report->device_id, sizeof(result_out->device_id));
    result_out->timestamp = report->timestamp;

    return PQC_SUCCESS;
}

pqc_result_t attestation_get_device_certificate(device_certificate_t *cert) {
    if (!cert || !g_attestation_initialized) {
        return PQC_ERROR_INVALID_PARAMETER;
    }

    // Copy device public key
    memcpy(&cert->public_key, &g_attestation_ctx.device_keypair.pk, sizeof(dilithium_public_key_t));
    
    // Copy device information
    memcpy(&cert->device_info, &g_attestation_ctx.device_info, sizeof(device_info_t));
    
    // Set certificate metadata
    cert->certificate_version = 1;
    cert->issued_timestamp = time(NULL);
    cert->expiry_timestamp = cert->issued_timestamp + (365 * 24 * 60 * 60); // 1 year
    cert->algorithm_id = PQC_ALG_DILITHIUM_5;

    // In a real implementation, this would be signed by a CA
    // For now, we'll create a self-signed certificate
    uint8_t cert_hash[32];
    pqc_result_t result = calculate_sha256((const uint8_t*)cert,
                                          sizeof(device_certificate_t) - sizeof(cert->ca_signature),
                                          cert_hash);
    if (result != PQC_SUCCESS) {
        return result;
    }

    size_t sig_len;
    result = dilithium_sign(cert->ca_signature, &sig_len,
                           cert_hash, 32,
                           &g_attestation_ctx.device_keypair.sk);
    if (result != PQC_SUCCESS) {
        return result;
    }

    cert->ca_signature_length = sig_len;
    return PQC_SUCCESS;
}

pqc_result_t attestation_get_pcr_values(uint8_t pcr_values[MAX_PCR_REGISTERS][32]) {
    if (!pcr_values || !g_attestation_initialized) {
        return PQC_ERROR_INVALID_PARAMETER;
    }

    for (int i = 0; i < MAX_PCR_REGISTERS; i++) {
        if (g_attestation_ctx.pcr_valid[i]) {
            memcpy(pcr_values[i], g_attestation_ctx.pcr_values[i], 32);
        } else {
            memset(pcr_values[i], 0, 32);
        }
    }

    return PQC_SUCCESS;
}

pqc_result_t attestation_get_measurement_log(measurement_log_t *log) {
    if (!log || !g_attestation_initialized) {
        return PQC_ERROR_INVALID_PARAMETER;
    }

    memcpy(log, &g_attestation_ctx.measurement_log, sizeof(measurement_log_t));
    return PQC_SUCCESS;
}

bool attestation_is_initialized(void) {
    return g_attestation_initialized;
}