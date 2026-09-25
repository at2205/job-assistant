#!/bin/bash
# Run Himalayas (remote jobs) discovery + ingest to DB
# First-time setup:  npx tsx src/himalayas-manual-login.ts   (sign in with Google)
# Usage:             bash run-himalayas-jobs.sh

set -e
cd "$(dirname "$0")"

echo "=== Himalayas Remote Job Discovery ==="
echo "Starting at $(date)"

npx tsx src/himalayas-job-discovery.ts

echo ""
echo "--- Ingesting latest results into PostgreSQL ---"
npx tsx src/ingest-results-to-db.ts

echo ""
echo "--- New (not-yet-seen) jobs ---"
npx tsx src/new-himalayas-jobs.ts || true

echo ""
echo "Done at $(date)"
