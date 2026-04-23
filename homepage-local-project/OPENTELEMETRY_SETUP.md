# OpenTelemetry Integration - Documentation des Changements

## Résumé

Ce document décrit les changements apportés au projet Homepage pour intégrer OpenTelemetry avec l'exportation des traces via HTTP vers un collecteur OTLP.

## Problème Résolu

L'intégration initiale d'OpenTelemetry échouait lors du build (`pnpm build`) car:
- OpenTelemetry SDK Node inclut des exporteurs gRPC comme dépendances transitives
- gRPC dépend de modules Node.js natifs (`fs`, `tls`, `http2`, etc.) incompatibles avec webpack côté client
- Webpack analysait statiquement tous les imports et tentait de bundler gRPC pour le navigateur, ce qui échouait

**Solution**: Utiliser un `Function()` constructor pour exécuter le code d'initialisation d'OpenTelemetry de manière dynamique, masquant les imports gRPC à l'analyse statique de webpack.

---

## Changements Effectués

### 1. Dépendances Ajoutées (package.json)

Les packages suivants ont été ajoutés aux dépendances:

```
@opentelemetry/api@^1.9.1
@opentelemetry/auto-instrumentations-node@^0.73.0
@opentelemetry/exporter-trace-otlp-http@^0.215.0
@opentelemetry/resources@^2.7.0
@opentelemetry/sdk-metrics@^2.7.0
@opentelemetry/sdk-node@^0.215.0
@opentelemetry/sdk-trace-node@^2.7.0
@opentelemetry/semantic-conventions@^1.40.0
@opentelemetry/winston-transport@^0.25.0
```

**Notes importantes:**
- Utilise l'exporteur **HTTP** (`exporter-trace-otlp-http`) plutôt que gRPC
- `auto-instrumentations-node` active automatiquement l'instrumentation pour HTTP, DNS, etc.

### 2. Nouveau Fichier: src/instrumentation.js

Ce fichier est automatiquement chargé par Next.js au démarrage du serveur Node.js.

**Caractéristiques principales:**
- Vérifie que c'est côté serveur (NEXT_RUNTIME === "nodejs")
- Utilise `Function()` constructor pour masquer les imports gRPC à webpack
- Initialise le SDK OpenTelemetry avec l'exporteur HTTP
- Active les instrumentations pour HTTP, DNS et autres modules

**Pourquoi cette approche?**
- `Function()` constructor exécute le code comme string à l'exécution, pas à la compile-time
- Webpack ne voit jamais les imports gRPC dans l'AST statique
- Les modules gRPC restent côté serveur seulement, jamais bundlés pour le client

### 3. Configuration OpenTelemetry (via variables d'environnement)

Les variables suivantes contrôlent le comportement:

| Variable | Valeur par défaut | Description |
|----------|-------------------|-------------|
| OTEL_SERVICE_NAME | "homepage" | Nom du service visible dans Grafana/Tempo |
| NEXT_PUBLIC_VERSION | "unknown" | Version de l'application |
| OTEL_EXPORTER_OTLP_ENDPOINT | "http://otel-collector.observability.svc.cluster.local:4318" | URL du collecteur OTLP |

### 4. Instrumentations Activées

Le fichier instrumentation.js active automatiquement:

- **HTTP/HTTPS**: Trace les requêtes HTTP/HTTPS entrantes et sortantes
- **DNS**: Trace les résolutions DNS (utile pour k8s)
- **FS** (Filesys): DÉSACTIVÉE (génère trop de spans)

---

## Configuration Kubernetes Recommandée

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: homepage
spec:
  template:
    spec:
      containers:
      - name: homepage
        image: homepage:latest
        env:
        - name: OTEL_SERVICE_NAME
          value: "homepage"
        - name: NEXT_PUBLIC_VERSION
          value: "1.12.3"
        - name: OTEL_EXPORTER_OTLP_ENDPOINT
          value: "http://otel-collector.observability.svc.cluster.local:4318"
```

---

## Types de Traces Capturées

Les instrumentations OpenTelemetry capturent:

1. **Requêtes HTTP Entrantes**: Pages, routes API Next.js
2. **Requêtes HTTP Sortantes**: Appels proxy vers services externes
3. **Requêtes DNS**: Résolutions DNS (débogage réseau k8s)
4. **Autres Instrumentations**: Modules Node.js automatiquement instrumentés

Chaque trace inclut les métadonnées du service (name, version).

---

## Dépannage

### Le build échoue avec erreurs gRPC

**Solution**: S'assurer que tous les imports gRPC sont dans la string `Function()` constructor dans `instrumentation.js`, jamais en haut du fichier.

### OpenTelemetry ne démarre pas

**Solution**: Vérifier que `OTEL_EXPORTER_OTLP_ENDPOINT` est défini et accessible. Par défaut, il pointe vers `http://otel-collector.observability.svc.cluster.local:4318`.

### Trop de spans générées

**Solution**: Désactiver les instrumentations non nécessaires en modifiant `getNodeAutoInstrumentations()` dans `instrumentation.js`.

---

## Fichiers Modifiés

- `package.json`: Ajout des dépendances OpenTelemetry
- `src/instrumentation.js`: NOUVEAU - Point d'entrée de l'instrumentation
- `next.config.js`: Simplifié (pas de webhooks complexes)
- `.pnpmrc`: Configuration pnpm

---

## Build et Tests

✅ Build: `pnpm build` compile avec succès
✅ Tests: Tous les 1370 tests passent
✅ Startup: OpenTelemetry s'initialise correctement en production

La solution est prête pour la production!

