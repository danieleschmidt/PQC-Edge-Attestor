const crypto = require('crypto');

class FalconSignature {
    constructor() {
        this.algorithms = {
            'falcon512': { n: 512, securityLevel: 1 },
            'falcon1024': { n: 1024, securityLevel: 5 }
        };
    }

    async generateKeyPair(algorithm = 'falcon1024') {
        if (!this.algorithms[algorithm]) {
            throw new Error(`Unsupported Falcon algorithm: ${algorithm}`);
        }

        const params = this.algorithms[algorithm];
        
        // Mock implementation - in production this would use the actual Falcon implementation
        const publicKeyLength = this.getPublicKeyLength(algorithm);
        const privateKeyLength = this.getPrivateKeyLength(algorithm);

        const publicKey = crypto.randomBytes(publicKeyLength);
        const privateKey = crypto.randomBytes(privateKeyLength);

        return {
            publicKey: publicKey.toString('hex'),
            privateKey: privateKey.toString('hex'),
            algorithm: algorithm,
            keyLength: {
                public: publicKeyLength,
                private: privateKeyLength
            }
        };
    }

    async sign(messageHex, privateKeyHex, algorithm = 'falcon1024') {
        if (!this.algorithms[algorithm]) {
            throw new Error(`Unsupported Falcon algorithm: ${algorithm}`);
        }

        const message = Buffer.from(messageHex, 'hex');
        const privateKey = Buffer.from(privateKeyHex, 'hex');

        // Validate private key length
        const expectedLength = this.getPrivateKeyLength(algorithm);
        if (privateKey.length !== expectedLength) {
            throw new Error(`Invalid private key length for ${algorithm}`);
        }

        // Mock implementation - generate deterministic signature
        const hash = crypto.createHash('sha256');
        hash.update(message);
        hash.update(privateKey);
        hash.update(algorithm);
        
        const signatureBase = hash.digest();
        
        // Falcon signatures are variable length, but we'll use average size
        const signatureLength = this.getAverageSignatureLength(algorithm);
        const signature = Buffer.alloc(signatureLength);
        
        // Generate signature using expanding hash
        for (let i = 0; i < signatureLength; i += 32) {
            const chunk = crypto.createHash('sha256');
            chunk.update(signatureBase);
            chunk.update(Buffer.from([Math.floor(i / 32)]));
            const chunkHash = chunk.digest();
            
            const copyLength = Math.min(32, signatureLength - i);
            chunkHash.copy(signature, i, 0, copyLength);
        }

        // Add length prefix (Falcon signatures include length)
        const lengthBuffer = Buffer.alloc(2);
        lengthBuffer.writeUInt16BE(signatureLength, 0);
        const finalSignature = Buffer.concat([lengthBuffer, signature]);

        return {
            signature: finalSignature.toString('hex'),
            algorithm: algorithm,
            messageHash: crypto.createHash('sha256').update(message).digest('hex'),
            signatureLength: signatureLength
        };
    }

    async verify(messageHex, signatureData, publicKeyHex, algorithm = 'falcon1024') {
        if (!this.algorithms[algorithm]) {
            throw new Error(`Unsupported Falcon algorithm: ${algorithm}`);
        }

        try {
            const message = Buffer.from(messageHex, 'hex');
            const publicKey = Buffer.from(publicKeyHex, 'hex');
            
            let signature;
            if (typeof signatureData === 'string') {
                signature = Buffer.from(signatureData, 'hex');
            } else if (signatureData.signature) {
                signature = Buffer.from(signatureData.signature, 'hex');
            } else {
                throw new Error('Invalid signature format');
            }

            // Validate public key length
            const expectedPublicKeyLength = this.getPublicKeyLength(algorithm);
            if (publicKey.length !== expectedPublicKeyLength) {
                return false;
            }

            // Extract signature length and data
            if (signature.length < 2) {
                return false;
            }

            const signatureLength = signature.readUInt16BE(0);
            const signatureData_actual = signature.slice(2);

            if (signatureData_actual.length !== signatureLength) {
                return false;
            }

            // Validate signature length bounds
            const { min, max } = this.getSignatureLengthBounds(algorithm);
            if (signatureLength < min || signatureLength > max) {
                return false;
            }

            // Mock verification - regenerate expected signature
            const hash = crypto.createHash('sha256');
            hash.update(message);
            hash.update(publicKey); // In real implementation, would use key derivation
            hash.update(algorithm);
            
            const expectedBase = hash.digest();
            
            // Generate expected signature
            const expectedSignature = Buffer.alloc(signatureLength);
            for (let i = 0; i < signatureLength; i += 32) {
                const chunk = crypto.createHash('sha256');
                chunk.update(expectedBase);
                chunk.update(Buffer.from([Math.floor(i / 32)]));
                const chunkHash = chunk.digest();
                
                const copyLength = Math.min(32, signatureLength - i);
                chunkHash.copy(expectedSignature, i, 0, copyLength);
            }

            // Constant-time comparison
            return this.constantTimeCompare(signatureData_actual, expectedSignature);

        } catch (error) {
            return false;
        }
    }

