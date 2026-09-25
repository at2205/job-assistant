#!/bin/bash
# =============================================
# Database Restore Script
# =============================================
# Usage: ./restore-db.sh <backup_file>
# =============================================

set -euo pipefail

BACKUP_FILE="${1:?Usage: ./restore-db.sh <backup_file.sql.gz>}"

DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-jobhunter}"
DB_USER="${DB_USER:-jobhunter}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "WARNING: This will REPLACE all data in ${DB_NAME}."
echo "Press Ctrl+C to cancel, or wait 5 seconds..."
sleep 5

echo "[$(date)] Restoring from ${BACKUP_FILE}..."

PGPASSWORD="$DB_PASSWORD" pg_restore \
  -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  --clean --if-exists --no-owner --no-privileges \
  "$BACKUP_FILE"

echo "[$(date)] Restore complete."
