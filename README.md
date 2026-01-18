# HighSpeedRail.TV

A curated video site showcasing the best content about high-speed rail.

## Quick Start

```bash
npm install
npm start
```

The site will be available at `http://localhost:8080`.

## Admin Panel

The admin panel lets you search YouTube for HSR content, queue videos for review, and publish them to the site.

### Setup

1. **Get a YouTube API Key**
   Follow the instructions in `YOUTUBE_API_SETUP.md` to get your free API key.

2. **Create your `.env` file**
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` and add your YouTube API key and admin password.

3. **Install dependencies and start the admin server**
   ```bash
   npm install
   npm run admin
   ```

4. **Access the admin panel**
   Open `http://localhost:3000/admin` and log in with your admin password.

### Admin Features

- **YouTube Search**: Search for HSR videos by keyword or use saved search presets
- **Review Queue**: Add videos to a queue for review before publishing
- **Grid & Detail Views**: Quick scan in grid view, detailed review for selected videos
- **Full Video Preview**: Watch videos directly in the admin panel with embedded player
- **Category Management**: Add, edit, and delete video categories
- **Search Presets**: Save common searches for quick access
- **One-Click Publishing**: Approve videos with custom titles and descriptions

### Running Both Site and Admin

To run the Eleventy dev server and admin panel simultaneously:

```bash
npm run dev
```

This starts:
- Eleventy site at `http://localhost:8080`
- Admin panel at `http://localhost:3000/admin`

## Adding Videos Manually

You can still add videos by editing `src/_data/videos.json` directly:

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

You can add more categories through the admin panel.

### Setting a Featured Video
Set `"featured": true` on one video to highlight it on the homepage.

## Deployment

The site is configured for Cloudflare Pages:

1. Connect your GitHub repo to Cloudflare Pages
2. Build command: `npm run build`
3. Build output directory: `_site`

**Note:** The admin panel is for local use only. It modifies your `videos.json` file locally, which you then commit and push to deploy changes.

## Tech Stack
- [Eleventy](https://www.11ty.dev/) static site generator
- [Express](https://expressjs.com/) for admin backend
- YouTube Data API v3 for video search
- YouTube embeds with lazy loading
- Responsive CSS (no framework)

## Part of the HSR Network
- [hsr.fyi](https://hsr.fyi)
- [HighSpeedRail.TV](https://highspeedrail.tv)
