# 🚀 PQC-Edge-Attestor Production Deployment Guide

## Overview

This guide provides comprehensive instructions for deploying PQC-Edge-Attestor in production environments with enterprise-grade security, scalability, and compliance features.

## 📋 Prerequisites

### System Requirements

**Minimum Production Environment:**
- CPU: 8 cores (x86_64 or ARM64)
- Memory: 16GB RAM
- Storage: 100GB SSD
- Network: 1Gbps connection
- OS: Ubuntu 22.04 LTS, CentOS 8+, or RHEL 8+

**Recommended Production Environment:**
- CPU: 16+ cores with AES-NI support
- Memory: 32GB+ RAM
- Storage: 500GB+ NVMe SSD
- Network: 10Gbps connection
- GPU: NVIDIA GPU for quantum acceleration (optional)

### Software Dependencies

```bash
# Core dependencies
- Node.js 18.x LTS
- Docker 24.x+
- Docker Compose v2.x
- Kubernetes 1.28+ (for orchestration)
- PostgreSQL 15+ or MongoDB 6.0+
- Redis 7.0+ (for caching)
- NGINX 1.24+ (load balancer/proxy)

# Security dependencies
- OpenSSL 3.0+
- Hardware Security Module (HSM) support
- TPM 2.0 hardware
- Network security appliances
```

## 🏗️ Architecture Overview

```
                    ┌─────────────────┐
                    │   Load Balancer │
                    │    (NGINX)      │
                    └─────────┬───────┘
                              │
                ┌─────────────┼─────────────┐
                │             │             │
        ┌───────▼──────┐ ┌────▼─────┐ ┌─────▼──────┐
        │  PQC Node 1  │ │ PQC Node │ │  PQC Node  │
        │              │ │    2     │ │     N      │
        └──────┬───────┘ └────┬─────┘ └─────┬──────┘
               │              │             │
               └──────────────┼─────────────┘
                              │
                    ┌─────────▼───────┐
                    │   Data Layer    │
                    │ PostgreSQL +    │
                    │ Redis Cluster   │
                    └─────────────────┘
```

## 🐳 Container Deployment

### Docker Deployment

1. **Build Production Image**

```bash
# Clone repository
git clone https://github.com/terragonlabs/PQC-Edge-Attestor.git
cd PQC-Edge-Attestor

# Build production image
docker build -f Dockerfile.production -t pqc-edge-attestor:production .
```

2. **Production Docker Compose**

Create `docker-compose.production.yml`:

```yaml
version: '3.8'

services:
  pqc-app:
    image: pqc-edge-attestor:production
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - LOG_LEVEL=info
      - ENABLE_MONITORING=true
      - ENABLE_SECURITY_SCANNING=true
    ports:
      - "3000:3000"
    volumes:
      - ./logs:/app/logs
      - ./security-reports:/app/security-reports
    depends_on:
      - postgresql
      - redis
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 4G
          cpus: '2'
        reservations:
          memory: 2G
          cpus: '1'

  postgresql:
    image: postgres:15-alpine
    restart: unless-stopped
    environment:
      - POSTGRES_DB=pqc_attestor
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init-scripts:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "--raw", "incr", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3

  nginx:
    image: nginx:1.24-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - pqc-app

volumes:
  postgres_data:
  redis_data:
```

3. **Environment Configuration**

Create `.env.production`:

```env
# Database
DATABASE_URL=postgresql://username:password@postgresql:5432/pqc_attestor
DB_USER=pqc_user
DB_PASSWORD=secure_db_password

# Redis
REDIS_URL=redis://:secure_redis_password@redis:6379
REDIS_PASSWORD=secure_redis_password

# Security
JWT_SECRET=your-256-bit-secret-key-here
API_KEYS=key1:value1,key2:value2

# Monitoring
PROMETHEUS_ENABLED=true
GRAFANA_ENABLED=true
LOG_LEVEL=info

# Compliance
GDPR_ENABLED=true
CCPA_ENABLED=true
AUDIT_RETENTION_DAYS=2555  # 7 years
```

