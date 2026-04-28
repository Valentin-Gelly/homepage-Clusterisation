# Guide pratique : Garage (S3) + Velero pour `homepage`

Ce guide est fait pour etre **rapide a remettre en place** et **simple a suivre**.
Il couvre :
- creation et initialisation de Garage S3
- configuration de Velero
- backups/restores de l'application `homepage`
- verification, visualisation et procedure de test
- depannage des erreurs frequentes (dont DNS local)

---

## 0) Prerequis

- cluster k3d/k3s fonctionnel
- `kubectl` configure sur le bon cluster
- Helm installe
- (optionnel) CLI `velero` installe localement

Verifier le contexte courant :

```bash
kubectl config current-context
kubectl get nodes
```

---

## 1) Deployer Garage (S3 compatible)

Depuis la racine du repo :

```bash
cd garage/script/helm
helm upgrade --install garage ./garage \
  --namespace garage \
  --create-namespace \
  -f "/Users/ethan-pro/Documents/Professionnel/Etudes/ESGI/S4/kubernetes/homepage-Clusterisation/backup-stack/garage-values.yaml"
```

Verifier :

```bash
kubectl get pods -n garage -w
kubectl get svc -n garage
```

---

## 2) Initialiser Garage (layout) et creer bucket + key

> Important : avec ce chart, utilise le binaire `/garage` dans le pod.

```bash
POD=$(kubectl get pods -n garage -l app.kubernetes.io/name=garage -o jsonpath='{.items[0].metadata.name}')
```

### 2.1 Verifier l'etat

```bash
kubectl exec -n garage -c garage -it "$POD" -- /garage status
```

Si tu vois `NO ROLE ASSIGNED`, fais l'initialisation layout :

```bash
# Remplacer <NODE_ID> par l'ID affiche dans /garage status (ou prefixe unique)
kubectl exec -n garage -c garage -it "$POD" -- /garage layout assign -z dc1 -c 1G <NODE_ID>
kubectl exec -n garage -c garage -it "$POD" -- /garage layout apply --version 1
kubectl exec -n garage -c garage -it "$POD" -- /garage layout show
```

### 2.2 Creer bucket + cle d'acces pour Velero

```bash
kubectl exec -n garage -c garage -it "$POD" -- /garage bucket create homepage-backups
kubectl exec -n garage -c garage -it "$POD" -- /garage key create velero-key
kubectl exec -n garage -c garage -it "$POD" -- /garage bucket allow --read --write --owner homepage-backups --key velero-key
kubectl exec -n garage -c garage -it "$POD" -- /garage key info velero-key
```

Garde precieusement :
- `Key ID`
- `Secret key` (affichee en clair lors du `key create`)

---

## 3) Configurer Velero pour utiliser Garage

Editer `backup-stack/velero-values.yaml` :

- `configuration.backupStorageLocation[0].bucket: homepage-backups`
- `configuration.backupStorageLocation[0].config.s3Url: http://garage.garage.svc.cluster.local:3900`
- `credentials.secretContents.cloud` :
  - `aws_access_key_id=<Key ID>`
  - `aws_secret_access_key=<Secret key>`

Verifier le nom du service S3 :

```bash
kubectl get svc -n garage
```

Si le service n'est pas `garage`, adapter l'URL :
`http://<service-s3>.garage.svc.cluster.local:3900`

---

## 4) Installer / mettre a jour Velero

```bash
helm repo add vmware-tanzu https://vmware-tanzu.github.io/helm-charts
helm repo update

helm upgrade --install velero vmware-tanzu/velero \
  --namespace velero \
  --create-namespace \
  -f backup-stack/velero-values.yaml
```

Verifier :

```bash
kubectl get pods -n velero
kubectl get backupstoragelocation -n velero
kubectl describe backupstoragelocation default -n velero
```

Attendu : `Available`.

---

## 5) Mettre en place le "cron" (Schedule Velero)

Le fichier `backup-stack/velero-schedule-homepage.yaml` contient :
- cron : `0 2 * * *` (tous les jours a 02:00)
- namespace : `homepage`
- retention : `7 jours` (`ttl: 168h0m0s`)

Appliquer :

```bash
kubectl apply -f backup-stack/velero-schedule-homepage.yaml
kubectl get schedules -n velero
kubectl describe schedule homepage-daily -n velero
```

### Comment le cron marche

- Velero lit l'objet `Schedule`
- A chaque execution cron, Velero cree un objet `Backup`
- `ttl` definit la date d'expiration et suppression automatique du backup

---

## 6) Backuper l'application `homepage`

### Backup manuel

