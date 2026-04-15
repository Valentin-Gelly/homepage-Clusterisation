Pour lancer l'application kubernetes : 
faire un apply sur tout les manifests du dossier kubernetes : 
```bash
kubectl apply -f configmaps/
kubectl apply -f kubernetes/
```

commande pour lancer grafana :
```bash
helm install observability ./observability-stack --namespace observability --create-namespace
```

```shell
PS C:\Users\vale8\Documents\ESGI\M2\clusteurisation\homepage> helm install observability ./observability-stack --namespace observability --create-namespace                                     
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
kubectl port-forward -n observability svc/observability-grafana 3000:3000
```
    
