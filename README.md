# HighSpeedRail.TV

A curated video site showcasing the best content about high-speed rail.

## Quick Start

```bash
npm install
npm start
```

The site will be available at `http://localhost:8080`.

## Adding Videos

To add a new video, edit `src/_data/videos.json`:

```json
{
  "id": "YOUTUBE_VIDEO_ID",
  "title": "Video Title",
  "description": "Brief description of the video",
  "category": "category-slug",
  "featured": false,
  "dateAdded": "2025-01-16"
}
```

### Available Categories
- `myth-busting` - Debunking common HSR misconceptions
- `construction-progress` - Updates on HSR construction
- `international-hsr` - HSR systems around the world
- `explainers` - Educational content about HSR
- `advocacy-speeches` - Talks and presentations
- `rides-tours` - First-person HSR experiences

### Setting a Featured Video
Set `"featured": true` on one video to highlight it on the homepage.

## Deployment

The site is configured for Cloudflare Pages:

1. Connect your GitHub repo to Cloudflare Pages
2. Build command: `npm run build`
3. Build output directory: `_site`

## Tech Stack
- [Eleventy](https://www.11ty.dev/) static site generator
- YouTube embeds with lazy loading
- Responsive CSS (no framework)

## Part of the HSR Network
- [hsr.fyi](https://hsr.fyi)
- [HighSpeedRail.TV](https://highspeedrail.tv)
