# Changeset: Intégration OpenTelemetry
## Résumé Exécutif
Intégration réussie d'OpenTelemetry pour la traçage distribué. Les traces sont exportées en HTTP vers un collecteur OTLP. Aucun breaking change, totalement optionnel en développement.
## Fichiers Créés
### 1. `src/instrumentation.js` (74 lignes)
- **Nouveau fichier** chargé automatiquement par Next.js
- Initialise le SDK OpenTelemetry côté serveur
- Utilise `Function()` constructor pour masquer les imports gRPC à webpack
- Permet la configuration via variables d'environnement
- Instrumentations activées: HTTP, DNS
**Clé de la solution:** `Function()` constructor empêche webpack d'analyser statiquement les imports gRPC.
### 2. `OPENTELEMETRY_SETUP.md` (150+ lignes)
- Documentation complète de l'intégration
- Guide de configuration
- Troubleshooting
## Fichiers Modifiés
### 1. `package.json`
**Changement:** Ajout de 9 dépendances OpenTelemetry
```diff
+ "@opentelemetry/api": "^1.9.1",
+ "@opentelemetry/auto-instrumentations-node": "^0.73.0",
+ "@opentelemetry/exporter-trace-otlp-http": "^0.215.0",
+ "@opentelemetry/resources": "^2.7.0",
+ "@opentelemetry/sdk-metrics": "^2.7.0",
+ "@opentelemetry/sdk-node": "^0.215.0",
+ "@opentelemetry/sdk-trace-node": "^2.7.0",
+ "@opentelemetry/semantic-conventions": "^1.40.0",
+ "@opentelemetry/winston-transport": "^0.25.0"
```
### 2. `next.config.js`
**Changement:** Simplifié - aucune configuration webpack complexe requise
Version précédente avait:
- Webpack externals complexes
- Rules d'ignorance des fichiers
- NormalModuleReplacementPlugin
**Nouvelle version:** Config standard, 18 lignes
### 3. `.pnpmrc`
**Changement:** Nettoyé, configuration minimale
```
auto-install-peers=true
```
## Résultat Final
### Build Status
✅ `pnpm build` compile avec succès (26.7s)
- Aucune erreur de module non trouvé
- Aucune erreur webpack gRPC
### Tests
✅ Tous les 1370 tests passent
- Suite de tests complète
### Déploiement
✅ Prêt pour la production
- OpenTelemetry s'initialise automatiquement
- Exportation HTTP vers OTLP collector
- Configurable via variables d'environnement
## Variables d'Environnement Disponibles
| Variable | Défaut | Exemple |
|----------|--------|---------|
| OTEL_SERVICE_NAME | "homepage" | "my-homepage" |
| NEXT_PUBLIC_VERSION | "unknown" | "1.12.3" |
| OTEL_EXPORTER_OTLP_ENDPOINT | "http://otel-collector.observability.svc.cluster.local:4318" | "http://tempo:4318" |
## Point Technique: Pourquoi Function() ?
**Problème:** Webpack analyse statiquement les imports/requires et tente de bundler tous les modules, incluant gRPC (incompatible client).
**Solution:** `Function()` constructor exécute le code comme string à runtime:
```javascript
const initCode = `require("@opentelemetry/sdk-node")...`;
new Function(initCode)(); // Webpack ne voit jamais le require
```
**Résultat:** gRPC reste côté serveur, webpack ne le voit jamais au build.
## Comparaison: Avant vs Après
| Aspect | Avant | Après |
|--------|-------|-------|
| Build | ❌ Échoue (gRPC modules not found) | ✅ Réussit en 26.7s |
| Tests | ✅ 1370 tests | ✅ 1370 tests (inchangé) |
| Config | N/A | ✅ Dynamique via env vars |
| Traces | Non | ✅ HTTP/OTLP à Grafana |
| Complexité | N/A | ✅ Minimale (un fichier) |
## Pour Démarrer
```bash
# 1. Installer les dépendances
pnpm install
# 2. Configurer l'endpoint du collecteur (optionnel)
export OTEL_EXPORTER_OTLP_ENDPOINT="http://otel-collector:4318"
# 3. Builder
pnpm build
# 4. Démarrer
pnpm start
```
Les traces seront automatiquement exportées vers le collecteur OTLP.
---
**Date:** 2026-04-23
**Status:** ✅ Prêt pour production
