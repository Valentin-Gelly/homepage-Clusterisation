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

### 1. **Dépendances Ajoutées** (`package.json`)

```json
{
  "dependencies": {
    "@opentelemetry/api": "^1.9.1",
    "@opentelemetry/auto-instrumentations-node": "^0.73.0",
    "@opentelemetry/exporter-trace-otlp-http": "^0.215.0",
    "@opentelemetry/resources": "^2.7.0",
    "@opentelemetry/sdk-metrics": "^2.7.0",
    "@opentelemetry/sdk-node": "^0.215.0",
    "@opentelemetry/sdk-trace-node": "^2.7.0",
    "@opentelemetry/semantic-conventions": "^1.40.0",
    "@opentelemetry/winston-transport": "^0.25.0"
  }
}
```

**Notes**:
- Utilise **HTTP** (`exporter-trace-otlp-http`) plutôt que gRPC pour éviter les conflits
- `auto-instrumentations-node` active automatiquement l'instrumentation pour HTTP, DNS, etc.
- `winston-transport` optionnel pour logger via OpenTelemetry

### 2. **Nouveau Fichier: `src/instrumentation.js`**

```javascript
export async function register() {
  // Vérifie que c'est côté serveur Node.js (pas Edge Runtime, pas navigateur)
  if (typeof process === "undefined" || typeof process.env === "undefined") {
    return;
  }
  if (process.env.NEXT_RUNTIME === "edge" || typeof window !== "undefined") {
    return;
  }

  // Code d'initialisation masqué via Function() constructor
  // pour éviter l'analyse statique de webpack
  const initCode = `
    (async () => {
      try {
        const { NodeSDK } = require("@opentelemetry/sdk-node");
        // ... imports et initialisation ...
      } catch (error) {
        // Arrête silencieusement si OTel n'est pas disponible
      }
    })();
  `;

  new Function(initCode)();
}
```

**Pourquoi cette approche?**
- `Function()` constructor exécute le code comme string à l'exécution, pas à la compile-time
- Webpack ne voit jamais les imports gRPC dans l'AST (Abstract Syntax Tree) statique
- Les modules gRPC restent côté serveur seulement

---

## Configuration OpenTelemetry

### Variables d'Environnement

Le fichier `instrumentation.js` lit ces variables d'environnement:

| Variable | Valeur par défaut | Description |
|----------|-------------------|-------------|
| `OTEL_SERVICE_NAME` | `"homepage"` | Nom du service dans Grafana/Tempo |
| `NEXT_PUBLIC_VERSION` | `"unknown"` | Version de l'application (injectée au build) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `"http://otel-collector.observability.svc.cluster.local:4318"` | URL du collecteur OTLP (HTTP sur port 4318) |

### Exemple de Configuration Kubernetes

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

## Instrumentations Activées

Le fichier `instrumentation.js` active automatiquement les instrumentations suivantes:

| Instrumentation | État | Raison |
|-----------------|------|--------|
| `@opentelemetry/instrumentation-http` | ✅ Activée | Tracer les requêtes HTTP/HTTPS (appels proxy Grafana, Strava, etc.) |
| `@opentelemetry/instrumentation-dns` | ✅ Activée | Déboguer les problèmes réseau Kubernetes (DNS) |
| `@opentelemetry/instrumentation-fs` | ❌ Désactivée | Génère trop de spans pour les lectures de fichiers (config YAML, etc.) |

---

## Fichiers Modifiés/Créés

### Créés:
- `src/instrumentation.js` - Point d'entrée pour l'instrumentation OpenTelemetry

### Modifiés:
- `package.json` - Ajout des dépendances OpenTelemetry
- `next.config.js` - Reste inchangé (configuration webpack simplifiée)
- `.pnpmrc` - Configuration pnpm basique

### Supprimés (cleanup):
- `webpack-stubs/` - Répertoire temporaire de stubs webpack (non utilisé dans la solution finale)

---

## Traces Générées

### Types de Spans Capturés

1. **Requêtes HTTP Entrantes**
   - Pages Next.js
   - Routes API (`/api/*`)

2. **Requêtes HTTP Sortantes**
   - Appels proxy vers services externes (Grafana, Strava, Minecraft, etc.)
   - Appels vers APIs tierces

3. **Requêtes DNS**
   - Résolutions DNS (utiles pour déboguer les problèmes réseau k8s)

4. **Autres Instrumentations Auto**
   - Modules Node.js automatiquement instrumentés

### Ressources de Service

Chaque span inclut les métadonnées du service:
```
service.name = OTEL_SERVICE_NAME (default: "homepage")
service.version = NEXT_PUBLIC_VERSION (default: "unknown")
```

---

## Dépannage

### Le build échoue encore avec des erreurs gRPC

**Cause probable**: webpack analyste encore les imports gRPC
**Solution**: S'assurer que `instrumentation.js` n'a PAS d'imports directs (`import`/`require`) en haut du fichier. Tous les imports gRPC doivent être en string dans le `Function()` constructor.

### OpenTelemetry ne démarre pas en production

**Cause probable**: La variable d'environnement `OTEL_EXPORTER_OTLP_ENDPOINT` n'est pas configurée
**Solution**: Définir l'URL du collecteur OTLP, par exemple:
```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="http://otel-collector:4318"
```

### Trop de spans générées

**Cause probable**: Trop d'instrumentations activées
**Solution**: Modifier `src/instrumentation.js` pour désactiver les instrumentations non nécessaires:
```javascript
getNodeAutoInstrumentations({
  "@opentelemetry/instrumentation-fs": { enabled: false },
  "@opentelemetry/instrumentation-http": { enabled: true },
  // Ajouter d'autres configs ici
})
```

---

## Avantages de cette Approche

✅ **Compatible avec Webpack**: Les imports gRPC ne sont jamais visibles à la compile-time
✅ **Flexible**: Peut être désactivé en définissant `NEXT_RUNTIME=edge` ou en développement
✅ **Sans Breaking Changes**: N'affecte pas le comportement de l'application
✅ **Production-Ready**: Utilise les APIs officielles d'OpenTelemetry
✅ **Kubernetes-Native**: Parfait pour les déploiements k8s avec collectors OTLP

---

## Références

- [OpenTelemetry Node SDK](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/sdk-node)
- [OTLP HTTP Exporter](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/exporter-trace-otlp-http)
- [Next.js Instrumentation](https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation)
- [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/)

