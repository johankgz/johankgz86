# Faire tourner le site sur un serveur Node

Le site tourne sur n'importe quel serveur Node (aujourd'hui o2switch, voir
`DEPLOIEMENT-O2SWITCH.md`) : `serveur.mjs` sert les pages et l'API, dont
le code est dans le dossier `serveur/`. Les données sont rangées dans un
dossier de fichiers ordinaires (variable `DONNEES_DOSSIER`), que l'on copie
pour sauvegarder.

---

## 1. Sur votre ordinateur, pour essayer

Il faut [Node.js](https://nodejs.org) version 20 ou plus.

Le plus court : **double-cliquez** `outils/essayer-en-local.sh` sur Mac
ou Linux, `outils/essayer-en-local.cmd` sur Windows. Le script installe
ce qu'il faut la première fois, démarre le site et l'ouvre dans le
navigateur.

À la main, cela revient à :

```bash
npm install     # une seule fois
npm start
```

Le site est sur <http://localhost:8080>. Les comptes de départ sont ceux
de `serveur/equipe.mjs` : société `tle`, identifiant `johan`.

Les données atterrissent dans `donnees/`, à côté du site. Vous pouvez
l'ouvrir : chaque dossier de chantier est un dossier, chaque PDF un
fichier. Pour repartir de zéro, supprimez `donnees/`.

Modifier une page, c'est ouvrir le `.html`, enregistrer, et recharger le
navigateur. Pas de compilation, pas d'attente.

Réglages, tous facultatifs :

| Variable | À quoi ça sert | Défaut |
|---|---|---|
| `PORT` | port d'écoute | `8080` |
| `DONNEES_DOSSIER` | où ranger les données | `./donnees` |
| `RESEND_API_KEY` | clé Resend, pour les e-mails de publication | vide, pas d'e-mail |
| `EXPEDITEUR` | expéditeur des e-mails | `onboarding@resend.dev` |

---

## 2. Mettre en ligne

### Render, Railway, Fly — le plus simple

Ces hébergeurs partent du dépôt GitHub : vous poussez, ils déploient.

- Commande de démarrage : `npm start`
- Version de Node : 20 ou plus

**Le point à ne pas rater : le disque.** Sur ces plateformes, le disque
est effacé à chaque déploiement. Il faut donc un disque persistant :

- Render : `Disks` → `Add Disk`, point de montage `/donnees` ;
- Railway : `Volumes` → point de montage `/donnees` ;
- Fly : `fly volumes create donnees`, monté sur `/donnees`.

Puis la variable `DONNEES_DOSSIER=/donnees`. Sans ce disque, **les
dossiers et les rapports disparaissent au déploiement suivant.**

### Un serveur à vous (VPS, machine du bureau, NAS)

```bash
git clone <votre dépôt> /opt/outils
cd /opt/outils && npm install
DONNEES_DOSSIER=/var/outils-donnees PORT=8080 npm start
```

Pour que ça reparte tout seul après une coupure, un service systemd :

```ini
# /etc/systemd/system/outils.service
[Unit]
Description=Outils de chantier
After=network.target

[Service]
WorkingDirectory=/opt/outils
Environment=PORT=8080
Environment=DONNEES_DOSSIER=/var/outils-donnees
Environment=RESEND_API_KEY=...
ExecStart=/usr/bin/node serveur.mjs
Restart=always
User=outils

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now outils
```

### HTTPS : obligatoire en pratique

Sans HTTPS, le téléphone refuse la géolocalisation (bouton Position du
SAV et du relevé) et l'installation sur l'écran d'accueil. Render,
Railway et Fly s'en chargent. Sur un serveur à vous, le plus court est
[Caddy](https://caddyserver.com), qui prend le certificat tout seul :

```
outils.votredomaine.fr {
    reverse_proxy localhost:8080
}
```

---

## 3. Sauvegarder

Tout tient dans le dossier des données.

```bash
tar czf sauvegarde-$(date +%F).tar.gz -C /var/outils-donnees .
```

Restaurer, c'est remettre le dossier en place et relancer. Une copie par
semaine sur un disque externe ou un cloud suffit ; c'est le seul geste
d'entretien que le site demande.

---

## 4. Un point de sécurité

Le code du serveur (`serveur/`, dont `equipe.mjs` et ses comptes de départ)
n'est jamais servi : `serveur.mjs` refuse ce dossier, comme `prive/`, les
données et le dépôt. Pour le vérifier sur le site en ligne :

```
https://votre-site/serveur/equipe.mjs
```

doit répondre **Interdit**.
