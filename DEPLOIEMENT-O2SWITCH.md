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

### Si cPanel dit « Unable to set environment variables in htaccess file »

> Error: [Errno 2] No such file or directory:
> '/home/VOTRECOMPTE/VOTREDOSSIER/.htaccess'

cPanel écrit les directives de Passenger dans un `.htaccess` à la racine
de l'application, et il s'attend à ce que le fichier existe : il le crée
lui-même quand c'est lui qui crée le dossier. Un dossier venu de
`git clone` n'en a pas.

Sans ce fichier, Apache ne passe pas la main à Node : les pages
s'affichent — Apache les sert directement — mais l'API ne répond plus,
et le site dit « Pas de réseau » à la connexion.

Dans le Terminal :

```bash
touch ~/VOTREDOSSIER/.htaccess
```

Puis *Save* dans Setup Node.js App — cPanel le remplit — puis *Restart*.

Ce fichier appartient au serveur : il est dans .gitignore, un
`git pull` n'y touche pas, et il ne doit jamais partir dans le dépôt.

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

### Le piège : AutoSSL n'atteint pas sa propre vérification

Une application Node est montée avec `PassengerBaseURI "/"` : **tout**
ce qui arrive sur le domaine part vers Node, y compris le jeton que
Let's Encrypt vient relire pour prouver que le domaine est à vous.

Or ce jeton est déposé dans la racine du document — `public_html` — et
notre serveur, lui, sert les fichiers depuis le dossier de l'application.
Il ne le trouve pas, répond 404, et la validation échoue. À chaque
passage, sans que rien ne l'explique : SSL/TLS Status affiche seulement
un certificat auto-signé qui ne se remplace jamais.

La parade tient en deux lignes — on rend ce seul dossier à Apache :

```bash
mkdir -p ~/public_html/.well-known/acme-challenge
printf 'PassengerEnabled off\n' > ~/public_html/.well-known/.htaccess
```

Pour vérifier avant d'attendre une nuit :

```bash
echo bonjour > ~/public_html/.well-known/acme-challenge/test
```

puis ouvrir `http://VOTREDOMAINE/.well-known/acme-challenge/test` — si
« bonjour » s'affiche, la validation réussira. Effacez ensuite le fichier
d'essai, et **gardez le `.well-known/.htaccess`** : il sert aussi aux
renouvellements, tous les trois mois.

### Reconnaître un certificat auto-signé

La date d'expiration. Un auto-signé — le bouchon que cPanel pose quand on
ajoute un domaine — expire dans **un an**. Un vrai Let's Encrypt expire
dans **trois mois**, et se renouvelle seul. Une date à un an, c'est donc
qu'aucun certificat valable n'a encore été émis.

Chez o2switch, la page SSL/TLS Status n'a **ni case à cocher ni bouton
Run AutoSSL** : le lancement manuel est désactivé, AutoSSL passe de
lui-même, en général chaque nuit. Une fois la parade ci-dessus en place,
il n'y a donc qu'à attendre le prochain passage — ou demander au support
de forcer l'émission.

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

**Les notifications sur le téléphone** marchent sans rien installer ni
régler : les clés sont fabriquées au premier usage et rangées dans le
dossier des données. Il faut seulement le site en **https** (voir 3).

Les rappels partent à leur heure tant que l'application tourne. Si
Passenger l'endort la nuit faute de visites, un rappel de 7 h pourrait
partir au premier passage du matin. Pour qu'il parte pile à l'heure,
ajoutez une tâche cron dans cPanel → **Tâches Cron** (toutes les
5 minutes) :

```bash
curl -s "https://VOTREDOMAINE/api/rapports?action=tic" > /dev/null
```

Facultatif : la variable `PUSH_CONTACT` (par exemple
`mailto:contact@votredomaine.fr`) remplace l'adresse du site comme
contact signé dans les notifications.

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

## Analyse de plan (essai)

La page « Analyse de plan » compte les symboles d'un plan électrique PDF. Le
calcul tourne à part, dans l'application Python du dépôt **Plan-**, installée
sur un sous-domaine (par exemple `plan.votre-domaine.fr`). Le site lui
transmet les plans des personnes connectées, avec une clé partagée : personne
d'autre ne peut s'en servir.

1. Installez l'analyseur en suivant le README du dépôt **Plan-** (section
   « Sur o2switch, branché sur Suivi travaux 360 ») : sous-domaine, Git™
   Version Control, Setup Python App, `PLAN_ANALYZER_KEY`.
2. Ici, dans **Setup Node.js App** › l'application du site › variables
   d'environnement :
   - `PLAN_ANALYSE_URL` = `https://plan.votre-domaine.fr`
   - `PLAN_ANALYSE_CLE` = la même phrase secrète que `PLAN_ANALYZER_KEY`
3. **Restart** de l'application du site.

La page « Analyse de plan » dit elle-même si l'analyseur est branché,
injoignable, ou si la clé ne correspond pas.
