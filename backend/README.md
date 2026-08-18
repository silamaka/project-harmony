# Backend — Project Harmony (BEBA EMPIRE)

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
  Un collaborateur ne peut pas auto-valider son propre livrable (statut) —
  seuls admin/chef de projet/client (propriétaire) le peuvent.
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
