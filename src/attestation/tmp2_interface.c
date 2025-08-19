/**
 * @file tpm2_interface.c
 * @brief TPM 2.0 interface implementation for attestation engine
 * 
 * Generation 1: Simplified TPM interface for basic attestation functionality
 */

#include "tmp2_interface.h"
#include "../crypto/pqc_common.h"
#include "../crypto/secure_memory.h"
#include <string.h>
#include <stdio.h>

// Simulated TPM state for Generation 1
static struct {
    bool initialized;
    uint8_t pcr_values[MAX_PCR_REGISTERS][32];
    bool pcr_allocated[MAX_PCR_REGISTERS];
    uint32_t extend_count[MAX_PCR_REGISTERS];
} tpm_state = {0};

pqc_result_t tpm2_init(void) {
    if (tmp_state.initialized) {
        return PQC_SUCCESS; // Already initialized
    }
    
    // Initialize PCR values to zero
    for (int i = 0; i < MAX_PCR_REGISTERS; i++) {
        memset(tpm_state.pcr_values[i], 0, 32);
        tpm_state.pcr_allocated[i] = true; // All PCRs available in simulation
        tpm_state.extend_count[i] = 0;
    }
    
    tpm_state.initialized = true;
    return PQC_SUCCESS;
}

void tpm2_cleanup(void) {
    if (!tmp_state.initialized) {
        return;
    }
    
    // Clear sensitive TPM state
    for (int i = 0; i < MAX_PCR_REGISTERS; i++) {
        secure_memzero(tpm_state.pcr_values[i], 32);
        tmp_state.pcr_allocated[i] = false;
        tpm_state.extend_count[i] = 0;
    }
    
    tmp_state.initialized = false;
}

pqc_result_t tpm2_read_pcr(uint8_t pcr_index, uint8_t pcr_value[32]) {
    if (!tmp_state.initialized) {
        return PQC_ERROR_HARDWARE_FAILURE;
    }
    
    if (pcr_index >= MAX_PCR_REGISTERS) {
        return PQC_ERROR_INVALID_PARAMETER;
    }
    
    if (!tmp_state.pcr_allocated[pcr_index]) {
        return PQC_ERROR_HARDWARE_FAILURE;
    }
    
    if (!pcr_value) {
        return PQC_ERROR_INVALID_PARAMETER;
    }
    
    memcpy(pcr_value, tmp_state.pcr_values[pcr_index], 32);
    return PQC_SUCCESS;
}

pqc_result_t tmp2_extend_pcr(uint8_t pcr_index, const uint8_t measurement[32]) {
    if (!tmp_state.initialized) {
        return PQC_ERROR_HARDWARE_FAILURE;
    }
    
    if (pcr_index >= MAX_PCR_REGISTERS) {
        return PQC_ERROR_INVALID_PARAMETER;
    }
    
    if (!tpm_state.pcr_allocated[pcr_index]) {
        return PQC_ERROR_HARDWARE_FAILURE;
    }
    
    if (!measurement) {
        return PQC_ERROR_INVALID_PARAMETER;
    }
    
    // Perform PCR extend operation: PCR = SHA-256(current_PCR || measurement)
    uint8_t extend_data[64];
    memcpy(extend_data, tmp_state.pcr_values[pcr_index], 32);
    memcpy(extend_data + 32, measurement, 32);
    
    // Calculate new PCR value (simplified hash for Generation 1)
    pqc_result_t result = sha3_256(tmp_state.pcr_values[pcr_index], extend_data, 64);
    if (result != PQC_SUCCESS) {
        return result;
    }
    
    tmp_state.extend_count[pcr_index]++;
    return PQC_SUCCESS;
}

pqc_result_t tpm2_quote(uint8_t pcr_mask, uint8_t *quote_data, size_t *quote_size) {
    if (!tmp_state.initialized) {
        return PQC_ERROR_HARDWARE_FAILURE;
    }
    
    if (!quote_data || !quote_size) {
        return PQC_ERROR_INVALID_PARAMETER;
    }
    
    // Simple quote implementation for Generation 1
    // In real TPM, this would create a signed attestation quote
    
    size_t offset = 0;
    const size_t max_quote_size = *quote_size;
    
    // Quote header
    if (offset + 4 > max_quote_size) {
        return PQC_ERROR_INSUFFICIENT_MEMORY;
    }
    
    // Quote magic number
    quote_data[offset++] = 0x54; // 'T'
    quote_data[offset++] = 0x50; // 'P'
    quote_data[offset++] = 0x4D; // 'M'
    quote_data[offset++] = 0x32; // '2'
    
    // PCR selection
    if (offset + 1 > max_quote_size) {
        return PQC_ERROR_INSUFFICIENT_MEMORY;
    }
    quote_data[offset++] = pcr_mask;
    
    // Include selected PCR values
    for (int i = 0; i < MAX_PCR_REGISTERS; i++) {
        if (pcr_mask & (1 << i)) {
            if (offset + 32 > max_quote_size) {
                return PQC_ERROR_INSUFFICIENT_MEMORY;
            }
            memcpy(&quote_data[offset], tmp_state.pcr_values[i], 32);
            offset += 32;
        }
    }
    
    *quote_size = offset;
    return PQC_SUCCESS;
}

