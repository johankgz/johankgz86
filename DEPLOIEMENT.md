# Faire tourner le site ailleurs que sur Netlify

Le site sait désormais vivre à deux endroits, avec le même code :

- **sur Netlify**, comme depuis le premier jour, rien ne change ;
- **sur n'importe quel serveur Node**, dès que la variable
  `DONNEES_DOSSIER` est renseignée : les données sont alors rangées dans
  un dossier de fichiers ordinaires, que l'on copie pour sauvegarder.

Une seule pièce fait la bascule : `netlify/functions/magasin.mjs`.

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
de `netlify/functions/equipe.mjs` : société `tle`, identifiant `johan`.

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

## 2. Rapatrier les données déjà sur Netlify

À faire une fois, avant de basculer pour de bon. Rien n'est modifié chez
Netlify : on ne fait que lire.

1. Sur netlify.com, relevez le **Site ID** : `Site configuration` →
   `General` → `Site ID`.
2. Créez un jeton : votre avatar → `User settings` → `Applications` →
   `Personal access tokens` → `New access token`.
3. Lancez :

```bash
NETLIFY_SITE_ID=xxx NETLIFY_AUTH_TOKEN=yyy npm run export-netlify
```

Tout arrive dans `donnees/`. Relancez `npm start` : le site repart sur
ces données, avec ses dossiers, ses documents et ses comptes.

---

## 3. Mettre en ligne

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

## 4. Sauvegarder

Tout tient dans le dossier des données.

```bash
tar czf sauvegarde-$(date +%F).tar.gz -C /var/outils-donnees .
```

Restaurer, c'est remettre le dossier en place et relancer. Une copie par
semaine sur un disque externe ou un cloud suffit ; c'est le seul geste
d'entretien que le site demande.

---

## 5. Ce qui change par rapport à Netlify

| | Netlify | Serveur Node |
|---|---|---|
| Mise en ligne | dépôt ZIP ou push GitHub | `git pull` puis redémarrage, ou push chez l'hébergeur |
| Données | blobs Netlify, invisibles | un dossier de fichiers, que vous voyez et copiez |
| Sauvegarde | à demander à Netlify | vous copiez le dossier |
| HTTPS | fourni | fourni par l'hébergeur, ou Caddy sur un serveur à vous |
| Essayer avant de publier | non | `npm start` sur votre ordinateur |
| Coût | gratuit jusqu'à un certain trafic | de 0 à quelques euros par mois |

Les deux peuvent tourner en même temps : gardez Netlify en service
pendant que vous essayez le nouveau serveur, et ne basculez l'adresse
qu'une fois sûr. Attention seulement à ne pas travailler des deux côtés
en même temps, les données ne se parlent pas.

---

## 6. Un point de sécurité, à vérifier sur le site en ligne

Le dossier `netlify/` se trouve à l'intérieur du dossier publié.
Ouvrez, sur votre site Netlify :

```
https://votre-site/netlify/functions/equipe.mjs
```

Si le fichier s'affiche, **les mots de passe de départ sont lisibles par
qui connaît l'adresse**. Le fichier `_redirects` ajouté à la racine
ferme ce chemin dès le prochain déploiement ; changez tout de même les
mots de passe concernés depuis la page Comptes. Le serveur Node, lui,
refuse ce chemin d'emblée.
