#!/bin/bash
# Run the LinkedIn Auto-Poster (AI text + AI-generated virtual image)
#
# Usage:
#   bash run-linkedin-post.sh                       # uses POST_TOPIC from .env
#   bash run-linkedin-post.sh "Your custom topic"   # one-off topic
#   POST_DRY_RUN=true bash run-linkedin-post.sh      # preview without publishing

set -e
cd "$(dirname "$0")"

echo "=== LinkedIn Auto-Poster ==="
echo "Starting at $(date)"
echo ""

node linkedin-auto-post.cjs "$@"

echo ""
echo "Done at $(date)"
