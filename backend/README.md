# Backend — OLYMPE (BEBA EMPIRE)

Django 5 + Django REST Framework + JWT (SimpleJWT) + PostgreSQL.

## État

- **Phase 0 — fondations** : projet Django, modèle `User` personnalisé (rôles
  admin/chef_projet/collaborateur/client), connexion PostgreSQL, CORS,
  authentification JWT, endpoint de santé.
- **Phase 1 — Auth + Utilisateurs + Clients** : `POST /api/v1/auth/login/`
  (retourne `{access, refresh, user}`), `POST /api/v1/auth/refresh/`,
  `GET/PATCH /api/v1/auth/me/`, CRUD complet `/api/v1/users/` (filtre
  `?role=`) et `/api/v1/clients/` (avec contacts imbriqués). Permissions
  calquées sur les règles déjà établies côté frontend cette session (voir
  `accounts/permissions.py` et `clients/permissions.py`). Cascade
  utilisateur "client" ↔ entreprise gérée par signal + `on_delete=SET_NULL`,
  testée dans les deux sens. Pas de pagination pour l'instant (le frontend
  attend des tableaux bruts partout).
- **Phase 2 — Projets + Missions** : CRUD `/api/v1/projects/` (filtre
  `?client=`) et `/api/v1/missions/` (filtres `?assignee=`, `?project=`).
  `client_id` d'une mission déduit automatiquement de son projet si non
  fourni, comme le fait déjà `CreateMissionDialog` côté frontend.
  **La portée en lecture des missions est désormais filtrée côté serveur
  par rôle** (`MissionViewSet.get_queryset`) : un collaborateur ne reçoit
  que ses missions assignées, un client que celles de son entreprise —
  hors périmètre = 404, pas de fuite de données. Écriture aussi limitée
  par rôle sur les missions : collaborateur → statut/priorité de ses
  missions uniquement, client → statut de celles de son entreprise
  uniquement (`missions/permissions.py`).