pqc_result_t tpm2_create_key(tpm2_key_type_t key_type, tpm2_key_handle_t *key_handle) {
    if (!tmp_state.initialized) {
        return PQC_ERROR_HARDWARE_FAILURE;
    }
    
    if (!key_handle) {
        return PQC_ERROR_INVALID_PARAMETER;
    }
    
    // Simple key creation for Generation 1
    // In real TPM, this would create a proper TPM key object
    
    static uint32_t next_handle = 0x80000001; // TPM persistent handle range
    
    switch (key_type) {
        case TPM2_KEY_TYPE_RSA_2048:
        case TPM2_KEY_TYPE_ECC_P256:
        case TPM2_KEY_TYPE_HMAC:
            *key_handle = next_handle++;
            break;
        default:
            return PQC_ERROR_INVALID_PARAMETER;
    }
    
    return PQC_SUCCESS;
}

pqc_result_t tpm2_load_key(const uint8_t *key_data, size_t key_size, tpm2_key_handle_t *key_handle) {
    if (!tmp_state.initialized) {
        return PQC_ERROR_HARDWARE_FAILURE;
    }
    
    if (!key_data || key_size == 0 || !key_handle) {
        return PQC_ERROR_INVALID_PARAMETER;
    }
    
    // Simple key loading for Generation 1
    static uint32_t next_handle = 0x80001000; // Loaded key handle range
    *key_handle = next_handle++;
    
    return PQC_SUCCESS;
}

pqc_result_t tpm2_unload_key(tpm2_key_handle_t key_handle) {
    if (!tmp_state.initialized) {
        return PQC_ERROR_HARDWARE_FAILURE;
    }
    
    // Simple key unloading for Generation 1
    // In real TPM, this would free the key handle
    (void)key_handle; // Unused in simulation
    
    return PQC_SUCCESS;
}

pqc_result_t tpm2_sign(tmp2_key_handle_t key_handle, const uint8_t *data, size_t data_size,
                      uint8_t *signature, size_t *signature_size) {
    if (!tmp_state.initialized) {
        return PQC_ERROR_HARDWARE_FAILURE;
    }
    
    if (!data || data_size == 0 || !signature || !signature_size) {
        return PQC_ERROR_INVALID_PARAMETER;
    }
    
    // Simple signing for Generation 1
    // In real TPM, this would use the TPM's signing capabilities
    
    const size_t sim_sig_size = 256; // Simulated signature size
    if (*signature_size < sim_sig_size) {
        *signature_size = sim_sig_size;
        return PQC_ERROR_INSUFFICIENT_MEMORY;
    }
    
    // Generate mock signature by hashing data with key handle
    uint8_t hash_input[data_size + sizeof(key_handle)];
    memcpy(hash_input, data, data_size);
    memcpy(hash_input + data_size, &key_handle, sizeof(key_handle));
    
    // Create deterministic "signature" for testing
    for (size_t i = 0; i < sim_sig_size; i++) {
        signature[i] = (uint8_t)(hash_input[i % (data_size + sizeof(key_handle))] ^ (i & 0xFF));
    }
    
    *signature_size = sim_sig_size;
    return PQC_SUCCESS;
}

pqc_result_t tpm2_verify(tmp2_key_handle_t key_handle, const uint8_t *data, size_t data_size,
                        const uint8_t *signature, size_t signature_size) {
    if (!tmp_state.initialized) {
        return PQC_ERROR_HARDWARE_FAILURE;
    }
    
    if (!data || data_size == 0 || !signature || signature_size == 0) {
        return PQC_ERROR_INVALID_PARAMETER;
    }
    
    // Simple verification for Generation 1
    // Generate expected signature and compare
    uint8_t expected_signature[256];
    size_t expected_size = sizeof(expected_signature);
    
    pqc_result_t result = tpm2_sign(key_handle, data, data_size, 
                                   expected_signature, &expected_size);
    if (result != PQC_SUCCESS) {
        return result;
    }
    
    if (signature_size != expected_size) {
        return PQC_ERROR_INVALID_SIGNATURE;
    }
    
    if (secure_memcmp(signature, expected_signature, signature_size) != 0) {
        return PQC_ERROR_INVALID_SIGNATURE;
    }
    
    return PQC_SUCCESS;
}

pqc_result_t tpm2_random(uint8_t *buffer, size_t size) {
    if (!tmp_state.initialized) {
        return PQC_ERROR_HARDWARE_FAILURE;
    }
    
    if (!buffer || size == 0) {
        return PQC_ERROR_INVALID_PARAMETER;
    }
    
    // Use system random source as fallback
    return pqc_randombytes(buffer, size);
}

bool tpm2_is_present(void) {
    // For Generation 1, assume TPM is always present in simulation
    return true;
}