### Kubernetes Deployment

1. **Kubernetes Manifests**

Create `k8s-production/`:

```yaml
# namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: pqc-attestor
  labels:
    name: pqc-attestor
    security-level: high

---
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: pqc-config
  namespace: pqc-attestor
data:
  NODE_ENV: "production"
  LOG_LEVEL: "info"
  ENABLE_MONITORING: "true"
  GDPR_ENABLED: "true"
  CCPA_ENABLED: "true"

---
# secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: pqc-secrets
  namespace: pqc-attestor
type: Opaque
data:
  DATABASE_URL: <base64-encoded-database-url>
  JWT_SECRET: <base64-encoded-jwt-secret>
  REDIS_PASSWORD: <base64-encoded-redis-password>

---
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pqc-attestor
  namespace: pqc-attestor
  labels:
    app: pqc-attestor
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 1
  selector:
    matchLabels:
      app: pqc-attestor
  template:
    metadata:
      labels:
        app: pqc-attestor
    spec:
      containers:
      - name: pqc-attestor
        image: pqc-edge-attestor:production
        ports:
        - containerPort: 3000
        env:
        - name: PORT
          value: "3000"
        envFrom:
        - configMapRef:
            name: pqc-config
        - secretRef:
            name: pqc-secrets
        resources:
          requests:
            memory: "2Gi"
            cpu: "1"
          limits:
            memory: "4Gi"
            cpu: "2"
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
          initialDelaySeconds: 5
          periodSeconds: 5
        securityContext:
          allowPrivilegeEscalation: false
          runAsNonRoot: true
          runAsUser: 1000
          capabilities:
            drop:
              - ALL

---
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: pqc-attestor-service
  namespace: pqc-attestor
spec:
  selector:
    app: pqc-attestor
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: ClusterIP

---
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: pqc-attestor-ingress
  namespace: pqc-attestor
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  tls:
  - hosts:
    - pqc-api.yourdomain.com
    secretName: pqc-attestor-tls
  rules:
  - host: pqc-api.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: pqc-attestor-service
            port:
              number: 80
```

2. **Deploy to Kubernetes**

```bash
# Apply manifests
kubectl apply -f k8s-production/

# Verify deployment
kubectl get pods -n pqc-attestor
kubectl get services -n pqc-attestor
kubectl get ingress -n pqc-attestor

# Check logs
kubectl logs -f deployment/pqc-attestor -n pqc-attestor
```

## 🔒 Security Configuration

### SSL/TLS Setup

1. **Generate SSL Certificates**

```bash
# Using Let's Encrypt with Certbot
certbot certonly --webroot -w /var/www/html -d pqc-api.yourdomain.com

# Or generate self-signed for testing
openssl req -x509 -nodes -days 365 -newkey rsa:4096 \
  -keyout ssl/private.key \
  -out ssl/certificate.crt \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=pqc-api.yourdomain.com"
```

2. **NGINX SSL Configuration**

```nginx
# nginx.conf
events {
    worker_connections 1024;
}

http {
    upstream pqc_backend {
        least_conn;
        server pqc-app:3000;
        keepalive 32;
    }
    
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    
    # SSL Configuration
    server {
        listen 443 ssl http2;
        server_name pqc-api.yourdomain.com;
        
        ssl_certificate /etc/nginx/ssl/certificate.crt;
        ssl_certificate_key /etc/nginx/ssl/private.key;
        
        # Modern SSL configuration
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384;
        ssl_prefer_server_ciphers off;
        ssl_session_cache shared:SSL:10m;
        ssl_session_timeout 10m;
        
        # Security headers
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header X-XSS-Protection "1; mode=block";
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';";
        
        # Rate limiting
        limit_req zone=api burst=20 nodelay;
        
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
            proxy_connect_timeout 5s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
        }
    }
    
    # HTTP to HTTPS redirect
    server {
        listen 80;
        server_name pqc-api.yourdomain.com;
        return 301 https://$server_name$request_uri;
    }
}
```

