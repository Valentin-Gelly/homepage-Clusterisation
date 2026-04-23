# Instrumentation OpenTelemetry — Traces Homepage

> Document de synthèse des changements apportés au projet, des choix techniques effectués, et des étapes de vérification recommandées.

---

## 📋 Ce qui a été fait

### 1. Correction du port VictoriaTraces dans l'OTel Collector

**Fichier :** `observability-stack/templates/otel-collector.yaml`

```yaml
# Avant (incorrect)
otlp/vtraces:
  endpoint: victoria-traces:8429   # port HTTP admin — ne parle pas OTLP gRPC

# Après (corrigé)
otlp/vtraces:
  endpoint: victoria-traces:4317   # port OTLP gRPC — correct
```

VictoriaTraces expose **deux ports distincts** :
- `:4317` → récepteur OTLP gRPC (là où l'OTel Collector doit envoyer les traces)
- `:8429` → interface HTTP d'administration et de requêtage

Sans cette correction, les traces auraient été rejetées par VictoriaTraces avec une erreur de protocole.

---

### 2. Installation des packages OpenTelemetry

```bash
pnpm add @opentelemetry/sdk-node \
         @opentelemetry/auto-instrumentations-node \
         @opentelemetry/exporter-trace-otlp-http \
         @opentelemetry/resources \
         @opentelemetry/semantic-conventions
```

| Package | Rôle |
|---|---|
| `sdk-node` | SDK principal Node.js — orchestration du cycle de vie OTel |
| `auto-instrumentations-node` | Patch automatique de `http`, `https`, `dns`, `net`… |
| `exporter-trace-otlp-http` | Envoi des spans vers l'OTel Collector via OTLP/HTTP |
| `resources` | Déclaration des attributs de ressource (nom du service, version) |
| `semantic-conventions` | Constantes standardisées OTel (noms d'attributs) |

---

### 3. Création du fichier `src/instrumentation.js`

Next.js 15+ charge automatiquement ce fichier au démarrage du processus Node.js serveur, **avant** le premier rendu de page. C'est le point d'entrée officiel recommandé pour toute initialisation serveur (OTel, Sentry, etc.).

```
src/
├── instrumentation.js   ← nouveau
├── pages/
├── utils/
└── ...
```

**Ce qui est instrumenté automatiquement :**

| Instrumentation | Traces générées |
|---|---|
| `http` / `https` | Toutes les requêtes **entrantes** (pages, API routes) et **sortantes** (appels proxy vers Grafana, Strava, Mastodon, Minecraft…) |
| `dns` | Résolutions DNS — utile pour diagnostiquer les latences réseau dans Kubernetes |
| `fs` | ❌ **Désactivé** — génère des dizaines de spans par requête (lectures de config YAML) pour un signal sans valeur |

---

### 4. Mise à jour du Deployment Kubernetes

**Fichier :** `kubernetes/homepage-deployment.yaml`

Ajout des variables d'environnement OTel et passage à une image buildée localement :

```yaml
image: "homepage:local"
imagePullPolicy: Never      # utilise l'image k3d importée, sans téléchargement

env:
  - name: OTEL_SERVICE_NAME
    value: "homepage"
  - name: OTEL_EXPORTER_OTLP_ENDPOINT
    value: "http://otel-collector.observability.svc.cluster.local:4318"
  - name: OTEL_LOG_LEVEL
    value: "warn"
```

---

### 5. Mise à jour du README

Le `README.md` a été réécrit pour documenter :
- Le workflow de build local (`docker build` + `k3d image import`)
- L'instrumentation OTel et ce qu'elle trace
- Le workflow Tilt pour le développement itératif

---

## 💡 Pourquoi cette approche est meilleure

### Hook `instrumentation.js` plutôt qu'un wrapper manuel

Next.js 15+ fournit un hook officiel chargé **une seule fois** avant le démarrage du serveur. L'alternative (modifier `server.js` ou patcher le `_app.jsx`) est fragile, non documentée, et écrasée à chaque `next build`. Le hook survit aux mises à jour de Next.js.

### Auto-instrumentation plutôt qu'instrumentation manuelle

Instrumenter manuellement chaque appel `fetch` ou `httpProxy` aurait représenté des dizaines de modifications dans le code métier, couplant la télémétrie à la logique applicative. L'auto-instrumentation patche les modules Node.js natifs (`http`, `https`) au démarrage : **zéro modification du code existant**, couverture complète des appels réseau.

### OTLP HTTP plutôt que gRPC pour l'export de traces

L'OTel Collector écoute sur le port `4318` (HTTP) depuis le pod Homepage. HTTP est plus simple à débugger (`curl`able), traverse mieux les proxies, et ne nécessite pas de configuration TLS supplémentaire en environnement interne. La communication entre l'OTel Collector et VictoriaTraces utilise gRPC (port `4317`) car c'est une communication interne cluster-to-cluster où gRPC est plus efficace.

### `imagePullPolicy: Never` + `k3d image import`

Évite de dépendre d'un registry externe (Docker Hub, GHCR, ECR…) pour les itérations locales. L'image est importée directement dans le runtime containerd du cluster k3d, ce qui est plus rapide et fonctionne hors connexion.

---

## ✅ Comment vérifier que tout fonctionne

### Étape 1 — Build et déploiement

```bash
# Builder l'image
docker build -t homepage:local .

# Importer dans k3d
k3d image import homepage:local -c homepage

# Déployer
kubectl apply -f configmaps/
kubectl apply -f kubernetes/
helm upgrade --install observability ./observability-stack \
  --namespace observability --create-namespace
```

### Étape 2 — Vérifier que les pods démarrent

```bash
kubectl get pods -n default
# → homepage-XXXXX   2/2   Running   (2 containers : homepage + log-shipper)

kubectl get pods -n observability
# → otel-collector-XXXXX     1/1   Running
# → victoria-traces-XXXXX    1/1   Running
# → victoria-metrics-XXXXX   1/1   Running
# → victoria-logs-XXXXX      1/1   Running
# → grafana-XXXXX            1/1   Running
```

> Le pod homepage doit afficher **2/2** (container `homepage` + sidecar `log-shipper`).

### Étape 3 — Vérifier que l'OTel Collector reçoit des données

```bash
kubectl logs -n observability deploy/otel-collector --follow
```

Après avoir visité `http://localhost:5000` (port-forward), vous devez voir des lignes du type :

```
2026-04-23T... info  TracesExporter  {"kind": "exporter", "data_type": "traces", "name": "otlp/vtraces", "resource spans": 1, "spans": 5}
```

### Étape 4 — Vérifier que les traces arrivent dans VictoriaTraces

```bash
kubectl port-forward -n observability svc/victoria-traces 8429:8429
```

Puis interroger l'API HTTP de VictoriaTraces :

```bash
curl "http://localhost:8429/select/0/traces" | head -50
# ou
curl "http://localhost:8429/api/v1/query?query=select_traces"
```

Vérification rapide que le service répond :

```bash
curl http://localhost:8429/-/ready
# → OK
```

### Étape 5 — Vérifier les traces dans Grafana

```bash
kubectl port-forward -n observability svc/grafana 4000:4000
```

1. Ouvrir `http://localhost:4000` (admin / admin)
2. Aller dans **Connections → Data Sources**
3. Vérifier qu'une source **VictoriaTraces / Tempo** est configurée pointant vers `http://victoria-traces:8429`
4. Aller dans **Explore**, sélectionner la source de traces
5. Chercher le service `homepage` — les spans HTTP doivent apparaître

### Étape 6 — Générer du trafic de test

Pour obtenir des traces représentatives, rafraîchir la page Homepage plusieurs fois :

```bash
kubectl port-forward -n default svc/homepage 5000:3000 &

# Générer quelques requêtes
for i in $(seq 1 10); do curl -s http://localhost:5000 > /dev/null; sleep 1; done
```

Les spans suivants doivent apparaître dans Grafana :
- `GET /` — rendu de la page principale
- `GET /api/services/proxy` — appels aux widgets (Grafana, Strava, etc.)
- `GET /api/widgets/proxy` — appels aux widgets système

---

## 🐛 Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| Aucune trace dans VictoriaTraces | `instrumentation.js` non chargé | Vérifier `NEXT_RUNTIME=nodejs` dans les logs du pod |
| Erreur `connection refused` dans l'OTel Collector | Pod VictoriaTraces non démarré | `kubectl get pods -n observability` |
| `imagePullBackOff` sur le pod homepage | Image `homepage:local` non importée | `k3d image import homepage:local -c homepage` |
| Traces reçues mais pas visibles dans Grafana | Datasource non configurée | Ajouter manuellement la datasource VictoriaTraces dans Grafana |
| Trop de spans `fs` dans les traces | `instrumentation-fs` réactivé | S'assurer que `enabled: false` est bien présent dans `instrumentation.js` |

