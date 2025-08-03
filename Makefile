# Makefile for PQC-Edge-Attestor
# Comprehensive build, test, and deployment automation

# =============================================================================
# Configuration
# =============================================================================

# Project metadata
PROJECT_NAME := pqc-edge-attestor
VERSION := $(shell cat package.json | grep '"version"' | cut -d'"' -f4)
BUILD_DATE := $(shell date -u +'%Y-%m-%dT%H:%M:%SZ')
VCS_REF := $(shell git rev-parse --short HEAD)

# Directories
SRC_DIR := src
BUILD_DIR := build
TEST_DIR := tests
DOCS_DIR := docs
COVERAGE_DIR := coverage
DIST_DIR := dist
LOGS_DIR := logs
CERTS_DIR := certs
DATA_DIR := data

# Build configurations
DEBUG_BUILD_DIR := $(BUILD_DIR)/debug
RELEASE_BUILD_DIR := $(BUILD_DIR)/release
TEST_BUILD_DIR := $(BUILD_DIR)/test

# Tools and commands
NODE := node
NPM := npm
CMAKE := cmake
MAKE_CMD := make
DOCKER := docker
DOCKER_COMPOSE := docker-compose
GIT := git
CURL := curl
WGET := wget

# Compiler settings
CC := gcc
CXX := g++
CFLAGS := -Wall -Wextra -std=c11
CXXFLAGS := -Wall -Wextra -std=c++17
LDFLAGS := -lm -lpthread

# Build flags
DEBUG_FLAGS := -g -O0 -DDEBUG=1 -fsanitize=address -fsanitize=undefined
RELEASE_FLAGS := -O3 -DNDEBUG -flto -march=native -fomit-frame-pointer
SECURITY_FLAGS := -fstack-protector-strong -D_FORTIFY_SOURCE=2 -fPIE

