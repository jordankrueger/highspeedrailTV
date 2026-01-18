# HighSpeedRail.TV

A curated video site showcasing the best content about high-speed rail.

**Live site:** [highspeedrail.tv](https://highspeedrail.tv)

---

## How This Site Works

This is a static site built with [Eleventy](https://www.11ty.dev/). The workflow is:

1. **Edit files locally** (add videos, change content)
2. **Push to GitHub** → triggers automatic deployment
3. **Cloudflare Pages** builds and publishes the site

That's it. No server to manage. Cloudflare handles everything once you push.

---

## Quick Reference

| What you want to do | How to do it |
|---------------------|--------------|
| Add a video | Use the admin panel, or edit `src/_data/videos.json` directly |
| Change site content | Edit files in `src/`, push to GitHub |
| Deploy changes | Just `git push` — Cloudflare deploys automatically |
| Preview locally | `npm start` → visit http://localhost:8080 |

---

## Running the Admin Panel Locally

The admin panel lets you search YouTube, queue videos for review, and publish them to the site. It runs only on your local machine — it's not deployed to Cloudflare.

### First-Time Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create your `.env` file:**
   ```bash
   cp .env.example .env
   ```

3. **Edit `.env` and add your keys:**
   - `YOUTUBE_API_KEY` — Get one free from [Google Cloud Console](https://console.cloud.google.com/) (see `YOUTUBE_API_SETUP.md`)
   - `ADMIN_PASSWORD` — Choose any password for the admin panel
   - `ANTHROPIC_API_KEY` — (Optional) For AI-assisted video review

### Starting the Admin Server

```bash
npm run admin
```

Then open: http://localhost:3000/admin

Log in with the `ADMIN_PASSWORD` you set in `.env`.

### Running Site Preview + Admin Together

```bash
npm run dev
```

This starts both:
- Eleventy site preview at http://localhost:8080
- Admin panel at http://localhost:3000/admin

---

## Adding Videos

### Via Admin Panel (Recommended)

1. Start the admin server (`npm run admin`)
2. Search YouTube for videos
3. Add videos to the review queue
4. Approve and categorize them
5. Commit and push the updated `src/_data/videos.json`

### Manually

Edit `src/_data/videos.json` directly:

```json
{
  "id": "YOUTUBE_VIDEO_ID",
  "title": "Video Title",
  "description": "Brief description",
  "category": "explainers",
  "featured": false,
  "dateAdded": "2025-01-18"
}
```

### Categories

- `explainers` — Educational content about HSR
- `myth-busting` — Debunking misconceptions
- `international-hsr` — HSR systems around the world
- `construction-progress` — Updates on projects being built
- `advocacy-speeches` — Talks and presentations
- `rides-tours` — First-person HSR experiences

You can add more categories via the admin panel.

---

## Deployment

### How It's Set Up

The site deploys via **Cloudflare Pages** connected to this GitHub repo.

Cloudflare is configured with:
- **Build command:** `npm run build`
- **Output directory:** `_site`

### Deploying Changes

```bash
git add .
git commit -m "Add new videos"
git push
```

Cloudflare will automatically build and deploy within a minute or two.

### Checking Deployment Status

Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/) → Pages → highspeedrail-tv to see build logs and deployment status.

---

## Security Notes

**What's safe in this repo:**
- All the code, templates, and video data
- The `.env.example` file (shows what variables are needed, no real values)

**What's NOT in this repo (and shouldn't be):**
- `.env` — Contains your API keys and admin password
- `admin/data/` — Local queue, presets, blocklist (not needed for deployment)
- `node_modules/` and `_site/` — Generated files

The `.gitignore` is already set up to exclude these. Just don't manually add them.

**About the admin panel:** It only runs locally on your machine. It's not deployed to Cloudflare or accessible on the internet. The password and session are just to prevent someone with physical access to your computer from using it.

---

## File Structure

```
highspeedrailTV/
├── src/
│   ├── _data/
│   │   └── videos.json      ← The video catalog (this gets deployed)
│   ├── _includes/           ← HTML templates
│   ├── css/                 ← Styles
│   └── *.njk                ← Page templates
├── admin/
│   ├── server.js            ← Admin backend (local only)
│   ├── public/              ← Admin UI
│   └── data/                ← Local admin data (gitignored)
├── _site/                   ← Built site (gitignored)
├── .env                     ← Your secrets (gitignored)
├── .env.example             ← Template for .env
└── .eleventy.js             ← Build configuration
```

---

## Part of the HSR Network

- [hsr.fyi](https://hsr.fyi)
- [highspeedrail.tv](https://highspeedrail.tv)
