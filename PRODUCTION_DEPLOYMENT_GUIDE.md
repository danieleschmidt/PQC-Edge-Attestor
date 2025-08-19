# TERRAGON PQC-Edge-Attestor Production Deployment Guide

## 🚀 Generation 3 Global Deployment Strategy

This comprehensive guide covers the production deployment of the TERRAGON PQC-Edge-Attestor across multiple regions with quantum-resistant security, advanced monitoring, and autonomous scaling capabilities.

## Prerequisites

### Infrastructure Requirements
- **Kubernetes Cluster**: v1.25+ with quantum workload support
- **Multi-Region Setup**: Minimum 3 regions for high availability
- **Hardware Security Modules (HSMs)**: FIPS 140-3 Level 3 certified
- **Load Balancers**: Layer 7 with TLS 1.3 and PQC cipher suite support
- **Database**: PostgreSQL 15+ with encryption at rest
- **Cache**: Redis Cluster 7+ with persistence
- **Monitoring**: Prometheus, Grafana, Jaeger for distributed tracing

### Security Requirements
- **Network Policies**: Zero-trust network segmentation
- **RBAC**: Fine-grained role-based access controls
- **Service Mesh**: Istio with mutual TLS and PQC support
- **Image Security**: Signed container images with SBOM
- **Secrets Management**: HashiCorp Vault or AWS Secrets Manager

## Deployment Architecture

### Global Multi-Region Setup

```
┌─────────────────────────────────────────────────────────────┐
│                     Global Control Plane                    │
├─────────────────────────────────────────────────────────────┤
│  • Global Load Balancer (CloudFlare/AWS Route53)           │
│  • DNS-based Routing with Health Checks                    │
│  • Cross-Region Replication Controller                     │
└─────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┼───────────────┐
                │               │               │
      ┌─────────▼──────┐ ┌──────▼──────┐ ┌─────▼──────────┐
      │   US-EAST-1    │ │  EU-WEST-1  │ │   ASIA-PAC-1   │
      │                │ │             │ │                │
      │ • 3 AZ Setup   │ │ • 3 AZ Setup│ │ • 3 AZ Setup   │
      │ • Primary HSM  │ │ • Backup HSM│ │ • Secondary HSM│
      │ • Full Stack   │ │ • Full Stack│ │ • Full Stack   │
      └────────────────┘ └─────────────┘ └────────────────┘
```

## Step-by-Step Deployment

### Phase 1: Infrastructure Preparation

#### 1.1 Kubernetes Cluster Setup

```bash
# Create production namespace
kubectl apply -f k8s/namespace.yaml

# Apply RBAC configurations
kubectl apply -f k8s/rbac.yaml

# Create persistent volumes
kubectl apply -f k8s/pvc.yaml
```

#### 1.2 Secret Management

```bash
# Generate quantum-safe secrets
openssl rand -hex 32 > jwt_secret.txt
openssl rand -hex 64 > encryption_key.txt

# Create Kubernetes secrets
kubectl create secret generic pqc-attestor-secrets \
  --from-literal=DB_USERNAME=pqc_attestor \
  --from-literal=DB_PASSWORD=$(openssl rand -base64 32) \
  --from-literal=REDIS_PASSWORD=$(openssl rand -base64 32) \
  --from-file=JWT_SECRET=jwt_secret.txt \
  --from-file=ENCRYPTION_KEY=encryption_key.txt \
  --namespace=pqc-attestor

# Clean up temporary files
rm jwt_secret.txt encryption_key.txt
```

#### 1.3 Configuration Deployment

```bash
# Apply configuration maps
kubectl apply -f k8s/configmap.yaml

# Verify configuration
kubectl get configmap pqc-attestor-config -n pqc-attestor -o yaml
```

### Phase 2: Database and Cache Deployment

#### 2.1 PostgreSQL Database

```bash
# Deploy PostgreSQL with PQC-optimized configuration
kubectl apply -f k8s/deployment.yaml

# Wait for database to be ready
kubectl wait --for=condition=ready pod -l app=postgres -n pqc-attestor --timeout=300s

# Initialize database schema
kubectl exec -it deployment/postgres-deployment -n pqc-attestor -- \
  psql -U pqc_attestor -d pqc_attestor_db -c "
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE EXTENSION IF NOT EXISTS uuid-ossp;
  "
```

