#!/usr/bin/env bash
# =============================================================================
# ScanWaste Production Deployment Script
# Automatically pulls code, validates health, builds containers and rotates
# =============================================================================

set -e

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

echo "=========================================================="
echo "🚀 Starting ScanWaste Production Deployment: $(date)"
echo "📍 Application directory: $APP_DIR"
echo "=========================================================="

# 1. Check for required env file
ENV_FILE=".env.production"
if [ ! -f "$ENV_FILE" ]; then
    if [ -f ".env" ]; then
        echo "⚠️ .env.production not found, falling back to .env"
        ENV_FILE=".env"
    else
        echo "❌ ERROR: Neither .env.production nor .env found! Aborting deployment."
        exit 1
    fi
fi

# 2. Check for docker and docker compose
if ! command -v docker &> /dev/null; then
    echo "❌ ERROR: docker command not found."
    exit 1
fi

# 3. Automatic MongoDB Backup prior to deployment (if containers are running)
if [ -f "./scripts/backup-db.sh" ]; then
    echo "📦 Backing up MongoDB before deployment..."
    chmod +x ./scripts/backup-db.sh || true
    ./scripts/backup-db.sh || echo "⚠️ Warning: DB backup failed or DB was not yet initialized."
fi

# 4. Pull latest git changes (if this is a git clone)
if [ -d ".git" ]; then
    echo "📥 Pulling latest git changes..."
    git pull origin main || git pull origin master || true
fi

# 5. Build and start containers using production compose
echo "🔨 Building and restarting production containers..."
docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml down --remove-orphans || true
docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml up -d --build

# 6. Verify healthcheck
echo "⏳ Waiting for services to become healthy..."
MAX_RETRIES=20
COUNT=0
HEALTHY=false

while [ $COUNT -lt $MAX_RETRIES ]; do
    sleep 3
    COUNT=$((COUNT + 1))
    
    # Check Nginx / Backend health endpoint
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/api/health || curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5000/api/health || echo "000")
    
    if [ "$HTTP_CODE" = "200" ]; then
        HEALTHY=true
        echo "✅ Services are UP and healthy! (HTTP 200 after $COUNT attempts)"
        break
    fi
    echo "   Attempt $COUNT/$MAX_RETRIES: Status $HTTP_CODE... waiting"
done

if [ "$HEALTHY" = false ]; then
    echo "❌ Deployment verification FAILED! Showing recent container logs:"
    docker compose -f docker-compose.prod.yml logs --tail=50
    exit 1
fi

# 7. Clean up dangling images to preserve server disk space
echo "🧹 Pruning unused Docker images..."
docker image prune -f || true

echo "=========================================================="
echo "🎉 ScanWaste Production Deployment COMPLETED SUCCESSFULLY!"
echo "=========================================================="
