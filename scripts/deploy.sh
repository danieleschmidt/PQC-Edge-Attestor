#!/bin/bash

# PQC-Edge-Attestor Production Deployment Script
# Usage: ./scripts/deploy.sh [environment] [version]

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENVIRONMENT="${1:-production}"
VERSION="${2:-latest}"
COMPOSE_FILE="docker-compose.prod.yml"

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

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if Docker is installed and running
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi
    
    # Check if Docker Compose is available
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    
    # Check if required files exist
    if [[ ! -f "$PROJECT_ROOT/$COMPOSE_FILE" ]]; then
        log_error "Docker Compose file not found: $COMPOSE_FILE"
        exit 1
    fi
    
    if [[ ! -f "$PROJECT_ROOT/.env.production" ]]; then
        log_warning "Production environment file not found: .env.production"
        log_info "Please create .env.production with required environment variables"
    fi
    
    log_success "Prerequisites check passed"
}

# Load environment variables
load_environment() {
    log_info "Loading environment configuration..."
    
    if [[ -f "$PROJECT_ROOT/.env.production" ]]; then
        set -a
        source "$PROJECT_ROOT/.env.production"
        set +a
        log_success "Environment variables loaded from .env.production"
    else
        log_warning "Using default environment variables"
    fi
    
    # Set default values if not provided
    export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(openssl rand -base64 32)}"
    export REDIS_PASSWORD="${REDIS_PASSWORD:-$(openssl rand -base64 32)}"
    export JWT_SECRET="${JWT_SECRET:-$(openssl rand -base64 64)}"
    export GRAFANA_PASSWORD="${GRAFANA_PASSWORD:-$(openssl rand -base64 16)}"
}

# Build Docker images
build_images() {
    log_info "Building Docker images..."
    
    cd "$PROJECT_ROOT"
    
    # Build main application image
    docker build -f Dockerfile.prod -t "terragonlabs/pqc-edge-attestor:$VERSION" .
    docker tag "terragonlabs/pqc-edge-attestor:$VERSION" "terragonlabs/pqc-edge-attestor:latest"
    
    log_success "Docker images built successfully"
}

# Create necessary directories and files
setup_deployment() {
    log_info "Setting up deployment environment..."
    
    # Create required directories
    mkdir -p "$PROJECT_ROOT/logs"
    mkdir -p "$PROJECT_ROOT/certs"
    mkdir -p "$PROJECT_ROOT/data"
    mkdir -p "$PROJECT_ROOT/config/nginx"
    mkdir -p "$PROJECT_ROOT/config/grafana/dashboards"
    mkdir -p "$PROJECT_ROOT/config/grafana/datasources"
    
    # Set proper permissions
    chmod 755 "$PROJECT_ROOT/logs"
    chmod 755 "$PROJECT_ROOT/data"
    
    log_success "Deployment environment setup complete"
}

# Deploy services
deploy_services() {
    log_info "Deploying services..."
    
    cd "$PROJECT_ROOT"
    
    # Use docker-compose or docker compose based on availability
    COMPOSE_CMD="docker-compose"
    if ! command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker compose"
    fi
    
    # Stop existing services gracefully
    log_info "Stopping existing services..."
    $COMPOSE_CMD -f "$COMPOSE_FILE" down --timeout 30
    
    # Pull latest images for external services
    log_info "Pulling latest images..."
    $COMPOSE_CMD -f "$COMPOSE_FILE" pull postgres redis prometheus grafana nginx
    
    # Start services
    log_info "Starting services..."
    $COMPOSE_CMD -f "$COMPOSE_FILE" up -d
    
    log_success "Services deployed successfully"
}

# Wait for services to be healthy
wait_for_services() {
    log_info "Waiting for services to be healthy..."
    
    local max_attempts=60
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        log_info "Health check attempt $attempt/$max_attempts"
        
        # Check main application health
        if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
            log_success "PQC-Edge-Attestor service is healthy"
            break
        fi
        
        if [[ $attempt -eq $max_attempts ]]; then
            log_error "Services failed to become healthy within timeout"
            return 1
        fi
        
        sleep 10
        ((attempt++))
    done
}

# Run post-deployment tests
run_post_deployment_tests() {
    log_info "Running post-deployment tests..."
    
    # Test main application endpoints
    log_info "Testing main application endpoints..."
    
    # Health check
    if ! curl -sf http://localhost:3000/health; then
        log_error "Health check failed"
        return 1
    fi
    
    # API status
    if ! curl -sf http://localhost:3000/api/v1/status; then
        log_error "API status check failed"
        return 1
    fi
    
    # Metrics endpoint
    if ! curl -sf http://localhost:3000/metrics; then
        log_error "Metrics endpoint check failed"
        return 1
    fi
    
    log_success "Post-deployment tests passed"
}

# Display deployment information
display_deployment_info() {
    log_success "Deployment completed successfully!"
    echo ""
    echo "=== Deployment Information ==="
    echo "Environment: $ENVIRONMENT"
    echo "Version: $VERSION"
    echo "Timestamp: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
    echo ""
    echo "=== Service URLs ==="
    echo "PQC-Edge-Attestor API: http://localhost:3000"
    echo "Health Check: http://localhost:3000/health"
    echo "API Documentation: http://localhost:3000/api-docs (if enabled)"
    echo "Metrics: http://localhost:3000/metrics"
    echo "Prometheus: http://localhost:9090"
    echo "Grafana: http://localhost:3001 (admin/\$GRAFANA_PASSWORD)"
    echo ""
    echo "=== Useful Commands ==="
    echo "View logs: docker-compose -f $COMPOSE_FILE logs -f"
    echo "Service status: docker-compose -f $COMPOSE_FILE ps"
    echo "Stop services: docker-compose -f $COMPOSE_FILE down"
    echo "Restart service: docker-compose -f $COMPOSE_FILE restart pqc-attestor"
    echo ""
}

# Cleanup function
cleanup() {
    log_info "Cleaning up temporary files..."
    # Add any cleanup tasks here
}

# Main deployment function
main() {
    log_info "Starting PQC-Edge-Attestor deployment..."
    log_info "Environment: $ENVIRONMENT"
    log_info "Version: $VERSION"
    echo ""
    
    # Set up trap for cleanup
    trap cleanup EXIT
    
    # Run deployment steps
    check_prerequisites
    load_environment
    setup_deployment
    build_images
    deploy_services
    wait_for_services
    run_post_deployment_tests
    display_deployment_info
    
    log_success "Deployment completed successfully!"
}

# Handle script arguments
case "${1:-}" in
    "help"|"-h"|"--help")
        echo "PQC-Edge-Attestor Deployment Script"
        echo ""
        echo "Usage: $0 [environment] [version]"
        echo ""
        echo "Arguments:"
        echo "  environment  Deployment environment (default: production)"
        echo "  version      Docker image version (default: latest)"
        echo ""
        echo "Environment files:"
        echo "  .env.production  Production environment variables"
        echo ""
        echo "Examples:"
        echo "  $0                    # Deploy production with latest version"
        echo "  $0 staging v1.2.3     # Deploy staging with specific version"
        echo ""
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac