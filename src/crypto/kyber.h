/**
 * @file kyber.h
 * @brief Kyber-1024 post-quantum key encapsulation mechanism interface
 * 
 * This header defines the API for the Kyber-1024 implementation, providing
 * quantum-resistant key exchange functionality for IoT edge devices.
 */

#ifndef KYBER_H
#define KYBER_H

#include "pqc_common.h"
#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

// Kyber-1024 algorithm parameters
#define KYBER_PUBLICKEYBYTES  1568  /**< Public key size in bytes */
#define KYBER_SECRETKEYBYTES  3168  /**< Secret key size in bytes */
#define KYBER_CIPHERTEXTBYTES 1568  /**< Ciphertext size in bytes */
#define KYBER_SSBYTES         32    /**< Shared secret size in bytes */

// Internal constants
#define KYBER_SYMBYTES        32    /**< Size of hashes and seeds */
#define KYBER_QINV            62209 /**< q^(-1) mod 2^16 */

/**
 * @brief Kyber public key structure
 */
typedef struct {
    uint8_t seed[32];                    /**< Public seed for matrix A */
    uint8_t t[KYBER_PUBLICKEYBYTES - 32]; /**< Packed polynomial t */
} kyber_public_key_t;

/**
 * @brief Kyber secret key structure  
 */
typedef struct {
    uint8_t s[4 * 256 * 12 / 8];  /**< Secret polynomial s (using constants directly) */
    kyber_public_key_t pk;                   /**< Associated public key */
    uint8_t h[32];                           /**< Hash of public key */
    uint8_t z[32];                           /**< Random value for implicit rejection */
} kyber_secret_key_t;

/**
 * @brief Kyber ciphertext structure
 */
typedef struct {
    uint8_t u[4 * 256 * 11 / 8];  /**< Compressed polynomial u (using constants directly) */
    uint8_t v[256 * 5 / 8];             /**< Compressed polynomial v (using constants directly) */
} kyber_ciphertext_t;

/**
 * @brief Kyber keypair structure for convenience
 */
typedef struct {
    kyber_public_key_t pk;   /**< Public key */
    kyber_secret_key_t sk;   /**< Secret key */
} kyber_keypair_t;

/**
 * @brief Generate a Kyber-1024 keypair
 * 
 * This function generates a new Kyber-1024 keypair suitable for key encapsulation.
 * The implementation uses cryptographically secure random number generation and
 * follows NIST specification for parameter generation.
 * 
 * @param[out] pk Generated public key
 * @param[out] sk Generated secret key  
 * @return PQC_SUCCESS on success, error code on failure
 * 
 * @note This function is not constant-time in key generation.
 * @note The secret key contains the public key for convenience.
 */
pqc_result_t kyber_keypair(kyber_public_key_t *pk, kyber_secret_key_t *sk);

/**
 * @brief Encapsulate a shared secret using Kyber-1024
 * 
 * This function generates a random message, encapsulates it using the provided
 * public key, and derives a shared secret. The implementation provides IND-CCA2
 * security through the Fujisaki-Okamoto transform.
 * 
 * @param[out] ct Generated ciphertext
 * @param[out] shared_secret Derived shared secret (32 bytes)
 * @param[in] pk Public key for encapsulation
 * @return PQC_SUCCESS on success, error code on failure
 * 
 * @note This function is constant-time in encapsulation operations.
 * @note The shared secret should be used immediately for key derivation.
 */
pqc_result_t kyber_encapsulate(kyber_ciphertext_t *ct, uint8_t *shared_secret,
                              const kyber_public_key_t *pk);

/**
 * @brief Decapsulate a shared secret using Kyber-1024
 * 
 * This function decapsulates the ciphertext using the secret key to recover
 * the shared secret. The implementation includes implicit rejection to prevent
 * chosen ciphertext attacks.
 * 
 * @param[out] shared_secret Recovered shared secret (32 bytes)
 * @param[in] ct Ciphertext to decapsulate
 * @param[in] sk Secret key for decapsulation
 * @return PQC_SUCCESS on success, error code on failure
 * 
 * @note This function is constant-time to prevent timing attacks.
 * @note Invalid ciphertexts trigger implicit rejection with pseudo-random output.
 */
pqc_result_t kyber_decapsulate(uint8_t *shared_secret, const kyber_ciphertext_t *ct,
                              const kyber_secret_key_t *sk);

/**
 * @brief Validate Kyber public key format
 * 
 * This function performs basic validation of a Kyber public key to ensure
 * it has the correct format and polynomial coefficients are properly reduced.
 * 
 * @param[in] pk Public key to validate
 * @return PQC_SUCCESS if valid, error code if invalid
 */
pqc_result_t kyber_validate_public_key(const kyber_public_key_t *pk);

/**
 * @brief Validate Kyber ciphertext format
 * 
 * This function performs basic validation of a Kyber ciphertext to ensure
 * it has the correct format and compressed values are within valid ranges.
 * 
 * @param[in] ct Ciphertext to validate
 * @return PQC_SUCCESS if valid, error code if invalid
 */
pqc_result_t kyber_validate_ciphertext(const kyber_ciphertext_t *ct);

/**
 * @brief Get algorithm information
 * 
 * @return Pointer to algorithm info structure
 */
const pqc_algorithm_info_t* kyber_get_algorithm_info(void);

// Internal functions for testing and debugging (not part of public API)
#ifdef PQC_ENABLE_TESTING
void kyber_poly_ntt(uint16_t poly[256]);
void kyber_poly_invntt(uint16_t poly[256]);
uint16_t kyber_montgomery_reduce(uint32_t a);
uint16_t kyber_barrett_reduce(uint16_t a);
#endif

#ifdef __cplusplus
}
#endif

#endif /* KYBER_H */