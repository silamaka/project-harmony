#!/usr/bin/env bash
# Mise à jour complète d'OLYMPE sur le serveur (VPS), en une commande :
#
#   bash ~/project-harmony/deploy.sh
#
# Récupère le code, regarde ce qui a changé et ne fait que le nécessaire :
#   backend  : dépendances Python (si requirements.txt a changé),
#              sauvegarde de la base puis migrations (si nouvelles migrations),
#              clés push (créées une seule fois), vérification, redémarrage ;
#   frontend : dépendances npm (si package.json a changé), build, redémarrage.
# S'arrête à la première erreur : rien n'est redémarré sur un code ou une
# base à moitié à jour.
#
# Variables facultatives :
#   FULL=1             tout refaire, même sans changement (après une
#                      intervention à la main, ou un pull fait séparément)
#   API_SERVICE        service systemd de l'API   (défaut : project-harmony)
#   FRONTEND_SERVICE   service systemd du front   (défaut : project-harmony-frontend)

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$REPO_DIR/backend"
API_SERVICE="${API_SERVICE:-project-harmony}"
FRONTEND_SERVICE="${FRONTEND_SERVICE:-project-harmony-frontend}"
FULL="${FULL:-0}"

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
ok() { printf '\033[1;32m%s\033[0m\n' "$1"; }

cd "$REPO_DIR"

step "Récupération du code"
BEFORE="$(git rev-parse HEAD)"
git pull --ff-only
AFTER="$(git rev-parse HEAD)"
if [[ "$BEFORE" == "$AFTER" && "$FULL" != "1" ]]; then
  ok "Déjà à jour, rien à faire. (FULL=1 pour tout refaire quand même.)"
  exit 0
fi
CHANGED="$(git diff --name-only "$BEFORE" "$AFTER")"
git --no-pager log --oneline "$BEFORE..$AFTER" || true

# Vrai si un fichier modifié correspond au motif (ou si FULL=1).
changed() { [[ "$FULL" == "1" ]] || grep -qE "$1" <<< "$CHANGED"; }

# ------------------------------------------------------------------ backend
if changed '^backend/'; then
  PYTHON="$BACKEND_DIR/.venv/bin/python"
  [[ -x "$PYTHON" ]] || PYTHON="python3"
  cd "$BACKEND_DIR"

  if changed '^backend/requirements\.txt$'; then
    step "Backend : dépendances Python"
    "$PYTHON" -m pip install --quiet -r requirements.txt
  fi

  if changed '^backend/.*/migrations/'; then
    # Une migration modifie la base : copie de sécurité juste avant.
    step "Backend : sauvegarde de la base avant migration"
    bash "$BACKEND_DIR/backup.sh"
    step "Backend : migrations"
    "$PYTHON" manage.py migrate --noinput
  fi
  # Garde-fou : échoue s'il reste une migration non appliquée.
  "$PYTHON" manage.py migrate --check

  if ! grep -qE '^VAPID_PRIVATE_KEY=.+' .env 2>/dev/null; then
    # Une seule fois par serveur : en changer désabonnerait tous les appareils.
    step "Backend : création des clés des notifications push"
    "$PYTHON" manage.py generate_vapid_keys | grep '^VAPID_' >> .env
  fi

  step "Backend : vérification de la configuration"
  "$PYTHON" manage.py check --deploy --fail-level ERROR

  step "Backend : redémarrage de l'API ($API_SERVICE)"
  sudo systemctl restart "$API_SERVICE"
  cd "$REPO_DIR"
fi

# ----------------------------------------------------------------- frontend
if changed '^(src/|public/|package(-lock)?\.json$|vite\.config|tsconfig|components\.json$)'; then
  if changed '^package(-lock)?\.json$' || [[ ! -d node_modules ]]; then
    step "Frontend : dépendances npm"
    npm install
  fi
  step "Frontend : build"
  npm run build
  step "Frontend : redémarrage ($FRONTEND_SERVICE)"
  sudo systemctl restart "$FRONTEND_SERVICE"
fi

# ------------------------------------------------------------- vérification
step "Vérification des services"
sleep 3
failed=0
for service in "$API_SERVICE" "$FRONTEND_SERVICE"; do
  if systemctl is-active --quiet "$service"; then
    ok "$service : en marche"
  else
    printf '\033[1;31m%s : ARRÊTÉ\033[0m\n' "$service"
    sudo journalctl -u "$service" -n 20 --no-pager || true
    failed=1
  fi
done
[[ "$failed" == "0" ]] || { echo "Un service ne tourne pas : voir les lignes ci-dessus." >&2; exit 1; }

printf '\n\033[1;32mMise à jour terminée.\033[0m\n'