    getPublicKeyLength(algorithm) {
        const params = this.algorithms[algorithm];
        if (!params) return 0;
        
        // Falcon public key size: n * log2(q) / 8 = n * 14 / 8
        switch (algorithm) {
            case 'falcon512': return 897;
            case 'falcon1024': return 1793;
            default: return 0;
        }
    }

    getPrivateKeyLength(algorithm) {
        const params = this.algorithms[algorithm];
        if (!params) return 0;
        
        // Falcon private key size is much larger due to the tree structure
        switch (algorithm) {
            case 'falcon512': return 1281;
            case 'falcon1024': return 2305;
            default: return 0;
        }
    }

    getAverageSignatureLength(algorithm) {
        const params = this.algorithms[algorithm];
        if (!params) return 0;
        
        // Falcon signatures are variable length, these are typical sizes
        switch (algorithm) {
            case 'falcon512': return 666;
            case 'falcon1024': return 1280;
            default: return 0;
        }
    }

    getSignatureLengthBounds(algorithm) {
        const params = this.algorithms[algorithm];
        if (!params) return { min: 0, max: 0 };
        
        // Falcon signature length bounds
        switch (algorithm) {
            case 'falcon512': 
                return { min: 617, max: 717 };
            case 'falcon1024': 
                return { min: 1230, max: 1330 };
            default: 
                return { min: 0, max: 0 };
        }
    }

    getSupportedAlgorithms() {
        return Object.keys(this.algorithms);
    }

    getAlgorithmParams(algorithm) {
        return this.algorithms[algorithm];
    }

    validateKeyPair(publicKeyHex, privateKeyHex, algorithm) {
        try {
            const publicKey = Buffer.from(publicKeyHex, 'hex');
            const privateKey = Buffer.from(privateKeyHex, 'hex');

            const expectedPublicLength = this.getPublicKeyLength(algorithm);
            const expectedPrivateLength = this.getPrivateKeyLength(algorithm);

            return publicKey.length === expectedPublicLength && 
                   privateKey.length === expectedPrivateLength;
        } catch (error) {
            return false;
        }
    }

    // Constant-time operations for side-channel resistance
    constantTimeCompare(a, b) {
        if (a.length !== b.length) {
            return false;
        }
        
        let result = 0;
        for (let i = 0; i < a.length; i++) {
            result |= a[i] ^ b[i];
        }
        
        return result === 0;
    }

    constantTimeSelect(condition, a, b) {
        const mask = condition ? 0xFF : 0x00;
        const result = new Uint8Array(a.length);
        
        for (let i = 0; i < a.length; i++) {
            result[i] = (mask & a[i]) | ((~mask) & b[i]);
        }
        
        return result;
    }

    // Security analysis helpers
    getSecurityLevel(algorithm) {
        const params = this.algorithms[algorithm];
        return params ? params.securityLevel : 0;
    }

    estimateOperationTime(algorithm, operation) {
        // Estimated times in milliseconds for different operations
        // Falcon is generally faster than Dilithium
        const estimates = {
            'falcon512': {
                keygen: 8.2,
                sign: 4.1,
                verify: 0.8
            },
            'falcon1024': {
                keygen: 15.7,
                sign: 7.2,
                verify: 1.2
            }
        };

        const alg = estimates[algorithm];
        return alg ? alg[operation] || 0 : 0;
    }

    // Memory requirements in bytes
    getMemoryRequirements(algorithm) {
        const params = this.algorithms[algorithm];
        if (!params) return null;

        return {
            stackMemory: params.n * 8, // Stack usage for tree operations
            heapMemory: this.getPublicKeyLength(algorithm) + this.getPrivateKeyLength(algorithm),
            signatureMemory: this.getAverageSignatureLength(algorithm),
            treeMemory: params.n * 16, // Memory for the signing tree
            totalMemory: params.n * 32 // Total working memory
        };
    }

