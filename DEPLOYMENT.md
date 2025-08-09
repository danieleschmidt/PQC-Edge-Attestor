# PQC-Edge-Attestor Deployment Guide

## Overview

This guide provides comprehensive instructions for deploying the PQC-Edge-Attestor system in production environments, supporting smart meters, EV chargers, and other critical IoT infrastructure.

## 🏗️ Architecture Overview

### System Components

1. **API Server**: Node.js/Express backend with PQC capabilities
2. **Research Framework**: Academic benchmarking and optimization
3. **Security Engine**: Quantum attack simulation and vulnerability assessment
4. **C Library**: Hardware attestation and cryptographic operations
5. **Optimization Engine**: Quantum-accelerated performance optimization

### Deployment Topology

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Load Balancer │────│ API Gateway      │────│ Edge Devices    │
│   (HAProxy/     │    │ (Kong/Envoy)     │    │ (Smart Meters/  │
│    Cloudflare)  │    │                  │    │  EV Chargers)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ PQC-Attestor    │────│ Database Cluster │────│ Monitoring      │
│ API Servers     │    │ (PostgreSQL +    │    │ (Prometheus +   │
│ (Multi-region)  │    │  Redis Cache)    │    │  Grafana)       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Research Labs   │────│ HSM/Key Vault    │────│ Alert Manager   │
│ (Academic       │    │ (Quantum-Safe    │    │ (PagerDuty/     │
│  Publication)   │    │  Key Storage)    │    │  Slack)         │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 📋 Prerequisites

### Hardware Requirements

#### Minimum (Development/Testing)
- **CPU**: 4 cores, 2.4GHz
- **RAM**: 8GB
- **Storage**: 50GB SSD
- **Network**: 1Gbps

#### Production (Single Instance)
- **CPU**: 8 cores, 3.2GHz
- **RAM**: 32GB
- **Storage**: 500GB NVMe SSD
- **Network**: 10Gbps
- **TPM**: 2.0 module (for hardware attestation)

#### Production (High Availability)
- **Load Balancer**: 2x instances (active/passive)
- **API Servers**: 3+ instances (load distributed)
- **Database**: PostgreSQL cluster (primary + 2 replicas)
- **Cache**: Redis cluster (3 nodes)
- **Monitoring**: Dedicated monitoring stack

### Software Prerequisites

```bash
# Core Dependencies
Node.js >= 18.0.0
npm >= 9.0.0
PostgreSQL >= 14.0
Redis >= 7.0
Docker >= 24.0
Docker Compose >= 2.0

# Build Tools (for C components)
GCC >= 9.0
CMake >= 3.25
Make >= 4.0

# Security Tools
OpenSSL >= 3.0
TPM2-Tools >= 5.0

# Monitoring (Optional)
Prometheus >= 2.40
Grafana >= 9.0
```

## 🔧 Installation

### 1. Clone and Setup

```bash
# Clone the repository
git clone https://github.com/terragonlabs/PQC-Edge-Attestor.git
cd PQC-Edge-Attestor

# Install Node.js dependencies
npm install

# Install system dependencies (Ubuntu/Debian)
sudo apt-get update
sudo apt-get install -y build-essential cmake \
    libssl-dev libtpm2-dev postgresql-client \
    redis-tools python3-pip

# Install Python tools (for research framework)
pip3 install numpy scipy matplotlib pandas jupyter
```

### 2. Environment Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit configuration
nano .env
```

#### Environment Variables

```bash
# Application
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=pqc_attestor
DB_USER=pqc_user
DB_PASSWORD=<secure_password>
DB_SSL=true
DB_POOL_SIZE=20

# Redis Cache
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=<redis_password>
REDIS_DB=0

# Security
JWT_SECRET=<generate_secure_jwt_secret>
API_KEY_SECRET=<generate_api_key_secret>
ENCRYPTION_KEY=<generate_32_char_encryption_key>

# CORS
CORS_ORIGINS=https://your-frontend.com,https://admin.yourcompany.com

# TPM/Hardware
TPM_DEVICE=/dev/tpm0
TPM_USE_SIMULATOR=false
HARDWARE_ACCELERATION=true

