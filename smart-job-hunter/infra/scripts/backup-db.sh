#!/bin/bash
# =============================================
# Database Backup Script
# =============================================
# Usage: ./backup-db.sh [daily|weekly|manual]
# Stores: local + optional S3 upload
# Retention: 7 daily, 4 weekly, 12 monthly
# =============================================

set -euo pipefail

BACKUP_TYPE="${1:-daily}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/postgres"
BACKUP_FILE="${BACKUP_DIR}/${BACKUP_TYPE}_${TIMESTAMP}.sql.gz"

DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-jobhunter}"
DB_USER="${DB_USER:-jobhunter}"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting ${BACKUP_TYPE} backup..."

# Dump + compress
PGPASSWORD="$DB_PASSWORD" pg_dump \
  -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  --format=custom --compress=9 \
  --no-owner --no-privileges \
  > "$BACKUP_FILE"

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[$(date)] Backup complete: ${BACKUP_FILE} (${SIZE})"

# Upload to S3 (if configured)
if [ -n "${S3_BACKUP_BUCKET:-}" ]; then
  aws s3 cp "$BACKUP_FILE" "s3://${S3_BACKUP_BUCKET}/postgres/${BACKUP_TYPE}/" --storage-class STANDARD_IA
  echo "[$(date)] Uploaded to S3: s3://${S3_BACKUP_BUCKET}/postgres/${BACKUP_TYPE}/"
fi

# Retention cleanup
echo "[$(date)] Cleaning old backups..."
case "$BACKUP_TYPE" in
  daily)   find "$BACKUP_DIR" -name "daily_*" -mtime +7 -delete ;;
  weekly)  find "$BACKUP_DIR" -name "weekly_*" -mtime +28 -delete ;;
  monthly) find "$BACKUP_DIR" -name "monthly_*" -mtime +365 -delete ;;
esac

echo "[$(date)] Backup complete."
