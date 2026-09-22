# Mettre le site sur o2switch

o2switch est un hébergement mutualisé avec cPanel. Le site y tourne en
entier — pages, API, base de données sur fichiers — à condition que
votre offre propose **Node.js version 20 ou plus**.

**À vérifier en premier.** Connectez-vous à cPanel et cherchez, dans la
barre de recherche du tableau de bord, « Node ». Si **Setup Node.js
App** apparaît, tout ce qui suit s'applique. Sinon, voyez le dernier
chapitre.

Comptez une demi-heure la première fois.

---

## 1. Poser le code sur le serveur

Deux façons, au choix.

### Par Git — recommandé, les mises à jour se font ensuite en deux clics

1. cPanel → **Git™ Version Control** → **Create**.
2. Cochez *Clone a Repository*.
3. Clone URL : `https://github.com/johankgz/johankgz86.git`
4. Repository Path : le nom du dossier, par exemple `suivitravaux360`
   (il sera créé dans `/home/VOTRECOMPTE/`).
5. Branche : `main`.
6. **Create**.

**Faites le clone AVANT de créer l'application Node.** Dans l'autre ordre,
cPanel a déjà fabriqué le dossier avec un `app.js` d'exemple, et Git
refuse d'écrire dedans :

> You cannot use the "/home/VOTRECOMPTE/outils" directory because it
> already contains files.

Si ça vous arrive : clonez sous un autre nom. Le nom du dossier n'est
codé nulle part — `app.js` et `app.cjs` calculent le dossier des
données par rapport à eux-mêmes. Il suffit de reporter le même nom dans
*Application root*.

Plus tard, pour publier une modification : la même page → **Manage** →
**Update from Remote** → puis **Restart** dans Setup Node.js App.

### Par fichier ZIP — si vous préférez ne pas toucher à Git

1. cPanel → **Gestionnaire de fichiers** → allez dans `/home/VOTRECOMPTE`.
2. **Téléverser** l'archive du site, puis clic droit → **Extraire**.
3. Renommez le dossier obtenu en `outils`.

---

## 2. Créer l'application Node

cPanel → **Setup Node.js App** → **Create Application**.

| Champ | Valeur |
|---|---|
| Node.js version | la plus élevée proposée, **20 minimum** |
| Application mode | `Production` |
| Application root | `outils` |
| Application URL | votre domaine ou un sous-domaine, par exemple `outils.tlenergies.com` |
| Application startup file | `app.js` — si cPanel le refuse, mettez `app.cjs` |

**Create**, puis restez sur la page.

### Les variables d'environnement

Sur la même page, section **Environment variables**, ajoutez :

| Nom | Valeur |
|---|---|
| `DONNEES_DOSSIER` | `/home/VOTRECOMPTE/outils-donnees` |
| `RESEND_API_KEY` | votre clé Resend, si vous voulez les e-mails de publication |
| `EXPEDITEUR` | `Outils de travaux <contact@votredomaine.fr>` |

`PORT` est fourni par l'hébergeur : ne le renseignez pas.

Le dossier des données est **en dehors** du dossier du site, exprès :
personne ne peut télécharger un PDF ou la liste des comptes en tapant
son adresse. Si vous ne mettez pas la variable, le site le crée tout
seul au même endroit.

### Installer la dépendance

Toujours sur la même page, bouton **Run NPM Install**. Une seule
dépendance à installer, c'est l'affaire de quelques secondes.

Puis **RESTART**.

Cette étape n'est pas facultative : sans elle le site ne démarre pas.
Si vous l'oubliez, le journal le dit en toutes lettres et rappelle quoi
faire — ce n'est pas une panne, juste une installation à finir.

### Si cPanel répond « 500 Internal Server Error » après l'installation

Le message complet commence par *« The operation was performed »* : c'est
donc l'installation qui a réussi, et le contrôle d'après qui a échoué.

**Mettez `app.cjs` comme fichier de démarrage**, puis *Restart*. C'est la
cause la plus fréquente : `app.js` est un module ES, et Passenger — le
moteur qui lance l'application chez o2switch — le charge parfois à
l'ancienne et s'arrête. `app.cjs` fait la même chose en JavaScript
classique, il est là pour ça.

Vérifiez aussi que *Application root* est bien le dossier cloné, et non
un dossier resté vide d'une tentative précédente.

Ouvrez l'adresse de l'application : la page de connexion doit
apparaître. Les comptes de départ sont ceux de
`netlify/functions/equipe.mjs` — société `tle`, identifiant `johan`.

**Changez les mots de passe dès la première connexion.** Ceux du fichier
sont écrits en clair dans le dépôt : ils servent à ouvrir le site la
première fois, pas à le garder. cPanel → l'appli → **Comptes**.

### Voir la vraie erreur, en une commande

Un 500 ne dit rien. Pour lire l'erreur en clair : cPanel → **Terminal**.

```bash
ls ~/nodevenv/VOTREDOSSIER/
```

Le numéro affiché est la version de Node de l'application — il en faut
**20 minimum**. S'il y en a plusieurs, c'est que la version a été changée
en cours de route : prenez celle qui est sélectionnée dans *Setup Node.js
App*, c'est la seule qui compte.

