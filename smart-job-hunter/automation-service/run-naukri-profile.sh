#!/bin/bash
# Run Naukri Profile Updater
# Usage: bash run-naukri-profile.sh

set -e
cd "$(dirname "$0")"

echo "=== Naukri Profile Updater ==="
echo "Starting at $(date)"

npx tsx src/naukri-profile-updater.ts

echo ""
echo "Done at $(date)"
