#!/usr/bin/env python3
"""
Populates the HSR TV admin queue from the N8N discovery workflow results.
Fetches the latest execution data from CH N8N and adds approved videos to queue.json.

Usage:
  python3 queue-from-discovery.py          # fetch latest and queue approved videos
  python3 queue-from-discovery.py --dry-run # show what would be queued without writing
"""

import json
import os
import sys
import urllib.request

QUEUE_PATH = os.path.join(os.path.dirname(__file__), 'data', 'queue.json')
N8N_API_KEY = os.environ.get('CH_N8N_API_KEY', '')
N8N_BASE = 'https://n8n.campaign.help/api/v1'
WORKFLOW_ID = 'BfLcaNynkOScyHaG'

def fetch_latest_execution():
    """Get the most recent successful execution of the HSR discovery workflow."""
    url = f'{N8N_BASE}/executions?workflowId={WORKFLOW_ID}&limit=1&status=success'
    req = urllib.request.Request(url, headers={'X-N8N-API-KEY': N8N_API_KEY})
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))

    if not data.get('data'):
        print('No successful executions found.')
        return None

    ex_id = data['data'][0]['id']

    # Fetch with data
    url2 = f'{N8N_BASE}/executions/{ex_id}?includeData=true'
    req2 = urllib.request.Request(url2, headers={'X-N8N-API-KEY': N8N_API_KEY})
    with urllib.request.urlopen(req2) as resp2:
        return json.loads(resp2.read().decode('utf-8'))

def extract_approved_videos(execution):
    """Extract approved videos with full metadata from execution data."""
    runs = execution['data']['resultData']['runData']

    # Get search results (full video data)
    search_data = runs['Search YouTube & Filter'][0]['data']['main'][0][0]['json']
    video_map = {v['id']: v for v in search_data.get('videos', [])}

    # Get Claude's approved reviews
    digest_data = runs['Format Discovery Digest'][0]['data']['main'][0][0]['json']
    approved = digest_data.get('approved', [])

    results = []
    for review in approved:
        video = video_map.get(review['id'], {})
        results.append({
            'id': review['id'],
            'title': review.get('suggestedTitle') or video.get('title', ''),
            'description': review.get('suggestedDescription') or video.get('description', ''),
            'thumbnail': video.get('thumbnail', ''),
            'channelTitle': video.get('channelTitle', ''),
            'publishedAt': video.get('publishedAt', ''),
            'duration': video.get('duration', ''),
            'viewCount': str(video.get('viewCount', 0)),
            'likeCount': str(video.get('likeCount', 0)),
            'category': review.get('category', ''),
            'aiReason': review.get('reason', ''),
        })

    return results

def main():
    dry_run = '--dry-run' in sys.argv

    if not N8N_API_KEY:
        print('ERROR: CH_N8N_API_KEY not set')
        sys.exit(1)

    print('Fetching latest discovery execution...')
    execution = fetch_latest_execution()
    if not execution:
        sys.exit(1)

    approved = extract_approved_videos(execution)
    print(f'Found {len(approved)} approved videos from Claude.')

    # Load existing queue
    if os.path.exists(QUEUE_PATH):
        with open(QUEUE_PATH) as f:
            queue = json.load(f)
    else:
        queue = []

    existing_ids = {v['id'] for v in queue}

    # Also load published videos to avoid dupes
    videos_path = os.path.join(os.path.dirname(__file__), '..', 'src', '_data', 'videos.json')
    if os.path.exists(videos_path):
        with open(videos_path) as f:
            published = json.load(f)
        published_ids = {v['id'] for v in published}
    else:
        published_ids = set()

    added = 0
    skipped_queue = 0
    skipped_published = 0

    for video in approved:
        if video['id'] in existing_ids:
            skipped_queue += 1
            continue
        if video['id'] in published_ids:
            skipped_published += 1
            continue

        queue_item = {
            **video,
            'addedToQueue': __import__('datetime').datetime.now().isoformat(),
            'status': 'pending'
        }
        queue.append(queue_item)
        added += 1

        if dry_run:
            print(f'  Would add: [{video["category"]}] "{video["title"]}" ({video["viewCount"]} views)')
        else:
            print(f'  Added: [{video["category"]}] "{video["title"]}"')

    if not dry_run and added > 0:
        with open(QUEUE_PATH, 'w') as f:
            json.dump(queue, f, indent=2)

    print(f'\nDone: {added} added, {skipped_queue} already in queue, {skipped_published} already published.')
    if dry_run:
        print('(Dry run — nothing was written)')

if __name__ == '__main__':
    main()
