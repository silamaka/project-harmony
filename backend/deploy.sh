#!/usr/bin/env bash
# Ancien point d'entrée, conservé pour les habitudes existantes : le
# déploiement complet (backend ET frontend) est désormais deploy.sh à la
# racine du projet.
exec bash "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/deploy.sh" "$@"
