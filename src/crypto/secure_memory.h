/**
 * @file secure_memory.h
 * @brief Secure memory management utilities for cryptographic operations
 * 
 * This header provides secure memory management functions that prevent
 * sensitive data from being leaked through memory dumps, compiler optimizations,
 * or side-channel attacks.
 */

#ifndef SECURE_MEMORY_H
#define SECURE_MEMORY_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

// ============================================================================
// Secure Memory Operations
// ============================================================================

/**
 * @brief Secure memory comparison (constant-time)
 * 
 * This function compares two memory regions in constant time to prevent
 * timing attacks. The comparison time is independent of the input values
 * and the position of the first differing byte.
 * 
 * @param[in] a First memory region
 * @param[in] b Second memory region  
 * @param[in] length Number of bytes to compare
 * @return 0 if regions are equal, non-zero if different
 * 
 * @note This function is constant-time for a given length.
 * @note The return value does not indicate which region is "larger".
 */
int secure_memcmp(const void *a, const void *b, size_t length);

/**
 * @brief Secure memory zeroing
 * 
 * This function zeros memory in a way that cannot be optimized away by
 * the compiler. It uses compiler-specific or platform-specific mechanisms
 * to ensure the memory is actually cleared.
 * 
 * @param[out] ptr Memory region to zero
 * @param[in] length Number of bytes to zero
 * 
 * @note This function prevents compiler optimization of memory clearing.
 * @note On some platforms, this may use special instructions or memory barriers.
 */
void secure_memzero(void *ptr, size_t length);

/**
 * @brief Secure memory copy (constant-time)
 * 
 * This function copies memory in constant time, preventing timing-based
 * side-channel attacks during sensitive data movement.
 * 
 * @param[out] dest Destination memory region
 * @param[in] src Source memory region
 * @param[in] length Number of bytes to copy
 * 
 * @note This function is constant-time for a given length.
 * @note Source and destination regions must not overlap.
 */
void secure_memcpy(void *dest, const void *src, size_t length);

/**
 * @brief Conditional secure memory copy (constant-time)
 * 
 * This function conditionally copies memory based on a condition value,
 * executing in constant time regardless of the condition.
 * 
 * @param[out] dest Destination memory region
 * @param[in] src Source memory region
 * @param[in] length Number of bytes to copy
 * @param[in] condition Condition flag (0 or 1)
 * 
 * @note If condition is 1, memory is copied. If 0, dest is unchanged.
 * @note This function is constant-time regardless of condition value.
 */
void secure_memcpy_conditional(void *dest, const void *src, size_t length, int condition);

// ============================================================================
// Secure Memory Allocation
// ============================================================================

/**
 * @brief Secure memory allocation
 * 
 * This function allocates memory that is suitable for storing sensitive
 * cryptographic data. The memory may be locked in RAM, allocated from
 * secure regions, or protected against swapping.
 * 
 * @param[in] size Number of bytes to allocate
 * @return Pointer to allocated memory, or NULL on failure
 * 
 * @note Allocated memory should be freed with secure_free().
 * @note The memory is not automatically zeroed.
 */
void* secure_malloc(size_t size);

/**
 * @brief Secure memory deallocation
 * 
 * This function deallocates memory previously allocated with secure_malloc().
 * The memory is securely zeroed before being returned to the system.
 * 
 * @param[in] ptr Pointer to memory to free (may be NULL)
 * @param[in] size Size of memory region to zero before freeing
 * 
 * @note The memory is zeroed even if ptr is NULL.
 * @note This function is safe to call with NULL pointers.
 */
void secure_free(void *ptr, size_t size);

/**
 * @brief Aligned secure memory allocation
 * 
 * This function allocates secure memory aligned to a specific boundary.
 * This is useful for SIMD operations or hardware-specific requirements.
 * 
 * @param[in] size Number of bytes to allocate
 * @param[in] alignment Alignment requirement (must be power of 2)
 * @return Pointer to aligned memory, or NULL on failure
 */
void* secure_aligned_malloc(size_t size, size_t alignment);

/**
 * @brief Aligned secure memory deallocation
 * 
 * @param[in] ptr Pointer to aligned memory to free
 * @param[in] size Size of memory region
 */
void secure_aligned_free(void *ptr, size_t size);

// ============================================================================
// Memory Protection
// ============================================================================

/**
 * @brief Lock memory pages to prevent swapping
 * 
 * This function attempts to lock memory pages in RAM to prevent them
 * from being swapped to disk, which could leak sensitive data.
 * 
 * @param[in] ptr Pointer to memory region
 * @param[in] length Size of memory region
 * @return 0 on success, -1 on failure
 * 
 * @note This may require elevated privileges on some platforms.
 * @note Not all platforms support memory locking.
 */
int secure_mlock(void *ptr, size_t length);

/**
 * @brief Unlock previously locked memory pages
 * 
 * @param[in] ptr Pointer to memory region
 * @param[in] length Size of memory region
 * @return 0 on success, -1 on failure
 */
