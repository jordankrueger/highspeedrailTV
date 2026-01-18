const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.ADMIN_PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'hsrtv-admin-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true if using HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// File paths
const VIDEOS_PATH = path.join(__dirname, '..', 'src', '_data', 'videos.json');
const QUEUE_PATH = path.join(__dirname, 'data', 'queue.json');
const PRESETS_PATH = path.join(__dirname, 'data', 'presets.json');
const CATEGORIES_PATH = path.join(__dirname, 'data', 'categories.json');
const BLOCKLIST_PATH = path.join(__dirname, 'data', 'blocklist.json');

// Ensure data directory exists
async function ensureDataDir() {
  const dataDir = path.join(__dirname, 'data');
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

// Initialize data files if they don't exist
async function initDataFiles() {
  await ensureDataDir();

  // Initialize queue
  try {
    await fs.access(QUEUE_PATH);
  } catch {
    await fs.writeFile(QUEUE_PATH, JSON.stringify([], null, 2));
  }

  // Initialize presets with some defaults
  try {
    await fs.access(PRESETS_PATH);
  } catch {
    const defaultPresets = [
      { id: 1, name: 'California HSR News', query: 'California high speed rail', maxResults: 10 },
      { id: 2, name: 'Texas Central', query: 'Texas Central Railway high speed', maxResults: 10 },
      { id: 3, name: 'Brightline Updates', query: 'Brightline train Florida', maxResults: 10 },
      { id: 4, name: 'International HSR', query: 'high speed rail Japan OR France OR Spain OR China', maxResults: 10 },
      { id: 5, name: 'HSR Explainers', query: 'high speed rail explained OR "how high speed rail works"', maxResults: 10 }
    ];
    await fs.writeFile(PRESETS_PATH, JSON.stringify(defaultPresets, null, 2));
  }

  // Initialize categories from existing videos
  try {
    await fs.access(CATEGORIES_PATH);
  } catch {
    const defaultCategories = [
      { slug: 'explainers', name: 'Explainers', description: 'Educational content explaining HSR concepts' },
      { slug: 'myth-busting', name: 'Myth Busting', description: 'Debunking common misconceptions about rail' },
      { slug: 'international-hsr', name: 'International HSR', description: 'High-speed rail systems around the world' },
      { slug: 'construction-progress', name: 'Construction Progress', description: 'Updates on HSR projects being built' },
      { slug: 'advocacy-speeches', name: 'Advocacy & Speeches', description: 'Pro-rail advocacy and public talks' },
      { slug: 'rides-tours', name: 'Rides & Tours', description: 'First-person experiences riding HSR' }
    ];
    await fs.writeFile(CATEGORIES_PATH, JSON.stringify(defaultCategories, null, 2));
  }

  // Initialize blocklist
  try {
    await fs.access(BLOCKLIST_PATH);
  } catch {
    const defaultBlocklist = {
      channels: [],
      keywords: [
        'EXPOSED', 'PANICS', 'SLAMMED', 'DESTROYS', 'DEMOLISHED',
        'HUMILIATED', 'OWNED', 'TRIGGERED', 'MELTDOWN', 'BOMBSHELL'
      ]
    };
    await fs.writeFile(BLOCKLIST_PATH, JSON.stringify(defaultBlocklist, null, 2));
  }
}

// Helper functions
async function readJSON(filepath) {
  const data = await fs.readFile(filepath, 'utf-8');
  return JSON.parse(data);
}

async function writeJSON(filepath, data) {
  await fs.writeFile(filepath, JSON.stringify(data, null, 2));
}

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session.authenticated) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// Auth routes
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_PASSWORD) {
    req.session.authenticated = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/auth-status', (req, res) => {
  res.json({ authenticated: !!req.session.authenticated });
});

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
    relevanceLanguage = 'en'
  } = req.query;
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'YouTube API key not configured' });
  }

  try {
    const params = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      maxResults: maxResults,
      order: order,
      videoDuration: videoDuration,
      key: apiKey
    });

    // Only add query if provided (allows browsing without search terms)
    if (q && q.trim()) {
      params.append('q', q);
    }

    // Date filters
    if (publishedAfter) {
      params.append('publishedAfter', publishedAfter);
    }
    if (publishedBefore) {
      params.append('publishedBefore', publishedBefore);
    }

    // Language filter - relevanceLanguage helps prioritize but doesn't strictly filter
    if (relevanceLanguage) {
      params.append('relevanceLanguage', relevanceLanguage);
    }

    if (pageToken) {
      params.append('pageToken', pageToken);
    }

    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    const data = await response.json();

    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }

    // Get video IDs for additional details
    const videoIds = data.items.map(item => item.id.videoId).join(',');

    // Fetch video details (duration, view count, etc.)
    const detailsParams = new URLSearchParams({
      part: 'contentDetails,statistics',
      id: videoIds,
      key: apiKey
    });

    const detailsResponse = await fetch(`https://www.googleapis.com/youtube/v3/videos?${detailsParams}`);
    const detailsData = await detailsResponse.json();

    // Merge details with search results
    let videos = data.items.map(item => {
      const details = detailsData.items.find(d => d.id === item.id.videoId) || {};
      return {
        id: item.id.videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnail: item.snippet.thumbnails.medium.url,
        channelTitle: item.snippet.channelTitle,
        publishedAt: item.snippet.publishedAt,
        duration: details.contentDetails?.duration,
        viewCount: details.statistics?.viewCount,
        likeCount: details.statistics?.likeCount
      };
    });

    // Filter by minimum views if specified
    if (minViews > 0) {
      videos = videos.filter(v => parseInt(v.viewCount || 0) >= parseInt(minViews));
    }

    res.json({
      videos,
      nextPageToken: data.nextPageToken,
      totalResults: data.pageInfo.totalResults
    });
  } catch (error) {
    console.error('YouTube API error:', error);
    res.status(500).json({ error: 'Failed to search YouTube' });
  }
});

