const crypto = require('crypto');
const { ValidationError } = require('../utils/validators');
const logger = require('../utils/logger');

class CryptoService {
    constructor(options = {}) {
        this.options = {
            defaultKemAlgorithm: options.defaultKemAlgorithm || 'kyber1024',
            defaultSignatureAlgorithm: options.defaultSignatureAlgorithm || 'dilithium5',
            hybridMode: options.hybridMode || false,
            keyCache: options.keyCache || true,
            securityLevel: options.securityLevel || 5,
            ...options
        };

        this.keyPairCache = new Map();
        this.supportedAlgorithms = {
            kem: ['kyber768', 'kyber1024'],
            signature: ['dilithium3', 'dilithium5', 'falcon512', 'falcon1024'],
            hash: ['sha256', 'sha384', 'sha3-256', 'sha3-384', 'shake256']
        };

        this.initializeCryptoModules();
    }

    initializeCryptoModules() {
        try {
            this.kyber = require('../crypto/kyber/kyber');
            this.dilithium = require('../crypto/dilithium/dilithium');
            this.falcon = require('../crypto/falcon/falcon');
            
            logger.info('PQC crypto modules initialized', {
                algorithms: this.supportedAlgorithms,
                hybridMode: this.options.hybridMode
            });
        } catch (error) {
            logger.error('Failed to initialize crypto modules', { error: error.message });
            throw new Error(`Crypto initialization failed: ${error.message}`);
        }
    }

    async generateKEMKeyPair(algorithm = null) {
        const alg = algorithm || this.options.defaultKemAlgorithm;
        
        if (!this.supportedAlgorithms.kem.includes(alg)) {
            throw new ValidationError(`Unsupported KEM algorithm: ${alg}`);
        }

        try {
            const keyPair = await this.generateKyberKeyPair(alg);
            
            if (this.options.keyCache) {
                const cacheKey = `kem_${alg}_${Date.now()}`;
                this.keyPairCache.set(cacheKey, {
                    keyPair,
                    algorithm: alg,
                    type: 'kem',
                    createdAt: new Date()
                });
            }

            logger.info('KEM key pair generated', { algorithm: alg });
            return keyPair;

        } catch (error) {
            logger.error('KEM key generation failed', { algorithm: alg, error: error.message });
            throw error;
        }
    }

    async generateSignatureKeyPair(algorithm = null) {
        const alg = algorithm || this.options.defaultSignatureAlgorithm;
        
        if (!this.supportedAlgorithms.signature.includes(alg)) {
            throw new ValidationError(`Unsupported signature algorithm: ${alg}`);
        }

        try {
            let keyPair;

            if (alg.startsWith('dilithium')) {
                keyPair = await this.generateDilithiumKeyPair(alg);
            } else if (alg.startsWith('falcon')) {
                keyPair = await this.generateFalconKeyPair(alg);
            } else {
                throw new Error(`Unsupported signature algorithm: ${alg}`);
            }

            if (this.options.keyCache) {
                const cacheKey = `sig_${alg}_${Date.now()}`;
                this.keyPairCache.set(cacheKey, {
                    keyPair,
                    algorithm: alg,
                    type: 'signature',
                    createdAt: new Date()
                });
            }

            logger.info('Signature key pair generated', { algorithm: alg });
            return keyPair;

        } catch (error) {
            logger.error('Signature key generation failed', { algorithm: alg, error: error.message });
            throw error;
        }
    }

    async generateHybridKeyPair(classicalAlgorithm = 'ecdsa', pqcAlgorithm = null) {
        if (!this.options.hybridMode) {
            throw new Error('Hybrid mode not enabled');
        }

        const pqcAlg = pqcAlgorithm || this.options.defaultSignatureAlgorithm;

        try {
            const classicalKeyPair = crypto.generateKeyPairSync(classicalAlgorithm, {
                namedCurve: 'prime384v1',
                publicKeyEncoding: { type: 'spki', format: 'pem' },
                privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
            });

            const pqcKeyPair = await this.generateSignatureKeyPair(pqcAlg);

            const hybridKeyPair = {
                publicKey: {
                    classical: classicalKeyPair.publicKey,
                    pqc: pqcKeyPair.publicKey,
                    algorithm: `${classicalAlgorithm}+${pqcAlg}`
                },
                privateKey: {
                    classical: classicalKeyPair.privateKey,
                    pqc: pqcKeyPair.privateKey,
                    algorithm: `${classicalAlgorithm}+${pqcAlg}`
                }
            };

            logger.info('Hybrid key pair generated', { 
                classical: classicalAlgorithm, 
                pqc: pqcAlg 
            });

            return hybridKeyPair;

        } catch (error) {
            logger.error('Hybrid key generation failed', { error: error.message });
            throw error;
        }
    }

    async encapsulate(publicKey, algorithm = null) {
        const alg = algorithm || this.options.defaultKemAlgorithm;

        try {
            const result = await this.kyberEncapsulate(publicKey, alg);
            
            logger.debug('Key encapsulation completed', { 
                algorithm: alg,
                ciphertextLength: result.ciphertext.length,
                sharedSecretLength: result.sharedSecret.length
            });

            return result;

        } catch (error) {
            logger.error('Key encapsulation failed', { algorithm: alg, error: error.message });
            throw error;
        }
    }

    async decapsulate(ciphertext, privateKey, algorithm = null) {
        const alg = algorithm || this.options.defaultKemAlgorithm;

        try {
            const sharedSecret = await this.kyberDecapsulate(ciphertext, privateKey, alg);
            
            logger.debug('Key decapsulation completed', { 
                algorithm: alg,
                sharedSecretLength: sharedSecret.length
            });

            return sharedSecret;

        } catch (error) {
            logger.error('Key decapsulation failed', { algorithm: alg, error: error.message });
            throw error;
        }
    }