### Firewall Configuration

```bash
# UFW firewall rules
ufw allow 22/tcp      # SSH
ufw allow 80/tcp      # HTTP
ufw allow 443/tcp     # HTTPS
ufw allow 5432/tcp    # PostgreSQL (internal only)
ufw allow 6379/tcp    # Redis (internal only)
ufw --force enable

# iptables rules for additional security
iptables -A INPUT -p tcp --dport 3000 -s 127.0.0.1 -j ACCEPT
iptables -A INPUT -p tcp --dport 3000 -j DROP
```

## 📊 Monitoring and Observability

### Prometheus Configuration

Create `monitoring/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'pqc-attestor'
    static_configs:
      - targets: ['pqc-app:3000']
    metrics_path: '/metrics'
    scrape_interval: 10s
    
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']
      
  - job_name: 'postgres-exporter'
    static_configs:
      - targets: ['postgres-exporter:9187']

rule_files:
  - "alerts.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093
```

### Grafana Dashboard

Import PQC-specific dashboard with metrics for:
- Operation latencies (Kyber, Dilithium, Falcon)
- Security threat detections
- Compliance status
- Auto-scaling events
- Research experiment results

### Log Management

```yaml
# docker-compose.logging.yml
version: '3.8'

services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    environment:
      - discovery.type=single-node
      - ES_JAVA_OPTS=-Xms1g -Xmx1g
    volumes:
      - elasticsearch_data:/usr/share/elasticsearch/data

  logstash:
    image: docker.elastic.co/logstash/logstash:8.11.0
    volumes:
      - ./logstash.conf:/usr/share/logstash/pipeline/logstash.conf
    depends_on:
      - elasticsearch

  kibana:
    image: docker.elastic.co/kibana/kibana:8.11.0
    ports:
      - "5601:5601"
    environment:
      ELASTICSEARCH_HOSTS: http://elasticsearch:9200
    depends_on:
      - elasticsearch

volumes:
  elasticsearch_data:
```

## 🔄 CI/CD Pipeline

### GitHub Actions Workflow

Create `.github/workflows/production-deploy.yml`:

```yaml
name: Production Deployment

on:
  push:
    branches: [main]
    tags: ['v*']

jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v3
      with:
        node-version: '18'
    - run: npm ci
    - run: node scripts/securityScan.js
    - uses: github/codeql-action/upload-sarif@v2
      with:
        sarif_file: security-reports/security-scan.sarif

  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v3
      with:
        node-version: '18'
    - run: npm ci
    - run: npm test
    - run: npm run test:coverage
    - uses: codecov/codecov-action@v3

  build:
    needs: [security-scan, test]
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - uses: docker/setup-buildx-action@v2
    - uses: docker/login-action@v2
      with:
        registry: ghcr.io
        username: ${{ github.actor }}
        password: ${{ secrets.GITHUB_TOKEN }}
    - uses: docker/build-push-action@v4
      with:
        context: .
        file: ./Dockerfile.production
        push: true
        tags: |
          ghcr.io/${{ github.repository }}:latest
          ghcr.io/${{ github.repository }}:${{ github.sha }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
    - uses: actions/checkout@v4
    - uses: azure/k8s-set-context@v3
      with:
        method: kubeconfig
        kubeconfig: ${{ secrets.KUBE_CONFIG }}
    - uses: azure/k8s-deploy@v1
      with:
        manifests: |
          k8s-production/namespace.yaml
          k8s-production/configmap.yaml
          k8s-production/secret.yaml
          k8s-production/deployment.yaml
          k8s-production/service.yaml
          k8s-production/ingress.yaml
        images: |
          ghcr.io/${{ github.repository }}:${{ github.sha }}
```

## 🧪 Testing in Production

### Health Checks

