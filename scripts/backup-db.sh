#!/usr/bin/env bash
# =============================================================================
# ScanWaste MongoDB Automated Backup Script
# Creates timestamped mongodump compressed archive and retains 7 days
# =============================================================================

set -e

BACKUP_DIR="${BACKUP_DIR:-./backups/mongo}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/scanwaste_backup_${TIMESTAMP}.gz"
MONGO_CONTAINER="scanwaste-mongodb-prod"

mkdir -p "$BACKUP_DIR"

if docker ps --format '{{.Names}}' | grep -q "^${MONGO_CONTAINER}$"; then
    echo "💾 Backing up MongoDB from container '${MONGO_CONTAINER}'..."
    docker exec "$MONGO_CONTAINER" mongodump --archive --gzip --db waste_classification > "$BACKUP_FILE"
    echo "✅ Backup successfully saved to: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
    
    # Remove backups older than 7 days
    find "$BACKUP_DIR" -type f -name "scanwaste_backup_*.gz" -mtime +7 -delete 2>/dev/null || true
else
    echo "ℹ️ Container '${MONGO_CONTAINER}' is not currently running. Skipping backup."
fi
