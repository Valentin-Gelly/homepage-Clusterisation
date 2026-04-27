# Homepage-Clusterisation : Clusterisation d'une application homepage.dev avec OpenTelemetry, VictoriaLogs, VictoriaMetrics, VictoriaTraces et Grafana

## Installation (premier lancement)

### Étape 1 : build de l'application

```bash
docker build --no-cache -t homepage:otel .
```

### Étape 2 : lancement de l'application dans un cluster k3d

Créer un cluster k3d :
```bash
k3d cluster create <nom-du-cluster>
```

Lister les clusters existants :
```bash
k3d cluster list
```

Importer l'image dans le cluster :
```bash
k3d image import homepage:otel -c <nom-du-cluster>
```

### Étape 3 : déploiement de l'application 

```bash
helm install homepage ./homepage --namespace homepage --create-namespace
```

Vérifications de l'état des pods :
```bash
kubectl get pods -n homepage -w
```

### Étape 4 : déploiement de la stack d'observabilité
```bash
helm install observability ./observability-stack --namespace observability --create-namespace
```

Vérifications de l'état des pods :
```bash
kubectl get pods -n observability -w
```

## Utilisation

### Accéder à l'application homepage.dev
Port forwarding pour accéder à l'application :
```bash
kubectl port-forward -n homepage svc/homepage 3000:3000
```

### Accéder à l'interface Grafana
Port forwarding pour accéder à Grafana :
```bash
kubectl port-forward -n observability svc/grafana 4000:4000
```

### Exposer le service VictoriaLogs
```bash
kubectl port-forward -n observability svc/victoria-logs 9428:9428
```

### Exposer le service VictoriaMetrics
```bash
kubectl port-forward -n observability svc/victoria-metrics 8428:8428
```

### Exposer le service VictoriaTraces
```bash
kubectl port-forward -n observability svc/victoria-traces 8429:8429
```

### Exposer le service OTEL-Collector
```bash
kubectl port-forward -n observability svc/otel-collector 4318:4318
```

## Vérifications des données

Verifier les logs et traces de `homepage`:

1. Verifier que l'app envoie bien vers OTEL:
```bash
kubectl describe pod -n default -l app.kubernetes.io/name=homepage
```

2. Dans Grafana > datasource **VictoriaLogs**, tester:
```text
{k8s.namespace.name="homepage",k8s.pod.name=~"homepage-.*"}
```

## Mise à jour de l'application et/ou stack d'observabilité

```bash
helm upgrade homepage ./homepage --namespace homepage --create-namespace
```

```bash
helm upgrade observability ./observability-stack --namespace observability --create-namespace
```

## Autres commandes utiles :

Suppression d'un service : 
```bash
kubectl delete --namespace=observability service grafana
```

Tout supprimer : 
```bash
kubectl delete --all deployments --namespace=homepage
```

```bash
kubectl delete --all deployments --namespace=observability
```

```bash
helm uninstall homepage -n homepage
helm uninstall observability -n observability
helm uninstall garage -n garage

kubectl delete namespace homepage observability garage
```

```bash
helm list -A
```

### Nettoyer (purger) les donnees persistees

1. Supprimer la stack d'observabilite:
```bash
helm uninstall observability -n observability
```

2. Supprimer les PVC pour effacer les donnees:
```bash
kubectl delete pvc -n observability \
  grafana-data \
  victoria-metrics-data \
  victoria-logs-data \
  victoria-traces-data
```

3. Reinstaller la stack:
```bash
helm install observability ./observability-stack --namespace observability --create-namespace
```

Option "soft clean" (sans supprimer les volumes): si tu fais juste `helm upgrade` ou un redeploy, les donnees restent.


```shell
helm upgrade observability ./observability-stack --namespace observability --create-namespace
```

### Persistance des donnees observability

- Grafana conserve deja sa configuration/dashboards via son PVC.
- Les donnees sont maintenant persistees aussi pour:
  - victoria-metrics
  - victoria-logs
  - victoria-traces
- Les tailles de volumes se configurent dans `observability-stack/values.yaml`:
  - `victoria.metrics.persistence.size`
  - `victoria.logs.persistence.size`
  - `victoria.traces.persistence.size`
- Si besoin, on peut définir une storage class pour chaque composant via `storageClass`.