// Get video details by ID (for bulk import)
app.get('/api/youtube/video/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'YouTube API key not configured' });
  }

  try {
    const params = new URLSearchParams({
      part: 'snippet,contentDetails,statistics',
      id: id,
      key: apiKey
    });

    const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`);
    const data = await response.json();

    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }

    if (!data.items || data.items.length === 0) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const item = data.items[0];
    const video = {
      id: item.id,
      title: item.snippet.title,
      description: item.snippet.description,
      thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
      channelTitle: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
      duration: item.contentDetails?.duration,
      viewCount: item.statistics?.viewCount,
      likeCount: item.statistics?.likeCount
    };

    res.json(video);
  } catch (error) {
    console.error('YouTube API error:', error);
    res.status(500).json({ error: 'Failed to fetch video' });
  }
});

// Queue routes
app.get('/api/queue', requireAuth, async (req, res) => {
  const queue = await readJSON(QUEUE_PATH);
  res.json(queue);
});

app.post('/api/queue', requireAuth, async (req, res) => {
  const { video } = req.body;
  const queue = await readJSON(QUEUE_PATH);

  // Check if already in queue
  if (queue.some(v => v.id === video.id)) {
    return res.status(400).json({ error: 'Video already in queue' });
  }

  // Check if already published
  const videos = await readJSON(VIDEOS_PATH);
  if (videos.some(v => v.id === video.id)) {
    return res.status(400).json({ error: 'Video already published' });
  }

  queue.push({
    ...video,
    addedToQueue: new Date().toISOString(),
    status: 'pending'
  });

  await writeJSON(QUEUE_PATH, queue);
  res.json({ success: true });
});

app.delete('/api/queue/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  let queue = await readJSON(QUEUE_PATH);
  queue = queue.filter(v => v.id !== id);
  await writeJSON(QUEUE_PATH, queue);
  res.json({ success: true });
});

app.post('/api/queue/:id/approve', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { title, description, category, featured } = req.body;

  // Get queue and remove the video
  let queue = await readJSON(QUEUE_PATH);
  const queueItem = queue.find(v => v.id === id);

  if (!queueItem) {
    return res.status(404).json({ error: 'Video not in queue' });
  }

  queue = queue.filter(v => v.id !== id);

  // Add to videos.json
  const videos = await readJSON(VIDEOS_PATH);

  // If this is marked as featured, unfeatured any existing featured video
  if (featured) {
    videos.forEach(v => v.featured = false);
  }

  videos.unshift({
    id,
    title: title || queueItem.title,
    description: description || queueItem.description,
    category,
    featured: featured || false,
    dateAdded: new Date().toISOString().split('T')[0]
  });

  await writeJSON(QUEUE_PATH, queue);
  await writeJSON(VIDEOS_PATH, videos);

  res.json({ success: true });
});

// Search presets routes
app.get('/api/presets', requireAuth, async (req, res) => {
  const presets = await readJSON(PRESETS_PATH);
  res.json(presets);
});

app.post('/api/presets', requireAuth, async (req, res) => {
  const { name, query, maxResults = 10 } = req.body;
  const presets = await readJSON(PRESETS_PATH);

  const newPreset = {
    id: Date.now(),
    name,
    query,
    maxResults
  };

  presets.push(newPreset);
  await writeJSON(PRESETS_PATH, presets);
  res.json(newPreset);
});

app.put('/api/presets/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { name, query, maxResults } = req.body;
  const presets = await readJSON(PRESETS_PATH);

  const index = presets.findIndex(p => p.id === parseInt(id));
  if (index === -1) {
    return res.status(404).json({ error: 'Preset not found' });
  }

  presets[index] = { ...presets[index], name, query, maxResults };
  await writeJSON(PRESETS_PATH, presets);
  res.json(presets[index]);
});

app.delete('/api/presets/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  let presets = await readJSON(PRESETS_PATH);
  presets = presets.filter(p => p.id !== parseInt(id));
  await writeJSON(PRESETS_PATH, presets);
  res.json({ success: true });
});

// Categories routes
app.get('/api/categories', requireAuth, async (req, res) => {
  const categories = await readJSON(CATEGORIES_PATH);
  res.json(categories);
});

app.post('/api/categories', requireAuth, async (req, res) => {
  const { name, description } = req.body;
  const categories = await readJSON(CATEGORIES_PATH);

  const slug = name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  if (categories.some(c => c.slug === slug)) {
    return res.status(400).json({ error: 'Category already exists' });
  }

  const newCategory = { slug, name, description };
  categories.push(newCategory);
  await writeJSON(CATEGORIES_PATH, categories);
  res.json(newCategory);
});

app.put('/api/categories/:slug', requireAuth, async (req, res) => {
  const { slug } = req.params;
  const { name, description } = req.body;
  const categories = await readJSON(CATEGORIES_PATH);

  const index = categories.findIndex(c => c.slug === slug);
  if (index === -1) {
    return res.status(404).json({ error: 'Category not found' });
  }

  categories[index] = { ...categories[index], name, description };
  await writeJSON(CATEGORIES_PATH, categories);
  res.json(categories[index]);
});

app.delete('/api/categories/:slug', requireAuth, async (req, res) => {
  const { slug } = req.params;

  // Check if category is in use
  const videos = await readJSON(VIDEOS_PATH);
  if (videos.some(v => v.category === slug)) {
    return res.status(400).json({ error: 'Cannot delete category that has videos' });
  }

  let categories = await readJSON(CATEGORIES_PATH);
  categories = categories.filter(c => c.slug !== slug);
  await writeJSON(CATEGORIES_PATH, categories);
  res.json({ success: true });
});

// Blocklist routes
app.get('/api/blocklist', requireAuth, async (req, res) => {
  const blocklist = await readJSON(BLOCKLIST_PATH);
  res.json(blocklist);
});

app.post('/api/blocklist/channel', requireAuth, async (req, res) => {
  const { channel } = req.body;
  const blocklist = await readJSON(BLOCKLIST_PATH);

  if (!blocklist.channels.includes(channel)) {
    blocklist.channels.push(channel);
    await writeJSON(BLOCKLIST_PATH, blocklist);
  }

  res.json(blocklist);
});

app.delete('/api/blocklist/channel/:channel', requireAuth, async (req, res) => {
  const { channel } = req.params;
  const blocklist = await readJSON(BLOCKLIST_PATH);

  blocklist.channels = blocklist.channels.filter(c => c !== channel);
  await writeJSON(BLOCKLIST_PATH, blocklist);

  res.json(blocklist);
});

app.post('/api/blocklist/keyword', requireAuth, async (req, res) => {
  const { keyword } = req.body;
  const blocklist = await readJSON(BLOCKLIST_PATH);

  const upperKeyword = keyword.toUpperCase();
  if (!blocklist.keywords.includes(upperKeyword)) {
    blocklist.keywords.push(upperKeyword);
    await writeJSON(BLOCKLIST_PATH, blocklist);
  }

  res.json(blocklist);
});

app.delete('/api/blocklist/keyword/:keyword', requireAuth, async (req, res) => {
  const { keyword } = req.params;
  const blocklist = await readJSON(BLOCKLIST_PATH);

  blocklist.keywords = blocklist.keywords.filter(k => k !== keyword);
  await writeJSON(BLOCKLIST_PATH, blocklist);

  res.json(blocklist);
});

// Published videos routes
app.get('/api/videos', requireAuth, async (req, res) => {
  const videos = await readJSON(VIDEOS_PATH);
  res.json(videos);
});

app.put('/api/videos/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { title, description, category, featured } = req.body;
  const videos = await readJSON(VIDEOS_PATH);

  const index = videos.findIndex(v => v.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Video not found' });
  }

  // If this is marked as featured, unfeatured any existing featured video
  if (featured) {
    videos.forEach(v => v.featured = false);
  }

  videos[index] = { ...videos[index], title, description, category, featured };
  await writeJSON(VIDEOS_PATH, videos);
  res.json(videos[index]);
});

app.delete('/api/videos/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  let videos = await readJSON(VIDEOS_PATH);
  videos = videos.filter(v => v.id !== id);
  await writeJSON(VIDEOS_PATH, videos);
  res.json({ success: true });
});

// Serve admin page
app.get('/admin*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
initDataFiles().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚄 HighSpeedRail.tv Admin Server`);
    console.log(`   Running at: http://localhost:${PORT}/admin`);
    console.log(`\n   API Key configured: ${process.env.YOUTUBE_API_KEY ? '✓' : '✗ (see YOUTUBE_API_SETUP.md)'}`);
    console.log(`   Admin password: ${process.env.ADMIN_PASSWORD ? '✓' : '✗ (add ADMIN_PASSWORD to .env)'}\n`);
  });
});
