Pour lancer l'application kubernetes :

```bash
docker build -t homepage:otel .
```

```bash
k3d cluster list
k3d image import homepage:otel -c <nom-du-cluster>
```

si pas de cluster, en créer un :
```bash
k3d cluster create <nom-du-cluster>
```

```bash
helm install homepage ./homepage --namespace homepage --create-namespace
```

```bash
kubectl get pods -n homepage -w
```

```bash
helm install observability ./observability-stack --namespace observability --create-namespace
```

```bash
kubectl get pods -n observability -w
```

Commande après le premier lancement dans le cas ou on veut faire une mise a jour de la stack observability :
```shell
helm upgrade homepage ./homepage --namespace homepage --create-namespace
```

```shell
helm upgrade observability ./observability-stack --namespace observability --create-namespace
```

port forwarding pour accéder à l'application : 
```bash
kubectl port-forward -n homepage svc/homepage 3000:3000
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

Verifier les logs et traces de `homepage`:

1. Verifier que l'app envoie bien vers OTEL:
```bash
kubectl describe pod -n default -l app.kubernetes.io/name=homepage
```

2. Dans Grafana > datasource **VictoriaLogs**, tester:
```text
{k8s.namespace.name="homepage",k8s.pod.name=~"homepage-.*"}
```

### Commandes utiles :

Pour supprimer un service il faut faire : 
```bash
kubectl delete --namespace=observability service grafana
```

Pour tout supprimer : 
```bash
kubectl delete --all deployments --namespace=homepage
```

```bash
kubectl delete --all deployments --namespace=observability
```

```bash
helm uninstall homepage -n homepage
helm uninstall observability -n observability

kubectl delete namespace homepage observability
```

```bash
helm list -A
```
