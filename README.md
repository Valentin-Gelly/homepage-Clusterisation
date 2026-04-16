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
kubectl port-forward -n observability svc/grafana 5000:5000
```

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