# Monitoring
PROMETHEUS_ENABLED=true
METRICS_PORT=9090
HEALTH_CHECK_PORT=8080

# Research
ENABLE_RESEARCH_ENDPOINTS=true
RESEARCH_DATA_PATH=/opt/pqc-attestor/research
BENCHMARK_ITERATIONS=1000

# Notifications
SLACK_WEBHOOK_URL=<slack_webhook>
SMTP_HOST=<smtp_server>
SMTP_PORT=587
SMTP_USER=<smtp_user>
SMTP_PASS=<smtp_password>

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000

# SSL/TLS
SSL_CERT_PATH=/etc/ssl/certs/pqc-attestor.crt
SSL_KEY_PATH=/etc/ssl/private/pqc-attestor.key
```

### 3. Database Setup

```bash
# Create database user and database
sudo -u postgres psql << EOF
CREATE USER pqc_user WITH PASSWORD '<secure_password>';
CREATE DATABASE pqc_attestor OWNER pqc_user;
GRANT ALL PRIVILEGES ON DATABASE pqc_attestor TO pqc_user;
\q
EOF

# Run migrations (if applicable)
npm run db:migrate

# Seed initial data (if applicable)
npm run db:seed
```

### 4. Build Application

```bash
# Build C components
make build-release

# Run tests
npm test

# Build Docker image (optional)
docker build -t pqc-edge-attestor:latest .
```

## 🚀 Deployment Methods

### Method 1: Direct Deployment

```bash
# Install PM2 for process management
npm install -g pm2

# Start application
pm2 start ecosystem.config.js --env production

# Configure PM2 startup
pm2 startup
pm2 save

# Monitor
pm2 monit
```

#### PM2 Configuration (ecosystem.config.js)

```javascript
module.exports = {
  apps: [{
    name: 'pqc-edge-attestor',
    script: 'src/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    log_file: '/var/log/pqc-attestor/combined.log',
    out_file: '/var/log/pqc-attestor/out.log',
    error_file: '/var/log/pqc-attestor/error.log',
    time: true,
    max_memory_restart: '2G',
    node_args: '--max-old-space-size=4096'
  }]
};
```

### Method 2: Docker Deployment

```yaml
# docker-compose.yml
version: '3.8'

services:
  pqc-attestor:
    build: .
    ports:
      - "3000:3000"
      - "9090:9090"
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
      - REDIS_HOST=redis
    depends_on:
      - postgres
      - redis
    volumes:
      - ./logs:/app/logs
      - ./data:/app/data
      - /dev/tpm0:/dev/tpm0
    privileged: true  # For TPM access
    restart: unless-stopped
    
  postgres:
    image: postgres:15
    environment:
      - POSTGRES_DB=pqc_attestor
      - POSTGRES_USER=pqc_user
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped
    
  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    restart: unless-stopped
    
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/ssl
    depends_on:
      - pqc-attestor
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

```bash
# Deploy with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f pqc-attestor

# Scale API servers
docker-compose up -d --scale pqc-attestor=3
```

### Method 3: Kubernetes Deployment

```yaml
# k8s-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pqc-edge-attestor
  labels:
    app: pqc-edge-attestor
spec:
  replicas: 3
  selector:
    matchLabels:
      app: pqc-edge-attestor
  template:
    metadata:
      labels:
        app: pqc-edge-attestor
    spec:
      containers:
      - name: pqc-attestor
        image: terragonlabs/pqc-edge-attestor:latest
        ports:
        - containerPort: 3000
        - containerPort: 9090
        env:
        - name: NODE_ENV
          value: "production"
        - name: DB_HOST
          valueFrom:
            secretKeyRef:
              name: pqc-secrets
              key: db-host
        resources:
          limits:
            memory: "4Gi"
            cpu: "2000m"
          requests:
            memory: "2Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3000
          initialDelaySeconds: 15
          periodSeconds: 5
        securityContext:
          privileged: false
          runAsNonRoot: true
          runAsUser: 1000
---
apiVersion: v1
kind: Service
metadata:
  name: pqc-edge-attestor-service
spec:
  selector:
    app: pqc-edge-attestor
  ports:
  - name: http
    port: 80
    targetPort: 3000
  - name: metrics
    port: 9090
    targetPort: 9090
  type: LoadBalancer
```

