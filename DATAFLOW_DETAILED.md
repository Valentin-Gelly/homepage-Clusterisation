# Flux Détaillés de Données OpenTelemetry

**Référence:** OpenTelemetry Protocol (OTLP), Victoria Traces API JSON  
**Version:** API v1  
**Format:** Protocol Buffers + JSON HTTP

---

## Cycle de Vie d'une Requête HTTP (avec Telemetry)

```
TIMESTAMP: T0=0ms            T1=150ms                    T2=180ms
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  User Browser / curl          hostname:3000                          │
│  ├─ GET /                     ├─ receives request                    │
│  └─ HTTP/1.1 ────────────────►│ @vercel/otel.register()              │
│                               │  BEFORE route handler                │
│                               │                                      │
│                               ├─ CREATE ROOT SPAN                    │
│                               │  ├─ trace_id: abc123...              │
│                               │  ├─ span_id: def456...               │
│                               │  ├─ name: "GET /"                    │
│                               │  ├─ kind: SPAN_KIND_SERVER           │
│                               │  ├─ start_time: T0                   │
│                               │  ├─ attributes:                      │
│                               │  │  ├─ http.method: GET              │
│                               │  │  ├─ http.scheme: http             │
│                               │  │  ├─ http.url: /                   │
│                               │  │  ├─ server.address: :3000         │
│                               │  │  └─ ...                           │
│                               │  │                                   │
│                               │  └─ (span opened, not yet sent)      │
│                               │                                      │
│                               ├─ ROUTE HANDLER EXECUTION             │
│                               │  ├─ create child span if HTTP        │
│                               │  │  call to external service         │
│                               │  │  │                                │
│                               │  │  ├─ HTTP OPTIONS preflight        │
│                               │  │  ├─ HTTP GET /api/services        │
│                               │  │  │  ├─ child_span_id: ghi789      │
│                               │  │  │  ├─ parent_span_id: def456     │
│                               │  │  │  ├─ http.method: GET           │
│                               │  │  │  ├─ http.url: /api/services    │
│                               │  │  │  └─ Response: 200 OK           │
│                               │  │  │  └─ span.end_time: ≈30ms       │
│                               │  │  │                                │
│                               │  │  └─ Child span closed             │
│                               │  │                                   │
│                               │  ├─ Build response                   │
│                               │  └─ 150ms processing time            │
│                               │                                      │
│                               │ ROOT SPAN ATTRIBUTES SET             │
│                               │  ├─ http.status_code: 200            │
│                               │  ├─ http.response_content_length     │
│                               │  ├─ http.response_body: HTML...      │
│                               │  └─ (optional) user_id, trace_id     │
│                               │                                      │
│                               │ CLOSE ROOT SPAN                      │
│                               │  ├─ end_time: T1=150ms               │
│                               │  ├─ total duration: 150ms            │
│                               │  └─ span_status: OK                  │
│                               │                                      │
│  ◄─ HTTP/1.1 200 OK ──────────│ response body                        │
│  │ Content-Type: text/html    │ (3KB HTML)                           │
│  │ X-Trace-Id: abc123...      │                                      │
│  │                            │                                      │
│  └─ Browser renders page      │ HTML sent to client (T1=150ms)       │
│                               │                                      │
│                               │ AFTER response sent:                 │
│                               │ ├─ Trace export (ASYNC)              │
│                               │ │  ├─ Collect all spans:             │
│                               │ │  │  ├─ root span (150ms)           │
│                               │ │  │  └─ child span (30ms)           │
│                               │ │  │                                 │
│                               │ │  ├─ Build OTLP message:            │
│                               │ │  │  ├─ resource_spans {            │
│                               │ │  │  │   resource {                 │
│                               │ │  │  │     attributes: {            │
│                               │ │  │  │       service.name: ...      │
│                               │ │  │  │     }                        │
│                               │ │  │  │   }                          │
│                               │ │  │  │   scope_spans [{             │
│                               │ │  │  │     scope {...}              │
│                               │ │  │  │     spans [...]              │
│                               │ │  │  │   }]                         │
│                               │ │  │  │ }                            │
│                               │ │  │  │                              │
│                               │ │  │  └─ Gzip compressed             │
│                               │ │  │     (typically 100-200B)        │
│                               │ │  │                                 │
│                               │ │  ├─ HTTP POST request:             │
│                               │ │  │  ├─ URL: http://otel-...        │
│                               │ │  │  │      collector:4318 /        │
│                               │ │  │  │      v1/traces               │
│                               │ │  │  ├─ Headers:                    │
│                               │ │  │  │  ├─ Content-Type:            │
│                               │ │  │  │  │  application/...          │
│                               │ │  │  │  │  +protobuf                │
│                               │ │  │  │  ├─ Content-Encoding:        │
│                               │ │  │  │  │  gzip                     │
│                               │ │  │  │  └─ X-Otlp-Signal:           │
│                               │ │  │  │     traces                   │
│                               │ │  │  ├─ Body: [binary trace]        │
│                               │ │  │  │                              │
│                               │ │  │  └─ (sent on port 4318)         │
│                               │ │  │                                 │
│                               │ │  └─ Request timeout: 30s           │
│                               │ │                                    │
│                               │ ├─ Release memory (spans)            │
│                               │ └─ Continue serving (T2=180ms)       │
│                               │                                      │
│                               └─ Trace export = 30ms                 │
└──────────────────────────────────────────────────────────────────────┘

T2=180ms: Export completes asynchronously
  ✓ User got response at T1=150ms (not blocked by telemetry export)
  ✓ Span data in-flight to otel-collector
```

