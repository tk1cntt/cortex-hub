#!/usr/bin/env bash
# ──────────────────────────────────────────────
# Deploy Cortex Hub services with fresh build.
#
# Usage:
#   ./scripts/deploy.sh              # all services
#   ./scripts/deploy.sh cortex-api   # single service
#
# Why this script?
#   docker compose up -d does NOT recreate containers when the local
#   image is rebuilt with the same tag. This script forces both
#   rebuild (--no-cache) and container recreation (--force-recreate).
# ──────────────────────────────────────────────
set -euo pipefail

COMPOSE_FILE="infra/docker-compose.yml"
SERVICE="${1:-}"

cd "$(dirname "$0")/.."

if [ -n "$SERVICE" ]; then
  echo "🔨 Building: $SERVICE"
  DOCKER_BUILDKIT=1 sg docker -c "docker compose -f $COMPOSE_FILE build --no-cache $SERVICE"
  echo "🚀 Starting: $SERVICE"
  sg docker -c "docker compose -f $COMPOSE_FILE up -d --force-recreate $SERVICE"
else
  echo "🔨 Building all services..."
  DOCKER_BUILDKIT=1 sg docker -c "docker compose -f $COMPOSE_FILE build --no-cache"
  echo "🚀 Starting all services..."
  sg docker -c "docker compose -f $COMPOSE_FILE up -d --force-recreate"
fi

echo ""
echo "✅ Deployment complete."
sg docker -c "docker compose -f $COMPOSE_FILE ps"