```bash
# Deploy to Kubernetes
kubectl apply -f k8s-deployment.yaml

# Create secrets
kubectl create secret generic pqc-secrets \
  --from-literal=db-host=postgres.example.com \
  --from-literal=db-password=<secure_password> \
  --from-literal=jwt-secret=<jwt_secret>

# Monitor deployment
kubectl get pods -l app=pqc-edge-attestor
kubectl logs -l app=pqc-edge-attestor -f
```

## 🔧 Configuration

### Load Balancer Configuration (HAProxy)

```
# /etc/haproxy/haproxy.cfg
global
    daemon
    log 127.0.0.1:514 local0
    chroot /var/lib/haproxy
    stats socket /run/haproxy/admin.sock mode 660
    stats timeout 30s
    user haproxy
    group haproxy

defaults
    mode http
    log global
    option httplog
    option dontlognull
    option log-health-checks
    timeout connect 5000
    timeout client 50000
    timeout server 50000
    errorfile 400 /etc/haproxy/errors/400.http
    errorfile 403 /etc/haproxy/errors/403.http
    errorfile 408 /etc/haproxy/errors/408.http
    errorfile 500 /etc/haproxy/errors/500.http
    errorfile 502 /etc/haproxy/errors/502.http
    errorfile 503 /etc/haproxy/errors/503.http
    errorfile 504 /etc/haproxy/errors/504.http

frontend pqc_frontend
    bind *:80
    bind *:443 ssl crt /etc/ssl/private/pqc-attestor.pem
    redirect scheme https if !{ ssl_fc }
    
    # Security headers
    http-response set-header X-Frame-Options DENY
    http-response set-header X-Content-Type-Options nosniff
    http-response set-header X-XSS-Protection "1; mode=block"
    http-response set-header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    
    # API routing
    acl is_api path_beg /api/
    acl is_health path_beg /health
    acl is_metrics path_beg /metrics
    
    use_backend pqc_api if is_api
    use_backend pqc_health if is_health
    use_backend pqc_metrics if is_metrics
    default_backend pqc_api

backend pqc_api
    balance roundrobin
    option httpchk GET /health
    http-check expect status 200
    
    server api1 10.0.1.10:3000 check
    server api2 10.0.1.11:3000 check
    server api3 10.0.1.12:3000 check

backend pqc_health
    balance roundrobin
    server health1 10.0.1.10:3000 check
    server health2 10.0.1.11:3000 check
    server health3 10.0.1.12:3000 check

backend pqc_metrics
    balance roundrobin
    server metrics1 10.0.1.10:9090 check
    server metrics2 10.0.1.11:9090 check
    server metrics3 10.0.1.12:9090 check

listen stats
    bind *:8404
    stats enable
    stats uri /stats
    stats refresh 30s
    stats admin if TRUE
```

### Nginx Configuration

```nginx
# /etc/nginx/sites-available/pqc-edge-attestor
upstream pqc_backend {
    least_conn;
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
}

server {
    listen 80;
    server_name pqc.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name pqc.yourdomain.com;

    # SSL configuration
    ssl_certificate /etc/ssl/certs/pqc-attestor.crt;
    ssl_certificate_key /etc/ssl/private/pqc-attestor.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" always;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req zone=api burst=20 nodelay;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    location / {
        proxy_pass http://pqc_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location /metrics {
        proxy_pass http://pqc_backend;
        allow 10.0.0.0/8;
        allow 172.16.0.0/12;
        allow 192.168.0.0/16;
        deny all;
    }

    location /health {
        access_log off;
        proxy_pass http://pqc_backend;
    }
}
```

## 📊 Monitoring and Observability

### Prometheus Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "pqc_rules.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093

