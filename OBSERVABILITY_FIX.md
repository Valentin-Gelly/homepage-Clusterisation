# 🔧 Correction - Configuration Observabilité

**Problème Trouvé:** L'exporte des traces vers Victoria Traces utilisait le mauvais protocole et endpoint.

## 🐛 Ce Qui Était Cassé

```yaml
# ❌ AVANT (otel-collector.yaml)
otlphttp/vtraces:
  endpoint: "http://victoria-traces:8429/insert/opentelemetry"  # Port 8429 = UI admin, pas d'API d'insertion
  
traces:
  exporters: [otlphttp/vtraces]  # Utilise l'exporter HTTP cassé
```

**Pourquoi c'était cassé:**
- Victoria Traces expose un **recepteur gRPC OTLP natif** sur le port 4317
- Le port 8429 est juste pour l'interrogation (UI admin), pas pour insérer les traces
- L'endpoint `/insert/opentelemetry` n'existe probablement pas sur le port 8429

## ✅ Correction Appliquée

```yaml
# ✅ APRÈS (otel-collector.yaml)
otlpgrpc/vtraces:
  endpoint: "victoria-traces:4317"  # Receptor gRPC natif de Victoria Traces
  tls:
    insecure: true

traces:
  exporters: [otlpgrpc/vtraces]  # Utilise l'exporter gRPC correct
```

---

## 🚀 Redéployer

### 1. Mettre à Jour la Stack Observabilité

```bash
helm upgrade observability ./observability-stack \
  --namespace observability
```

Vérifier que les pods redémarrent:
```bash
kubectl get pods -n observability -w  # -w = watch (Ctrl+C pour arrêter)
```

Attendre que tous les pods soient **Running**.

### 2. Redémarrer le Pod Homepage

```bash
kubectl rollout restart deployment/homepage
```

Vérifier:
```bash
kubectl get pods | grep homepage  # Doit montrer un pod en RUNNING
kubectl logs -f deployment/homepage | grep -i "otel\|telemetry"
```

### 3. Générer du Trafic

```bash
# Port forward vers homepage
kubectl port-forward svc/homepage 3000:3000 &

# Générer du trafic
curl http://localhost:3000/
curl http://localhost:3000/api/services
sleep 3
```

### 4. Vérifier les Traces dans Grafana

```bash
# Port forward vers Grafana
kubectl port-forward -n observability svc/grafana 3000:3000 &

# Ouvrir http://localhost:3000
# Aller à: Explore → Data Source: Tempo → Service Name: "homepage"
```

Les traces devraient maintenant **apparaître** ✅

---

## 🔍 Diagnostic en Cas de Problème Persistant

Si les traces ne s'affichent toujours pas:

### Check 1: Logs du Collecteur

```bash
kubectl logs -n observability deployment/otel-collector | tail -50

# Cherchez des messages comme:
# - "received spans" (OK)
# - Erreurs de connexion (problème de réseau)
```

### Check 2: Vérifier que Victoria Traces Reçoit

```bash
kubectl logs -n observability deployment/victoria-traces | tail -50

# Cherchez des messages comme:
# - Traces reçues
# - Aucune erreur
```

### Check 3: Utiliser le Script de Diagnostic

```bash
bash diagnose-observability.sh

# Cela affiche:
# 1. État des pods
# 2. Services et endpoints
# 3. Logs du collecteur
# 4. Logs de Victoria
# 5. Vérification de connectivité
```

---

## 📊 Architecture Corrigée

```
Homepage Pod
  │
  └──→ OTLP HTTP (port 4318)
       │
       OTel Collector
       │
       ├──→ gRPC OTLP (port 4317) ─→ Victoria Traces ✅ (corrigé)
       ├──→ HTTP RemoteWrite ─────→ Victoria Metrics ✅
       └──→ HTTP OTLP ───────────→ Victoria Logs ✅
       │
       └──→ Grafana Datasources (Tempo, Prometheus, Loki)
```

---

**Status:** ✅ Configuration Corrigée  
**Prochaine Étape:** Redéployer et tester

