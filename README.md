# Homepage — Dashboard Kubernetes

Application [Homepage](https://gethomepage.dev/) déployée sur Kubernetes, avec instrumentation OpenTelemetry et une stack d'observabilité complète (métriques, logs, traces).

---

## 🏗️ Build de l'image locale

Le projet contient le code source Next.js avec l'instrumentation OpenTelemetry. Il faut donc builder une image custom avant de déployer.

```bash
cd homepage-local-project/

# Build de l'image depuis le code source (inclut l'instrumentation OTel)
docker build -t homepage:local .

# Import direct dans le cluster k3d — aucun registry externe requis
k3d image import homepage:local -c homepage
```

> **Note :** `imagePullPolicy: Never` est configuré dans le Deployment, Kubernetes utilisera donc l'image importée sans essayer de la télécharger.

---

## 🚀 Lancer l'application Kubernetes

```bash
kubectl apply -f configmaps/
kubectl apply -f kubernetes/
```

Port forwarding pour accéder à l'application :
```bash
kubectl port-forward -n default svc/homepage 5000:3000
```

---

## 📡 OpenTelemetry — Traces

L'application génère automatiquement des traces OpenTelemetry grâce au fichier `src/instrumentation.js` (hook natif Next.js).

**Ce qui est tracé :**
- Requêtes HTTP **entrantes** (pages & routes API Next.js)
- Requêtes HTTP **sortantes** du proxy vers les services (Grafana, Strava, Minecraft, etc.)
- Résolutions DNS

Les traces sont envoyées à l'OTel Collector via les variables d'environnement configurées dans le Deployment :
| Variable | Valeur |
|---|---|
| `OTEL_SERVICE_NAME` | `homepage` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://otel-collector.observability.svc.cluster.local:4318` |

---

## 📊 Stack d'Observabilité

### Premier lancement

```bash
helm install observability ./observability-stack --namespace observability --create-namespace
```

### Mises à jour suivantes

```bash
helm upgrade observability ./observability-stack --namespace observability --create-namespace
```

### Port forwarding des services d'observabilité

```bash
# Grafana — dashboards & visualisation
kubectl port-forward -n observability svc/grafana 4000:4000

# OTel Collector — réception des traces/logs/métriques
kubectl port-forward -n observability svc/otel-collector 4318:4318

# VictoriaMetrics — métriques
kubectl port-forward -n observability svc/victoria-metrics 8428:8428

# VictoriaLogs — logs
kubectl port-forward -n observability svc/victoria-logs 9428:9428

# VictoriaTraces — traces (OTLP gRPC sur :4317, HTTP admin sur :8429)
kubectl port-forward -n observability svc/victoria-traces 8429:8429
```

### Vérifier les pods de la stack

```bash
kubectl get pods -n observability
```

---

## 🔧 Commandes utiles

```bash
# Voir tous les pods de l'application
kubectl get pods -n default

# Voir tous les pods de l'observabilité
kubectl get pods -n observability

# Supprimer un service spécifique
kubectl delete --namespace=observability service grafana

# Tout supprimer (observabilité)
kubectl delete --all deployments --namespace=observability
```

---

## 🛠️ Développement local avec Tilt (hot-reload)

k3d + Tilt permettent un workflow de développement itératif avec live update, sans registry externe :

```bash
cd k3d
./k3d-up.sh   # Crée le cluster k3d avec registry local intégré
tilt up        # Build automatique + déploiement + hot-reload
```

> Le Tiltfile utilise `Dockerfile-tilt` (mode dev, `next dev`) et un registry local k3d sur `k3d-registry.localhost:55000`.