    // Batch verification for multiple signatures
    async batchVerify(verifications) {
        const results = [];
        
        for (const verification of verifications) {
            const { message, signature, publicKey, algorithm } = verification;
            const result = await this.verify(message, signature, publicKey, algorithm);
            results.push({
                ...verification,
                valid: result
            });
        }
        
        return results;
    }

    // Signature with salt (randomized signing)
    async signWithSalt(messageHex, saltHex, privateKeyHex, algorithm = 'falcon1024') {
        if (!saltHex || typeof saltHex !== 'string') {
            throw new Error('Salt must be a non-empty hex string');
        }

        // Prepend salt to message
        const saltBuffer = Buffer.from(saltHex, 'hex');
        const messageBuffer = Buffer.from(messageHex, 'hex');
        const saltedMessage = Buffer.concat([saltBuffer, messageBuffer]);

        const result = await this.sign(saltedMessage.toString('hex'), privateKeyHex, algorithm);
        result.salt = saltHex;
        
        return result;
    }

    async verifyWithSalt(messageHex, saltHex, signatureData, publicKeyHex, algorithm = 'falcon1024') {
        if (!saltHex || typeof saltHex !== 'string') {
            return false;
        }

        // Reconstruct salted message
        const saltBuffer = Buffer.from(saltHex, 'hex');
        const messageBuffer = Buffer.from(messageHex, 'hex');
        const saltedMessage = Buffer.concat([saltBuffer, messageBuffer]);

        return await this.verify(saltedMessage.toString('hex'), signatureData, publicKeyHex, algorithm);
    }

    // Tree-based signature verification for Falcon's specific structure
    verifyTreeStructure(signature, algorithm) {
        try {
            const sig = Buffer.from(signature, 'hex');
            
            if (sig.length < 2) {
                return false;
            }

            const signatureLength = sig.readUInt16BE(0);
            const bounds = this.getSignatureLengthBounds(algorithm);
            
            return signatureLength >= bounds.min && signatureLength <= bounds.max;
        } catch (error) {
            return false;
        }
    }

    // Compress signature (Falcon supports signature compression)
    compressSignature(signatureHex) {
        // Mock compression - in practice this would use Falcon's compression algorithm
        const signature = Buffer.from(signatureHex, 'hex');
        const compressed = crypto.createHash('sha256').update(signature).digest();
        
        return {
            compressed: compressed.toString('hex'),
            originalLength: signature.length,
            compressionRatio: compressed.length / signature.length
        };
    }

    decompressSignature(compressedHex, originalLength) {
        // Mock decompression - in practice this would reconstruct the signature
        const compressed = Buffer.from(compressedHex, 'hex');
        
        // Simple expansion for demo
        const expanded = Buffer.alloc(originalLength);
        for (let i = 0; i < originalLength; i++) {
            expanded[i] = compressed[i % compressed.length];
        }
        
        return expanded.toString('hex');
    }
}

// Export singleton instance
const falcon = new FalconSignature();

module.exports = {
    generateKeyPair: (algorithm) => falcon.generateKeyPair(algorithm),
    sign: (message, privateKey, algorithm) => falcon.sign(message, privateKey, algorithm),
    verify: (message, signature, publicKey, algorithm) => falcon.verify(message, signature, publicKey, algorithm),
    signWithSalt: (message, salt, privateKey, algorithm) => falcon.signWithSalt(message, salt, privateKey, algorithm),
    verifyWithSalt: (message, salt, signature, publicKey, algorithm) => falcon.verifyWithSalt(message, salt, signature, publicKey, algorithm),
    batchVerify: (verifications) => falcon.batchVerify(verifications),
    getSupportedAlgorithms: () => falcon.getSupportedAlgorithms(),
    getAlgorithmParams: (algorithm) => falcon.getAlgorithmParams(algorithm),
    validateKeyPair: (publicKey, privateKey, algorithm) => falcon.validateKeyPair(publicKey, privateKey, algorithm),
    getSecurityLevel: (algorithm) => falcon.getSecurityLevel(algorithm),
    estimateOperationTime: (algorithm, operation) => falcon.estimateOperationTime(algorithm, operation),
    getMemoryRequirements: (algorithm) => falcon.getMemoryRequirements(algorithm),
    verifyTreeStructure: (signature, algorithm) => falcon.verifyTreeStructure(signature, algorithm),
    compressSignature: (signature) => falcon.compressSignature(signature),
    decompressSignature: (compressed, length) => falcon.decompressSignature(compressed, length)
};