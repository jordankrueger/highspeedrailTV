#!/bin/bash
# HSR TV Auto-Deploy
# Checks if videos.json has changed and pushes to GitHub → Cloudflare Pages auto-builds.
# Runs via LaunchAgent every 5 minutes.

REPO_DIR="/Users/jordankrueger/ClaudeCode/side-hustle/hsr/highspeedrailTV"
LOG="/tmp/hsr-auto-deploy.log"

cd "$REPO_DIR" || exit 1

# Check if videos.json has uncommitted changes
if [[ -n $(git status --porcelain src/_data/videos.json) ]]; then
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

    # Count new videos (rough: count lines added vs removed)
    NEW_COUNT=$(git diff --stat src/_data/videos.json | grep -o '[0-9]* insertion' | grep -o '[0-9]*' || echo "some")

    git add src/_data/videos.json
    git commit -m "Add new videos via admin panel

Auto-deployed $(date '+%Y-%m-%d %H:%M')" >> "$LOG" 2>&1

    if git push >> "$LOG" 2>&1; then
        echo "$TIMESTAMP - Pushed videos.json update to GitHub" >> "$LOG"
    else
        echo "$TIMESTAMP - ERROR: git push failed" >> "$LOG"
    fi
else
    # Only log once per hour to keep log clean
    MINUTE=$(date '+%M')
    if [[ "$MINUTE" == "00" || "$MINUTE" == "01" ]]; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') - No changes to videos.json" >> "$LOG"
    fi
fi
