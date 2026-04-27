# Architecture Kubernetes - Homepage Clusterisation

---

## Vue d'Ensemble - Diagramme Global

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DOCKER DESKTOP KUBERNETES CLUSTER                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────┐   ┌──────────────────────────────────┐
│    NAMESPACE: default                │   │   NAMESPACE: observability       │
├──────────────────────────────────────┤   ├──────────────────────────────────┤
│  ┌─────────────────────────────────┐ │   │  ┌────────────────────────────┐  │
│  │ DEPLOYMENT: homepage            │ │   │  │ DEPLOYMENT: otel-collector │  │
│  ├─────────────────────────────────┤ │   │  ├────────────────────────────┤  │
│  │                                 │ │   │  │ Image: collector-contrib   │  │
│  │  POD: homepage-*                │ │   │  │ Ports:                     │  │
│  │  ├─ homepage container          │ │   │  │  • :4317 (gRPC OTLP)       │  │
│  │  │  ├─ Next.js + @vercel/otel   │ │   │  │  • :4318 (HTTP OTLP)       │  │
│  │  │  ├─ Port: :3000              │ │   │  │  • :8888 (metrics)         │  │
│  │  │  └─ Sends telemetry to:      │ │   │  │                            │  │
│  │  │     otel-collector:4318      │ │   │  │ Receivers:                 │  │
│  │  │                              │ │   │  │  • otlp (gRPC+HTTP)        │  │
│  │  └─ log-shipper (fluent-bit)    │ │   │  │  • prometheus              │  │
│  │     ├─ Tails: /var/log/pods     │ │   │  │                            │  │
│  │     └─ Exports: :4318/v1/logs   │ │   │  │ Exporters:                 │  │
│  │                                 │ │   │  │  • otlp → traces:4317      │  │
│  │  SERVICE: homepage              │ │   │  │  • otlphttp → logs:9428    │  │
│  │  └─ :3000 → pod :3000           │ │   │  │  • promrw → metrics:8428   │  │
│  └─────────────────────────────────┘ │   │  └────────────────────────────┘  │
│           ↓ (HTTP OTLP)              │   │      ↓          ↓          ↓     │
└──────────┬─────────────────────────┬─┘   │ ┌─────────┐┌─────────┐┌─────────┐│
           │                         │     │ │Victoria ││Victoria ││Victoria ││
           │                         │     │ │ Traces  ││  Logs   ││Metrics  ││
           └────────────┬────────────┴─────┼→├─────────┤├─────────┤├─────────┤│
                        │    OTLP          │ │:4317/   ││:9428/   ││:8428/   ││
                        │    PROTOCOL      │ │8429     ││insert   ││write    ││
                        │                  │ │(Jaeger) ││(OTLP)   ││(Prom)   ││
                        ↓                  │ └─────────┘└─────────┘└─────────┘│
                ┌──────────────────┐       │    ↑            ↑            ↑   │ 
                │  OTel            │       │    │Queried by  │Queried by  │   │ 
                │  Collector       │       │    │Grafana     │Grafana     │   │ 
                │  :4318           │       │    │            │            │   │ 
                │  :4317           │       │    └────────────┴─┬──────────┘   │ 
                └──────────────────┘       │                   │              │  
                                           │  ┌────────────────────────────┐  │    
                                           │  │  DEPLOYMENT: grafana       │  │    
                                           │  ├────────────────────────────┤  │    
                                           │  │  Port: :3000 (Web UI)      │  │    
                                           │  │                            │  │    
                                           │  │  Datasources:              │  │    
                                           │  │  • VictoriaMetrics         │  │    
                                           │  │  • VictoriaLogs            │  │    
                                           │  │  • VictoriaTraces (Jaeger) │  │
                                           │  │                            │  │
                                           │  │  → Browser :3000           │  │
                                           │  └────────────────────────────┘  │
                                           │                                  │
                                           │  ┌────────────────────────────┐  │
                                           │  │ D: kube-state-metrics      │  │
                                           │  ├────────────────────────────┤  │
                                           │  │ Port: :8080 (Prometheus)   │  │
                                           │  │ Watched by: otel-collector │  │
                                           │  └────────────────────────────┘  │
                                           └──────────────────────────────────┘