#### 2.2 Redis Cache Cluster

```bash
# Deploy Redis with persistence
kubectl apply -f k8s/deployment.yaml

# Verify Redis is running
kubectl wait --for=condition=ready pod -l app=redis -n pqc-attestor --timeout=300s
```

### Phase 3: Application Deployment

#### 3.1 Container Image Preparation

```bash
# Build production image with multi-stage optimization
docker build -f Dockerfile.prod -t pqc-edge-attestor:v1.0.0-prod .

# Sign container image (recommended)
cosign sign --key cosign.key pqc-edge-attestor:v1.0.0-prod

# Push to secure registry
docker tag pqc-edge-attestor:v1.0.0-prod your-registry/pqc-edge-attestor:v1.0.0-prod
docker push your-registry/pqc-edge-attestor:v1.0.0-prod
```

#### 3.2 Application Deployment

```bash
# Deploy PQC-Edge-Attestor with Generation 3 features
kubectl apply -f k8s/deployment.yaml

# Deploy service and ingress
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml

# Configure auto-scaling
kubectl apply -f k8s/hpa.yaml
```

#### 3.3 Health Check Validation

```bash
# Check deployment status
kubectl get deployments -n pqc-attestor
kubectl get pods -n pqc-attestor

# Verify health endpoints
kubectl port-forward svc/pqc-attestor-service 8080:80 -n pqc-attestor &
curl http://localhost:8080/health/ready
curl http://localhost:8080/health/live
curl http://localhost:8080/metrics
```

### Phase 4: Security Hardening

#### 4.1 Network Policies

```yaml
# Apply network segmentation
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: pqc-attestor-netpol
  namespace: pqc-attestor
spec:
  podSelector:
    matchLabels:
      app: pqc-edge-attestor
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: istio-system
    ports:
    - protocol: TCP
      port: 3000
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: postgres
    ports:
    - protocol: TCP
      port: 5432
  - to:
    - podSelector:
        matchLabels:
          app: redis
    ports:
    - protocol: TCP
      port: 6379
```

#### 4.2 Pod Security Standards

```bash
# Apply security policies
kubectl label namespace pqc-attestor \
  pod-security.kubernetes.io/enforce=restricted \
  pod-security.kubernetes.io/audit=restricted \
  pod-security.kubernetes.io/warn=restricted
```

### Phase 5: Monitoring and Observability

#### 5.1 Prometheus Metrics

```bash
# Deploy ServiceMonitor for Prometheus
cat <<EOF | kubectl apply -f -
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: pqc-attestor-metrics
  namespace: pqc-attestor
spec:
  selector:
    matchLabels:
      app: pqc-edge-attestor
  endpoints:
  - port: metrics
    interval: 30s
    path: /metrics
EOF
```

#### 5.2 Grafana Dashboard

```bash
# Import PQC-Edge-Attestor dashboard
curl -X POST \
  http://grafana.monitoring.svc.cluster.local:3000/api/dashboards/db \
  -H "Content-Type: application/json" \
  -d @grafana-dashboard.json
```

#### 5.3 Distributed Tracing

```bash
# Enable Jaeger tracing
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: jaeger-config
  namespace: pqc-attestor
data:
  JAEGER_AGENT_HOST: jaeger-agent.monitoring.svc.cluster.local
  JAEGER_AGENT_PORT: "6832"
  JAEGER_SAMPLER_TYPE: probabilistic
  JAEGER_SAMPLER_PARAM: "0.1"
EOF
```

## High Availability Configuration

### Multi-Region Setup

#### Global Load Balancer Configuration

```yaml
# CloudFlare/AWS Route53 Health Check
health_check:
  endpoint: "https://api.pqc-attestor.{region}.example.com/health/ready"
  interval: 30s
  timeout: 10s
  healthy_threshold: 2
  unhealthy_threshold: 3

# Traffic routing policy
routing_policy:
  primary_region: "us-east-1"
  secondary_regions: ["eu-west-1", "asia-pac-1"]
  failover_threshold: 5s
  geographic_routing: true
```

