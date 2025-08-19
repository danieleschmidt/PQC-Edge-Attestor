/**
 * @file secure_memory.c
 * @brief Secure memory management implementation
 */

#include "secure_memory.h"
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

// Statistics tracking
static size_t g_allocated_bytes = 0;
static size_t g_peak_allocated_bytes = 0;
static size_t g_allocation_count = 0;

int secure_memcmp(const void *a, const void *b, size_t length) {
    if (!a || !b) {
        return -1;
    }
    
    const uint8_t *pa = (const uint8_t *)a;
    const uint8_t *pb = (const uint8_t *)b;
    uint8_t result = 0;
    
    // Constant-time comparison
    for (size_t i = 0; i < length; i++) {
        result |= pa[i] ^ pb[i];
    }
    
    return result ? 1 : 0;
}

void secure_memzero(void *ptr, size_t length) {
    if (!ptr || length == 0) {
        return;
    }
    
    volatile uint8_t *p = (volatile uint8_t *)ptr;
    for (size_t i = 0; i < length; i++) {
        p[i] = 0;
    }
    
    // Memory barrier to prevent optimization
    __asm__ __volatile__("" ::: "memory");
}

void secure_memcpy(void *dest, const void *src, size_t length) {
    if (!dest || !src || length == 0) {
        return;
    }
    
    uint8_t *d = (uint8_t *)dest;
    const uint8_t *s = (const uint8_t *)src;
    
    for (size_t i = 0; i < length; i++) {
        d[i] = s[i];
    }
}

void secure_memcpy_conditional(void *dest, const void *src, size_t length, int condition) {
    if (!dest || !src || length == 0) {
        return;
    }
    
    uint8_t *d = (uint8_t *)dest;
    const uint8_t *s = (const uint8_t *)src;
    uint8_t mask = (condition & 1) ? 0xFF : 0x00;
    
    for (size_t i = 0; i < length; i++) {
        d[i] = (d[i] & ~mask) | (s[i] & mask);
    }
}

void* secure_malloc(size_t size) {
    if (size == 0) {
        return NULL;
    }
    
    void *ptr = malloc(size);
    if (ptr) {
        g_allocated_bytes += size;
        g_allocation_count++;
        if (g_allocated_bytes > g_peak_allocated_bytes) {
            g_peak_allocated_bytes = g_allocated_bytes;
        }
    }
    
    return ptr;
}

void secure_free(void *ptr, size_t size) {
    if (!ptr) {
        return;
    }
    
    secure_memzero(ptr, size);
    free(ptr);
    
    if (g_allocated_bytes >= size) {
        g_allocated_bytes -= size;
    }
}

void* secure_aligned_malloc(size_t size, size_t alignment) {
    // Simple aligned allocation for Generation 1
    if (size == 0 || alignment == 0 || (alignment & (alignment - 1)) != 0) {
        return NULL;
    }
    
    // Allocate extra space for alignment
    void *raw = malloc(size + alignment - 1 + sizeof(void*));
    if (!raw) {
        return NULL;
    }
    
    // Calculate aligned address
    uintptr_t addr = (uintptr_t)raw + sizeof(void*);
    uintptr_t aligned = (addr + alignment - 1) & ~(alignment - 1);
    void *aligned_ptr = (void*)aligned;
    
    // Store original pointer
    ((void**)aligned_ptr)[-1] = raw;
    
    g_allocated_bytes += size;
    g_allocation_count++;
    if (g_allocated_bytes > g_peak_allocated_bytes) {
        g_peak_allocated_bytes = g_allocated_bytes;
    }
    
    return aligned_ptr;
}

void secure_aligned_free(void *ptr, size_t size) {
    if (!ptr) {
        return;
    }
    
    secure_memzero(ptr, size);
    void *raw = ((void**)ptr)[-1];
    free(raw);
    
    if (g_allocated_bytes >= size) {
        g_allocated_bytes -= size;
    }
}