```bash
# Basic health check
curl -f https://pqc-api.yourdomain.com/health

# Detailed system status
curl https://pqc-api.yourdomain.com/api/v1/status

# Metrics endpoint
curl https://pqc-api.yourdomain.com/metrics
```

### Load Testing

```bash
# Install k6 load testing tool
npm install -g k6

# Run load test
k6 run --vus 100 --duration 5m load-test.js
```

### Security Testing

```bash
# Run security scan
node scripts/securityScan.js

# Penetration testing with OWASP ZAP
docker run -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py \
  -t https://pqc-api.yourdomain.com
```

## 📈 Performance Optimization

### Database Optimization

```sql
-- PostgreSQL optimization
-- Create indexes for frequently queried columns
CREATE INDEX idx_operations_timestamp ON operations(timestamp);
CREATE INDEX idx_devices_status ON devices(status);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- Enable connection pooling
-- Set in postgresql.conf:
-- max_connections = 200
-- shared_buffers = 256MB
-- effective_cache_size = 1GB
```

### Redis Optimization

```redis
# Redis configuration
maxmemory 2gb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
```

### Application Performance

```javascript
// Enable production optimizations in Node.js
process.env.NODE_ENV = 'production';

// Configure clustering
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;

if (cluster.isMaster) {
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
} else {
  require('./src/index.js');
}
```

## 🚨 Disaster Recovery

### Backup Strategy

```bash
#!/bin/bash
# backup.sh - Automated backup script

# Database backup
pg_dump -h localhost -U pqc_user pqc_attestor | \
  gzip > backups/db_backup_$(date +%Y%m%d_%H%M%S).sql.gz

# Application data backup
tar -czf backups/app_data_$(date +%Y%m%d_%H%M%S).tar.gz \
  logs/ security-reports/ research_output/

# Upload to secure cloud storage
aws s3 cp backups/ s3://pqc-backups/ --recursive --exclude "*" --include "*.gz" --include "*.tar.gz"
```

### Recovery Procedures

```bash
# Database recovery
gunzip -c backups/db_backup_20240314_120000.sql.gz | \
  psql -h localhost -U pqc_user pqc_attestor

# Application data recovery
tar -xzf backups/app_data_20240314_120000.tar.gz

# Service restart
docker-compose restart pqc-app
```

## 🔍 Troubleshooting

### Common Issues

1. **High Memory Usage**
   - Check for memory leaks: `docker stats pqc-app`
   - Restart application: `docker-compose restart pqc-app`
   - Scale horizontally: `kubectl scale deployment pqc-attestor --replicas=5`

2. **Database Connection Issues**
   - Check connection pool: Monitor PostgreSQL connections
   - Verify credentials: Test database connectivity
   - Check network: Ensure database is accessible

3. **SSL Certificate Expiration**
   - Monitor certificate expiry: `openssl x509 -in ssl/certificate.crt -noout -dates`
   - Auto-renewal: Configure certbot cron job

4. **Performance Degradation**
   - Check resource usage: `htop`, `iotop`, `docker stats`
   - Review application logs: `kubectl logs -f deployment/pqc-attestor`
   - Monitor metrics: Check Grafana dashboards

### Emergency Contacts

- **Technical Lead**: tech-lead@terragonlabs.com
- **Security Team**: security@terragonlabs.com
- **DevOps Team**: devops@terragonlabs.com
- **On-call Engineer**: +1-555-EMERGENCY

## 📚 Additional Resources

- [Security Runbook](./SECURITY_RUNBOOK.md)
- [Performance Tuning Guide](./PERFORMANCE_TUNING.md)
- [Compliance Documentation](./COMPLIANCE.md)
- [API Documentation](./API_DOCUMENTATION.md)
- [Disaster Recovery Plan](./DISASTER_RECOVERY.md)

---

**⚠️ Important**: This deployment guide contains production-grade configurations. Ensure all security credentials are properly managed and never commit secrets to version control.

**📞 Support**: For deployment assistance, contact support@terragonlabs.com or create an issue in the repository.