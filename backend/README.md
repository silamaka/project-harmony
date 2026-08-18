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
- Restent à faire : Livrables + Commentaires (Phase 3), Calendrier +
  Notifications (Phase 4), Dashboard + Statistiques (Phase 5). Frontend
  pas encore branché sur ce backend.

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
