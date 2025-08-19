/**
 * @file circuitBreaker.js
 * @brief Circuit breaker pattern implementation for resilient service calls - Generation 2
 */

const EventEmitter = require('events');

const STATES = {
    CLOSED: 'CLOSED',
    OPEN: 'OPEN', 
    HALF_OPEN: 'HALF_OPEN'
};

class CircuitBreakerError extends Error {
    constructor(message, state, stats) {
        super(message);
        this.name = 'CircuitBreakerError';
        this.state = state;
        this.stats = stats;
    }
}

class CircuitBreaker extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            failureThreshold: options.failureThreshold || 5,
            successThreshold: options.successThreshold || 2,
            timeout: options.timeout || 30000,
            serviceName: options.serviceName || 'unknown-service',
            ...options
        };
        
        this.state = STATES.CLOSED;
        this.stats = {
            requests: 0,
            successes: 0,
            failures: 0,
            rejects: 0
        };
        
        this.failureHistory = [];
        this.openedAt = null;
        this.halfOpenSuccesses = 0;
    }

    async execute(fn, ...args) {
        this.stats.requests++;
        
        try {
            this._checkCircuitState();
            const result = await fn(...args);
            await this._onSuccess();
            return result;
        } catch (error) {
            await this._onFailure(error);
            throw error;
        }
    }

    getState() {
        return this.state;
    }

    getStats() {
        return {
            ...this.stats,
            state: this.state,
            failureRate: this._calculateFailureRate()
        };
    }

    _checkCircuitState() {
        const now = Date.now();
        
        switch (this.state) {
            case STATES.CLOSED:
                if (this._shouldOpen()) {
                    this._transitionTo(STATES.OPEN);
                    throw new CircuitBreakerError('Circuit breaker opened', this.state, this.stats);
                }
                break;
                
            case STATES.OPEN:
                if (this.openedAt && (now - this.openedAt >= this.options.timeout)) {
                    this._transitionTo(STATES.HALF_OPEN);
                } else {
                    this.stats.rejects++;
                    throw new CircuitBreakerError('Circuit breaker is open', this.state, this.stats);
                }
                break;
        }
    }

    async _onSuccess() {
        this.stats.successes++;
        
        if (this.state === STATES.HALF_OPEN) {
            this.halfOpenSuccesses++;
            if (this.halfOpenSuccesses >= this.options.successThreshold) {
                this._transitionTo(STATES.CLOSED);
            }
        }
    }

    async _onFailure(error) {
        if (error instanceof CircuitBreakerError) {
            throw error;
        }
        
        this.stats.failures++;
        this.failureHistory.push(Date.now());
        
        if (this.state === STATES.HALF_OPEN) {
            this._transitionTo(STATES.OPEN);
        }
    }

    _shouldOpen() {
        const cutoff = Date.now() - 60000; // 1 minute window
        const recentFailures = this.failureHistory.filter(t => t > cutoff);
        return recentFailures.length >= this.options.failureThreshold;
    }

    _transitionTo(newState) {
        const previousState = this.state;
        this.state = newState;
        
        if (newState === STATES.OPEN) {
            this.openedAt = Date.now();
            this.halfOpenSuccesses = 0;
        } else if (newState === STATES.CLOSED) {
            this.openedAt = null;
            this.halfOpenSuccesses = 0;
        }
        
        this.emit('stateChange', { previousState, newState });
    }

    _calculateFailureRate() {
        const total = this.stats.successes + this.stats.failures;
        return total > 0 ? this.stats.failures / total : 0;
    }
}

module.exports = { CircuitBreaker, CircuitBreakerError, STATES };