int secure_mlock(void *ptr, size_t length) {
    // Placeholder for Generation 1 - would use mlock() on Unix systems
    (void)ptr;
    (void)length;
    return 0; // Assume success
}

int secure_munlock(void *ptr, size_t length) {
    // Placeholder for Generation 1
    (void)ptr;
    (void)length;
    return 0;
}

int secure_madvise_nodump(void *ptr, size_t length) {
    // Placeholder for Generation 1
    (void)ptr;
    (void)length;
    return 0;
}

void secure_array_access(const void *array, size_t element_size, 
                        size_t num_elements, size_t index, void *result) {
    if (!array || !result || index >= num_elements) {
        return;
    }
    
    // Simple implementation for Generation 1
    const uint8_t *arr = (const uint8_t *)array;
    const uint8_t *element = arr + (index * element_size);
    secure_memcpy(result, element, element_size);
}

void secure_array_access_conditional(const void *array, size_t element_size,
                                    size_t index, void *result, int condition) {
    if (!array || !result) {
        return;
    }
    
    const uint8_t *arr = (const uint8_t *)array;
    const uint8_t *element = arr + (index * element_size);
    secure_memcpy_conditional(result, element, element_size, condition);
}

void secure_memory_barrier(void) {
    __asm__ __volatile__("mfence" ::: "memory");
}

void secure_compiler_barrier(void) {
    __asm__ __volatile__("" ::: "memory");
}

void secure_random_delay(uint32_t base_cycles, uint32_t random_mask) {
    // Simple delay implementation
    volatile uint32_t delay = base_cycles + (rand() & random_mask);
    for (uint32_t i = 0; i < delay; i++) {
        __asm__ __volatile__("nop");
    }
}

void secure_dummy_accesses(const void *dummy_array, size_t array_size, size_t num_accesses) {
    if (!dummy_array || array_size == 0) {
        return;
    }
    
    const volatile uint8_t *arr = (const volatile uint8_t *)dummy_array;
    for (size_t i = 0; i < num_accesses; i++) {
        volatile uint8_t dummy = arr[i % array_size];
        (void)dummy;
    }
}

bool secure_memory_available(void) {
    return true; // Basic implementation always available
}

int secure_memory_init(void) {
    g_allocated_bytes = 0;
    g_peak_allocated_bytes = 0;
    g_allocation_count = 0;
    return 0;
}

void secure_memory_cleanup(void) {
    // Log any memory leaks
    if (g_allocated_bytes > 0) {
        fprintf(stderr, "Warning: %zu bytes not freed\n", g_allocated_bytes);
    }
}

void secure_memory_stats(size_t *allocated_bytes, size_t *peak_allocated_bytes, 
                        size_t *allocation_count) {
    if (allocated_bytes) {
        *allocated_bytes = g_allocated_bytes;
    }
    if (peak_allocated_bytes) {
        *peak_allocated_bytes = g_peak_allocated_bytes;
    }
    if (allocation_count) {
        *allocation_count = g_allocation_count;
    }
}

#ifdef PQC_ENABLE_TESTING
int secure_memory_self_test(void) {
    // Basic self-test
    uint8_t test1[32], test2[32];
    memset(test1, 0xAA, sizeof(test1));
    memset(test2, 0xAA, sizeof(test2));
    
    if (secure_memcmp(test1, test2, sizeof(test1)) != 0) {
        return -1;
    }
    
    test2[0] = 0xBB;
    if (secure_memcmp(test1, test2, sizeof(test1)) == 0) {
        return -1;
    }
    
    secure_memzero(test1, sizeof(test1));
    for (size_t i = 0; i < sizeof(test1); i++) {
        if (test1[i] != 0) {
            return -1;
        }
    }
    
    return 0;
}

uint64_t secure_memory_benchmark(const char *operation_name, size_t iterations) {
    (void)operation_name;
    (void)iterations;
    return 100; // Placeholder timing
}
#endif