---

##  Pipeline OTel Collector - Traces

```
OTLP HTTP Request arrives at :4318
│
├─ Listener picks up connection
├─ ParseRequest() → protobuf decode
└─ ExportTraceServiceRequest {
     resource_spans: [{
       resource: { 
         attributes: [...],  # service.name, environment, etc
       },
       scope_spans: [{
         scope: {...},
         spans: [
           { trace_id, span_id, name, kind, start_time, duration, ... },
           { trace_id, span_id, name, kind, start_time, duration, ... },
         ]
       }]
     }]
   }
│
├─ ROUTING: traces pipeline
│  ├─ receivers: [otlp]  ✓ matches incoming signal type
│  └─ processors: [batch]
│  └─ exporters: [otlp/vtraces]
│
├─ PROCESSOR: Batch
│  ├─ Input: spans (streamed)
│  ├─ Action:
│  │  ├─ Accumulate spans in memory buffer
│  │  ├─ Wait until:
│  │  │  ├─ buffer contains 1000 spans (send_batch_size) OR
│  │  │  ├─ 5s elapsed (timeout) OR
│  │  │  ├─ shutdown
│  │  │
│  │  └─ Batch formed with 50 spans (example)
│  │
│  └─ Output: batch of spans
│
├─ EXPORTER: otlp/vtraces
│  ├─ Target: victoria-traces:4317
│  ├─ Protocol: gRPC OTLP
│  │
│  ├─ Connection Pool:
│  │  ├─ Check if tcp:victoria-traces:4317 alive
│  │  ├─ If not: retry with exponential backoff
│  │  ├─ If alive: reuse connection
│  │
│  ├─ Send ExportTraceServiceRequest {
│  │    resource_spans: [ spans batch ]
│  │  }
│  │
│  ├─ Receive: ExportTraceServiceResponse {
│  │    partial_success: { ... }
│  │  }
│  │
│  └─ Success: Ack
│     (spans now persisted in Victoria Traces)
│
└─ OBSERVABILITY
   └─ otel-collector metrics:
      ├─ otelcol_exporter_sent_spans{exporter="otlp/vtraces"}
      ├─ otelcol_exporter_send_failed_spans{exporter="otlp/vtraces"}
      ├─ otelcol_processor_batch_send_size_distribution
      └─ → metric @ port 8888 (scraped by self this cycle)
```

