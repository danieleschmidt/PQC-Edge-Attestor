# Multi-stage Dockerfile for PQC-Edge-Attestor
# Optimized for security, performance, and minimal attack surface

# =============================================================================
# Base stage - Common dependencies
# =============================================================================
FROM node:18-alpine AS base

# Install system dependencies and security updates
RUN apk update && apk upgrade && \
    apk add --no-cache \
        dumb-init \
        tini \
        curl \
        wget \
        git \
        python3 \
        py3-pip \
        make \
        g++ \
        gcc \
        libc-dev \
        linux-headers \
        openssl \
        openssl-dev \
        libffi-dev \
        pkgconfig \
        cmake \
        ninja \
        gmp-dev \
        mpfr-dev \
        mpc1-dev && \
    rm -rf /var/cache/apk/* /tmp/* /var/tmp/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# =============================================================================
# Dependencies stage - Install all dependencies
# =============================================================================
FROM base AS dependencies

# Install all dependencies (including devDependencies)
RUN npm ci --only=production && \
    npm cache clean --force

# Install development dependencies in separate layer
RUN npm ci --only=development && \
    npm cache clean --force

# =============================================================================
# Build stage - Compile C/C++ libraries and prepare assets
# =============================================================================
FROM dependencies AS build

# Copy source code
COPY . .

# Build native crypto libraries
RUN mkdir -p build && \
    cd build && \
    cmake .. \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_C_COMPILER=gcc \
        -DCMAKE_CXX_COMPILER=g++ \
        -DENABLE_OPTIMIZATIONS=ON \
        -DENABLE_SECURITY_FEATURES=ON \
        -DBUILD_SHARED_LIBS=ON && \
    make -j$(nproc) && \
    make install

# Run security scan and tests
RUN npm run lint && \
    npm run security:scan && \
    npm run test:unit

# Create optimized production build
RUN npm run build:release

# =============================================================================
# Runtime stage - Minimal production image
# =============================================================================
FROM node:18-alpine AS runtime

# Install only runtime dependencies
RUN apk update && apk upgrade && \
    apk add --no-cache \
        dumb-init \
        tini \
        curl \
        openssl \
        gmp \
        mpfr \
        mpc1 && \
    rm -rf /var/cache/apk/* /tmp/* /var/tmp/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Set working directory
WORKDIR /app

# Copy built application
COPY --from=build --chown=nodejs:nodejs /app/build/release ./build/
COPY --from=build --chown=nodejs:nodejs /app/src ./src/
COPY --from=build --chown=nodejs:nodejs /app/package*.json ./
COPY --from=dependencies --chown=nodejs:nodejs /app/node_modules ./node_modules/

# Copy configuration files
COPY --chown=nodejs:nodejs docs/ ./docs/
COPY --chown=nodejs:nodejs certs/ ./certs/

# Create necessary directories
RUN mkdir -p logs temp uploads && \
    chown -R nodejs:nodejs logs temp uploads

# Security hardening
RUN chmod -R 755 /app && \
    chmod -R 644 /app/src && \
    chmod +x /app/src/index.js

# Set security-focused environment variables
ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=1024 --unhandled-rejections=strict" \
    UV_THREADPOOL_SIZE=16 \
    MALLOC_ARENA_MAX=2

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Expose port
EXPOSE 3000

# Switch to non-root user
USER nodejs

# Use tini as init system
ENTRYPOINT ["tini", "--"]

# Start application
CMD ["node", "src/index.js"]

# =============================================================================
# Development stage - Full development environment
# =============================================================================
FROM dependencies AS development

# Install additional development tools
RUN apk add --no-cache \
        bash \
        zsh \
        fish \
        vim \
        nano \
        less \
        htop \
        tree \
        jq \
        netcat-openbsd \
        strace \
        gdb \
        valgrind && \
    rm -rf /var/cache/apk/*

# Install global development tools
RUN npm install -g \
        nodemon \
        concurrently \
        cross-env \
        rimraf \
        npm-check-updates \
        clinic \
        autocannon

# Copy source code
COPY . .

# Set development environment
ENV NODE_ENV=development \
    DEBUG="pqc-*" \
    LOG_LEVEL=debug

# Expose development ports
EXPOSE 3000 5432 9229 9090

# Development health check
HEALTHCHECK --interval=60s --timeout=10s --start-period=10s --retries=2 \
    CMD curl -f http://localhost:3000/health || exit 1

# Switch to non-root user
USER nodejs

# Development entry point
ENTRYPOINT ["tini", "--"]
CMD ["npm", "run", "dev"]

# =============================================================================
# Testing stage - Optimized for CI/CD
# =============================================================================
FROM dependencies AS testing

# Install testing tools
RUN apk add --no-cache \
        bash \
        curl \
        jq && \
    rm -rf /var/cache/apk/*

# Copy source code
COPY . .

# Build for testing
RUN npm run build:debug

# Set testing environment
ENV NODE_ENV=test \
    CI=true \
    COVERAGE=true

# Run tests
RUN npm run test:all && \
    npm run test:coverage && \
    npm run security:audit

# Switch to non-root user
USER nodejs

# Default command for testing
CMD ["npm", "test"]

# =============================================================================
# Security scan stage - Vulnerability scanning
# =============================================================================
FROM runtime AS security-scan

# Install security scanning tools
USER root
RUN apk add --no-cache \
        grype \
        syft && \
    rm -rf /var/cache/apk/*

# Run security scans
RUN grype . -o json > /tmp/vulnerabilities.json && \
    syft . -o json > /tmp/sbom.json

# Switch back to non-root user
USER nodejs

# =============================================================================
# Metadata and labels
# =============================================================================
LABEL maintainer="Terragon Labs <dev@terragonlabs.com>" \
      org.opencontainers.image.title="PQC-Edge-Attestor" \
      org.opencontainers.image.description="Post-quantum cryptographic framework for IoT edge device attestation" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.vendor="Terragon Labs" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.source="https://github.com/terragonlabs/PQC-Edge-Attestor" \
      org.opencontainers.image.documentation="https://github.com/terragonlabs/PQC-Edge-Attestor/blob/main/README.md" \
      org.opencontainers.image.created="$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
      security.scan="enabled" \
      security.updates="automated" \
      build.automated="true" \
      build.target="production"