```

---

## Flux de Données - OpenTelemetry Data Flow

### Traces (Spans)

```
homepage:3000                otel-collector              Victoria Traces
    │                              │                            │
    │ HTTP OTLP                    │                            │
    ├─ Path: http://               │                            │
    │  otel-collector:4318         │                            │
    │ /v1/traces                   │                            │
    │                              │                            │
    └─────────────────────────────►│                            │
                                   │                            │
                        [Trace Batch Processing]                │
                        (batcher processor)                     │
                                   │                            │
                        gRPC OTLP  │                            │
                        /v1/traces │                            │
                                   ├───────────────────────────►│
                                   │                            │
                                   │                    Storage: /vtraces
                                   │                 Queries via Jaeger API:
                                   │                 /select/jaeger
```

### Metrics (OTel Auto-instrumentation)

```
homepage:3000         otel-collector            Victoria Metrics
    │                     │                           │
    │ HTTP OTLP           │                           │
    ├─ /v1/metrics        │                           │
    │ (request duration,  │                           │
    │  http in/out,       │                           │
    │  DNS, etc.)         │                           │
    │                     │                           │
    └────────────────────►│                           │
                          │                           │
                [Metric Batch Processing]             │
                          │                           │
              Prometheus  │                           │
              Remote Write│                           │
              /api/v1/    │                           │
              write       │                           │
                          ├──────────────────────────►│
                          │                           │
                          │                    Storage: /vm-data
```

### Logs (Fluent Bit Log Shipper)

```
/var/log/pods/default_homepage-*/          fluent-bit              Victoria Logs
<container>/<stdout>
    │                                           │                        │
    │ File Tailing                              │                        │
    ├─ path=/var/log/pods/default_homepage-*    │                        │
    │ (watched continuously)                    │                        │
    │                                           │                        │
    │                                     HTTP OTLP                      │
    │                                     /v1/logs                       │
    └──────────────────────────────────────────►│                        │
                                                │                        │
                                    Log Records │                        │
                                    (batched)   │                        │
                                                ├───────────────────────►│
                                                │                        │
                                                │                  Storage: /logs
```

### Kubernetes Metrics (KSM → OTel Collector)

```
kube-state-metrics                    otel-collector           Victoria Metrics
(watches all K8s objects)                    │
    │                                        │
    │ Port: 8080                             │
    │ Prometheus format                      │
    │                                        │
    └───────────────────────────────────────►│
                  ↑                          │
        Scraped every 15s by               [Batch]
        prometheus receiver                  │
                                             │
                                 Prometheus  │
                                 Remote Write│
                                             ├──────────────────────┐
                                             │                      │
                                             ▼                      ▼
                                         Victoria Metrics       Grafana Dashboards
```

### Visualization Layer

```
Grafana:3000
    │
    ├─────────────────────────────────────────────────────────┐
    │                                                         │
    ▼                    ▼                    ▼               ▼
