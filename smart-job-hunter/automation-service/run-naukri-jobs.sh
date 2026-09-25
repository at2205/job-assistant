#!/bin/bash
# Run Naukri Job Discovery + ATS Analysis
# Usage: bash run-naukri-jobs.sh

set -e
cd "$(dirname "$0")"

echo "=== Naukri Job Discovery + ATS Analysis ==="
echo "Starting at $(date)"

npx tsx src/naukri-job-discovery.ts

echo ""
echo "Done at $(date)"
