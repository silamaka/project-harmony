#!/usr/bin/env bash
# Sauvegarde de la base PostgreSQL d'OLYMPE.
#
#   bash backend/backup.sh
#
# Écrit une copie complète (format pg_dump "custom", compressé) dans
# BACKUP_DIR, vérifie qu'elle est lisible, puis supprime les copies de plus
# de KEEP_DAYS jours. Les accès à la base sont lus dans backend/.env
# (DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT).
#
# Variables facultatives :
#   BACKUP_DIR  dossier des sauvegardes (défaut : ~/olympe-backups)
#   KEEP_DAYS   nombre de jours conservés (défaut : 14)
#
# Restauration : voir la section « Sauvegardes » de backend/README.md.

set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$HOME/olympe-backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"

# Lit une variable du .env sans l'exécuter (un mot de passe peut contenir
# des caractères spéciaux pour le shell).
env_value() {
  local line
  line="$(grep -E "^$1=" "$BACKEND_DIR/.env" | tail -n 1 || true)"
  line="${line#*=}"
  line="${line%\"}"; line="${line#\"}"
  line="${line%\'}"; line="${line#\'}"
  printf '%s' "$line"
}

DB_NAME="$(env_value DB_NAME)";         DB_NAME="${DB_NAME:-project_harmony}"
DB_USER="$(env_value DB_USER)";         DB_USER="${DB_USER:-project_harmony}"
DB_HOST="$(env_value DB_HOST)";         DB_HOST="${DB_HOST:-localhost}"
DB_PORT="$(env_value DB_PORT)";         DB_PORT="${DB_PORT:-5432}"
export PGPASSWORD="$(env_value DB_PASSWORD)"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"  # la base contient les comptes clients : lisible par toi seul
FILE="$BACKUP_DIR/olympe-$(date +%Y%m%d-%H%M%S).dump"
TMP="$FILE.partial"

# Fichier temporaire puis renommage : une sauvegarde interrompue (disque
# plein, coupure) ne laisse jamais un fichier tronqué qui aurait l'air bon.
pg_dump --format=custom --no-owner --host="$DB_HOST" --port="$DB_PORT" \
  --username="$DB_USER" --file="$TMP" "$DB_NAME"
if ! pg_restore --list "$TMP" > /dev/null; then
  rm -f "$TMP"
  echo "ÉCHEC : la sauvegarde produite est illisible." >&2
  exit 1
fi
mv "$TMP" "$FILE"
chmod 600 "$FILE"

find "$BACKUP_DIR" -name 'olympe-*.dump' -type f -mtime +"$KEEP_DAYS" -delete

echo "Sauvegarde OK : $FILE ($(du -h "$FILE" | cut -f1))"
echo "$(find "$BACKUP_DIR" -name 'olympe-*.dump' -type f | wc -l) sauvegarde(s) conservée(s) dans $BACKUP_DIR"
