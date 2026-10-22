#!/usr/bin/env bash
# Mise à jour de l'API sur le serveur (VPS), à lancer depuis n'importe où :
#
#   bash backend/deploy.sh
#
# Enchaîne, et s'arrête à la première erreur (rien n'est redémarré sur un
# code ou une base à moitié à jour) :
#   1. récupère le code (git pull) ;
#   2. installe les dépendances Python ;
#   3. applique les migrations, puis vérifie qu'il n'en reste aucune
#      (une migration oubliée faisait planter tous les dépôts de livrables) ;
#   4. vérifie la configuration Django ;
#   5. redémarre l'API.
#
# Variables facultatives :
#   RESTART_CMD  commande qui redémarre l'API sur ce serveur, par exemple
#                RESTART_CMD="sudo systemctl restart olympe-api".
#                Sans elle, le script rappelle de redémarrer à la main.
#   PYTHON       interpréteur à utiliser (défaut : .venv du backend s'il
#                existe, sinon python3).
#   SKIP_PULL=1  ne pas faire git pull (code déjà à jour).

set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$BACKEND_DIR")"

if [[ -z "${PYTHON:-}" ]]; then
  if [[ -x "$BACKEND_DIR/.venv/bin/python" ]]; then
    PYTHON="$BACKEND_DIR/.venv/bin/python"
  else
    PYTHON="python3"
  fi
fi

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }

if [[ "${SKIP_PULL:-0}" != "1" ]]; then
  step "1/5 Récupération du code"
  git -C "$REPO_DIR" pull --ff-only
else
  step "1/5 Récupération du code (ignorée : SKIP_PULL=1)"
fi

cd "$BACKEND_DIR"

step "2/5 Dépendances Python"
"$PYTHON" -m pip install --quiet -r requirements.txt

step "3/5 Migrations"
"$PYTHON" manage.py migrate --noinput
# Garde-fou : échoue s'il reste une migration non appliquée.
"$PYTHON" manage.py migrate --check

step "4/5 Vérification de la configuration"
"$PYTHON" manage.py check --deploy --fail-level ERROR

step "5/5 Redémarrage de l'API"
if [[ -n "${RESTART_CMD:-}" ]]; then
  eval "$RESTART_CMD"
  echo "API redémarrée."
else
  echo "RESTART_CMD non défini : redémarre l'API à la main pour charger le nouveau code."
fi

printf '\n\033[1;32mMise à jour terminée.\033[0m\n'