---

## Victoria Traces - Storage Backend

```
gRPC OTLP Request arrives at :4317
│
├─ VictoriaTraces gRPC server
├─ Decode ExportTraceServiceRequest (protobuf)
│
└─ Import pipeline:
   │
   ├─ For each span:
   │  ├─ trace_id: abc123...  (16 bytes)
   │  ├─ span_id: def456...   (8 bytes)
   │  ├─ start_time: 1719412345123000000 (nanoseconds)
   │  ├─ duration: 150000000 ns (150ms)
   │  ├─ attributes: {...}
   │  ├─ events: [...]
   │  ├─ links: [...]
   │  └─ status: OK
   │
   ├─ Extract indexed fields:
   │  ├─ span_id → index
   │  ├─ trace_id → reverse index
   │  ├─ service_name → tag index
   │  ├─ span.kind → tag index
   │  ├─ http.status_code → range index
   │  └─ start_time → time range index
   │
   ├─ Write to column storage:
   │  ├─ trace_id.db (indexed)
   │  ├─ span_id.db (indexed)
   │  ├─ timestamp.db (time series)
   │  ├─ duration.db (sorted)
   │  ├─ attributes.db (tag values)
   │  └─ ... (10+ column files)
   │
   ├─ Disk write to /vtraces
   │  ├─ append-only log initially
   │  ├─ merge into main storage on background
   │  └─ compaction runs hourly
   │
   ├─ Send ExportTraceServiceResponse
   │
   └─ Metrics updated:
      ├─ vtinsert_metric_rows_added_total
      ├─ vtinsert_packet_processing_duration
      └─ vtinsert_request_duration_seconds
```

---

## Jaeger Query API - Trace Retrieval

```
Grafana Traces UI (user clicks on trace)
│
│ HTTP GET http://victoria-traces:8429/select/jaeger/api/traces?
│            service=homepage&
│            operation=GET%20%2F&
│            samplerType=const&
│            maxTraces=20
│
├─ Request routed to Victoria Traces query path
├─ Parse query parameters
│
└─ Execute query:
   │
   ├─ Lookup spans where:
   │  ├─ service_name = "homepage" (tag index lookup)
   │  ├─ span.name = "GET /" (attribute index lookup)
   │  └─ start_time > now-1h (time range scan)
   │
   ├─ Fetch span details from column storage
   ├─ Reconstruct trace tree:
   │  ├─ traces[trace_id] = [spans]
   │  ├─ for each span: parent_span_id → build hierarchy
   │  └─ result: tree view
   │
   ├─ Format response as Jaeger JSON API:
   │  ├─ {
   │  │   data: [
   │  │     {
   │  │       traceID: "abc123...",
   │  │       spans: [
   │  │         {
   │  │           traceID: "abc123...",
   │  │           spanID: "def456...",
   │  │           operationName: "GET /",
   │  │           references: [],  # root span
   │  │           startTime: 1719412345123,
   │  │           duration: 150000,  # microseconds
   │  │           tags: [
   │  │             { key: "http.status_code", value: 200 },
   │  │             { key: "http.method", value: "GET" },
   │  │           ],
   │  │           logs: [...],  # events/logs
   │  │           processes: {...}
   │  │         },
   │  │         {
   │  │           traceID: "abc123...",
   │  │           spanID: "ghi789...",
   │  │           parentSpanID: "def456...",
   │  │           operationName: "GET /api/services",
   │  │           ...
   │  │         }
   │  │       ],
   │  │       processes: {
   │  │         "p1": {
   │  │           serviceName: "homepage",
   │  │           tags: [...]
   │  │         }
   │  │       },
   │  │       warnings: null
   │  │     }
   │  │   ],
   │  │   total: 1,
   │  │   limit: 20,
   │  │   offset: 0,
   │  │   errors: null
   │  │ }
   │  │
   │  └─ HTTP 200 OK with JSON body
   │
   ├─ Send response
   │
   └─ Trace details now visible in Grafana Traces UI
      ├─ Timeline view
      ├─ Span waterfalls
      ├─ Service topology
      ├─ Error analysis
      └─ Latency breakdown
```

