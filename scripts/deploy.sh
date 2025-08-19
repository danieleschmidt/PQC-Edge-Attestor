#!/bin/bash
# Production deployment script for PQC Edge Attestor
# TERRAGON SDLC v4.0 - Autonomous deployment automation

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEPLOYMENT_ENV="${1:-production}"
DOCKER_REGISTRY="${DOCKER_REGISTRY:-terragon}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

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
    log_info "Checking deployment prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed or not in PATH"
        exit 1
    fi
    
    # Check if Docker daemon is running
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Build Docker image
build_image() {
    log_info "Building production Docker image..."
    
    cd "$PROJECT_ROOT"
    
    # Build the image
    docker build -f Dockerfile.prod -t "${DOCKER_REGISTRY}/pqc-edge-attestor:${IMAGE_TAG}" .
    
    log_success "Docker image built successfully"
}

# Setup environment
setup_environment() {
    log_info "Setting up deployment environment..."
    
    cd "$PROJECT_ROOT"
    
    # Create directories
    mkdir -p logs data/certificates config backups
    
    # Create .env file if it doesn't exist
    if [[ ! -f .env ]]; then
        cat > .env << EOF
NODE_ENV=production
PRIMARY_REGION=us-east-1
DB_PASSWORD=securepqcpass123
REDIS_PASSWORD=secureredispass123
GRAFANA_PASSWORD=admin123
LOG_LEVEL=info
SECURITY_LEVEL=5
COMPLIANCE_MODE=strict
EOF
        log_info "Created .env file with default values"
    fi
    
    log_success "Environment setup completed"
}

# Deploy services
deploy_services() {
    log_info "Deploying services with Docker Compose..."
    
    cd "$PROJECT_ROOT"
    
    # Stop existing services
    docker-compose -f docker-compose.prod.yml down --remove-orphans || true
    
    # Deploy services
    docker-compose -f docker-compose.prod.yml up -d
    
    log_success "Services deployed successfully"
}

# Show deployment status
show_status() {
    log_info "Deployment Status:"
    echo "=================="
    
    cd "$PROJECT_ROOT"
    docker-compose -f docker-compose.prod.yml ps
    
    echo ""
    log_info "Service URLs:"
    echo "  - Main Application: https://localhost:8443"
    echo "  - Prometheus: http://localhost:9090"
    echo "  - Health Check: https://localhost:8443/health"
}

# Main deployment flow
main() {
    log_info "Starting PQC Edge Attestor production deployment..."
    
    check_prerequisites
    setup_environment
    build_image
    deploy_services
    show_status
    
    log_success "🚀 PQC Edge Attestor deployed successfully!"
}

# Handle script arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "status")
        show_status
        ;;
    "stop")
        cd "$PROJECT_ROOT"
        docker-compose -f docker-compose.prod.yml down
        log_success "Services stopped"
        ;;
    *)
        echo "Usage: $0 [deploy|status|stop]"
        exit 1
        ;;
esac