```bash
velero backup create homepage-manual-$(date +%F-%H%M) \
--include-namespaces homepage \
--default-volumes-to-fs-backup

velero backup create observability-manual-$(date +%F-%H%M) \
  --include-namespaces observability \
  --default-volumes-to-fs-backup
```

Suivi :

```bash
velero backup get
velero backup describe <backup-name> --details
velero backup logs <backup-name>
```

Alternative sans CLI velero :

```bash
kubectl get backups -n velero
kubectl describe backup <backup-name> -n velero
kubectl logs deploy/velero -n velero | rg -i "error|warning|backup|s3|garage"
```

---

## 7) Restaurer un backup

```bash
velero restore create --from-backup <backup-name>
velero restore get
velero restore describe <restore-name> --details
```

Verifier les ressources restaurees :

```bash
kubectl get all -n homepage
kubectl get pvc -n homepage
```

---

## 8) Procedure de test recommandee (end-to-end)

### Test A - Validation backup manuel
1. lancer un backup manuel `homepage`
2. verifier phase `Completed`
3. verifier qu'un objet backup existe dans Garage

### Test B - Validation restore
1. creer une ressource de test dans `homepage` (ex: ConfigMap)
2. lancer un backup manuel
3. supprimer la ressource test
4. lancer restore depuis ce backup
5. verifier que la ressource revient

### Test C - Validation schedule (cron)
1. modifier temporairement le schedule en `*/15 * * * *`
2. attendre 15-20 min
3. verifier creation automatique de backups
4. remettre `0 2 * * *`

---

## 9) Visualiser les backups

## 9.1 Vue Kubernetes (etat Velero)

```bash
kubectl get backupstoragelocation -n velero
kubectl get schedules -n velero
kubectl get backups -n velero
kubectl get restores -n velero
```

## 9.2 Vue objets S3 (Garage)

Option simple : client S3 (Cyberduck, etc.)

Port-forward :

```bash
kubectl port-forward -n garage svc/garage 3900:3900
```

Parametres :
- endpoint : `http://127.0.0.1:3900`
- region : `garage`
- access key / secret key : celles de `velero-key`

---

## 10) Depannage rapide

### Cas 1 - `BackupStorageLocation ... Unavailable`

Verifier :

```bash
kubectl describe backupstoragelocation default -n velero
kubectl logs deploy/velero -n velero | rg -i "error|backupstoragelocation|s3|garage"
```

Causes classiques :
- mauvaises credentials
- `s3Url` incorrect
- bucket absent
- service Garage inaccessible

### Cas 2 - `lookup garage.garage.svc.cluster.local: no such host` depuis `velero backup describe --details`

Contexte :
- cette commande est lancee depuis ta machine locale
- DNS `*.svc.cluster.local` n'est resolu que depuis le cluster

Ce n'est pas forcement un echec du backup. Utiliser plutot :

```bash
kubectl describe backup <backup-name> -n velero
kubectl logs deploy/velero -n velero | rg -i "error|backup|s3|garage"
```

Si besoin d'analyse locale detaillee :
- faire un port-forward vers Garage
- ou lancer les commandes depuis un pod ayant acces DNS cluster

---

## 11) Checklist "remise en place rapide" (copier/coller)

```bash
# 1) Garage
cd garage/script/helm
helm upgrade --install garage ./garage -n garage --create-namespace \
  -f "/Users/ethan-pro/Documents/Professionnel/Etudes/ESGI/S4/kubernetes/homepage-Clusterisation/backup-stack/garage-values.yaml"

# 2) Init Garage
POD=$(kubectl get pods -n garage -l app.kubernetes.io/name=garage -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n garage -c garage -it "$POD" -- /garage status
kubectl exec -n garage -c garage -it "$POD" -- /garage layout show

# 3) Bucket + key (si absent)
kubectl exec -n garage -c garage -it "$POD" -- /garage bucket create homepage-backups
kubectl exec -n garage -c garage -it "$POD" -- /garage key create velero-key
kubectl exec -n garage -c garage -it "$POD" -- /garage bucket allow --read --write --owner homepage-backups --key velero-key

# 4) Velero
helm repo add vmware-tanzu https://vmware-tanzu.github.io/helm-charts
helm repo update
helm upgrade --install velero vmware-tanzu/velero -n velero --create-namespace -f backup-stack/velero-values.yaml

# 5) Schedule
kubectl apply -f backup-stack/velero-schedule-homepage.yaml

# 6) Test backup
velero backup create homepage-manual-$(date +%F-%H%M) --include-namespaces homepage --default-volumes-to-fs-backup
kubectl get backups -n velero
```