---

## Logs Pipeline - fluent-bit → OTel → Victoria

```
STEP 1: File Tailing (fluent-bit)
═════════════════════════════════════
/var/log/pods/default_homepage-59fd85889d-wczvv/
├── homepage              (container)
│   └── 0.log            (stdout)
│       │
│       ├─ timestamp [2026-04-27T10:03:26Z] INFO @vercel/otel started
│       ├─ timestamp [2026-04-27T10:03:26Z] INFO Starting ...
│       ├─ GET / 200 150ms
│       │
│       └─ fluent-bit tail plugin:
│          ├─ Watches directory
│          ├─ Every 1s: reads new lines
│          ├─ Parses timestamp (if format configured)
│          └─ Passes to output plugin
│
└── log-shipper          (container - fluent-bit)
    └─ 0.log

STEP 2: Output to OTel Collector (fluent-bit)
═════════════════════════════════════════════
fluent-bit config:
  [OUTPUT]
    name opentelemetry
    host otel-collector.observability.svc.cluster.local
    port 4318
    logs_uri /v1/logs
    compress gzip

Action:
  ├─ Collect buffered log records (batched)
  ├─ Create OpenTelemetry LogExportRequest
  │  ├─ resource_logs: {
  │  │   resource: {
  │  │     attributes: {
  │  │       "service.name": "homepage",  # from config
  │  │       "k8s.pod.name": "homepage-...",  # from file path
  │  │       "k8s.namespace": "default",
  │  │     }
  │  │   },
  │  │   scope_logs: [{
  │  │     scope: {...},
  │  │     log_records: [
  │  │       {
  │  │         time_unix_nano: 1719412345000000000,
  │  │         severity_number: 2 (INFO),
  │  │         body: "Starting ...",
  │  │         attributes: {
  │  │           "source": "stdout"
  │  │         }
  │  │       },
  │  │       { ... }  # more log records
  │  │     ]
  │  │   }]
  │  │ }
  │  │
  │  └─ Body: protobuf encoded
  │
  ├─ HTTP POST request to otel-collector:4318/v1/logs
  ├─ Gzip compress body
  ├─ Send headers:
  │  ├─ Content-Type: application/x-protobuf
  │  ├─ Content-Encoding: gzip
  │  └─ X-Otlp-Signal: logs
  │
  └─ Receive HTTP 200 OK


STEP 3: OTel Collector Logs Pipeline
════════════════════════════════════
Receiver otlp (HTTP endpoint :4318)
  ├─ Parse ExportLogsServiceRequest
  │
  └─ Routing: logs pipeline
     ├─ receivers: [otlp]
     ├─ processors: [batch]
     └─ exporters: [otlphttp/vlogs]

Processor batch
  ├─ Buffer log records
  ├─ Wait for batch conditions
  └─ Send batch

Exporter otlphttp/vlogs
  ├─ Target: http://victoria-logs:9428/insert/opentelemetry
  ├─ HTTP POST ExportLogsServiceRequest
  │
  └─ Done


STEP 4: Victoria Logs Storage
════════════════════════════════
victoria-logs:9428 receives HTTP request
  │
  ├─ URI: /insert/opentelemetry
  ├─ ParseOTLP() → decode protobuf
  │
  ├─ For each log record:
  │  ├─ Extract:
  │  │  ├─ timestamp
  │  │  ├─ message (body)
  │  │  ├─ severity_level
  │  │  ├─ service_name (from resource attributes)
  │  │  ├─ pod_name (from resource attributes)
  │  │  ├─ namespace (from resource attributes)
  │  │  └─ custom attributes
  │  │
  │  └─ Store as structured log entry
  │
  ├─ Write to column storage
  │  ├─ _time (indexed)
  │  ├─ _msg (full-text indexed)
  │  ├─ service_name (tag indexed)
  │  ├─ pod_name (tag indexed)
  │  ├─ severity (tag indexed)
  │  └─ custom_attrs (searchable)
  │
  ├─ Persist to /logs (LSM tree)
  │
  └─ Return HTTP 200 OK


STEP 5: Query Logs in Grafana
═════════════════════════════
Grafana Logs tab
  │
  │ Query: {k8s.namespace="default", k8s.pod.name=~"homepage-.*"}
  │
  └─ VictoriaLogs datasource
     │
     ├─ HTTP POST to :9428/select/logsql
     ├─ Query: _msg:"error" AND service_name="homepage"
     │
     ├─ Victoria Logs processes:
     │  ├─ Full-text search on _msg
     │  ├─ Filter on service_name tag
     │  ├─ Return matching logs
     │
     └─ Display in Grafana timeline
        ├─ Color-coded by severity
        ├─ Searchable
        ├─ Linked to traces by trace_id in attributes
        └─ Live tail possible
```

