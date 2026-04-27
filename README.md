Pour lancer l'application kubernetes : 
faire un apply sur tout les manifests du dossier kubernetes : 
```bash
kubectl apply -f configmaps/
kubectl apply -f kubernetes/
```

port forwarding pour accéder à l'application : 
```bash
kubectl port-forward -n default svc/homepage 3000:3000
```

commande pour lancer grafana pour le premier lancement :
```bash
helm install observability ./observability-stack --namespace observability --create-namespace
```
Commande après le premier lancement : 
```shell
helm upgrade observability ./observability-stack --namespace observability --create-namespace
```

```shell
helm install observability ./observability-stack --namespace observability --create-namespace                                     
NAME: observability
LAST DEPLOYED: Sun Apr  5 12:39:54 2026
NAMESPACE: observability
STATUS: deployed
REVISION: 1
DESCRIPTION: Install complete
TEST SUITE: None
```

puis faire un port forwarding pour accéder à grafana :
```bash
kubectl port-forward -n observability svc/grafana 4000:4000
```

pour lancer victoria-logs : 
```bash
kubectl port-forward -n observability svc/victoria-logs 9428:9428
```

pour lancer metrics : 
```bash
kubectl port-forward -n observability svc/victoria-metrics 8428:8428
```

pour lancer traces : 
```bash
kubectl port-forward -n observability svc/victoria-traces 8429:8429
```

pour lancer otel-collector : 
```bash
kubectl port-forward -n observability svc/otel-collector 4318:4318
```

Configuration recommandee pour remonter automatiquement les donnees:

- **Logs Kubernetes**: collectes automatiquement via l'OpenTelemetry Collector (DaemonSet) depuis `/var/log/pods`.
- **Metriques cluster**: exposees via `kube-state-metrics` + kubelet/host metrics.
- **Metriques applicatives Prometheus**: ajouter les annotations suivantes sur les pods/deployments applicatifs:
```yaml
metadata:
  annotations:
    prometheus.io/scrape: "true"
    prometheus.io/port: "8080"
    prometheus.io/path: "/metrics"
```
- **Traces + logs + metrics OTLP applicatives**: pointer les SDK OTEL vers:
  - `OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector.observability.svc.cluster.local:4318`
  - `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf`
  - `OTEL_SERVICE_NAME=<nom-de-ton-app>`

Quelques requetes utiles dans Grafana:

- **Metriques**: `sum(rate(container_cpu_usage_seconds_total[5m])) by (k8s_namespace_name, k8s_pod_name)`
- **Memoire**: `sum(container_memory_working_set_bytes) by (k8s_namespace_name, k8s_pod_name)`
- **Etat des pods**: `kube_pod_status_phase`

Verifier les logs et traces de `homepage`:

1. Redemarrer le deploiement:
```bash
kubectl apply -f kubernetes/homepage-deployment.yaml
kubectl rollout restart deployment/homepage -n default
kubectl rollout status deployment/homepage -n default
```
2. Verifier que l'app envoie bien vers OTEL:
```bash
kubectl describe pod -n default -l app.kubernetes.io/name=homepage
```
3. Verifier les logs captures par le collector:
```bash
kubectl logs -n observability ds/otel-collector --since=10m | rg homepage
```
4. Dans Grafana > datasource **VictoriaLogs**, tester:
```text
{k8s_namespace_name="default",k8s_pod_name=~"homepage-.*"}
```
5. Dans Grafana > Explore > datasource **VictoriaTraces**:
   - rechercher le service `homepage`
   - declencher des requetes sur homepage (refresh page, appels API) pour generer du trafic

Important: pour voir des **traces applicatives**, il faut que le runtime de l'application soit instrumente OpenTelemetry (SDK ou auto-instrumentation). Les variables `OTEL_*` seules configurent la destination, mais ne creent pas de spans si l'application n'est pas instrumentee.

Pour voir les pods et les services observability il faut spécifier le namespace `observability` :
```bashbash
kubectl get pods -n observability
NAME                                           READY   STATUS    RESTARTS   AGE
observability-grafana-5c9b6f8d9c-7z5l   2/2     Running   0          3m
```

Pour supprimer un service il faut faire : 
```bash
kubectl delete --namespace=observability service grafana
```

Pour tout supprimer : 
```bash
kubectl delete --all deployments --namespace=observability
```

