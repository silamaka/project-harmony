"""Django settings for the OLYMPE (BEBA EMPIRE) backend."""

from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv
import os
import sys

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    return default if value is None else value.strip().lower() in {"1", "true", "yes"}


def env_list(name: str, default: str) -> list[str]:
    return [item.strip() for item in os.environ.get(name, default).split(",") if item.strip()]


SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "insecure-dev-key-do-not-use-in-production")
DEBUG = env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "accounts",
    "clients",
    "projects",
    "missions",
    "deliverables",
    "comments",
    "calendar_app",
    "notifications",
    "dashboard",
    "core",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # Réponses JSON compressées (5 à 10 fois plus légères), surtout utile
    # sur mobile. Le navigateur les décompresse de lui-même.
    "django.middleware.gzip.GZipMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "notifications.actor.ResetActorMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("DB_NAME", "project_harmony"),
        "USER": os.environ.get("DB_USER", "project_harmony"),
        "PASSWORD": os.environ.get("DB_PASSWORD", ""),
        "HOST": os.environ.get("DB_HOST", "localhost"),
        "PORT": os.environ.get("DB_PORT", "5432"),
    }
}

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "fr-fr"
# Fuseau de l'agence, pour les textes datés générés côté serveur (ex.
# "publication prévue le … à 10:00" dans la discussion). L'interface, elle,
# affiche les dates dans le fuseau du navigateur de chaque utilisateur.
TIME_ZONE = os.environ.get("DJANGO_TIME_ZONE", "UTC")
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CORS_ALLOWED_ORIGINS = env_list(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:8080,http://localhost:8081,http://localhost:5173,http://localhost:4173",
)

# URL du frontend, utilisée pour construire le lien de réinitialisation de
# mot de passe envoyé par e-mail (le backend ne sert pas les pages React).
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:8080")

# Backend console par défaut (dev) : le contenu de l'e-mail part dans les
# logs du serveur au lieu d'un vrai envoi SMTP. À remplacer par un vrai
# backend (SMTP, SES...) via EMAIL_BACKEND/EMAIL_HOST* en production —
# aucun changement de code requis, uniquement des variables d'env.
EMAIL_BACKEND = os.environ.get(
    "EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend"
)
EMAIL_HOST = os.environ.get("EMAIL_HOST", "")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "no-reply@bebaempire.local")

# Notifications push (Web Push). Paire de clés propre au serveur, générée
# une fois par `python manage.py generate_vapid_keys`. Sans clés, le push est
# simplement désactivé (la cloche fonctionne toujours).
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "")
# Contact exigé par les services push (Google, Apple...) en cas de problème.
VAPID_SUBJECT = os.environ.get("VAPID_SUBJECT", "mailto:empirebeba@gmail.com")

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        # JWT standard qui retient aussi l'auteur de la requête (notifications).
        "notifications.actor.ActorJWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    # Pas de pagination pour l'instant : le frontend attend un tableau brut
    # partout (Promise<User[]>, etc.), aucune page n'a de logique de
    # pagination. À activer plus tard comme un changement coordonné
    # frontend+backend, pas un défaut silencieux qui casse chaque liste.
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        # Ciblé sur les vues sensibles (connexion, mot de passe oublié) via
        # throttle_scope — pas de limite globale par défaut, qui pénaliserait
        # un usage normal de l'app sans protéger grand-chose de plus.
        "auth-sensitive": "10/min",
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
}

# `manage.py test` crée plusieurs utilisateurs par test (un par rôle) : le
# hasher PBKDF2 par défaut, volontairement lent, fait passer une suite de
# quelques dizaines de tests de secondes à plusieurs minutes pour rien. Ce
# hasher rapide n'est utilisé que sous test, jamais pour de vrais mots de
# passe.
if "test" in sys.argv:
    PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
    # Jamais de vrai envoi push pendant les tests, même si le .env local a
    # des clés : les tests du push les fournissent eux-mêmes.
    VAPID_PUBLIC_KEY = VAPID_PRIVATE_KEY = ""