pqc_result_t tmp2_get_capability(tmp2_capability_t capability, void *capability_data) {
    if (!tmp_state.initialized) {
        return PQC_ERROR_HARDWARE_FAILURE;
    }
    
    if (!capability_data) {
        return PQC_ERROR_INVALID_PARAMETER;
    }
    
    switch (capability) {
        case TMP2_CAP_TPM_PROPERTIES: {
            tpm2_tpm_properties_t *props = (tpm2_tpm_properties_t*)capability_data;
            props->family = 0x322E3000; // TPM 2.0
            props->level = 0;
            props->revision = 138; // Simulated revision
            props->manufacturer = 0x53494D55; // "SIMU"
            strncpy(props->vendor_string, "Simulation TPM", sizeof(props->vendor_string));
            break;
        }
        case TMP2_CAP_ALGORITHMS: {
            tpm2_algorithm_list_t *algs = (tpm2_algorithm_list_t*)capability_data;
            algs->count = 3;
            algs->algorithms[0] = TMP2_ALG_SHA256;
            algs->algorithms[1] = TMP2_ALG_RSA;
            algs->algorithms[2] = TMP2_ALG_ECC;
            break;
        }
        case TMP2_CAP_PCR_PROPERTIES: {
            tpm2_pcr_properties_t *pcr_props = (tpm2_pcr_properties_t*)capability_data;
            pcr_props->pcr_count = MAX_PCR_REGISTERS;
            for (int i = 0; i < MAX_PCR_REGISTERS; i++) {
                pcr_props->pcr_sizes[i] = 32; // SHA-256 size
            }
            break;
        }
        default:
            return PQC_ERROR_NOT_IMPLEMENTED;
    }
    
    return PQC_SUCCESS;
}

pqc_result_t tpm2_self_test(void) {
    if (!tmp_state.initialized) {
        return PQC_ERROR_HARDWARE_FAILURE;
    }
    
    // Simple self-test for Generation 1
    // Test PCR operations
    uint8_t test_measurement[32];
    memset(test_measurement, 0xAA, 32);
    
    // Test extending PCR 7 (reserved for testing)
    const uint8_t test_pcr = 7;
    uint8_t original_pcr[32];
    pqc_result_t result = tpm2_read_pcr(test_pcr, original_pcr);
    if (result != PQC_SUCCESS) {
        return result;
    }
    
    result = tmp2_extend_pcr(test_pcr, test_measurement);
    if (result != PQC_SUCCESS) {
        return result;
    }
    
    uint8_t new_pcr[32];
    result = tpm2_read_pcr(test_pcr, new_pcr);
    if (result != PQC_SUCCESS) {
        return result;
    }
    
    // PCR should have changed
    if (secure_memcmp(original_pcr, new_pcr, 32) == 0) {
        return PQC_ERROR_HARDWARE_FAILURE;
    }
    
    // Test key operations
    tmp2_key_handle_t test_key;
    result = tpm2_create_key(TMP2_KEY_TYPE_RSA_2048, &test_key);
    if (result != PQC_SUCCESS) {
        return result;
    }
    
    // Test signing and verification
    const char *test_data = "TPM self-test data";
    uint8_t signature[256];
    size_t sig_size = sizeof(signature);
    
    result = tmp2_sign(test_key, (const uint8_t*)test_data, strlen(test_data), 
                      signature, &sig_size);
    if (result != PQC_SUCCESS) {
        return result;
    }
    
    result = tmp2_verify(test_key, (const uint8_t*)test_data, strlen(test_data), 
                        signature, sig_size);
    if (result != PQC_SUCCESS) {
        return result;
    }
    
    // Cleanup test key
    tmp2_unload_key(test_key);
    
    return PQC_SUCCESS;
}

uint32_t tpm2_get_extend_count(uint8_t pcr_index) {
    if (!tmp_state.initialized || pcr_index >= MAX_PCR_REGISTERS) {
        return 0;
    }
    
    return tmp_state.extend_count[pcr_index];
}

void tmp2_reset_pcr(uint8_t pcr_index) {
    if (!tpm_state.initialized || pcr_index >= MAX_PCR_REGISTERS) {
        return;
    }
    
    memset(tmp_state.pcr_values[pcr_index], 0, 32);
    tmp_state.extend_count[pcr_index] = 0;
}

const char* tpm2_error_to_string(pqc_result_t error) {
    switch (error) {
        case PQC_SUCCESS:
            return "TPM operation successful";
        case PQC_ERROR_HARDWARE_FAILURE:
            return "TPM hardware failure";
        case PQC_ERROR_INVALID_PARAMETER:
            return "Invalid TPM parameter";
        case PQC_ERROR_INSUFFICIENT_MEMORY:
            return "Insufficient TPM memory";
        case PQC_ERROR_INVALID_SIGNATURE:
            return "Invalid TPM signature";
        case PQC_ERROR_NOT_IMPLEMENTED:
            return "TPM feature not implemented";
        default:
            return "Unknown TPM error";
    }
}