const crypto = require('crypto');

function generateSecureId(prefix = '', length = 16) {
    const randomBytes = crypto.randomBytes(length);
    const id = randomBytes.toString('hex');
    return prefix ? `${prefix}_${id}` : id;
}

function createTimestamp() {
    return new Date().toISOString();
}

function calculateAge(timestamp) {
    const now = new Date();
    const then = new Date(timestamp);
    return now.getTime() - then.getTime();
}

function isExpired(timestamp, maxAge) {
    return calculateAge(timestamp) > maxAge;
}

function formatBytes(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

function formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function retry(fn, maxAttempts = 3, delay = 1000) {
    return async (...args) => {
        let lastError;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await fn(...args);
            } catch (error) {
                lastError = error;
                
                if (attempt === maxAttempts) {
                    throw lastError;
                }
                
                await sleep(delay * attempt);
            }
        }
    };
}

function debounce(func, delay) {
    let timeoutId;
    
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

function throttle(func, limit) {
    let inThrottle;
    
    return function (...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    
    if (obj instanceof Date) {
        return new Date(obj.getTime());
    }
    
    if (obj instanceof Array) {
        return obj.map(item => deepClone(item));
    }
    
    if (typeof obj === 'object') {
        const cloned = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                cloned[key] = deepClone(obj[key]);
            }
        }
        return cloned;
    }
}

function deepEqual(obj1, obj2) {
    if (obj1 === obj2) {
        return true;
    }
    
    if (obj1 == null || obj2 == null) {
        return false;
    }
    
    if (typeof obj1 !== typeof obj2) {
        return false;
    }
    
    if (typeof obj1 !== 'object') {
        return false;
    }
    
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    
    if (keys1.length !== keys2.length) {
        return false;
    }
    
    for (const key of keys1) {
        if (!keys2.includes(key)) {
            return false;
        }
        
        if (!deepEqual(obj1[key], obj2[key])) {
            return false;
        }
    }
    
    return true;
}

function secureCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') {
        return false;
    }
    
    if (a.length !== b.length) {
        return false;
    }
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    
    return result === 0;
}

function constantTimeStringCompare(str1, str2) {
    const buf1 = Buffer.from(str1);
    const buf2 = Buffer.from(str2);
    
    if (buf1.length !== buf2.length) {
        return false;
    }
    
    return crypto.timingSafeEqual(buf1, buf2);
}

function hashObject(obj) {
    const str = JSON.stringify(obj, Object.keys(obj).sort());
    return crypto.createHash('sha256').update(str).digest('hex');
}

function encodeBase64Url(buffer) {
    return buffer.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

function decodeBase64Url(str) {
    str += '='.repeat((4 - str.length % 4) % 4);
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(str, 'base64');
}

function parseVersion(version) {
    const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
    if (!match) {
        throw new Error(`Invalid version format: ${version}`);
    }
    
    return {
        major: parseInt(match[1], 10),
        minor: parseInt(match[2], 10),
        patch: parseInt(match[3], 10),
        prerelease: match[4] || null
    };
}

function compareVersions(version1, version2) {
    const v1 = parseVersion(version1);
    const v2 = parseVersion(version2);
    
    if (v1.major !== v2.major) {
        return v1.major - v2.major;
    }
    
    if (v1.minor !== v2.minor) {
        return v1.minor - v2.minor;
    }
    
    if (v1.patch !== v2.patch) {
        return v1.patch - v2.patch;
    }
    
    if (v1.prerelease && !v2.prerelease) {
        return -1;
    }
    
    if (!v1.prerelease && v2.prerelease) {
        return 1;
    }
    
    if (v1.prerelease && v2.prerelease) {
        return v1.prerelease.localeCompare(v2.prerelease);
    }
    
    return 0;
}

function sanitizeFilename(filename) {
    return filename
        .replace(/[^a-zA-Z0-9\-_.]/g, '_')
        .replace(/_{2,}/g, '_')
        .replace(/^_|_$/g, '')
        .substring(0, 255);
}

function validateSecurityHeaders(headers) {
    const securityHeaders = {
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY',
        'x-xss-protection': '1; mode=block',
        'strict-transport-security': 'max-age=31536000; includeSubDomains',
        'content-security-policy': "default-src 'self'"
    };
    
    const missing = [];
    for (const [header, expectedValue] of Object.entries(securityHeaders)) {
        if (!headers[header] || headers[header] !== expectedValue) {
            missing.push(header);
        }
    }
    
    return missing;
}

function rateLimit(maxRequests, timeWindow) {
    const requests = new Map();
    
    return (identifier) => {
        const now = Date.now();
        const windowStart = now - timeWindow;
        
        if (!requests.has(identifier)) {
            requests.set(identifier, []);
        }
        
        const userRequests = requests.get(identifier);
        const validRequests = userRequests.filter(time => time > windowStart);
        
        if (validRequests.length >= maxRequests) {
            return false;
        }
        
        validRequests.push(now);
        requests.set(identifier, validRequests);
        
        return true;
    };
}

function createCircuitBreaker(threshold = 5, timeout = 60000) {
    let failures = 0;
    let lastFailureTime = null;
    let state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    
    return async (fn) => {
        if (state === 'OPEN') {
            if (Date.now() - lastFailureTime > timeout) {
                state = 'HALF_OPEN';
            } else {
                throw new Error('Circuit breaker is OPEN');
            }
        }
        
        try {
            const result = await fn();
            
            if (state === 'HALF_OPEN') {
                state = 'CLOSED';
                failures = 0;
            }
            
            return result;
        } catch (error) {
            failures++;
            lastFailureTime = Date.now();
            
            if (failures >= threshold) {
                state = 'OPEN';
            }
            
            throw error;
        }
    };
}

function memoize(fn, keyResolver = (...args) => JSON.stringify(args)) {
    const cache = new Map();
    
    return (...args) => {
        const key = keyResolver(...args);
        
        if (cache.has(key)) {
            return cache.get(key);
        }
        
        const result = fn(...args);
        cache.set(key, result);
        
        return result;
    };
}

module.exports = {
    generateSecureId,
    createTimestamp,
    calculateAge,
    isExpired,
    formatBytes,
    formatDuration,
    sleep,
    retry,
    debounce,
    throttle,
    deepClone,
    deepEqual,
    secureCompare,
    constantTimeStringCompare,
    hashObject,
    encodeBase64Url,
    decodeBase64Url,
    parseVersion,
    compareVersions,
    sanitizeFilename,
    validateSecurityHeaders,
    rateLimit,
    createCircuitBreaker,
    memoize
};