---

## Metrics - Prometheus Remote Write

```
kube-state-metrics:8080 (Kubernetes metrics)
  │
  │ Exposes Prometheus format:
  │ # HELP kube_pod_info ...
  │ # TYPE kube_pod_info gauge
  │ kube_pod_info{namespace="observability",pod="otel-collector-..."} 1
  │ kube_pod_container_status_ready{...} 1
  │ kube_pod_status_phase{...} "Running"
  │
  ├─ Scraped by otel-collector (prometheus receiver)
  ├─ Scrape interval: 15s
  ├─ Scrape timeout: 10s
  │
  └─ Homepage (@vercel/otel) auto-instrumentation metrics:
     │
     ├─ http_server_request_duration_ms (histogram)
     │  ├─ labels: method, status, path
     │  └─ buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, ...]ms
     │
     ├─ http_client_request_duration_ms (histogram)
     │  └─ for outgoing HTTP calls
     │
     ├─ http_server_requests_total (counter)
     │  ├─ labels: method, status, path
     │  └─ value increases
     │
     ├─ http_server_active_requests (gauge)
     │  ├─ Current in-flight requests
     │  └─ updated per-request
     │
     └─ process_* metrics
        ├─ process_cpu_time_total
        ├─ process_resident_memory_bytes
        └─ ... standard prometheus process metrics


otel-collector prometheus receiver
  │
  ├─ Scrape http://kube-state-metrics:8080/metrics
  ├─ Parse Prometheus text format
  │
  └─ Convert to OTLP Metrics Model:
     │
     ├─ ResourceMetrics {
     │    resource: {
     │      attributes: {
     │        service.name: "homepage" (for app metrics)
     │        k8s.namespace: "observability" (for KSM)
     │      }
     │    },
     │    scope_metrics: [{
     │      scope: {...},
     │      metrics: [
     │        {
     │          name: "http_server_request_duration_ms",
     │          type: HISTOGRAM,
     │          unit: "ms",
     │          data: {
     │            dataPoints: [
     │              {
     │                attributes: { method: "GET", path: "/" },
     │                count: 150,
     │                sum: 15000,  # total ms
     │                bucket_counts: [10, 20, 50, ...],
     │                explicit_bounds: [10, 25, 50, ...],
     │                start_time_unix_nano: 1719412200000000000,
     │                time_unix_nano: 1719412215000000000  # 15s later
     │              }
     │            ]
     │          }
     │        },
     │        { ... more metrics }
     │      ]
     │    }]
     │  }
     │
     └─ Pass to batch processor


Batch processor
  │
  ├─ Accumulate metric data points
  ├─ Wait until: 1000 points OR 5s timeout
  │
  └─ Output as batched ResourceMetrics


Prometheus Remote Write exporter
  │
  ├─ Target: http://victoria-metrics:8428/api/v1/write
  ├─ Convert OTLP metrics to Prometheus remote write format
  │
  ├─ HTTP POST body:
  │  ├─ Protobuf encoded:
  │  │  ├─ timeseries: [
  │  │  │   {
  │  │  │     labels: [
  │  │  │       { name: "__name__", value: "http_server_request_duration_ms" },
  │  │  │       { name: "method", value: "GET" },
  │  │  │       { name: "path", value: "/" },
  │  │  │       { name: "instance", value: "homepage" }
  │  │  │     ],
  │  │  │     samples: [
  │  │  │       {
  │  │  │         value: 150.0,  # duration
  │  │  │         timestamp_ms: 1719412215000  # when recorded
  │  │  │       }
  │  │  │     ]
  │  │  │   },
  │  │  │   { ... more timeseries }
  │  │  │ ]
  │  │  │
  │  │  └─ Snappy compressed
  │  │
  │  └─ Headers:
  │     ├─ Content-Encoding: snappy
  │     ├─ Content-Type: application/x-protobuf
  │     ├─ X-Prometheus-Remote-Write-Version: 0.1.0
  │     └─ User-Agent: otelcol/...
  │
  └─ HTTP 200 OK (prometheus remote write protocol)


Victoria Metrics storage
  │
  ├─ Receives /api/v1/write POST
  ├─ Decompresses snappy body
  ├─ Parses Prometheus timeseries
  │
  ├─ For each sample:
  │  ├─ Extract: metric name, labels, value, timestamp
  │  ├─ Hash labels to create metric series ID
  │  ├─ Check if series exists (create if not)
  │  └─ Write data points to column storage
  │
  ├─ Compression:
  │  ├─ Consolidate into 1 block per hour
  │  ├─ LZ4 compress
  │  └─ Store in /vm-data
  │
  └─ Space saved:
     ├─ Deduplication of identical label sets
     ├─ Time-series compression
     ├─ Efficient range queries
     └─ ~10x compression over raw samples
```

