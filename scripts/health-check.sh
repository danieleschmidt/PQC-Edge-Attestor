#!/bin/bash

# PQC-Edge-Attestor Health Check Script
# Usage: ./scripts/health-check.sh [endpoint]

set -euo pipefail

# Configuration
ENDPOINT="${1:-http://localhost:3000}"
TIMEOUT=30
RETRIES=3

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Health check function
check_endpoint() {
    local endpoint="$1"
    local description="$2"
    local expected_status="${3:-200}"
    
    log_info "Checking $description..."
    
    local response
    local status_code
    local attempt=1
    
    while [[ $attempt -le $RETRIES ]]; do
        if response=$(curl -s -w "HTTPSTATUS:%{http_code}" --max-time $TIMEOUT "$endpoint" 2>/dev/null); then
            status_code=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
            body=$(echo "$response" | sed -E 's/HTTPSTATUS:[0-9]*$//')
            
            if [[ "$status_code" == "$expected_status" ]]; then
                log_success "$description (HTTP $status_code)"
                echo "$body" | jq . 2>/dev/null || echo "$body"
                return 0
            else
                log_warning "$description returned HTTP $status_code (expected $expected_status)"
            fi
        else
            log_warning "$description failed (attempt $attempt/$RETRIES)"
        fi
        
        ((attempt++))
        if [[ $attempt -le $RETRIES ]]; then
            sleep 2
        fi
    done
    
    log_error "$description failed after $RETRIES attempts"
    return 1
}

# Performance check
check_performance() {
    log_info "Running performance checks..."
    
    local start_time=$(date +%s%N)
    
    if curl -s --max-time 5 "$ENDPOINT/api/v1/status" > /dev/null; then
        local end_time=$(date +%s%N)
        local duration=$(( (end_time - start_time) / 1000000 ))
        
        if [[ $duration -lt 1000 ]]; then
            log_success "Response time: ${duration}ms (Good)"
        elif [[ $duration -lt 3000 ]]; then
            log_warning "Response time: ${duration}ms (Acceptable)"
        else
            log_error "Response time: ${duration}ms (Slow)"
            return 1
        fi
    else
        log_error "Performance check failed"
        return 1
    fi
}

# Security check
check_security() {
    log_info "Running security checks..."
    
    # Check security headers
    local headers
    if headers=$(curl -s -I "$ENDPOINT" --max-time $TIMEOUT 2>/dev/null); then
        log_info "Checking security headers..."
        
        if echo "$headers" | grep -qi "x-frame-options"; then
            log_success "X-Frame-Options header present"
        else
            log_warning "X-Frame-Options header missing"
        fi
        
        if echo "$headers" | grep -qi "x-content-type-options"; then
            log_success "X-Content-Type-Options header present"
        else
            log_warning "X-Content-Type-Options header missing"
        fi
        
        if echo "$headers" | grep -qi "strict-transport-security"; then
            log_success "HSTS header present"
        else
            log_warning "HSTS header missing (expected for HTTPS)"
        fi
    else
        log_error "Failed to retrieve headers"
        return 1
    fi
}

# Main health check
main() {
    log_info "Starting PQC-Edge-Attestor health check..."
    log_info "Endpoint: $ENDPOINT"
    echo ""
    
    local exit_code=0
    
    # Core health checks
    check_endpoint "$ENDPOINT/health" "Basic health check" || exit_code=1
    check_endpoint "$ENDPOINT/health/ready" "Readiness check" || exit_code=1
    check_endpoint "$ENDPOINT/api/v1/status" "API status" || exit_code=1
    
    # Optional checks (don't fail if not available)
    check_endpoint "$ENDPOINT/metrics" "Metrics endpoint" || log_warning "Metrics endpoint not available"
    
    # Performance and security checks
    check_performance || exit_code=1
    check_security || log_warning "Some security checks failed"
    
    echo ""
    if [[ $exit_code -eq 0 ]]; then
        log_success "All health checks passed!"
    else
        log_error "Some health checks failed!"
    fi
    
    return $exit_code
}

# Help message
show_help() {
    echo "PQC-Edge-Attestor Health Check Script"
    echo ""
    echo "Usage: $0 [endpoint]"
    echo ""
    echo "Arguments:"
    echo "  endpoint    Base URL to check (default: http://localhost:3000)"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Check localhost"
    echo "  $0 https://pqc.yourdomain.com         # Check production"
    echo "  $0 http://staging.yourdomain.com:3000 # Check staging"
    echo ""
}

# Handle script arguments
case "${1:-}" in
    "help"|"-h"|"--help")
        show_help
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac