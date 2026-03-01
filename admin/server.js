const express = require('express')
const session = require('express-session')
const path = require('path')
const fs = require('fs').promises
const { execSync } = require('child_process')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

// Git helpers — repo root is one level up from admin/
const REPO_ROOT = path.join(__dirname, '..')

let lastPullTime = 0
function gitPull() {
  const now = Date.now()
  if (now - lastPullTime < 30_000) return true // debounce: max once per 30s
  lastPullTime = now
  try {
    execSync('git pull --ff-only', {
      cwd: REPO_ROOT,
      timeout: 10_000,
      stdio: 'pipe',
    })
    console.log('[git] pull succeeded')
    return true
  } catch (err) {
    console.error('[git] pull failed:', err.message)
    return false
  }
}

function gitPushFiles(files, message) {
  try {
    execSync(`git add ${files.join(' ')}`, {
      cwd: REPO_ROOT,
      timeout: 10_000,
      stdio: 'pipe',
    })

    // Check if there are staged changes before committing
    try {
      execSync('git diff --cached --quiet', {
        cwd: REPO_ROOT,
        timeout: 5_000,
        stdio: 'pipe',
      })
      console.log('[git] no changes to commit')
      return true // nothing to commit is fine
    } catch {
      // diff --cached --quiet exits non-zero when there ARE changes — that's what we want
    }

    execSync(`git commit -m "${message}"`, {
      cwd: REPO_ROOT,
      timeout: 10_000,
      stdio: 'pipe',
    })
    execSync('git push', { cwd: REPO_ROOT, timeout: 30_000, stdio: 'pipe' })
    console.log(`[git] pushed: ${message}`)
    return true
  } catch (err) {
    console.error('[git] push failed:', err.message)
    return false
  }
}

// Anthropic API helper (using native fetch instead of SDK)
async function callClaude(messages, maxTokens = 4096) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured')
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      messages: messages,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'API request failed')
  }

  return response.json()
}

const app = express()
const PORT = process.env.ADMIN_PORT || 3000

// Middleware
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static(path.join(__dirname, 'public')))

// Session configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'hsrtv-admin-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Set to true if using HTTPS
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
)

// File paths
const VIDEOS_PATH = path.join(__dirname, '..', 'src', '_data', 'videos.json')
const QUEUE_PATH = path.join(__dirname, 'data', 'queue.json')
const PRESETS_PATH = path.join(__dirname, 'data', 'presets.json')
const CATEGORIES_PATH = path.join(__dirname, 'data', 'categories.json')
const BLOCKLIST_PATH = path.join(__dirname, 'data', 'blocklist.json')
const SETTINGS_PATH = path.join(__dirname, 'data', 'settings.json')

// Ensure data directory exists
async function ensureDataDir() {
  const dataDir = path.join(__dirname, 'data')
  try {
    await fs.access(dataDir)
  } catch {
    await fs.mkdir(dataDir, { recursive: true })
  }
}

// Initialize data files if they don't exist
async function initDataFiles() {
  await ensureDataDir()

  // Initialize queue
  try {
    await fs.access(QUEUE_PATH)
  } catch {
    await fs.writeFile(QUEUE_PATH, JSON.stringify([], null, 2))
  }

  // Initialize presets with some defaults
  try {
    await fs.access(PRESETS_PATH)
  } catch {
    const defaultPresets = [
      {
        id: 1,
        name: 'California HSR News',
        query: 'California high speed rail',
        maxResults: 10,
      },
      {
        id: 2,
        name: 'Texas Central',
        query: 'Texas Central Railway high speed',
        maxResults: 10,
      },
      {
        id: 3,
        name: 'Brightline Updates',
        query: 'Brightline train Florida',
        maxResults: 10,
      },
      {
        id: 4,
        name: 'International HSR',
        query: 'high speed rail Japan OR France OR Spain OR China',
        maxResults: 10,
      },
      {
        id: 5,
        name: 'HSR Explainers',
        query: 'high speed rail explained OR "how high speed rail works"',
        maxResults: 10,
      },
    ]
    await fs.writeFile(PRESETS_PATH, JSON.stringify(defaultPresets, null, 2))
  }

  // Initialize categories from existing videos
  try {
    await fs.access(CATEGORIES_PATH)
  } catch {
    const defaultCategories = [
      {
        slug: 'explainers',
        name: 'Explainers',
        description: 'Educational content explaining HSR concepts',
      },
      {
        slug: 'myth-busting',
        name: 'Myth Busting',
        description: 'Debunking common misconceptions about rail',
      },
      {
        slug: 'international-hsr',
        name: 'International HSR',
        description: 'High-speed rail systems around the world',
      },
      {
        slug: 'construction-progress',
        name: 'Construction Progress',
        description: 'Updates on HSR projects being built',
      },
      {
        slug: 'advocacy-speeches',
        name: 'Advocacy & Speeches',
        description: 'Pro-rail advocacy and public talks',
      },
      {
        slug: 'rides-tours',
        name: 'Rides & Tours',
        description: 'First-person experiences riding HSR',
      },
    ]
    await fs.writeFile(
      CATEGORIES_PATH,
      JSON.stringify(defaultCategories, null, 2)
    )
  }

  // Initialize blocklist
  try {
    await fs.access(BLOCKLIST_PATH)
  } catch {
    const defaultBlocklist = {
      channels: [],
      keywords: [
        'EXPOSED',
        'PANICS',
        'SLAMMED',
        'DESTROYS',
        'DEMOLISHED',
        'HUMILIATED',
        'OWNED',
        'TRIGGERED',
        'MELTDOWN',
        'BOMBSHELL',
      ],
    }
    await fs.writeFile(
      BLOCKLIST_PATH,
      JSON.stringify(defaultBlocklist, null, 2)
    )
  }

  // Initialize settings
  try {
    await fs.access(SETTINGS_PATH)
  } catch {
    const defaultSettings = {
      footerLinks: [
        { id: 1, label: 'hsr.fyi', url: 'https://hsr.fyi' },
        { id: 2, label: 'HSR Alliance', url: 'https://www.hsrail.org' },
        { id: 3, label: 'CA HSR Authority', url: 'https://hsr.ca.gov' },
      ],
    }
    await fs.writeFile(SETTINGS_PATH, JSON.stringify(defaultSettings, null, 2))
  }
}

// Helper functions
async function readJSON(filepath) {
  const data = await fs.readFile(filepath, 'utf-8')
  return JSON.parse(data)
}

async function writeJSON(filepath, data) {
  await fs.writeFile(filepath, JSON.stringify(data, null, 2))
}

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session.authenticated) {
    next()
  } else {
    res.status(401).json({ error: 'Unauthorized' })
  }
}

// Auth routes
app.post('/api/login', (req, res) => {
  const { password } = req.body
  if (password === process.env.ADMIN_PASSWORD) {
    req.session.authenticated = true
    res.json({ success: true })
  } else {
    res.status(401).json({ error: 'Invalid password' })
  }
})

app.post('/api/logout', (req, res) => {
  req.session.destroy()
  res.json({ success: true })
})

app.get('/api/auth-status', (req, res) => {
  res.json({ authenticated: !!req.session.authenticated })
})

// YouTube API routes
app.get('/api/youtube/search', requireAuth, async (req, res) => {
  const {
    q,
    maxResults = 10,
    pageToken,
    publishedAfter,
    publishedBefore,
    order = 'date',
    videoDuration = 'medium',
    minViews = 0,
    relevanceLanguage = 'en',
  } = req.query
  const apiKey = process.env.YOUTUBE_API_KEY

  if (!apiKey) {
    return res.status(500).json({ error: 'YouTube API key not configured' })
  }

  try {
    const params = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      maxResults: maxResults,
      order: order,
      videoDuration: videoDuration,
      key: apiKey,
    })

    // Only add query if provided (allows browsing without search terms)
    if (q && q.trim()) {
      params.append('q', q)
    }

    // Date filters
    if (publishedAfter) {
      params.append('publishedAfter', publishedAfter)
    }
    if (publishedBefore) {
      params.append('publishedBefore', publishedBefore)
    }

    // Language filter - relevanceLanguage helps prioritize but doesn't strictly filter
    if (relevanceLanguage) {
      params.append('relevanceLanguage', relevanceLanguage)
    }

    if (pageToken) {
      params.append('pageToken', pageToken)
    }

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${params}`
    )
    const data = await response.json()

    if (data.error) {
      return res.status(400).json({ error: data.error.message })
    }

    // Get video IDs for additional details
    const videoIds = data.items.map((item) => item.id.videoId).join(',')

    // Fetch video details (duration, view count, etc.)
    const detailsParams = new URLSearchParams({
      part: 'contentDetails,statistics',
      id: videoIds,
      key: apiKey,
    })

    const detailsResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?${detailsParams}`
    )
    const detailsData = await detailsResponse.json()

    // Merge details with search results
    let videos = data.items.map((item) => {
      const details =
        detailsData.items.find((d) => d.id === item.id.videoId) || {}
      return {
        id: item.id.videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnail: item.snippet.thumbnails.medium.url,
        channelTitle: item.snippet.channelTitle,
        publishedAt: item.snippet.publishedAt,
        duration: details.contentDetails?.duration,
        viewCount: details.statistics?.viewCount,
        likeCount: details.statistics?.likeCount,
      }
    })

    // Filter by minimum views if specified
    if (minViews > 0) {
      videos = videos.filter(
        (v) => parseInt(v.viewCount || 0) >= parseInt(minViews)
      )
    }

    res.json({
      videos,
      nextPageToken: data.nextPageToken,
      totalResults: data.pageInfo.totalResults,
    })
  } catch (error) {
    console.error('YouTube API error:', error)
    res.status(500).json({ error: 'Failed to search YouTube' })
  }
})

// Get video details by ID (for bulk import)
app.get('/api/youtube/video/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const apiKey = process.env.YOUTUBE_API_KEY

  if (!apiKey) {
    return res.status(500).json({ error: 'YouTube API key not configured' })
  }

  try {
    const params = new URLSearchParams({
      part: 'snippet,contentDetails,statistics',
      id: id,
      key: apiKey,
    })

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?${params}`
    )
    const data = await response.json()

    if (data.error) {
      return res.status(400).json({ error: data.error.message })
    }

    if (!data.items || data.items.length === 0) {
      return res.status(404).json({ error: 'Video not found' })
    }

    const item = data.items[0]
    const video = {
      id: item.id,
      title: item.snippet.title,
      description: item.snippet.description,
      thumbnail:
        item.snippet.thumbnails.medium?.url ||
        item.snippet.thumbnails.default?.url,
      channelTitle: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
      duration: item.contentDetails?.duration,
      viewCount: item.statistics?.viewCount,
      likeCount: item.statistics?.likeCount,
    }

    res.json(video)
  } catch (error) {
    console.error('YouTube API error:', error)
    res.status(500).json({ error: 'Failed to fetch video' })
  }
})

// Queue routes
app.get('/api/queue', requireAuth, async (req, res) => {
  gitPull()
  const queue = await readJSON(QUEUE_PATH)
  res.json(queue)
})

app.post('/api/queue', requireAuth, async (req, res) => {
  const { video } = req.body
  const queue = await readJSON(QUEUE_PATH)

  // Check if already in queue
  if (queue.some((v) => v.id === video.id)) {
    return res.status(400).json({ error: 'Video already in queue' })
  }

  // Check if already published
  const videos = await readJSON(VIDEOS_PATH)
  if (videos.some((v) => v.id === video.id)) {
    return res.status(400).json({ error: 'Video already published' })
  }

  queue.push({
    ...video,
    addedToQueue: new Date().toISOString(),
    status: 'pending',
  })

  await writeJSON(QUEUE_PATH, queue)
  res.json({ success: true })
})

// Clear entire queue
app.post('/api/queue/clear', requireAuth, async (req, res) => {
  await writeJSON(QUEUE_PATH, [])
  res.json({ success: true })
})

app.delete('/api/queue/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  let queue = await readJSON(QUEUE_PATH)
  queue = queue.filter((v) => v.id !== id)
  await writeJSON(QUEUE_PATH, queue)
  res.json({ success: true })
})

app.post('/api/queue/:id/approve', requireAuth, async (req, res) => {
  const { id } = req.params
  const { title, description, category, featured } = req.body

  // Get queue and remove the video
  let queue = await readJSON(QUEUE_PATH)
  const queueItem = queue.find((v) => v.id === id)

  if (!queueItem) {
    return res.status(404).json({ error: 'Video not in queue' })
  }

  queue = queue.filter((v) => v.id !== id)

  // Add to videos.json
  const videos = await readJSON(VIDEOS_PATH)

  // If this is marked as featured, unfeatured any existing featured video
  if (featured) {
    videos.forEach((v) => (v.featured = false))
  }

  videos.unshift({
    id,
    title: title || queueItem.title,
    description: description || queueItem.description,
    category,
    featured: featured || false,
    dateAdded: new Date().toISOString().split('T')[0],
  })

  await writeJSON(QUEUE_PATH, queue)
  await writeJSON(VIDEOS_PATH, videos)

  const deployed = gitPushFiles(
    ['src/_data/videos.json', 'admin/data/queue.json'],
    `Approve video: ${(title || queueItem.title).slice(0, 50)}`
  )
  res.json({ success: true, deployed })
})

// Publish all queue items at once
app.post('/api/queue/publish-all', requireAuth, async (req, res) => {
  let queue = await readJSON(QUEUE_PATH)

  if (queue.length === 0) {
    return res.status(400).json({ error: 'Queue is empty' })
  }

  const videos = await readJSON(VIDEOS_PATH)

  for (const item of queue) {
    videos.unshift({
      id: item.id,
      title: item.title,
      description: item.description,
      category: item.category || 'explainers',
      featured: false,
      dateAdded: new Date().toISOString().split('T')[0],
    })
  }

  const publishedCount = queue.length
  await writeJSON(QUEUE_PATH, [])
  await writeJSON(VIDEOS_PATH, videos)

  const deployed = gitPushFiles(
    ['src/_data/videos.json', 'admin/data/queue.json'],
    `Publish ${publishedCount} videos from queue`
  )
  res.json({ success: true, published: publishedCount, deployed })
})

// Search presets routes
app.get('/api/presets', requireAuth, async (req, res) => {
  const presets = await readJSON(PRESETS_PATH)
  res.json(presets)
})

app.post('/api/presets', requireAuth, async (req, res) => {
  const { name, query, maxResults = 10 } = req.body
  const presets = await readJSON(PRESETS_PATH)

  const newPreset = {
    id: Date.now(),
    name,
    query,
    maxResults,
  }

  presets.push(newPreset)
  await writeJSON(PRESETS_PATH, presets)
  res.json(newPreset)
})

app.put('/api/presets/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const { name, query, maxResults } = req.body
  const presets = await readJSON(PRESETS_PATH)

  const index = presets.findIndex((p) => p.id === parseInt(id))
  if (index === -1) {
    return res.status(404).json({ error: 'Preset not found' })
  }

  presets[index] = { ...presets[index], name, query, maxResults }
  await writeJSON(PRESETS_PATH, presets)
  res.json(presets[index])
})

app.delete('/api/presets/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  let presets = await readJSON(PRESETS_PATH)
  presets = presets.filter((p) => p.id !== parseInt(id))
  await writeJSON(PRESETS_PATH, presets)
  res.json({ success: true })
})

// Categories routes
app.get('/api/categories', requireAuth, async (req, res) => {
  const categories = await readJSON(CATEGORIES_PATH)
  res.json(categories)
})

app.post('/api/categories', requireAuth, async (req, res) => {
  const { name, description } = req.body
  const categories = await readJSON(CATEGORIES_PATH)

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  if (categories.some((c) => c.slug === slug)) {
    return res.status(400).json({ error: 'Category already exists' })
  }

  const newCategory = { slug, name, description }
  categories.push(newCategory)
  await writeJSON(CATEGORIES_PATH, categories)
  res.json(newCategory)
})

app.put('/api/categories/:slug', requireAuth, async (req, res) => {
  const { slug } = req.params
  const { name, description } = req.body
  const categories = await readJSON(CATEGORIES_PATH)

  const index = categories.findIndex((c) => c.slug === slug)
  if (index === -1) {
    return res.status(404).json({ error: 'Category not found' })
  }

  categories[index] = { ...categories[index], name, description }
  await writeJSON(CATEGORIES_PATH, categories)
  res.json(categories[index])
})

app.delete('/api/categories/:slug', requireAuth, async (req, res) => {
  const { slug } = req.params

  // Check if category is in use
  const videos = await readJSON(VIDEOS_PATH)
  if (videos.some((v) => v.category === slug)) {
    return res
      .status(400)
      .json({ error: 'Cannot delete category that has videos' })
  }

  let categories = await readJSON(CATEGORIES_PATH)
  categories = categories.filter((c) => c.slug !== slug)
  await writeJSON(CATEGORIES_PATH, categories)
  res.json({ success: true })
})

// Blocklist routes
app.get('/api/blocklist', requireAuth, async (req, res) => {
  const blocklist = await readJSON(BLOCKLIST_PATH)
  res.json(blocklist)
})

app.post('/api/blocklist/channel', requireAuth, async (req, res) => {
  const { channel } = req.body
  const blocklist = await readJSON(BLOCKLIST_PATH)

  if (!blocklist.channels.includes(channel)) {
    blocklist.channels.push(channel)
    await writeJSON(BLOCKLIST_PATH, blocklist)
  }

  res.json(blocklist)
})

app.delete('/api/blocklist/channel/:channel', requireAuth, async (req, res) => {
  const { channel } = req.params
  const blocklist = await readJSON(BLOCKLIST_PATH)

  blocklist.channels = blocklist.channels.filter((c) => c !== channel)
  await writeJSON(BLOCKLIST_PATH, blocklist)

  res.json(blocklist)
})

app.post('/api/blocklist/keyword', requireAuth, async (req, res) => {
  const { keyword } = req.body
  const blocklist = await readJSON(BLOCKLIST_PATH)

  const upperKeyword = keyword.toUpperCase()
  if (!blocklist.keywords.includes(upperKeyword)) {
    blocklist.keywords.push(upperKeyword)
    await writeJSON(BLOCKLIST_PATH, blocklist)
  }

  res.json(blocklist)
})

app.delete('/api/blocklist/keyword/:keyword', requireAuth, async (req, res) => {
  const { keyword } = req.params
  const blocklist = await readJSON(BLOCKLIST_PATH)

  blocklist.keywords = blocklist.keywords.filter((k) => k !== keyword)
  await writeJSON(BLOCKLIST_PATH, blocklist)

  res.json(blocklist)
})

// Published videos routes
app.get('/api/videos', requireAuth, async (req, res) => {
  const videos = await readJSON(VIDEOS_PATH)
  res.json(videos)
})

app.put('/api/videos/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const { title, description, category, featured } = req.body
  const videos = await readJSON(VIDEOS_PATH)

  const index = videos.findIndex((v) => v.id === id)
  if (index === -1) {
    return res.status(404).json({ error: 'Video not found' })
  }

  // If this is marked as featured, unfeatured any existing featured video
  if (featured) {
    videos.forEach((v) => (v.featured = false))
  }

  videos[index] = { ...videos[index], title, description, category, featured }
  await writeJSON(VIDEOS_PATH, videos)
  res.json(videos[index])
})

app.delete('/api/videos/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  let videos = await readJSON(VIDEOS_PATH)
  videos = videos.filter((v) => v.id !== id)
  await writeJSON(VIDEOS_PATH, videos)
  const deployed = gitPushFiles(['src/_data/videos.json'], `Remove video ${id}`)
  res.json({ success: true, deployed })
})

// Set featured video
app.post('/api/videos/:id/feature', requireAuth, async (req, res) => {
  const { id } = req.params
  const videos = await readJSON(VIDEOS_PATH)

  const index = videos.findIndex((v) => v.id === id)
  if (index === -1) {
    return res.status(404).json({ error: 'Video not found' })
  }

  // Unfeature all videos, then feature the selected one
  videos.forEach((v) => (v.featured = false))
  videos[index].featured = true

  await writeJSON(VIDEOS_PATH, videos)
  res.json({ success: true, featured: videos[index] })
})

// Settings routes
app.get('/api/settings', requireAuth, async (req, res) => {
  const settings = await readJSON(SETTINGS_PATH)
  res.json(settings)
})

app.get('/api/settings/footer-links', requireAuth, async (req, res) => {
  const settings = await readJSON(SETTINGS_PATH)
  res.json(settings.footerLinks || [])
})

app.post('/api/settings/footer-links', requireAuth, async (req, res) => {
  const { label, url } = req.body

  if (!label || !url) {
    return res.status(400).json({ error: 'Label and URL are required' })
  }

  const settings = await readJSON(SETTINGS_PATH)
  const newLink = {
    id: Date.now(),
    label,
    url,
  }

  settings.footerLinks = settings.footerLinks || []
  settings.footerLinks.push(newLink)

  await writeJSON(SETTINGS_PATH, settings)
  res.json(newLink)
})

app.delete('/api/settings/footer-links/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const settings = await readJSON(SETTINGS_PATH)

  settings.footerLinks = (settings.footerLinks || []).filter(
    (l) => l.id !== parseInt(id)
  )

  await writeJSON(SETTINGS_PATH, settings)
  res.json({ success: true })
})

app.put('/api/settings/footer-links/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const { label, url } = req.body
  const settings = await readJSON(SETTINGS_PATH)

  const index = (settings.footerLinks || []).findIndex(
    (l) => l.id === parseInt(id)
  )
  if (index === -1) {
    return res.status(404).json({ error: 'Link not found' })
  }

  settings.footerLinks[index] = { ...settings.footerLinks[index], label, url }

  await writeJSON(SETTINGS_PATH, settings)
  res.json(settings.footerLinks[index])
})

// Tracking settings routes
app.get('/api/settings/tracking', requireAuth, async (req, res) => {
  const settings = await readJSON(SETTINGS_PATH)
  res.json({
    googleAnalyticsId: settings.googleAnalyticsId || '',
  })
})

app.post('/api/settings/tracking', requireAuth, async (req, res) => {
  const { googleAnalyticsId } = req.body
  const settings = await readJSON(SETTINGS_PATH)

  settings.googleAnalyticsId = googleAnalyticsId || ''

  await writeJSON(SETTINGS_PATH, settings)
  res.json({ success: true, googleAnalyticsId: settings.googleAnalyticsId })
})

// Build site endpoint
app.post('/api/build', requireAuth, async (req, res) => {
  const { exec } = require('child_process')
  const projectRoot = path.join(__dirname, '..')

  exec('npm run build', { cwd: projectRoot }, (error, stdout, stderr) => {
    if (error) {
      console.error('Build error:', error)
      return res.status(500).json({ error: 'Build failed', details: stderr })
    }
    res.json({ success: true, output: stdout })
  })
})

// AI Review endpoint with streaming progress
app.post('/api/ai-review', requireAuth, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error:
        'Anthropic API key not configured. Add ANTHROPIC_API_KEY to your .env file.',
    })
  }

  try {
    const queue = await readJSON(QUEUE_PATH)
    const categories = await readJSON(CATEGORIES_PATH)

    if (queue.length === 0) {
      return res.json({ reviews: [], message: 'Queue is empty' })
    }

    // Set up Server-Sent Events for progress
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const categoryList = categories
      .map((c) => `- ${c.slug}: ${c.name} - ${c.description}`)
      .join('\n')

    // Process in batches of 15 videos
    const BATCH_SIZE = 15
    const allReviews = []
    const totalBatches = Math.ceil(queue.length / BATCH_SIZE)

    for (let i = 0; i < queue.length; i += BATCH_SIZE) {
      const batch = queue.slice(i, i + BATCH_SIZE)
      const batchNum = Math.floor(i / BATCH_SIZE) + 1

      // Send progress update
      res.write(
        `data: ${JSON.stringify({
          type: 'progress',
          batch: batchNum,
          totalBatches,
          processed: i,
          total: queue.length,
        })}\n\n`
      )

      const videoList = batch
        .map((v, idx) => {
          const views = parseInt(v.viewCount || 0)
          return `Video ${i + idx + 1}:
- ID: ${v.id}
- Title: ${v.title}
- Channel: ${v.channelTitle}
- Description: ${v.description || 'No description'}
- Views: ${views.toLocaleString()}
- Published: ${v.publishedAt}`
        })
        .join('\n\n')

      const prompt = `You are a content curator for HighSpeedRail.tv, a website that showcases positive content about high-speed rail and trains.

CATEGORIES AVAILABLE:
${categoryList}

VIDEOS TO REVIEW:
${videoList}

REVIEW CRITERIA:
1. REJECT if views < 10,000
2. REJECT if the video is NOT positive about high-speed rail / trains OR is actively against HSR development
3. Be LENIENT on topic - videos about trains, transit, infrastructure, and related topics are OK even if not specifically about HSR
4. Accept videos that are educational, advocacy, ride experiences, construction updates, or generally pro-transit

For each video, respond with a JSON object in this exact format:
{
  "reviews": [
    {
      "id": "VIDEO_ID",
      "action": "approve" or "reject",
      "category": "category-slug" (only if approving),
      "reason": "Brief explanation of your decision",
      "suggestedTitle": "Cleaned up title if needed" (only if approving),
      "suggestedDescription": "Brief 1-2 sentence description" (only if approving)
    }
  ]
}

Respond ONLY with valid JSON, no additional text.`

      const message = await callClaude([{ role: 'user', content: prompt }])

      // Parse the response
      const responseText = message.content[0].text
      let batchReviews

      try {
        batchReviews = JSON.parse(responseText)
      } catch (parseError) {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          batchReviews = JSON.parse(jsonMatch[0])
        } else {
          console.error('Failed to parse batch response:', responseText)
          continue
        }
      }

      if (batchReviews.reviews) {
        allReviews.push(...batchReviews.reviews)
      }
    }

    // Send final result
    res.write(
      `data: ${JSON.stringify({ type: 'complete', reviews: allReviews })}\n\n`
    )
    res.end()
  } catch (error) {
    console.error('AI Review error:', error)
    res.write(
      `data: ${JSON.stringify({ type: 'error', error: error.message || 'AI review failed' })}\n\n`
    )
    res.end()
  }
})

// Bulk approve endpoint for AI recommendations
app.post('/api/ai-review/apply', requireAuth, async (req, res) => {
  const { approvals } = req.body // Array of { id, category, title, description }

  if (!approvals || !Array.isArray(approvals)) {
    return res.status(400).json({ error: 'Invalid approvals data' })
  }

  try {
    let queue = await readJSON(QUEUE_PATH)
    const videos = await readJSON(VIDEOS_PATH)
    let approved = 0

    for (const approval of approvals) {
      const queueItem = queue.find((v) => v.id === approval.id)
      if (!queueItem) continue

      // Remove from queue
      queue = queue.filter((v) => v.id !== approval.id)

      // Add to videos
      videos.unshift({
        id: approval.id,
        title: approval.title || queueItem.title,
        description:
          approval.description || queueItem.description?.slice(0, 200) || '',
        category: approval.category,
        featured: false,
        dateAdded: new Date().toISOString().split('T')[0],
      })

      approved++
    }

    await writeJSON(QUEUE_PATH, queue)
    await writeJSON(VIDEOS_PATH, videos)

    const deployed = gitPushFiles(
      ['src/_data/videos.json', 'admin/data/queue.json'],
      `Bulk approve ${approved} videos via AI review`
    )
    res.json({ success: true, approved, deployed })
  } catch (error) {
    console.error('Bulk approve error:', error)
    res.status(500).json({ error: 'Failed to apply approvals' })
  }
})

// Bulk reject endpoint for AI recommendations
app.post('/api/ai-review/reject', requireAuth, async (req, res) => {
  const { rejections } = req.body // Array of video IDs to reject

  if (!rejections || !Array.isArray(rejections)) {
    return res.status(400).json({ error: 'Invalid rejections data' })
  }

  try {
    let queue = await readJSON(QUEUE_PATH)
    const originalLength = queue.length

    queue = queue.filter((v) => !rejections.includes(v.id))

    await writeJSON(QUEUE_PATH, queue)

    res.json({ success: true, rejected: originalLength - queue.length })
  } catch (error) {
    console.error('Bulk reject error:', error)
    res.status(500).json({ error: 'Failed to apply rejections' })
  }
})

// Serve admin page — git pull only on initial page load (exact /admin)
app.get('/admin', (req, res) => {
  gitPull()
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

// Start server
initDataFiles().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚄 HighSpeedRail.tv Admin Server`)
    console.log(`   Running at: http://localhost:${PORT}/admin`)
    console.log(
      `\n   API Key configured: ${process.env.YOUTUBE_API_KEY ? '✓' : '✗ (see YOUTUBE_API_SETUP.md)'}`
    )
    console.log(
      `   Admin password: ${process.env.ADMIN_PASSWORD ? '✓' : '✗ (add ADMIN_PASSWORD to .env)'}\n`
    )
  })
})