    async sign(message, privateKey, algorithm = null) {
        const alg = algorithm || this.options.defaultSignatureAlgorithm;

        try {
            let signature;

            if (typeof privateKey === 'object' && privateKey.classical && privateKey.pqc) {
                signature = await this.signHybrid(message, privateKey, alg);
            } else if (alg.startsWith('dilithium')) {
                signature = await this.dilithiumSign(message, privateKey, alg);
            } else if (alg.startsWith('falcon')) {
                signature = await this.falconSign(message, privateKey, alg);
            } else {
                throw new Error(`Unsupported signature algorithm: ${alg}`);
            }

            logger.debug('Message signed', { 
                algorithm: alg,
                messageLength: message.length,
                signatureLength: typeof signature === 'string' ? signature.length : JSON.stringify(signature).length
            });

            return signature;

        } catch (error) {
            logger.error('Signing failed', { algorithm: alg, error: error.message });
            throw error;
        }
    }

    async verify(message, signature, publicKey, algorithm = null) {
        const alg = algorithm || this.options.defaultSignatureAlgorithm;

        try {
            let isValid;

            if (typeof publicKey === 'object' && publicKey.classical && publicKey.pqc) {
                isValid = await this.verifyHybrid(message, signature, publicKey, alg);
            } else if (alg.startsWith('dilithium')) {
                isValid = await this.dilithiumVerify(message, signature, publicKey, alg);
            } else if (alg.startsWith('falcon')) {
                isValid = await this.falconVerify(message, signature, publicKey, alg);
            } else {
                throw new Error(`Unsupported signature algorithm: ${alg}`);
            }

            logger.debug('Signature verification completed', { 
                algorithm: alg,
                isValid: isValid
            });

            return isValid;

        } catch (error) {
            logger.error('Signature verification failed', { algorithm: alg, error: error.message });
            return false;
        }
    }

    async hash(data, algorithm = 'sha256') {
        if (!this.supportedAlgorithms.hash.includes(algorithm)) {
            throw new ValidationError(`Unsupported hash algorithm: ${algorithm}`);
        }

        try {
            const hash = crypto.createHash(algorithm);
            hash.update(data);
            return hash.digest('hex');
        } catch (error) {
            logger.error('Hashing failed', { algorithm, error: error.message });
            throw error;
        }
    }

    async generateRandomBytes(length) {
        try {
            return crypto.randomBytes(length);
        } catch (error) {
            logger.error('Random byte generation failed', { length, error: error.message });
            throw error;
        }
    }

    async generateKyberKeyPair(algorithm) {
        return this.kyber.generateKeyPair(algorithm);
    }

    async kyberEncapsulate(publicKey, algorithm) {
        return this.kyber.encapsulate(publicKey, algorithm);
    }

    async kyberDecapsulate(ciphertext, privateKey, algorithm) {
        return this.kyber.decapsulate(ciphertext, privateKey, algorithm);
    }

    async generateDilithiumKeyPair(algorithm) {
        return this.dilithium.generateKeyPair(algorithm);
    }

    async dilithiumSign(message, privateKey, algorithm) {
        return this.dilithium.sign(message, privateKey, algorithm);
    }

    async dilithiumVerify(message, signature, publicKey, algorithm) {
        return this.dilithium.verify(message, signature, publicKey, algorithm);
    }

    async generateFalconKeyPair(algorithm) {
        return this.falcon.generateKeyPair(algorithm);
    }

    async falconSign(message, privateKey, algorithm) {
        return this.falcon.sign(message, privateKey, algorithm);
    }

    async falconVerify(message, signature, publicKey, algorithm) {
        return this.falcon.verify(message, signature, publicKey, algorithm);
    }

    async signHybrid(message, hybridPrivateKey, algorithm) {
        const classicalSig = crypto.sign('sha256', message, hybridPrivateKey.classical);
        const pqcSig = await this.sign(message, hybridPrivateKey.pqc, algorithm.split('+')[1]);

        return {
            classical: classicalSig.toString('hex'),
            pqc: pqcSig,
            algorithm: hybridPrivateKey.algorithm
        };
    }

    async verifyHybrid(message, hybridSignature, hybridPublicKey, algorithm) {
        try {
            const classicalValid = crypto.verify(
                'sha256', 
                message, 
                hybridPublicKey.classical, 
                Buffer.from(hybridSignature.classical, 'hex')
            );

            const pqcValid = await this.verify(
                message, 
                hybridSignature.pqc, 
                hybridPublicKey.pqc, 
                algorithm.split('+')[1]
            );

            return classicalValid && pqcValid;

        } catch (error) {
            logger.error('Hybrid verification failed', { error: error.message });
            return false;
        }
    }

    clearKeyCache() {
        this.keyPairCache.clear();
        logger.info('Key pair cache cleared');
    }

    getCacheStats() {
        return {
            size: this.keyPairCache.size,
            entries: Array.from(this.keyPairCache.entries()).map(([key, value]) => ({
                key,
                algorithm: value.algorithm,
                type: value.type,
                createdAt: value.createdAt
            }))
        };
    }

    getSupportedAlgorithms() {
        return { ...this.supportedAlgorithms };
    }

    getSecurityLevel(algorithm) {
        const levels = {
            'kyber768': 3,
            'kyber1024': 5,
            'dilithium3': 3,
            'dilithium5': 5,
            'falcon512': 1,
            'falcon1024': 5
        };

        return levels[algorithm] || 1;
    }
}

module.exports = CryptoService;