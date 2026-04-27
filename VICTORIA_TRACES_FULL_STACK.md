# ✅ Correction - Victoria Traces + Jaeger Query + Grafana

**Problème:** Grafana (datasource Tempo) ne peut pas interroger Victoria Traces (API incompatible)

## 🔧 Solution

Ajouter **Jaeger Query** comme intermédiaire:

```
Grafana (requête HTTP) 
    ↓
Jaeger Query (API compatible)
    ↓
Victoria Traces (gRPC)
```

---

## 🚀 Déployer

### 1. Mettre à jour la stack observabilité

```bash
helm upgrade observability ./observability-stack \
  --namespace observability
```

Cela va:
- ✅ Dépasser `jaeger-query.yaml` pour déployer Jaeger Query
- ✅ Mettre à jour la configmap Grafana avec la datasource Jaeger
- ✅ OTel Collector continue à envoyer vers Victoria Traces (inchangé)

### 2. Vérifier que tout démarre

```bash
kubectl get pods -n observability -w
# Attendre que jaeger-query soit Running
```

### 3. Redémarrer Grafana pour charger la nouvelle datasource

```bash
kubectl rollout restart deployment/grafana -n observability
```

### 4. Tester

```bash
# Port forward vers Grafana
kubectl port-forward -n observability svc/grafana 3000:3000 &

# Ouvrir http://localhost:3000
# Aller à: Explore → Data Source: "Jaeger" → Service Name: "homepage"

# Cliquer sur une trace pour voir les détails
```

---

## 📊 Architecture Finale

```
┌─────────────────────────┐
│ Homepage              │
│ @vercel/otel          │
└────────────┬───────────┘
             │ OTLP HTTP
             ↓
┌─────────────────────────┐
│ OTel Collector        │
│ :4318 (HTTP)          │
└────────────┬───────────┘
             │ gRPC OTLP
             ↓
┌─────────────────────────┐
│ Victoria Traces       │
│ :4317 (gRPC receiver) │
│ :8429 (UI HTTP)       │
└────────────┬───────────┘
             │ gRPC Query
             ↓
┌─────────────────────────┐
│ Jaeger Query          │
│ :16686 (HTTP API)     │
└────────────┬───────────┘
             │ HTTP API
             ↓
┌─────────────────────────┐
│ Grafana               │
│ Datasource: Jaeger    │
└─────────────────────────┘
```

---

## 📝 Fichiers Modifiés

- **`otel-collector.yaml`** - Envoie vers Victoria Traces (inchangé)
- **`grafana-datasources.yaml`** - Ajoute datasource Jaeger
- **`jaeger-query.yaml`** (nouveau) - Service Jaeger Query

---

## ✅ Vérification

Après le déploiement:

```bash
# Jaeger Query démarre?
kubectl get pods -n observability | grep jaeger-query

# Jaeger Query peut interroger Victoria Traces?
kubectl logs -n observability deployment/jaeger-query | head -30

# Grafana voit la datasource Jaeger?
# Grafana → Configuration → Datasources → "Jaeger"
```

---

**Status:** Architecture maintenant compatible avec Victoria Traces ✅