#### Cross-Region Replication

```bash
# Setup database replication
kubectl apply -f - <<EOF
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: postgres-cluster
  namespace: pqc-attestor
spec:
  instances: 3
  postgresql:
    parameters:
      wal_level: replica
      max_wal_senders: 10
      max_replication_slots: 10
  backup:
    barmanObjectStore:
      destinationPath: "s3://pqc-backups"
      wal:
        retention: "7d"
      data:
        retention: "30d"
EOF
```

## Performance Optimization

### Resource Allocation

```yaml
# Optimized resource requests and limits
resources:
  requests:
    memory: "512Mi"
    cpu: "250m"
    # Custom resources for quantum acceleration
    quantum-accelerator.example.com/qpu: "1"
  limits:
    memory: "2Gi"
    cpu: "1000m"
    quantum-accelerator.example.com/qpu: "1"
```

### Auto-Scaling Configuration

```yaml
# Horizontal Pod Autoscaler with custom metrics
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: pqc-attestor-hpa
  namespace: pqc-attestor
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: pqc-attestor-deployment
  minReplicas: 3
  maxReplicas: 50
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  - type: Pods
    pods:
      metric:
        name: quantum_operations_per_second
      target:
        type: AverageValue
        averageValue: "100"
```

## Security Compliance

### Regulatory Compliance

#### FIPS 140-3 Validation

```bash
# Verify FIPS compliance
kubectl exec -it deployment/pqc-attestor-deployment -n pqc-attestor -- \
  openssl engine -t fips

# Check quantum-safe algorithms
kubectl exec -it deployment/pqc-attestor-deployment -n pqc-attestor -- \
  curl -s http://localhost:3000/api/v1/crypto/algorithms
```

#### SOC 2 Type II Controls

- **Access Controls**: RBAC with MFA
- **Encryption**: AES-256 + PQC algorithms
- **Monitoring**: Real-time threat detection
- **Backup**: Automated with 30-day retention
- **Incident Response**: Automated alerting and remediation

### Vulnerability Management

```bash
# Container image scanning
trivy image pqc-edge-attestor:v1.0.0-prod

# Runtime security scanning
falco --config /etc/falco/falco.yaml

# Network security validation
cilium connectivity test
```

## Disaster Recovery

### Backup Strategy

```bash
# Database backup automation
kubectl create cronjob postgres-backup \
  --image=postgres:15-alpine \
  --schedule="0 2 * * *" \
  --restart=OnFailure \
  -- /bin/sh -c "pg_dump -h postgres-service -U pqc_attestor pqc_attestor_db | gzip > /backup/pqc_db_$(date +%Y%m%d_%H%M%S).sql.gz"

# Kubernetes state backup
velero backup create pqc-attestor-backup \
  --include-namespaces pqc-attestor \
  --storage-location default
```

### Recovery Procedures

#### Database Recovery

```bash
# Restore from backup
kubectl exec -it deployment/postgres-deployment -n pqc-attestor -- \
  psql -U pqc_attestor -d pqc_attestor_db < backup_file.sql

# Verify data integrity
kubectl exec -it deployment/postgres-deployment -n pqc-attestor -- \
  psql -U pqc_attestor -d pqc_attestor_db -c "SELECT COUNT(*) FROM devices;"
```

#### Application Recovery

```bash
# Restore application state
velero restore create pqc-attestor-restore \
  --from-backup pqc-attestor-backup

# Verify service health
kubectl get pods -n pqc-attestor
curl https://api.pqc-attestor.example.com/health/ready
```

## Maintenance Procedures

### Rolling Updates

```bash
# Zero-downtime deployment
kubectl set image deployment/pqc-attestor-deployment \
  pqc-attestor=pqc-edge-attestor:v1.1.0-prod \
  -n pqc-attestor

# Monitor rollout
kubectl rollout status deployment/pqc-attestor-deployment -n pqc-attestor

# Rollback if needed
kubectl rollout undo deployment/pqc-attestor-deployment -n pqc-attestor
```