# Colors for output
RED := \033[0;31m
GREEN := \033[0;32m
YELLOW := \033[0;33m
BLUE := \033[0;34m
MAGENTA := \033[0;35m
CYAN := \033[0;36m
WHITE := \033[1;37m
RESET := \033[0m

# Default target
.DEFAULT_GOAL := help

# Make configuration
.PHONY: all help clean install build test lint format docs docker
.SILENT: help
SHELL := /bin/bash

# =============================================================================
# Help and Information
# =============================================================================

help: ## Show this help message
	@echo -e "$(WHITE)PQC-Edge-Attestor Build System$(RESET)"
	@echo -e "$(CYAN)Version: $(VERSION)$(RESET)"
	@echo -e "$(CYAN)Build Date: $(BUILD_DATE)$(RESET)"
	@echo -e "$(CYAN)VCS Ref: $(VCS_REF)$(RESET)"
	@echo ""
	@echo -e "$(WHITE)Available targets:$(RESET)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(CYAN)%-20s$(RESET) %s\n", $$1, $$2}'
	@echo ""
	@echo -e "$(WHITE)Build configurations:$(RESET)"
	@echo -e "  $(GREEN)debug$(RESET)    - Debug build with sanitizers"
	@echo -e "  $(GREEN)release$(RESET)  - Optimized production build"
	@echo -e "  $(GREEN)test$(RESET)     - Test build with coverage"
	@echo ""

info: ## Show project information
	@echo -e "$(WHITE)Project Information:$(RESET)"
	@echo -e "  Name:         $(PROJECT_NAME)"
	@echo -e "  Version:      $(VERSION)"
	@echo -e "  Build Date:   $(BUILD_DATE)"
	@echo -e "  VCS Ref:      $(VCS_REF)"
	@echo -e "  Node Version: $(shell $(NODE) --version)"
	@echo -e "  NPM Version:  $(shell $(NPM) --version)"
	@echo -e "  CMake:        $(shell $(CMAKE) --version | head -n1)"
	@echo -e "  GCC:          $(shell $(CC) --version | head -n1)"
	@echo -e "  Docker:       $(shell $(DOCKER) --version)"

# =============================================================================
# Setup and Installation
# =============================================================================

install: ## Install all dependencies
	@echo -e "$(BLUE)Installing dependencies...$(RESET)"
	$(NPM) ci
	@echo -e "$(GREEN)Dependencies installed successfully$(RESET)"

install-dev: ## Install development dependencies
	@echo -e "$(BLUE)Installing development dependencies...$(RESET)"
	$(NPM) ci --include=dev
	@echo -e "$(GREEN)Development dependencies installed$(RESET)"

setup: install dirs ## Complete project setup
	@echo -e "$(BLUE)Setting up project environment...$(RESET)"
	@if [ ! -f .env ]; then cp .env.example .env; fi
	@echo -e "$(GREEN)Project setup complete$(RESET)"

dirs: ## Create necessary directories
	@mkdir -p $(BUILD_DIR) $(LOGS_DIR) $(COVERAGE_DIR) $(DIST_DIR) $(DATA_DIR)
	@mkdir -p $(DEBUG_BUILD_DIR) $(RELEASE_BUILD_DIR) $(TEST_BUILD_DIR)
	@mkdir -p $(CERTS_DIR) $(DATA_DIR)/{postgres,redis,prometheus,grafana}

# =============================================================================
# Code Quality and Formatting
# =============================================================================

lint: ## Run linting checks
	@echo -e "$(BLUE)Running linting checks...$(RESET)"
	$(NPM) run lint
	@echo -e "$(GREEN)Linting completed$(RESET)"

lint-fix: ## Fix linting issues automatically
	@echo -e "$(BLUE)Fixing linting issues...$(RESET)"
	$(NPM) run lint:fix
	@echo -e "$(GREEN)Linting fixes applied$(RESET)"

format: ## Format code
	@echo -e "$(BLUE)Formatting code...$(RESET)"
	$(NPM) run format
	clang-format -i src/**/*.{c,h,cpp,hpp} || true
	@echo -e "$(GREEN)Code formatting completed$(RESET)"

format-check: ## Check code formatting
	@echo -e "$(BLUE)Checking code formatting...$(RESET)"
	$(NPM) run format:check
	@echo -e "$(GREEN)Format check completed$(RESET)"

type-check: ## Run TypeScript type checking
	@echo -e "$(BLUE)Running type checks...$(RESET)"
	$(NPM) run type-check
	@echo -e "$(GREEN)Type checking completed$(RESET)"

# =============================================================================
# Building
# =============================================================================

all: clean build test ## Build everything

build: build-native build-app ## Build all components

build-native: dirs ## Build native cryptographic libraries
	@echo -e "$(BLUE)Building native libraries...$(RESET)"
	cd $(RELEASE_BUILD_DIR) && \
		$(CMAKE) ../.. \
			-DCMAKE_BUILD_TYPE=Release \
			-DCMAKE_C_COMPILER=$(CC) \
			-DCMAKE_CXX_COMPILER=$(CXX) \
			-DCMAKE_C_FLAGS="$(CFLAGS) $(RELEASE_FLAGS) $(SECURITY_FLAGS)" \
			-DCMAKE_CXX_FLAGS="$(CXXFLAGS) $(RELEASE_FLAGS) $(SECURITY_FLAGS)" \
			-DENABLE_OPTIMIZATIONS=ON \
			-DENABLE_SECURITY_FEATURES=ON \
			-DBUILD_SHARED_LIBS=ON && \
		$(MAKE_CMD) -j$(shell nproc)
	@echo -e "$(GREEN)Native libraries built successfully$(RESET)"

build-app: ## Build Node.js application
	@echo -e "$(BLUE)Building application...$(RESET)"
	$(NPM) run build
	@echo -e "$(GREEN)Application built successfully$(RESET)"

build-debug: dirs ## Build debug version with sanitizers
	@echo -e "$(BLUE)Building debug version...$(RESET)"
	cd $(DEBUG_BUILD_DIR) && \
		$(CMAKE) ../.. \
			-DCMAKE_BUILD_TYPE=Debug \
			-DCMAKE_C_COMPILER=$(CC) \
			-DCMAKE_CXX_COMPILER=$(CXX) \
			-DCMAKE_C_FLAGS="$(CFLAGS) $(DEBUG_FLAGS)" \
			-DCMAKE_CXX_FLAGS="$(CXXFLAGS) $(DEBUG_FLAGS)" \
			-DENABLE_DEBUG=ON \
			-DENABLE_SANITIZERS=ON && \
		$(MAKE_CMD) -j$(shell nproc)
	@echo -e "$(GREEN)Debug build completed$(RESET)"

build-release: build-native ## Build optimized release version
	@echo -e "$(GREEN)Release build completed$(RESET)"

build-test: dirs ## Build test version with coverage
	@echo -e "$(BLUE)Building test version...$(RESET)"
	cd $(TEST_BUILD_DIR) && \
		$(CMAKE) ../.. \
			-DCMAKE_BUILD_TYPE=Debug \
			-DCMAKE_C_FLAGS="$(CFLAGS) -g -O0 --coverage" \
			-DCMAKE_CXX_FLAGS="$(CXXFLAGS) -g -O0 --coverage" \
			-DENABLE_COVERAGE=ON \
			-DENABLE_TESTING=ON && \
		$(MAKE_CMD) -j$(shell nproc)
	@echo -e "$(GREEN)Test build completed$(RESET)"

# =============================================================================
# Testing
# =============================================================================

test: test-unit test-integration ## Run all tests

test-unit: ## Run unit tests
	@echo -e "$(BLUE)Running unit tests...$(RESET)"
	$(NPM) run test:unit
	@echo -e "$(GREEN)Unit tests completed$(RESET)"

test-integration: ## Run integration tests
	@echo -e "$(BLUE)Running integration tests...$(RESET)"
	$(NPM) run test:integration
	@echo -e "$(GREEN)Integration tests completed$(RESET)"

test-e2e: ## Run end-to-end tests
	@echo -e "$(BLUE)Running end-to-end tests...$(RESET)"
	$(NPM) run test:e2e
	@echo -e "$(GREEN)End-to-end tests completed$(RESET)"

test-coverage: build-test ## Run tests with coverage
	@echo -e "$(BLUE)Running tests with coverage...$(RESET)"
	$(NPM) run test:coverage
	cd $(TEST_BUILD_DIR) && ctest --verbose
	gcov $(TEST_BUILD_DIR)/src/**/*.c || true
	lcov --capture --directory $(TEST_BUILD_DIR) --output-file $(COVERAGE_DIR)/coverage.info || true
	genhtml $(COVERAGE_DIR)/coverage.info --output-directory $(COVERAGE_DIR)/html || true
	@echo -e "$(GREEN)Coverage report generated$(RESET)"

test-security: ## Run security tests
	@echo -e "$(BLUE)Running security tests...$(RESET)"
	$(NPM) run security:audit
	$(NPM) run security:scan
	@echo -e "$(GREEN)Security tests completed$(RESET)"

test-performance: ## Run performance tests
	@echo -e "$(BLUE)Running performance tests...$(RESET)"
	$(NPM) run test:performance
	@echo -e "$(GREEN)Performance tests completed$(RESET)"

test-hardware: ## Run hardware-in-loop tests
	@echo -e "$(BLUE)Running hardware tests...$(RESET)"
	$(NPM) run test:hardware
	@echo -e "$(GREEN)Hardware tests completed$(RESET)"

benchmark: build-release ## Run performance benchmarks
	@echo -e "$(BLUE)Running benchmarks...$(RESET)"
	$(NPM) run benchmark
	cd $(RELEASE_BUILD_DIR) && ./benchmark_runner
	@echo -e "$(GREEN)Benchmarks completed$(RESET)"

# =============================================================================
# Documentation
# =============================================================================

docs: ## Generate documentation
	@echo -e "$(BLUE)Generating documentation...$(RESET)"
	$(NPM) run docs
	doxygen Doxyfile || true
	@echo -e "$(GREEN)Documentation generated$(RESET)"

docs-serve: docs ## Serve documentation locally
	@echo -e "$(BLUE)Serving documentation...$(RESET)"
	$(NPM) run docs:serve &
	python3 -m http.server 8000 -d docs/_build/html &
	@echo -e "$(GREEN)Documentation available at http://localhost:8000$(RESET)"

# =============================================================================
# Docker Operations
# =============================================================================

docker-build: ## Build Docker image
	@echo -e "$(BLUE)Building Docker image...$(RESET)"
	$(DOCKER) build -t $(PROJECT_NAME):$(VERSION) -t $(PROJECT_NAME):latest .
	@echo -e "$(GREEN)Docker image built$(RESET)"

docker-build-dev: ## Build development Docker image
	@echo -e "$(BLUE)Building development Docker image...$(RESET)"
	$(DOCKER) build --target development -t $(PROJECT_NAME):dev .
	@echo -e "$(GREEN)Development Docker image built$(RESET)"

docker-test: ## Run tests in Docker
	@echo -e "$(BLUE)Running tests in Docker...$(RESET)"
	$(DOCKER) build --target testing -t $(PROJECT_NAME):test .
	$(DOCKER) run --rm $(PROJECT_NAME):test
	@echo -e "$(GREEN)Docker tests completed$(RESET)"

docker-security-scan: ## Run security scan on Docker image
	@echo -e "$(BLUE)Running security scan...$(RESET)"
	$(DOCKER) build --target security-scan -t $(PROJECT_NAME):security-scan .
	@echo -e "$(GREEN)Security scan completed$(RESET)"

docker-compose-up: ## Start all services with Docker Compose
	@echo -e "$(BLUE)Starting services...$(RESET)"
	$(DOCKER_COMPOSE) up -d
	@echo -e "$(GREEN)Services started$(RESET)"

docker-compose-down: ## Stop all services
	@echo -e "$(BLUE)Stopping services...$(RESET)"
	$(DOCKER_COMPOSE) down
	@echo -e "$(GREEN)Services stopped$(RESET)"

docker-compose-logs: ## Show Docker Compose logs
	$(DOCKER_COMPOSE) logs -f

# =============================================================================
# Development
# =============================================================================

dev: ## Start development server
	@echo -e "$(BLUE)Starting development server...$(RESET)"
	$(NPM) run dev

dev-docker: ## Start development environment with Docker
	@echo -e "$(BLUE)Starting development environment...$(RESET)"
	$(DOCKER_COMPOSE) --profile tools up -d
	@echo -e "$(GREEN)Development environment started$(RESET)"
	@echo -e "$(CYAN)API:       http://localhost:3000$(RESET)"
	@echo -e "$(CYAN)PgAdmin:   http://localhost:5050$(RESET)"
	@echo -e "$(CYAN)Redis UI:  http://localhost:8081$(RESET)"
	@echo -e "$(CYAN)Grafana:   http://localhost:3001$(RESET)"

dev-stop: ## Stop development environment
	$(DOCKER_COMPOSE) --profile tools down

watch: ## Watch for file changes and rebuild
	@echo -e "$(BLUE)Watching for changes...$(RESET)"
	$(NPM) run watch

monitor: ## Monitor application performance
	@echo -e "$(BLUE)Starting performance monitoring...$(RESET)"
	clinic doctor -- $(NODE) src/index.js

# =============================================================================
# Database Operations
# =============================================================================

db-migrate: ## Run database migrations
	@echo -e "$(BLUE)Running database migrations...$(RESET)"
	$(NPM) run db:migrate
	@echo -e "$(GREEN)Migrations completed$(RESET)"

db-seed: ## Seed database with test data
	@echo -e "$(BLUE)Seeding database...$(RESET)"
	$(NPM) run db:seed
	@echo -e "$(GREEN)Database seeded$(RESET)"

db-reset: ## Reset database
	@echo -e "$(YELLOW)Resetting database...$(RESET)"
	$(NPM) run db:reset
	@echo -e "$(GREEN)Database reset$(RESET)"

db-backup: ## Backup database
	@echo -e "$(BLUE)Backing up database...$(RESET)"
	mkdir -p $(DATA_DIR)/backups
	pg_dump -h localhost -U postgres pqc_attestor_dev > $(DATA_DIR)/backups/backup_$(shell date +%Y%m%d_%H%M%S).sql
	@echo -e "$(GREEN)Database backup completed$(RESET)"

# =============================================================================
# Hardware Operations
# =============================================================================

hardware-flash: build-release ## Flash firmware to hardware
	@echo -e "$(BLUE)Flashing firmware...$(RESET)"
	openocd -f interface/stlink.cfg -f target/stm32l5x.cfg -c "program $(RELEASE_BUILD_DIR)/firmware.elf verify reset exit"
	@echo -e "$(GREEN)Firmware flashed$(RESET)"

hardware-debug: build-debug ## Start hardware debugging session
	@echo -e "$(BLUE)Starting debug session...$(RESET)"
	openocd -f interface/stlink.cfg -f target/stm32l5x.cfg &
	gdb-multiarch $(DEBUG_BUILD_DIR)/firmware.elf

hardware-monitor: ## Monitor hardware serial output
	@echo -e "$(BLUE)Monitoring hardware...$(RESET)"
	screen /dev/ttyUSB0 115200

tpm-start: ## Start TPM simulator
	@echo -e "$(BLUE)Starting TPM simulator...$(RESET)"
	$(NPM) run tpm:start

tpm-reset: ## Reset TPM simulator
	@echo -e "$(BLUE)Resetting TPM simulator...$(RESET)"
	$(NPM) run tpm:reset

# =============================================================================
# Deployment
# =============================================================================

package: build test ## Create deployment package
	@echo -e "$(BLUE)Creating deployment package...$(RESET)"
	mkdir -p $(DIST_DIR)
	tar -czf $(DIST_DIR)/$(PROJECT_NAME)-$(VERSION).tar.gz \
		--exclude=node_modules --exclude=.git --exclude=build/debug \
		--exclude=build/test --exclude=coverage --exclude=logs .
	@echo -e "$(GREEN)Package created: $(DIST_DIR)/$(PROJECT_NAME)-$(VERSION).tar.gz$(RESET)"

deploy-staging: package ## Deploy to staging environment
	@echo -e "$(BLUE)Deploying to staging...$(RESET)"
	# Add staging deployment commands here
	@echo -e "$(GREEN)Deployed to staging$(RESET)"

deploy-prod: package ## Deploy to production environment
	@echo -e "$(YELLOW)Deploying to production...$(RESET)"
	# Add production deployment commands here
	@echo -e "$(GREEN)Deployed to production$(RESET)"

# =============================================================================
# Cleanup
# =============================================================================

clean: ## Clean build artifacts
	@echo -e "$(BLUE)Cleaning build artifacts...$(RESET)"
	rm -rf $(BUILD_DIR) $(COVERAGE_DIR) $(DIST_DIR)
	$(NPM) run clean || true
	@echo -e "$(GREEN)Clean completed$(RESET)"

clean-all: clean ## Clean everything including dependencies
	@echo -e "$(BLUE)Cleaning everything...$(RESET)"
	rm -rf node_modules
	$(DOCKER) system prune -f || true
	@echo -e "$(GREEN)Deep clean completed$(RESET)"

clean-logs: ## Clean log files
	@echo -e "$(BLUE)Cleaning logs...$(RESET)"
	rm -rf $(LOGS_DIR)/*
	@echo -e "$(GREEN)Logs cleaned$(RESET)"

clean-data: ## Clean development data
	@echo -e "$(YELLOW)Cleaning development data...$(RESET)"
	rm -rf $(DATA_DIR)/*
	@echo -e "$(GREEN)Data cleaned$(RESET)"

# =============================================================================
# Maintenance
# =============================================================================

update: ## Update dependencies
	@echo -e "$(BLUE)Updating dependencies...$(RESET)"
	$(NPM) update
	npm-check-updates -u
	$(NPM) install
	@echo -e "$(GREEN)Dependencies updated$(RESET)"

audit: ## Run security audit
	@echo -e "$(BLUE)Running security audit...$(RESET)"
	$(NPM) audit
	@echo -e "$(GREEN)Security audit completed$(RESET)"

audit-fix: ## Fix security vulnerabilities
	@echo -e "$(BLUE)Fixing security vulnerabilities...$(RESET)"
	$(NPM) audit fix
	@echo -e "$(GREEN)Vulnerabilities fixed$(RESET)"

check: lint test-coverage audit ## Run all quality checks

validate: format-check type-check lint test ## Validate code quality

precommit: format lint test-unit ## Pre-commit checks

release: clean build test package ## Prepare release
	@echo -e "$(GREEN)Release $(VERSION) ready$(RESET)"

# =============================================================================
# CI/CD
# =============================================================================

ci: install validate test-coverage audit ## CI pipeline
	@echo -e "$(GREEN)CI pipeline completed$(RESET)"

cd-staging: ci deploy-staging ## CD pipeline for staging

cd-prod: ci deploy-prod ## CD pipeline for production

# =============================================================================
# Version Information
# =============================================================================

version: ## Show version information
	@echo -e "$(WHITE)Version Information:$(RESET)"
	@echo -e "  Version:    $(VERSION)"
	@echo -e "  Build Date: $(BUILD_DATE)"
	@echo -e "  VCS Ref:    $(VCS_REF)"

# Make sure intermediate files are not deleted
.PRECIOUS: $(BUILD_DIR)/%
.SECONDARY:
