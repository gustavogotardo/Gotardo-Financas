#!/bin/sh
set -eu

: "${PGHOST:?PGHOST obrigatório}"
: "${PGUSER:?PGUSER obrigatório}"
: "${PGDATABASE:?PGDATABASE obrigatório}"
: "${MINIO_ENDPOINT:?MINIO_ENDPOINT obrigatório}"
: "${MINIO_ROOT_USER:?MINIO_ROOT_USER obrigatório}"
: "${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD obrigatório}"
: "${BUCKET:?BUCKET obrigatório}"

SCHEDULE_HOURS="${BACKUP_SCHEDULE_HOURS:-24}"

run_backup() {
  TS="$(date +%Y%m%d-%H%M%S)"
  FILE="gotardo-${TS}.dump.gz"
  pg_dump -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -Fc | gzip -9 > "/tmp/${FILE}"
  mc cp "/tmp/${FILE}" "local/${BUCKET}/backups/db/" >/dev/null
  echo "[backup] ok: ${FILE}"
  rm -f "/tmp/${FILE}"
}

mc alias set local "http://${MINIO_ENDPOINT}" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null

if [ "${1:-}" = "--once" ]; then
  run_backup
  exit 0
fi

echo "[backup] agendado a cada ${SCHEDULE_HOURS}h"
while true; do
  run_backup
  sleep "$((SCHEDULE_HOURS * 3600))"
done