### Database Maintenance

```bash
# Automated maintenance window
kubectl create cronjob postgres-maintenance \
  --image=postgres:15-alpine \
  --schedule="0 3 * * 0" \
  --restart=OnFailure \
  -- /bin/sh -c "
    psql -h postgres-service -U pqc_attestor -d pqc_attestor_db -c 'VACUUM ANALYZE;'
    psql -h postgres-service -U pqc_attestor -d pqc_attestor_db -c 'REINDEX DATABASE pqc_attestor_db;'
  "
```

## Troubleshooting Guide

### Common Issues

#### Pod Startup Failures

```bash
# Check pod logs
kubectl logs -f deployment/pqc-attestor-deployment -n pqc-attestor

# Check events
kubectl get events -n pqc-attestor --sort-by='.lastTimestamp'

# Check resource usage
kubectl top pods -n pqc-attestor
```

#### Database Connection Issues

```bash
# Test database connectivity
kubectl exec -it deployment/pqc-attestor-deployment -n pqc-attestor -- \
  nc -zv postgres-service 5432

# Check database logs
kubectl logs deployment/postgres-deployment -n pqc-attestor
```

#### Performance Degradation

```bash
# Check metrics
curl -s http://localhost:8080/metrics | grep -E "(response_time|memory_usage|cpu_usage)"

# Analyze traces
kubectl port-forward svc/jaeger-query 16686:16686 -n monitoring
# Visit http://localhost:16686
```

## Performance Benchmarks

### Expected Performance Metrics

- **Throughput**: 10,000+ attestations/second per instance
- **Latency**: < 100ms average response time
- **Availability**: 99.9% uptime SLA
- **Scalability**: Auto-scale from 3 to 50 instances
- **Security**: Zero critical vulnerabilities
- **Quantum Readiness**: NIST Level 5 algorithms

### Load Testing

```bash
# Run performance tests
k6 run --vus 1000 --duration 10m load-test.js

# Monitor during load test
kubectl top pods -n pqc-attestor
kubectl get hpa -n pqc-attestor -w
```

## Compliance and Auditing

### Audit Logging

```bash
# Enable Kubernetes audit logging
kubectl patch cluster cluster --type merge -p '{
  "spec": {
    "auditPolicy": {
      "rules": [
        {
          "level": "Request",
          "namespaces": ["pqc-attestor"],
          "resources": [{"group": "", "resources": ["*"]}]
        }
      ]
    }
  }
}'
```

### Compliance Reports

```bash
# Generate compliance report
kubectl compliance scan --profile stig-node \
  --namespace pqc-attestor

# Check security posture
kubectl kube-bench run --targets node,master
```

## Production Checklist

### Pre-Deployment Checklist

- [ ] Infrastructure provisioned and configured
- [ ] Security policies applied
- [ ] Monitoring and alerting configured
- [ ] Backup and disaster recovery tested
- [ ] Load testing completed
- [ ] Security scanning passed
- [ ] Documentation updated
- [ ] Team training completed

### Post-Deployment Checklist

- [ ] Health checks passing
- [ ] Metrics collection working
- [ ] Alerts configured and tested
- [ ] Performance within SLA targets
- [ ] Security monitoring active
- [ ] Backup verification completed
- [ ] Runbook updated
- [ ] Incident response plan activated

## Support and Maintenance

### Support Contacts

- **Emergency**: pqc-emergency@terragonlabs.com
- **Technical Support**: support@terragonlabs.com
- **Security Issues**: security@terragonlabs.com

### Maintenance Windows

- **Regular Maintenance**: Sundays 02:00-06:00 UTC
- **Emergency Maintenance**: As needed with 2-hour notice
- **Security Patches**: Within 24 hours of release

---

**TERRAGON PQC-Edge-Attestor Generation 3 Production Deployment**  
*Quantum-Resistant • Globally Scalable • Production Ready*

For additional support, visit: https://docs.terragonlabs.com/pqc-edge-attestor