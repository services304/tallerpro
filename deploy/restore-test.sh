#!/bin/sh
# Prueba mensual de restauración: carga el último respaldo en una base temporal y cuenta las órdenes.
set -eu
cd "$(dirname "$0")/.."
LAST=$(ls -t /home/ubuntu/backups/db-*.dump | head -1)
docker compose exec -T db psql -U tallerpro -d postgres -c "DROP DATABASE IF EXISTS restore_test" -c "CREATE DATABASE restore_test"
docker compose exec -T db pg_restore -U tallerpro -d restore_test < "$LAST"
docker compose exec -T db psql -U tallerpro -d restore_test -tAc "SELECT 'órdenes: ' || count(*) FROM orders"
docker compose exec -T db psql -U tallerpro -d postgres -c "DROP DATABASE restore_test"