int secure_munlock(void *ptr, size_t length);

/**
 * @brief Mark memory as non-dumpable
 * 
 * This function attempts to mark memory regions as non-dumpable in
 * core dumps, preventing sensitive data from appearing in crash dumps.
 * 
 * @param[in] ptr Pointer to memory region
 * @param[in] length Size of memory region
 * @return 0 on success, -1 on failure
 */
int secure_madvise_nodump(void *ptr, size_t length);

// ============================================================================
// Random Memory Access Patterns
// ============================================================================

/**
 * @brief Array access with random timing
 * 
 * This function accesses an array element while introducing random timing
 * to prevent cache-timing attacks. All array elements are accessed in
 * random order to provide uniform access patterns.
 * 
 * @param[in] array Array to access
 * @param[in] element_size Size of each array element
 * @param[in] num_elements Number of elements in array
 * @param[in] index Index of element to retrieve
 * @param[out] result Buffer to store retrieved element
 * 
 * @note This function provides protection against cache-timing attacks.
 * @note The access time is independent of the target index.
 */
void secure_array_access(const void *array, size_t element_size, 
                        size_t num_elements, size_t index, void *result);

/**
 * @brief Conditional array access (constant-time)
 * 
 * This function conditionally accesses an array element based on a condition,
 * executing in constant time regardless of the condition value.
 * 
 * @param[in] array Array to access
 * @param[in] element_size Size of each array element
 * @param[in] index Index of element to retrieve
 * @param[out] result Buffer to store retrieved element
 * @param[in] condition Condition flag (0 or 1)
 * 
 * @note If condition is 1, element is copied to result.
 * @note If condition is 0, result is unchanged.
 * @note Access time is independent of condition value.
 */
void secure_array_access_conditional(const void *array, size_t element_size,
                                    size_t index, void *result, int condition);

// ============================================================================
// Memory Barriers and Synchronization
// ============================================================================

/**
 * @brief Memory barrier to prevent reordering
 * 
 * This function inserts a memory barrier to prevent the compiler or CPU
 * from reordering memory operations across this point.
 */
void secure_memory_barrier(void);

/**
 * @brief Compiler barrier to prevent optimization
 * 
 * This function inserts a compiler barrier to prevent the compiler from
 * optimizing across this point while allowing CPU reordering.
 */
void secure_compiler_barrier(void);

// ============================================================================
// Side-Channel Mitigations
// ============================================================================

/**
 * @brief Add random delay to prevent timing attacks
 * 
 * This function adds a small random delay to the execution to make
 * timing-based side-channel attacks more difficult.
 * 
 * @param[in] base_cycles Base number of cycles to delay
 * @param[in] random_mask Mask for random additional delay
 */
void secure_random_delay(uint32_t base_cycles, uint32_t random_mask);

/**
 * @brief Dummy memory accesses to equalize cache state
 * 
 * This function performs dummy memory accesses to equalize the cache
 * state and prevent cache-based side-channel attacks.
 * 
 * @param[in] dummy_array Array for dummy accesses
 * @param[in] array_size Size of dummy array
 * @param[in] num_accesses Number of dummy accesses to perform
 */
void secure_dummy_accesses(const void *dummy_array, size_t array_size, size_t num_accesses);

// ============================================================================
// Platform-Specific Implementations
// ============================================================================

/**
 * @brief Check if secure memory features are available
 * 
 * @return true if secure memory features are available, false otherwise
 */
bool secure_memory_available(void);

/**
 * @brief Initialize secure memory subsystem
 * 
 * @return 0 on success, -1 on failure
 */
int secure_memory_init(void);

/**
 * @brief Cleanup secure memory subsystem
 */
void secure_memory_cleanup(void);

/**
 * @brief Get secure memory statistics
 * 
 * @param[out] allocated_bytes Number of bytes currently allocated
 * @param[out] peak_allocated_bytes Peak number of bytes allocated
 * @param[out] allocation_count Number of allocations performed
 */
void secure_memory_stats(size_t *allocated_bytes, size_t *peak_allocated_bytes, 
                        size_t *allocation_count);

// ============================================================================
// Testing and Debugging
// ============================================================================

#ifdef PQC_ENABLE_TESTING
/**
 * @brief Test secure memory functions
 * 
 * This function runs a comprehensive test of all secure memory functions
 * to verify correct operation and timing characteristics.
 * 
 * @return 0 on success, -1 on failure
 */
int secure_memory_self_test(void);

/**
 * @brief Measure timing of secure operations
 * 
 * @param[in] operation_name Name of operation to measure
 * @param[in] iterations Number of iterations to measure
 * @return Average cycles per operation
 */
uint64_t secure_memory_benchmark(const char *operation_name, size_t iterations);
#endif

#ifdef __cplusplus
}
#endif

#endif /* SECURE_MEMORY_H */