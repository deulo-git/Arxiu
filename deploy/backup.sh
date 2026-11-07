#!/bin/sh
# Còpia de seguretat de l'Arxiu (base de dades + documents) a deploy/backups.
# Programa-la cada nit amb «crontab -e»:
#   30 3 * * * /home/USUARI/Arxiu/deploy/backup.sh >> /home/USUARI/Arxiu/deploy/backups/backup.log 2>&1
set -e
cd "$(dirname "$0")"
docker compose exec -T arxiu node --disable-warning=ExperimentalWarning server/cli/backup.ts /backups 14
