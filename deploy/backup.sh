#!/bin/sh
# Copia diaria de la base de datos y de las fotos. Guarda 30 días.
# Programar con: crontab -e  →  15 3 * * * /home/ubuntu/tallerpro/deploy/backup.sh
# Si BACKUP_S3 está definido (ej. s3://tallerpro-respaldos), también sube la copia a S3 (aws cli).
set -eu
cd "$(dirname "$0")/.."
DIR=/home/ubuntu/backups
STAMP=$(date +%Y-%m-%d)
mkdir -p "$DIR"
docker compose exec -T db pg_dump -U tallerpro -Fc tallerpro > "$DIR/db-$STAMP.dump"
docker compose run --rm -T -v "$DIR":/backup --entrypoint sh app -c "tar czf /backup/storage-$STAMP.tgz -C /data storage"
find "$DIR" -type f -mtime +30 -delete
if [ -n "${BACKUP_S3:-}" ]; then aws s3 sync "$DIR" "$BACKUP_S3" --delete; fi
echo "respaldo $STAMP listo"
