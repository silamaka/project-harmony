# Backend — Project Harmony (BEBA EMPIRE)

Django 5 + Django REST Framework + JWT (SimpleJWT) + PostgreSQL.

## État

Phase 0 — fondations : projet Django, modèle `User` personnalisé (rôles
admin/chef_projet/collaborateur/client), connexion PostgreSQL, CORS,
authentification JWT configurée, endpoint de santé. Aucune route métier
(clients, missions...) pour l'instant — voir les phases suivantes.

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