- **Phase 3 — Livrables + Commentaires** : CRUD `/api/v1/deliverables/`
  (filtre `?mission=`) et `/api/v1/comments/` (filtre `?mission=`, immuables
  — pas d'édition, suppression admin uniquement). Portée en lecture/écriture
  dérivée de `missions.scoping.missions_visible_to` (source unique de
  vérité, réutilisée par Missions/Livrables/Commentaires) : impossible de
  déposer un livrable ou commenter une mission qu'on n'a pas le droit de
  voir. `uploaded_by`/`author_id` toujours forcés à l'utilisateur connecté
  (jamais une valeur du client). Les `mentions` d'un commentaire sont
  ré-extraites côté serveur depuis `body`, jamais celles envoyées par le
  client (tenter d'injecter de fausses mentions est ignoré silencieusement).
  Un collaborateur ne peut pas auto-valider son propre livrable. Deux
  validations indépendantes : `status` (agence : admin/chef de projet, vaut
  envoi au client) et `client_status` (client propriétaire seul, sur un
  livrable déjà validé par l'agence). Le statut de mission en découle
  (`deliverables/decisions.py`).
- **Phase 4 — Calendrier + Notifications** : `GET /api/v1/calendar/` fusionne
  échéances de missions, dépôts de livrables et réunions (comme déjà fait
  côté frontend), mais la portée mission/livrable est désormais imposée
  côté serveur via `missions_visible_to` — les réunions génériques restent
  visibles à tous. CRUD `/api/v1/meetings/` réservé à
  admin/chef de projet/collaborateur (mêmes rôles qui voient la page
  Calendrier côté frontend). `/api/v1/notifications/` : portée dérivée de
  la mission liée, tout est en lecture seule sauf `read` (marquer lu),
  action `mark-all-read`, suppression admin uniquement. La création d'une
  notification "mission créée" est désormais un vrai effet de bord serveur
  (signal `post_save` sur Mission), plus une simulation frontend.
- **Phase 5 — Dashboard + Statistiques** : `GET /api/v1/dashboard/` (compteurs
  globaux), `/missions-by-client/`, `/missions-by-collaborator/`,
  `/completion-rate/`, `/monthly/` (vide pour l'instant — pas d'historique
  agrégé stocké, aucune donnée fabriquée), `/alerts/` (échéances à J+1/J+2 —
  `deadline` est un DateField, la fenêtre "24h/48h" du frontend se traduit
  au jour près). Réservé à admin/chef de projet (seuls rôles qui atteignent
  Dashboard/Statistiques côté frontend) ; pas de scope supplémentaire par
  utilisateur, ces agrégats sont globaux par nature. La page Statistiques
  n'a pas d'endpoint dédié : elle consomme directement Missions/Clients/
  Projets/Livrables comme déjà fait côté frontend.
- **Les 5 phases prévues sont terminées côté backend.** Reste : brancher
  effectivement le frontend dessus (actuellement toujours sur données
  mock).

## Installation

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt

cp .env.example .env
# renseigner DJANGO_SECRET_KEY, DB_PASSWORD (ou reprendre les valeurs
# locales déjà en place si vous avez suivi la Phase 0)

python manage.py migrate
python manage.py createsuperuser
python manage.py runserver 8000      # http://localhost:8000/api/v1/health/
```

## Base de données

Rôle et base PostgreSQL dédiés (créés en Phase 0, pas de réutilisation
d'une base d'un autre projet) :

```sql
CREATE ROLE project_harmony WITH LOGIN PASSWORD '...';
CREATE DATABASE project_harmony OWNER project_harmony;
```

## Vérification

```bash
python manage.py check
curl http://localhost:8000/api/v1/health/   # {"status": "ok"}
```

Le frontend (`../`) pointe vers ce backend via `VITE_API_URL` dans son
propre `.env` (voir `../.env.example`).

## Mise à jour en production (VPS)

Sur le serveur, une seule commande met à jour **toute** la plateforme (API
et frontend) :

```bash
bash ~/project-harmony/deploy.sh
```

Le script récupère le code, regarde ce qui a changé et ne fait que le
nécessaire :

- **backend** : dépendances Python si `requirements.txt` a changé ;
  **sauvegarde de la base puis migrations** s'il y en a de nouvelles, et
  vérification qu'il n'en reste aucune ; clés des notifications push créées
  la première fois ; contrôle de la configuration (`check --deploy`) ;
  redémarrage de l'API ;
- **frontend** : dépendances npm si `package.json` a changé, build,
  redémarrage ;
- pour finir, vérifie que les deux services tournent, et affiche leurs
  dernières lignes de journal sinon.

Il s'arrête à la première erreur : rien n'est redémarré sur un code ou une
base à moitié à jour. `FULL=1 bash deploy.sh` refait tout même sans
changement (après une intervention à la main). Les services par défaut sont
`project-harmony` (API) et `project-harmony-frontend` ; sinon, les indiquer
par `API_SERVICE=...` et `FRONTEND_SERVICE=...`. Les avertissements de
`check --deploy` (DEBUG actif, clé secrète faible, cookies non
sécurisés...) sont à corriger en production.

### Sauvegardes de la base

`backend/backup.sh` copie toute la base dans `~/olympe-backups/`, vérifie
que la copie est lisible et garde les 14 derniers jours. Le déploiement la
lance de lui-même avant chaque migration ; pour une copie **chaque nuit**,
l'ajouter avec `crontab -e` :

```cron
30 3 * * * bash /home/UTILISATEUR/project-harmony/backend/backup.sh >> /home/UTILISATEUR/olympe-backups/backup.log 2>&1
```

Ces copies restent sur le même serveur : elles protègent d'une erreur
(suppression, migration ratée), pas de la perte du serveur. Pour cela,
copier régulièrement `~/olympe-backups/` ailleurs (ordinateur, Google
Drive...).

**Restaurer** une sauvegarde (remplace tout le contenu actuel de la base) :

```bash
sudo systemctl stop project-harmony
bash backend/backup.sh   # copie de l'état actuel, au cas où
pg_restore --clean --if-exists --no-owner -h localhost -U project_harmony   -d project_harmony ~/olympe-backups/olympe-AAAAMMJJ-HHMMSS.dump
sudo systemctl start project-harmony
```

### Rappels de publication (cron)

Les rappels de publication (la veille, puis « en retard » une fois la date
passée) sont envoyés par une commande à lancer **toutes les heures**. La
même commande signale aussi les missions dont l'échéance est dépassée. Chaque
rappel ne part qu'une fois par date prévue (une fois par échéance pour les
missions) : relancer la commande ne crée pas de doublon. À ajouter avec `crontab -e` sur le serveur :

```cron
0 * * * * cd /chemin/vers/project-harmony/backend && .venv/bin/python manage.py send_publication_reminders >> /var/log/olympe-rappels.log 2>&1
```

Les heures affichées dans les rappels suivent `DJANGO_TIME_ZONE` (par
exemple `Europe/Paris`) défini dans le `.env` du backend.
