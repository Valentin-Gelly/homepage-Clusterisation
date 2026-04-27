# Homepage — Dashboard Kubernetes

Application [Homepage](https://gethomepage.dev/) déployée sur Kubernetes avec **OpenTelemetry intégré** et une **stack d'observabilité complète** (traces, metrics, logs).

**Plateforme testée:** Docker Desktop Kubernetes

---

## 🏗️ Build de l'image locale

Le projet contient le code source Next.js avec l'instrumentation OpenTelemetry (`@vercel/otel`).

```bash
cd homepage-local-project/

# Build l'image depuis le code source
# Ceci compile Next.js et intègre l'instrumentation OTel
docker build -t homepage:local .
```

**Avec Docker Desktop Kubernetes:** L'image est automatiquement disponible dans le cluster (pas d'import requis).

> **Note :** `imagePullPolicy: Never` est configuré dans le Deployment. Kubernetes utilisera l'image locale sans essayer de la télécharger d'un registry.

---

## 🚀 Déployer l'Application

### 1. Stack d'Observabilité (à faire en premier)

```bash
kubectl create namespace observability

# Depuis la racine du workspace
helm install observability ./observability-stack \
  --namespace observability \
  --create-namespace
```

Vérifier que tout démarre:
```bash
kubectl get pods -n observability
# Doit afficher: otel-collector, victoria-traces, victoria-metrics, victoria-logs, grafana
```

### 2. Application Homepage

```bash
# Déployer les ConfigMaps
kubectl apply -f configmaps/

# Déployer l'application
kubectl apply -f kubernetes/
```

Vérifier que le pod démarre:
```bash
kubectl get pods -n default | grep homepage
kubectl logs deployment/homepage | grep OpenTelemetry
# Doit afficher: "SDK initialized successfully"
```

### 3. Port Forwarding pour Accéder à l'App

```bash
kubectl port-forward -n default svc/homepage 3000:3000
```

Puis: **http://localhost:3000**

---

## 📡 OpenTelemetry — Configuration

### Qu'est-ce qui est Tracé?

L'application génère automatiquement des traces via `@vercel/otel` (hook natif Next.js):

- ✅ Requêtes HTTP **entrantes** (pages, routes API)
- ✅ Requêtes HTTP **sortantes** (proxy vers Grafana, Strava, Docker, etc.)
- ✅ Résolutions DNS
- ✅ Metrics (latence, débit, erreurs)
- ✅ Logs applicatifs

### Configuration

Les traces sont envoyées au collecteur OTLP via le pod `homepage`:

| Variable | Valeur |
|---|---|
| `OTEL_SERVICE_NAME` | `homepage` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://otel-collector.observability.svc.cluster.local:4318` |
| `NEXT_PUBLIC_VERSION` | `1.12.3` |
| `OTEL_LOG_LEVEL` | `info` |

Ces variables sont définies dans `kubernetes/homepage-deployment.yaml`.

### Vérifier la Connectivité

```bash
# Depuis le pod homepage
kubectl exec -it deployment/homepage -- sh

# Test DNS (doit résoudre une IP)
nslookup otel-collector.observability.svc.cluster.local

# Test HTTP (doit répondre 405 ou 415)
curl http://otel-collector.observability.svc.cluster.local:4318/v1/traces
```

---

## 📊 Stack d'Observabilité

### Architecture

- **OTel Collector** : Reçoit traces/metrics/logs via HTTP (port 4318) et gRPC (port 4317)
- **Victoria Traces** : Stocke les traces (port 8429)
- **Victoria Metrics** : Stocke les métriques (port 8428)
- **Victoria Logs** : Stocke les logs (port 9428)
- **Grafana** : Visualise tout (port 3000)

### Accéder aux Services d'Observabilité

```bash
# Grafana — dashboards & visualisation
kubectl port-forward -n observability svc/grafana 3000:3000
# http://localhost:3000

# OTel Collector — réception des traces/logs/metrics
kubectl port-forward -n observability svc/otel-collector 4318:4318

# Victoria Traces — requête des traces
kubectl port-forward -n observability svc/victoria-traces 8429:8429

# Victoria Metrics — requête des metrics
kubectl port-forward -n observability svc/victoria-metrics 8428:8428

# Victoria Logs — requête des logs
kubectl port-forward -n observability svc/victoria-logs 9428:9428
```

### Voir les Traces dans Grafana

1. Ouvrir **http://localhost:3000** (Grafana)
2. Aller à **Explore** (left sidebar)
3. Choisir **Data Source: Tempo** (traces)
4. Chercher **Service Name: "homepage"**
5. Voir vos traces ✅

---

## 🔄 Mises à Jour

### Mettre à Jour la Stack d'Observabilité

```bash
helm upgrade observability ./observability-stack \
  --namespace observability
```

### Redéployer l'Application

```bash
# Option 1: Rebuild et restart
docker build -t homepage:local .
kubectl rollout restart deployment/homepage -n default

# Option 2: Supprimer et redéployer
kubectl delete deployment homepage -n default
kubectl apply -f kubernetes/
```

---

## 🔧 Commandes Utiles

```bash
# Voir les pods
kubectl get pods -n default
kubectl get pods -n observability

# Voir les services
kubectl get svc -n default
kubectl get svc -n observability

# Logs en temps réel
kubectl logs -f deployment/homepage
kubectl logs -f -n observability deployment/otel-collector

# Entrer dans le pod
kubectl exec -it deployment/homepage -- sh
kubectl exec -it -n observability deployment/otel-collector -- sh

# Supprimer des ressources
kubectl delete deployment homepage -n default
kubectl delete namespace observability
```

---

## 🆘 Dépannage

### Les pods ne démarrent pas

```bash
kubectl logs deployment/homepage
kubectl logs -n observability deployment/otel-collector
```

### Pas de traces dans Grafana

1. Vérifier que le pod homepage démarre: `kubectl logs deployment/homepage | grep OpenTelemetry`
2. Vérifier la connectivité: `kubectl exec deployment/homepage -- curl http://otel-collector.observability.svc.cluster.local:4318/v1/traces`
3. Générer du trafic: `curl http://localhost:3000/`
4. Attendre quelques secondes et rafraîchir Grafana

### Port 3000 déjà utilisé

```bash
# Si le port 3000 est occupé, utiliser un autre:
kubectl port-forward -n observability svc/grafana 4000:3000
# Puis: http://localhost:4000
```

---

## 📚 Documentation Supplémentaire

- **`QUICKSTART_DOCKER_DESKTOP.md`** — Démarrage rapide (5 commandes)
- **`BUILD_DEPLOY_VERIFY.md`** — Guide détaillé avec vérifications
- **`KUBERNETES_OTEL_ANALYSIS.md`** — Analyse technique de la configuration
- **`FINAL_SUMMARY.md`** — Résumé complet