```bash
source ~/nodevenv/VOTREDOSSIER/24/bin/activate
cd ~/VOTREDOSSIER
node app.cjs
```

`node` n'existe que dans cet environnement : hors de lui, le terminal
répond « commande introuvable », et c'est normal.

Le site démarre alors devant vous et affiche ses quatre lignes — site,
données, e-mails, Ctrl+C. **S'il démarre, le code va bien** : le problème
est dans la configuration de l'application cPanel, pas dans le site.
Sinon, l'erreur s'affiche en clair.

### Par le Terminal, si vous préférez

o2switch donne un terminal (cPanel → **Terminal**). Après avoir créé
l'application, la page affiche une ligne « Enter to the virtual
environment » : copiez-la, collez-la dans le terminal, puis :

```bash
cd ~/outils
bash outils/installer-o2switch.sh
```

Le script installe, prépare le dossier des données et affiche les
valeurs à recopier dans le formulaire.

---

## 3. HTTPS

o2switch installe un certificat Let's Encrypt automatiquement (AutoSSL)
sur les domaines et sous-domaines du compte. Vérifiez dans cPanel →
**SSL/TLS Status** que votre adresse est bien couverte, et que
`https://` fonctionne.

Ce n'est pas un détail de confort : **sans HTTPS**, le téléphone refuse
la géolocalisation (bouton Position du SAV et du relevé) et
l'installation sur l'écran d'accueil.

---

## 4. Reprendre les données déjà sur Netlify

À faire une fois, quand le site répond sur o2switch.

1. Sur netlify.com, relevez le **Site ID** (`Site configuration` →
   `General`) et créez un jeton (votre avatar → `User settings` →
   `Applications` → `Personal access tokens`).
2. Dans le Terminal cPanel, après être entré dans l'environnement
   virtuel :

```bash
cd ~/outils
NETLIFY_SITE_ID=xxx NETLIFY_AUTH_TOKEN=yyy DONNEES_DOSSIER=~/outils-donnees npm run export-netlify
```

3. **RESTART** dans Setup Node.js App.

Tous les dossiers, documents, comptes et listes sont là. Rien n'est
modifié chez Netlify : le script ne fait que lire, et vous pouvez
laisser l'ancien site en service le temps de vérifier.

Si le terminal n'est pas disponible, lancez la même commande depuis
votre ordinateur (Node 20 requis), puis téléversez le dossier `donnees`
obtenu dans `/home/VOTRECOMPTE/outils-donnees`.

---

## 5. Au quotidien

**Publier une modification** : cPanel → Git Version Control → *Update
from Remote*, puis *Restart*. Si le changement ne touche que des pages
`.html`, le redémarrage n'est même pas nécessaire.

**Sauvegarder** : tout tient dans `/home/VOTRECOMPTE/outils-donnees`.
o2switch garde ses propres sauvegardes (JetBackup), mais une copie à
vous ne coûte rien :

```bash
tar czf ~/sauvegarde-outils-$(date +%F).tar.gz -C ~/outils-donnees .
```

Téléchargez l'archive de temps en temps. Restaurer, c'est remettre le
dossier en place et redémarrer.

**Si le site ne répond plus** : Setup Node.js App → *Restart*. Le
journal des erreurs est dans `~/outils/stderr.log` ou dans la section
*Errors* de cPanel.

---

## 6. Vérifier que tout y est

Une fois le site en ligne, cinq minutes suffisent à s'en assurer :

- [ ] La page de connexion s'ouvre en `https://`, cadenas fermé.
- [ ] Vous vous connectez, le menu affiche vos applis.
- [ ] `https://votre-adresse/netlify/functions/equipe.mjs` renvoie
      **Interdit** — les sources restent hors de portée.
- [ ] Un relevé se publie, et il apparaît dans **Mes rapports**.
- [ ] **Carte des chantiers** ouvre la carte et pose une épingle.
- [ ] Le **carnet d'échantillons** sort un PDF avec le papier à en-tête :
      c'est le signe que `entete-societe.png` et `entete-contact.png`
      sont bien servis.
- [ ] Sur le téléphone, le bouton **Position** du relevé relève le GPS
      (il faut HTTPS pour cela).
- [ ] Le dossier `/home/VOTRECOMPTE/outils-donnees` se remplit, et
      `/home/VOTRECOMPTE/outils/donnees` reste absent.

Si l'un de ces points cloche, dites-moi lequel.

---

## 7. Si votre offre n'a pas Node.js

Le site a besoin d'un serveur pour son API : les pages seules ne
suffisent pas. Trois issues, de la plus simple à la plus lourde :

1. **Demander à o2switch.** Le support répond vite et Node fait partie
   de leur offre ; il s'agit souvent d'une case à activer.
2. **Garder l'API ailleurs.** Les pages sur o2switch, l'API sur Netlify
   ou un petit serveur. Il faut alors un renvoi `/api/*` vers l'autre
   adresse — quelques lignes de `.htaccess` que je peux écrire.
3. **Changer d'hébergeur pour cette application.** Voir `DEPLOIEMENT.md`
   pour Render, Railway, Fly ou un VPS.

Dites-moi ce que vous trouvez dans votre cPanel, et je fais le reste.