---

## Grafana Dashboard Rendering Pipeline

```
Grafana Browser UI (user opens Dashboard)
  │
  ├─ Load dashboard configuration
  ├─ Parse panels (Traces, Metrics, Logs, Table, etc)
  │
  └─ For each panel:
     │
     ├─ Traces Panel
     │  ├─ Datasource: VictoriaTraces (Jaeger API)
     │  ├─ Query: { service: "homepage", status: "error" }
     │  │
     │  └─ HTTP GET /select/jaeger/api/traces
     │     ├─ Params: service=homepage&operation=...&...
     │     ├─ Response: Jaeger trace JSON
     │     └─ Render: trace timeline + waterfall
     │
     ├─ Metrics Panel (Graph)
     │  ├─ Datasource: VictoriaMetrics
     │  ├─ Query: rate(http_server_requests_total[5m])
     │  │
     │  └─ HTTP POST /api/v1/query_range
     │     ├─ Body: { query: "...", start: T1, end: T2, step: 30s }
     │     ├─ Response: timeseries points
     │     ├─ Transform: Prometheus QL → values
     │     └─ Render: line graph
     │
     ├─ Logs Panel
     │  ├─ Datasource: VictoriaLogs
     │  ├─ Query: { k8s.namespace: "default", level: "error" }
     │  │
     │  └─ HTTP POST /select/logsql
     │     ├─ Body: { query: "...", limit: 100 }
     │     ├─ Response: log entries list
     │     └─ Render: table + live tail
     │
     └─ Stats Panel
        ├─ Datasource: VictoriaMetrics
        ├─ Query: http_server_active_requests (current gauge)
        │
        └─ HTTP GET /api/v1/query
           ├─ Response: current value
           └─ Render: big number
```