scrape_configs:
  - job_name: 'pqc-edge-attestor'
    static_configs:
      - targets: ['localhost:9090']
    metrics_path: '/metrics'
    scrape_interval: 10s

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['localhost:9100']

  - job_name: 'postgres-exporter'
    static_configs:
      - targets: ['localhost:9187']

  - job_name: 'redis-exporter'
    static_configs:
      - targets: ['localhost:9121']
```

### Alert Rules

```yaml
# pqc_rules.yml
groups:
- name: pqc-edge-attestor
  rules:
  - alert: PQCHighLatency
    expr: pqc_http_request_duration_seconds{quantile="0.95"} > 1.0
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: High latency detected in PQC Edge Attestor

  - alert: PQCHighErrorRate
    expr: rate(pqc_http_requests_total{status=~"5.."}[5m]) > 0.1
    for: 2m
    labels:
      severity: critical
    annotations:
      summary: High error rate detected

  - alert: PQCMemoryUsageHigh
    expr: process_resident_memory_bytes / 1024 / 1024 > 2048
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: Memory usage is high (>2GB)

  - alert: PQCAttestationFailures
    expr: rate(pqc_attestation_failures_total[5m]) > 0.05
    for: 1m
    labels:
      severity: critical
    annotations:
      summary: High attestation failure rate detected
```

### Grafana Dashboards

Create comprehensive dashboards for:

1. **API Performance**: Request latency, throughput, error rates
2. **Cryptographic Operations**: Key generation, signing, verification times
3. **Research Metrics**: Benchmarking results, optimization improvements
4. **Security Monitoring**: Attack simulation results, vulnerability assessments
5. **System Resources**: CPU, memory, disk, network utilization
6. **Business Metrics**: Device registrations, attestation success rates

## 🔐 Security Configuration

### SSL/TLS Setup

```bash
# Generate private key and CSR
openssl req -new -newkey rsa:4096 -nodes -keyout pqc-attestor.key -out pqc-attestor.csr

# Or use ECC (recommended for post-quantum readiness)
openssl ecparam -genkey -name secp384r1 -out pqc-attestor-ec.key
openssl req -new -key pqc-attestor-ec.key -out pqc-attestor-ec.csr

# Get certificate from CA and install
sudo cp pqc-attestor.crt /etc/ssl/certs/
sudo cp pqc-attestor.key /etc/ssl/private/
sudo chmod 600 /etc/ssl/private/pqc-attestor.key
```

### Firewall Configuration

```bash
# UFW (Ubuntu)
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 3000/tcp  # API (internal)
sudo ufw allow from 10.0.0.0/8 to any port 9090  # Metrics (internal)
sudo ufw enable

# Or iptables
iptables -A INPUT -p tcp --dport 22 -j ACCEPT
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -j ACCEPT
iptables -A INPUT -p tcp --dport 3000 -s 10.0.0.0/8 -j ACCEPT
iptables -A INPUT -p tcp --dport 9090 -s 10.0.0.0/8 -j ACCEPT
iptables -A INPUT -j DROP
```

## 🧪 Testing

### Health Checks

```bash
# Basic health check
curl -f http://localhost:3000/health

# Detailed health check
curl -s http://localhost:3000/health | jq .

# Readiness check
curl -f http://localhost:3000/health/ready

# Metrics endpoint
curl -s http://localhost:9090/metrics | grep pqc_
```

### Load Testing

```bash
# Install artillery
npm install -g artillery

# Create load test configuration
cat > loadtest.yml << EOF
config:
  target: 'https://pqc.yourdomain.com'
  phases:
    - duration: 60
      arrivalRate: 10
    - duration: 120
      arrivalRate: 50
    - duration: 60
      arrivalRate: 100

scenarios:
  - name: "API Load Test"
    weight: 70
    flow:
      - get:
          url: "/health"
      - get:
          url: "/api/v1/status"

  - name: "PQC Operations"
    weight: 30
    flow:
      - post:
          url: "/api/v1/pqc/keygen"
          json:
            algorithm: "kyber"
            keysize: 1024
EOF

# Run load test
artillery run loadtest.yml
```

### Security Testing

```bash
# SSL/TLS testing
nmap --script ssl-enum-ciphers -p 443 pqc.yourdomain.com