VictoriaMetrics    VictoriaLogs         VictoriaTraces    (local)
:8428/api/v1/*    :9428/...         :8429/select/jaeger


Explore / Dashboard
    │
    ├─ Traces Tab
    │  └─ Jaeger Datasource
    │     └─ Query Victoria Traces
    │        └─ Display: Services, Requests, Spans, Latency
    │
    ├─ Metrics Tab
    │  └─ VictoriaMetrics Datasource
    │     └─ Query: CPU, Memory, Request Rate, etc.
    │
    └─ Logs Tab
       └─ VictoriaLogs Datasource
          └─ Query: Log lines, errors, patterns
```

---

## Inventaire des Composants

### Namespace: `default`

| Composant | Type | Image | Ports | Fonction |
|-----------|------|-------|-------|----------|
| **homepage** | Deployment | node:22-alpine + homepage build | 3000/TCP | Web application (Next.js + @vercel/otel) |
| homepage-svc | Service | - | 3000→3000 | Internal access to homepage |

**Containers dans `homepage` pod:**
- `homepage`: Next.js app with OpenTelemetry SDK
- `log-shipper`: fluent-bit (tail logs → otel-collector)

**Volumes:**
- logs: emptyDir (shared with log-shipper)
- images: PVC (mounted at /app/public/images)
- configmaps: 8× homepage configs

---

### Namespace: `observability`

| Composant | Type | Image | Ports | Fonction |
|-----------|------|-------|-------|----------|
| **otel-collector** | Deployment | otel/opentelemetry-collector-contrib:0.114.0 | 4317(gRPC), 4318(HTTP), 8888(metrics) | Traces/Metrics/Logs ingestion & routing |
| **victoria-traces** | Deployment | victoriametrics/victoria-traces:latest | 4317(gRPC), 8429(HTTP+Jaeger) | Trace storage & Jaeger Query API |
| **victoria-metrics** | Deployment | victoriametrics/victoria-metrics:v1.111.0 | 8428/TCP | Metrics storage (Prometheus compatible) |
| **victoria-logs** | Deployment | victoriametrics/victoria-logs:v1.23.0-victorialogs | 9428/TCP | Logs storage (OTLP HTTP compatible) |
| **grafana** | Deployment | grafana/grafana:11.4.0 | 3000/TCP | Visualization & dashboards |
| **kube-state-metrics** | Deployment | k8s.gcr.io/kube-state-metrics | 8080/TCP | K8s object metrics (Prometheus format) |

**Ressources (Grafana):**
```yaml
requests:
  memory: 64Mi
  cpu: 50m
limits:
  memory: 256Mi
  cpu: 200m
```

---

## Connectivité Inter-Services

```
Direction         Source              Protocol    Target                Port
─────────────────────────────────────────────────────────────────────────────────
Egress            homepage:3000       HTTP OTLP   otel-collector        4318
Egress            homepage:3000       gRPC OTLP   otel-collector        4317
Egress            fluent-bit          HTTP OTLP   otel-collector        4318

Ingress           otel-collector      gRPC OTLP   victoria-traces       4317
Ingress           otel-collector      HTTP OTLP   victoria-logs         9428
Ingress           otel-collector      Prom RW     victoria-metrics      8428

Scrape            otel-collector      Prometheus  kube-state-metrics    8080
Scrape            otel-collector      Prometheus  otel-collector (self) 8888

Ingress           grafana:3000        HTTP        victoria-metrics      8428
Ingress           grafana:3000        HTTP        victoria-logs         9428
Ingress           grafana:3000        HTTP        victoria-traces       8429
```

---

## Load Patterns

### Peak Load Scenario (Homepage with Full Telemetry)

```
Time: 10 requests/sec from users
│
├─ Request → homepage:3000 (HTTP)
│  ├─ Next.js processes request
│  ├─ @vercel/otel creates 1 span
│  ├─ Span → otel-collector:4318 (HTTP OTLP)
│  │
│  ├─ Fetches services (API calls)
│  │  └─ Each API call = 1+ span
│  │      └─ → otel-collector:4318
│  │
│  ├─ Renders page
│  │  └─ generates metrics
│  │      └─ → otel-collector:4318 (metrics)
│  │
│  └─ Response 200 OK (200ms avg)
│
├─ fluent-bit continuously reads logs
│  └─ ships to otel-collector:4318 (/v1/logs)
│
└─ Async: Prometheus scrapes
   ├─ kube-state-metrics:8080 (every 15s)
   ├─ otel-collector:8888 (every 15s)
   └─ Data → victoria-metrics via prometheus.remotewrite
```

**Estimated Data Volume (per 10 requests):**
- Traces: 50-150 spans (5-15 KB)
- Metrics: 20-50 metric points (2-5 KB)
- Logs: 100-500 log lines (20-50 KB)

---

## Network Policies & RBAC

### Service Accounts

```
✅ homepage
   └─ Deployments: homepage
   └─ Can mount configmaps & PVCs

✅ kube-state-metrics
   └─ Deployed with ClusterRole
   └─ Can: list, watch nodes, pods, services, deployments, etc.
   └─ RBAC: ClusterRole + ClusterRoleBinding

✅ (implicit) otel-collector
   └─ Uses default service account
   └─ Only needs network access (no K8s API calls)
```

### Namespaces

```
Isolation:
  default ──┐
            ├─ No cross-namespace communication
observability ┤
            └─ Services discoverable within same namespace via DNS

DNS Resolution:
  homepage → otel-collector.observability.svc.cluster.local:4318
  (FQDN required for cross-namespace)
```

---

## Data Persistence

### Storage Types

```
ephemeral:
  ├─ logs (emptyDir)
  │  └─ /app/config/logs (homepage pod)
  │     └─ Lost on pod restart
  │
  └─ /dev/shm in running containers

persistent:
  ├─ victoria-traces:/vtraces (Traces DB)
  │  └─ Persists spans permanently
  │
  ├─ victoria-logs:/logs (Logs DB)
  │  └─ Persists logs permanently
  │
  ├─ victoria-metrics:/vm-data (Metrics DB)
  │  └─ Persists metrics permanently
  │
  ├─ grafana:/var/lib/grafana (Dashboards, configs)
  │  └─ Persists dashboards & settings
  │
  └─ images (PVC claim "homepage-images-pvc")
     └─ Mounted at homepage:/app/public/images
     └─ Persists user-uploaded images
```

**Note:** Victoria deployments do NOT have PVC in this setup = data lost on pod restart!  
**Recommendation:** Add PersistentVolumeClaims for production.

---

## Service Discovery

### Internal DNS Names

```
Namespace: observability (services discovered within ns):
  otel-collector.observability.svc.cluster.local:4317
  otel-collector.observability.svc.cluster.local:4318
  victoria-traces.observability.svc.cluster.local:4317
  victoria-traces.observability.svc.cluster.local:8429
  victoria-metrics.observability.svc.cluster.local:8428
  victoria-logs.observability.svc.cluster.local:9428
  grafana.observability.svc.cluster.local:3000
  kube-state-metrics.observability.svc.cluster.local:8080

Namespace: default (services discovered within ns):
  homepage.default.svc.cluster.local:3000

Cross-namespace:
  otel-collector.observability.svc.cluster.local
  (from homepage pod in default namespace)
```

---

## Deployment Sequence (Startup Order)

```
1. Victoria Services (must start first - storage backends)
   ├─ victoria-traces (port 4317 listener)
   ├─ victoria-logs (port 9428 listener)
   └─ victoria-metrics (port 8428 listener)
      └─ Wait ~10s for each to be ready

2. kube-state-metrics
   ├─ Needs RBAC permissions
   └─ Starts exporting metrics @ port 8080

3. otel-collector
   ├─ Waits for Victoria services (connection pooling with retries)
   ├─ Opens receivers (4317, 4318)
   ├─ Starts exporters once Victoria backends respond
   └─ Starts metrics server @ 8080

4. Grafana
   ├─ Waits for Victoria services
   ├─ Loads datasources from provisioning ConfigMap
   └─ Opens Web UI @ 3000

5. homepage
   ├─ Waited for otel-collector (env: OTEL_EXPORTER_OTLP_ENDPOINT)
   ├─ Initializes @vercel/otel SDK
   ├─ Starts HTTP server @ 3000
   └─ Begins sending telemetry
```

---

## Request Latency Breakdown

```
User Request to Response (best case, no errors):

User
  │
  ├─ HTTP GET / ─────────────────┐
  │                              │ kubernetes ingress
  │                              │ (if configured)
  ▼                              │
homepage:3000                    │
  │                              │
  ├─ Query homepage config ──────┼─ 50-100ms
  │ (from configmaps)            │
  │                              │
  ├─ Execute Next.js routes ─────┼─ 100-500ms
  │ (API calls, database, etc)   │
  │                              │
  ├─ @vercel/otel spans auto- ───┼─ 0ms (async, non-blocking)
  │ instrumented (non-blocking)  │
  │                              │
  ├─ HTTP response generated ────┼─ 0ms
  │                              │
  └─ Export telemetry (async) ───┼─ 0ms (background)
     │                           │
     └─→ otel-collector:4318     │ 1-5ms (local network in cluster)
        (HTTP OTLP)              │

TOTAL TIME TO RESPONSE: 150-600ms
(Telemetry export is background - doesn't block user)
```

---

## Configuration Parameters

### Environment Variables

```yaml
Homepage Pod:
  OTEL_SERVICE_NAME: "homepage"
  OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-collector.observability.svc.cluster.local:4318"
  OTEL_LOG_LEVEL: "info"
  NEXT_PUBLIC_VERSION: "1.12.3"
  HOMEPAGE_ALLOWED_HOSTS: "localhost:5000,$(MY_POD_IP):4000,$(MY_POD_IP):3000"

OTel Collector Config:
  receivers:
    otlp:
      protocols:
        grpc: 0.0.0.0:4317
        http: 0.0.0.0:4318
  exporters:
    otlp/vtraces:
      endpoint: victoria-traces:4317
    otlphttp/vlogs:
      endpoint: http://victoria-logs:9428/insert/opentelemetry
    prometheusremotewrite:
      endpoint: http://victoria-metrics:8428/api/v1/write
```

---

## Observability of the Stack Itself

```
Meta-observability (observing the observers):

kube-state-metrics
  └─ Monitors: Victoria pods (state, restarts, cpu, memory)
  └─ Monitors: OTel Collector pod state
  └─ Exports @ :8080 (Prometheus format)
      └─ Scraped by otel-collector prometheus receiver
         └─ Stored in Victoria Metrics

otel-collector
  └─ Exports self metrics @ :8888 (Prometheus format)
  └─ Scraped every 15s
  └─ Stored in Victoria Metrics
  └─ Visible in Grafana

Result:
  You can dashboard:
    ├─ homepage latency
    ├─ homepage error rate
    ├─ otel-collector processing stats
    ├─ Victoria Traces disk usage
    ├─ Victoria Metrics cardinality
    └─ All Kubernetes object states
```

---

## Típical Grafana Queries

### Traces
```
Service: homepage
Operation: POST /api/services
Duration: > 500ms
Error: false
```

### Metrics (Prometheus QL)
```
rate(http_server_request_duration_ms[5m])
histogram_quantile(0.95, rate(...[5m]))
increase(http_server_requests_total[1h])
```

### Logs (VictoriaLogs filtering)
```
{k8s.namespace="default", k8s.pod.name=~"homepage-.*", level="error"}
```

---

## 🔍 Debugging Checklist

```
❓ No traces appearing?
  → Check homepage → otel-collector connectivity (curl test from pod)
  → Check otel-collector → victoria-traces connectivity
  → Verify OTEL_EXPORTER_OTLP_ENDPOINT env var
  → Check otel-collector logs for export errors

❓ Logs not showing?
  → Check fluent-bit is running as second container
  → Verify /var/log/pods volume mount
  → Check fluent-bit → otel-collector:4318 connectivity
  → Check otel-collector logs for log processor errors

❓ Metrics not showing?
  → Check Victoria Metrics storage disk space
  → Verify prometheus remote write receiver configured
  → Check otel-collector → victoria-metrics:8428 connectivity
  → Check KSM → otel-collector:8080 scrape

❓ Grafana datasources unreachable?
  → Verify Victoria services are Running
  → Test DNS resolution from Grafana pod
  → Check service ports match datasource URLs
  → Verify HTTP endpoints (not gRPC) for HTTP exporters
```