# Vulnerability scanning
nikto -h https://pqc.yourdomain.com

# OWASP ZAP scanning (if available)
zap-baseline.py -t https://pqc.yourdomain.com
```

## 📝 Maintenance

### Backup Strategy

```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/backups/pqc-attestor"

# Create backup directory
mkdir -p $BACKUP_DIR

# Database backup
pg_dump -h localhost -U pqc_user pqc_attestor | gzip > $BACKUP_DIR/database_$DATE.sql.gz

# Application data backup
tar -czf $BACKUP_DIR/app_data_$DATE.tar.gz /opt/pqc-attestor/data /opt/pqc-attestor/logs

# Configuration backup
tar -czf $BACKUP_DIR/config_$DATE.tar.gz /opt/pqc-attestor/.env /etc/nginx/sites-available/pqc-edge-attestor

# Cleanup old backups (keep 30 days)
find $BACKUP_DIR -name "*.gz" -mtime +30 -delete

echo "Backup completed: $DATE"
```

### Log Rotation

```bash
# /etc/logrotate.d/pqc-edge-attestor
/opt/pqc-attestor/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 644 pqc pqc
    postrotate
        pm2 reload pqc-edge-attestor
    endscript
}
```

### Update Procedure

```bash
#!/bin/bash
# update.sh

echo "Starting PQC-Edge-Attestor update..."

# Backup current version
./backup.sh

# Stop application
pm2 stop pqc-edge-attestor

# Pull updates
git pull origin main

# Install dependencies
npm install

# Run migrations
npm run db:migrate

# Build application
make build-release

# Run tests
npm test

# Start application
pm2 start pqc-edge-attestor

# Verify deployment
sleep 30
curl -f http://localhost:3000/health

echo "Update completed successfully"
```

## 🚨 Troubleshooting

### Common Issues

1. **High Memory Usage**
   ```bash
   # Monitor memory usage
   pm2 monit
   
   # Restart if needed
   pm2 restart pqc-edge-attestor
   
   # Check for memory leaks
   node --inspect src/index.js
   ```

2. **Database Connection Issues**
   ```bash
   # Check PostgreSQL status
   sudo systemctl status postgresql
   
   # Test connection
   psql -h localhost -U pqc_user -d pqc_attestor
   
   # Check connection pool
   curl -s http://localhost:3000/health | jq '.database'
   ```

3. **TPM/Hardware Issues**
   ```bash
   # Check TPM status
   tpm2_getrandom 16
   
   # Verify device access
   ls -la /dev/tpm*
   
   # Test attestation
   curl -X POST http://localhost:3000/api/v1/attestation/test
   ```

### Performance Tuning

1. **Node.js Optimization**
   ```bash
   # Increase heap size
   export NODE_OPTIONS="--max-old-space-size=8192"
   
   # Enable V8 optimizations
   export NODE_OPTIONS="$NODE_OPTIONS --optimize-for-size"
   ```

2. **Database Optimization**
   ```sql
   -- Optimize PostgreSQL settings
   ALTER SYSTEM SET shared_buffers = '512MB';
   ALTER SYSTEM SET effective_cache_size = '2GB';
   ALTER SYSTEM SET maintenance_work_mem = '128MB';
   SELECT pg_reload_conf();
   ```

3. **Redis Optimization**
   ```bash
   # Redis configuration
   echo "maxmemory 1gb" >> /etc/redis/redis.conf
   echo "maxmemory-policy allkeys-lru" >> /etc/redis/redis.conf
   sudo systemctl restart redis
   ```

## 📞 Support

For deployment support and technical assistance:

- **Documentation**: https://docs.terragonlabs.com/pqc-edge-attestor
- **GitHub Issues**: https://github.com/terragonlabs/PQC-Edge-Attestor/issues
- **Technical Support**: support@terragonlabs.com
- **Security Issues**: security@terragonlabs.com (PGP: 0xDEADBEEF)

## 📄 License

This deployment guide is part of the PQC-Edge-Attestor project, licensed under Apache License 2.0.

---

*This deployment guide was generated by Terragon Labs Autonomous SDLC v4.0*