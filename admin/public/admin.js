// State
let currentTab = 'search';
let searchResults = [];
let nextPageToken = null;
let currentSearchQuery = '';
let queue = [];
let categories = [];
let presets = [];
let publishedVideos = [];
let blocklist = { channels: [], keywords: [] };
let currentVideoForModal = null;
let viewMode = 'grid';
let editingCategorySlug = null;
let editingPresetId = null;

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const adminPanel = document.getElementById('admin-panel');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  setupEventListeners();
});

async function checkAuth() {
  try {
    const res = await fetch('/api/auth-status');
    const data = await res.json();
    if (data.authenticated) {
      showAdminPanel();
    }
  } catch (e) {
    console.error('Auth check failed:', e);
  }
}

function setupEventListeners() {
  // Login
  loginForm.addEventListener('submit', handleLogin);
  logoutBtn.addEventListener('click', handleLogout);

  // Navigation
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Search
  document.getElementById('search-btn').addEventListener('click', handleSearch);
  document.getElementById('search-input').addEventListener('keypress', e => {
    if (e.key === 'Enter') handleSearch();
  });
  document.getElementById('run-preset-btn').addEventListener('click', runPreset);
  document.getElementById('browse-recent-btn').addEventListener('click', browseRecent);

  // Filter change - re-render results when hide toggle changes
  document.getElementById('filter-hide-published').addEventListener('change', () => {
    if (searchResults.length > 0) renderSearchResults();
  });

  // View toggle
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => setViewMode(btn.dataset.view));
  });

  // Modals
  document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
    btn.addEventListener('click', closeAllModals);
  });

  // Add buttons
  document.getElementById('add-category-btn').addEventListener('click', () => openCategoryModal());
  document.getElementById('add-preset-btn').addEventListener('click', () => openPresetModal());

  // Forms
  document.getElementById('approve-form').addEventListener('submit', handleApprove);
  document.getElementById('category-form').addEventListener('submit', handleCategorySave);
  document.getElementById('preset-form').addEventListener('submit', handlePresetSave);

  // Modal actions
  document.getElementById('modal-reject-btn').addEventListener('click', handleReject);

  // Bulk Import
  document.getElementById('bulk-import-btn').addEventListener('click', toggleBulkImport);
  document.getElementById('bulk-cancel-btn').addEventListener('click', toggleBulkImport);
  document.getElementById('bulk-submit-btn').addEventListener('click', handleBulkImport);

  // Blocklist
  document.getElementById('add-channel-btn').addEventListener('click', () => {
    const input = document.getElementById('add-channel-input');
    const channel = input.value.trim();
    if (channel) {
      blockChannel(channel);
      input.value = '';
    }
  });
  document.getElementById('add-keyword-btn').addEventListener('click', () => {
    const input = document.getElementById('add-keyword-input');
    const keyword = input.value.trim();
    if (keyword) {
      blockKeyword(keyword);
      input.value = '';
    }
  });
  document.getElementById('add-channel-input').addEventListener('keypress', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('add-channel-btn').click();
    }
  });
  document.getElementById('add-keyword-input').addEventListener('keypress', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('add-keyword-btn').click();
    }
  });

  // Close modal on backdrop click
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', e => {
      if (e.target === modal) closeAllModals();
    });
  });
}

// Auth
async function handleLogin(e) {
  e.preventDefault();
  const password = document.getElementById('password').value;

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });

    if (res.ok) {
      showAdminPanel();
    } else {
      loginError.textContent = 'Invalid password';
    }
  } catch (e) {
    loginError.textContent = 'Login failed';
  }
}

async function handleLogout() {
  await fetch('/api/logout', { method: 'POST' });
  adminPanel.classList.add('hidden');
  loginScreen.classList.remove('hidden');
  document.getElementById('password').value = '';
}

async function showAdminPanel() {
  loginScreen.classList.add('hidden');
  adminPanel.classList.remove('hidden');
  await loadInitialData();
}

async function loadInitialData() {
  await Promise.all([
    loadQueue(),
    loadCategories(),
    loadPresets(),
    loadPublishedVideos(),
    loadBlocklist()
  ]);
  populatePresetSelect();
  populateCategorySelect();
}

// Tab Navigation
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `${tab}-tab`);
  });
}

// YouTube Search
function getFilters() {
  const dateFilter = document.getElementById('filter-date').value;
  const order = document.getElementById('filter-order').value;
  const duration = document.getElementById('filter-duration').value;
  const minViews = document.getElementById('filter-views').value;
  const language = document.getElementById('filter-language').value;
  const hidePublished = document.getElementById('filter-hide-published').checked;

  // Calculate publishedAfter date based on selection
  let publishedAfter = null;
  if (dateFilter !== 'all') {
    const now = new Date();
    switch (dateFilter) {
      case '2y': now.setFullYear(now.getFullYear() - 2); break;
      case '1y': now.setFullYear(now.getFullYear() - 1); break;
      case '6m': now.setMonth(now.getMonth() - 6); break;
      case '3m': now.setMonth(now.getMonth() - 3); break;
      case '1m': now.setMonth(now.getMonth() - 1); break;
    }
    publishedAfter = now.toISOString();
  }

  return {
    publishedAfter,
    order,
    videoDuration: duration,
    minViews: parseInt(minViews),
    language,
    hidePublished
  };
}

async function handleSearch() {
  let query = document.getElementById('search-input').value.trim();
  // If no query provided, use default HSR search terms focused on English-speaking content
  if (!query) {
    query = 'high speed rail OR bullet train OR Amtrak OR HS2 OR TGV OR Eurostar';
  }
  currentSearchQuery = query;
  nextPageToken = null;
  await performSearch(query);
}

async function browseRecent() {
  // Search with HSR-related terms but sorted by date
  document.getElementById('search-input').value = '';
  document.getElementById('filter-order').value = 'date';
  currentSearchQuery = 'high speed rail OR bullet train OR Amtrak OR HS2 OR TGV OR Eurostar';
  nextPageToken = null;
  await performSearch(currentSearchQuery);
}

async function runPreset() {
  const select = document.getElementById('preset-select');
  const preset = presets.find(p => p.id === parseInt(select.value));
  if (!preset) return;

  document.getElementById('search-input').value = preset.query;
  currentSearchQuery = preset.query;
  nextPageToken = null;
  await performSearch(preset.query, preset.maxResults);
}

async function performSearch(query, maxResults = 20, pageToken = null) {
  const resultsContainer = document.getElementById('search-results');
  resultsContainer.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  const filters = getFilters();

  try {
    const params = new URLSearchParams({ maxResults });

    // Add query if provided
    if (query && query.trim()) {
      params.append('q', query);
    }

    // Add filters
    if (filters.publishedAfter) params.append('publishedAfter', filters.publishedAfter);
    params.append('order', filters.order);
    params.append('videoDuration', filters.videoDuration);
    if (filters.minViews > 0) params.append('minViews', filters.minViews);
    if (filters.language) params.append('relevanceLanguage', filters.language);
    if (pageToken) params.append('pageToken', pageToken);

    const res = await fetch(`/api/youtube/search?${params}`);
    const data = await res.json();

    if (data.error) {
      resultsContainer.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${data.error}</p></div>`;
      return;
    }

    searchResults = data.videos;
    nextPageToken = data.nextPageToken;
    renderSearchResults();
  } catch (e) {
    resultsContainer.innerHTML = '<div class="empty-state"><h3>Search failed</h3><p>Please try again</p></div>';
  }
}

function isBlocklisted(video) {
  // Check if channel is blocked
  if (blocklist.channels.includes(video.channelTitle)) {
    return true;
  }

  // Check if title contains blocked keywords (case-insensitive)
  const titleUpper = video.title.toUpperCase();
  for (const keyword of blocklist.keywords) {
    if (titleUpper.includes(keyword)) {
      return true;
    }
  }

  return false;
}

function renderSearchResults() {
  const container = document.getElementById('search-results');
  const hidePublished = document.getElementById('filter-hide-published').checked;

  // Filter out blocklisted videos first
  let videosToShow = searchResults.filter(video => !isBlocklisted(video));
  const blockedCount = searchResults.length - videosToShow.length;

  // Then filter out published/queued videos if checkbox is checked
  if (hidePublished) {
    videosToShow = videosToShow.filter(video => {
      const isQueued = queue.some(q => q.id === video.id);
      const isPublished = publishedVideos.some(v => v.id === video.id);
      return !isQueued && !isPublished;
    });
  }

  if (videosToShow.length === 0) {
    const message = hidePublished && searchResults.length > 0
      ? '<div class="empty-state"><h3>All results already in your library</h3><p>Uncheck "Hide published/queued" to see them, or try a different search</p></div>'
      : '<div class="empty-state"><h3>No results found</h3><p>Try a different search term or adjust filters</p></div>';
    container.innerHTML = message;
    return;
  }

  container.innerHTML = videosToShow.map(video => {
    const isQueued = queue.some(q => q.id === video.id);
    const isPublished = publishedVideos.some(v => v.id === video.id);
    const status = isPublished ? 'published' : (isQueued ? 'queued' : null);

    return `
      <div class="video-card" data-id="${video.id}">
        <div class="video-thumbnail">
          <img src="${video.thumbnail}" alt="${escapeHtml(video.title)}">
          ${video.duration ? `<span class="video-duration">${formatDuration(video.duration)}</span>` : ''}
          ${status ? `<span class="video-status ${status}">${status === 'published' ? 'Published' : 'In Queue'}</span>` : ''}
        </div>
        <div class="video-info">
          <h3>${escapeHtml(video.title)}</h3>
          <p class="channel">${escapeHtml(video.channelTitle)}</p>
          <div class="meta">
            <span>${formatViews(video.viewCount)} views</span>
            <span>${formatDate(video.publishedAt)}</span>
          </div>
        </div>
        <div class="video-actions">
          ${!isPublished && !isQueued ?
            `<button class="btn-add" onclick="addToQueue('${video.id}')">Add to Queue</button>` :
            `<button class="btn-view" onclick="openVideoModal('${video.id}', 'search')">View</button>`
          }
          <button class="btn-block" onclick="blockChannel('${escapeHtml(video.channelTitle).replace(/'/g, "\\'")}')">Block Channel</button>
        </div>
      </div>
    `;
  }).join('');

  // Show count of hidden videos
  const afterBlocklist = searchResults.length - blockedCount;
  const hiddenCount = afterBlocklist - videosToShow.length;
  let notes = '';
  if (blockedCount > 0) {
    notes += `<p class="hidden-count">${blockedCount} blocked by filters</p>`;
  }
  if (hiddenCount > 0) {
    notes += `<p class="hidden-count">${hiddenCount} already in your library</p>`;
  }

  // Pagination
  const pagination = document.getElementById('search-pagination');
  pagination.innerHTML = notes + (nextPageToken ?
    `<button onclick="loadMoreResults()">Load More Results</button>` : '');
}

async function loadMoreResults() {
  if (!nextPageToken || !currentSearchQuery) return;
  await performSearch(currentSearchQuery, 10, nextPageToken);
}

// Queue Management
async function loadQueue() {
  try {
    const res = await fetch('/api/queue');
    queue = await res.json();
    document.getElementById('queue-count').textContent = queue.length;
    renderQueue();
  } catch (e) {
    console.error('Failed to load queue:', e);
  }
}

function renderQueue() {
  const container = document.getElementById('queue-content');

  if (queue.length === 0) {
    container.innerHTML = '<div class="empty-state"><h3>Queue is empty</h3><p>Search for videos and add them to the queue for review</p></div>';
    return;
  }

  container.className = viewMode === 'detail' ? 'video-grid detail-view' : 'video-grid';

  container.innerHTML = queue.map(video => `
    <div class="video-card" data-id="${video.id}">
      <div class="video-thumbnail">
        <img src="${video.thumbnail}" alt="${escapeHtml(video.title)}">
        ${video.duration ? `<span class="video-duration">${formatDuration(video.duration)}</span>` : ''}
      </div>
      <div class="video-info">
        <h3>${escapeHtml(video.title)}</h3>
        <p class="channel">${escapeHtml(video.channelTitle)}</p>
        ${viewMode === 'detail' ? `<p class="description">${escapeHtml(video.description)}</p>` : ''}
        <div class="meta">
          <span>${formatViews(video.viewCount)} views</span>
          <span>Added ${formatDate(video.addedToQueue)}</span>
        </div>
      </div>
      <div class="video-actions">
        <button class="btn-add" onclick="openVideoModal('${video.id}', 'queue')">Review</button>
        <button class="btn-remove" onclick="removeFromQueue('${video.id}')">Remove</button>
      </div>
    </div>
  `).join('');
}

async function addToQueue(videoId) {
  const video = searchResults.find(v => v.id === videoId);
  if (!video) return;

  try {
    const res = await fetch('/api/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video })
    });

    const data = await res.json();
    if (data.error) {
      showToast(data.error, 'error');
    } else {
      showToast('Added to queue', 'success');
      await loadQueue();
      renderSearchResults(); // Update status badges
    }
  } catch (e) {
    showToast('Failed to add to queue', 'error');
  }
}

async function removeFromQueue(videoId) {
  try {
    await fetch(`/api/queue/${videoId}`, { method: 'DELETE' });
    showToast('Removed from queue', 'success');
    await loadQueue();
    if (currentTab === 'search') renderSearchResults();
    closeAllModals();
  } catch (e) {
    showToast('Failed to remove', 'error');
  }
}

// Published Videos
async function loadPublishedVideos() {
  try {
    const res = await fetch('/api/videos');
    publishedVideos = await res.json();
    document.getElementById('video-count').textContent = `${publishedVideos.length} videos`;
    renderPublishedVideos();
  } catch (e) {
    console.error('Failed to load videos:', e);
  }
}

function renderPublishedVideos() {
  const container = document.getElementById('published-content');

  if (publishedVideos.length === 0) {
    container.innerHTML = '<div class="empty-state"><h3>No published videos</h3><p>Approve videos from the queue to add them to your site</p></div>';
    return;
  }

  container.innerHTML = publishedVideos.map(video => `
    <div class="video-card" data-id="${video.id}">
      <div class="video-thumbnail">
        <img src="https://img.youtube.com/vi/${video.id}/mqdefault.jpg" alt="${escapeHtml(video.title)}">
        ${video.featured ? '<span class="video-status published">Featured</span>' : ''}
      </div>
      <div class="video-info">
        <h3>${escapeHtml(video.title)}</h3>
        <p class="channel">${getCategoryName(video.category)}</p>
        <div class="meta">
          <span>Added ${formatDate(video.dateAdded)}</span>
        </div>
      </div>
      <div class="video-actions">
        <button class="btn-view" onclick="window.open('/video/${video.id}/', '_blank')">View on Site</button>
      </div>
    </div>
  `).join('');
}

// Categories
async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    categories = await res.json();
    renderCategories();
  } catch (e) {
    console.error('Failed to load categories:', e);
  }
}

function renderCategories() {
  const container = document.getElementById('categories-content');

  container.innerHTML = categories.map(cat => {
    const videoCount = publishedVideos.filter(v => v.category === cat.slug).length;
    return `
      <div class="category-item" data-slug="${cat.slug}">
        <div>
          <h3>${escapeHtml(cat.name)}</h3>
          <p>${escapeHtml(cat.description || 'No description')} • ${videoCount} videos</p>
        </div>
        <div class="item-actions">
          <button onclick="openCategoryModal('${cat.slug}')">Edit</button>
          <button class="btn-delete" onclick="deleteCategory('${cat.slug}')" ${videoCount > 0 ? 'disabled title="Cannot delete category with videos"' : ''}>Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

function openCategoryModal(slug = null) {
  editingCategorySlug = slug;
  const modal = document.getElementById('category-modal');
  const title = document.getElementById('category-modal-title');
  const nameInput = document.getElementById('category-name');
  const descInput = document.getElementById('category-description');

  if (slug) {
    const cat = categories.find(c => c.slug === slug);
    title.textContent = 'Edit Category';
    nameInput.value = cat.name;
    descInput.value = cat.description || '';
  } else {
    title.textContent = 'Add Category';
    nameInput.value = '';
    descInput.value = '';
  }

  modal.classList.remove('hidden');
}

async function handleCategorySave(e) {
  e.preventDefault();
  const name = document.getElementById('category-name').value.trim();
  const description = document.getElementById('category-description').value.trim();

  try {
    if (editingCategorySlug) {
      await fetch(`/api/categories/${editingCategorySlug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description })
      });
      showToast('Category updated', 'success');
    } else {
      await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description })
      });
      showToast('Category added', 'success');
    }

    await loadCategories();
    populateCategorySelect();
    closeAllModals();
  } catch (e) {
    showToast('Failed to save category', 'error');
  }
}

async function deleteCategory(slug) {
  if (!confirm('Are you sure you want to delete this category?')) return;

  try {
    const res = await fetch(`/api/categories/${slug}`, { method: 'DELETE' });
    const data = await res.json();

    if (data.error) {
      showToast(data.error, 'error');
    } else {
      showToast('Category deleted', 'success');
      await loadCategories();
      populateCategorySelect();
    }
  } catch (e) {
    showToast('Failed to delete category', 'error');
  }
}

// Presets
async function loadPresets() {
  try {
    const res = await fetch('/api/presets');
    presets = await res.json();
    renderPresets();
  } catch (e) {
    console.error('Failed to load presets:', e);
  }
}

function renderPresets() {
  const container = document.getElementById('presets-content');

  container.innerHTML = presets.map(preset => `
    <div class="preset-item" data-id="${preset.id}">
      <div>
        <h3>${escapeHtml(preset.name)}</h3>
        <p>${escapeHtml(preset.query)} • Max ${preset.maxResults} results</p>
      </div>
      <div class="item-actions">
        <button onclick="openPresetModal(${preset.id})">Edit</button>
        <button class="btn-delete" onclick="deletePreset(${preset.id})">Delete</button>
      </div>
    </div>
  `).join('');
}

function openPresetModal(id = null) {
  editingPresetId = id;
  const modal = document.getElementById('preset-modal');
  const title = document.getElementById('preset-modal-title');
  const nameInput = document.getElementById('preset-name');
  const queryInput = document.getElementById('preset-query');
  const maxInput = document.getElementById('preset-max-results');

  if (id) {
    const preset = presets.find(p => p.id === id);
    title.textContent = 'Edit Search Preset';
    nameInput.value = preset.name;
    queryInput.value = preset.query;
    maxInput.value = preset.maxResults;
  } else {
    title.textContent = 'Add Search Preset';
    nameInput.value = '';
    queryInput.value = '';
    maxInput.value = '10';
  }

  modal.classList.remove('hidden');
}

async function handlePresetSave(e) {
  e.preventDefault();
  const name = document.getElementById('preset-name').value.trim();
  const query = document.getElementById('preset-query').value.trim();
  const maxResults = parseInt(document.getElementById('preset-max-results').value);

  try {
    if (editingPresetId) {
      await fetch(`/api/presets/${editingPresetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, query, maxResults })
      });
      showToast('Preset updated', 'success');
    } else {
      await fetch('/api/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, query, maxResults })
      });
      showToast('Preset added', 'success');
    }

    await loadPresets();
    populatePresetSelect();
    closeAllModals();
  } catch (e) {
    showToast('Failed to save preset', 'error');
  }
}

async function deletePreset(id) {
  if (!confirm('Are you sure you want to delete this preset?')) return;

  try {
    await fetch(`/api/presets/${id}`, { method: 'DELETE' });
    showToast('Preset deleted', 'success');
    await loadPresets();
    populatePresetSelect();
  } catch (e) {
    showToast('Failed to delete preset', 'error');
  }
}

// Video Modal
async function openVideoModal(videoId, source) {
  const modal = document.getElementById('video-modal');
  let video;

  if (source === 'search') {
    video = searchResults.find(v => v.id === videoId);
  } else if (source === 'queue') {
    video = queue.find(v => v.id === videoId);
  }

  if (!video) return;

  currentVideoForModal = video;

  // Set iframe
  document.getElementById('modal-iframe').src = `https://www.youtube-nocookie.com/embed/${video.id}`;

  // Set info
  document.getElementById('modal-title').textContent = video.title;
  document.getElementById('modal-channel').textContent = video.channelTitle;
  document.getElementById('modal-date').textContent = formatDate(video.publishedAt);
  document.getElementById('modal-views').textContent = `${formatViews(video.viewCount)} views`;
  document.getElementById('modal-description').textContent = video.description;

  // Set form defaults
  document.getElementById('modal-edit-title').value = video.title;
  document.getElementById('modal-edit-description').value = video.description.slice(0, 200);
  document.getElementById('modal-featured').checked = false;

  // Show/hide reject button based on source
  document.getElementById('modal-reject-btn').style.display = source === 'queue' ? 'block' : 'none';

  modal.classList.remove('hidden');
}

async function handleApprove(e) {
  e.preventDefault();

  if (!currentVideoForModal) return;

  const title = document.getElementById('modal-edit-title').value.trim();
  const description = document.getElementById('modal-edit-description').value.trim();
  const category = document.getElementById('modal-category').value;
  const featured = document.getElementById('modal-featured').checked;

  if (!category) {
    showToast('Please select a category', 'error');
    return;
  }

  try {
    // If video is in queue, approve it
    const inQueue = queue.some(v => v.id === currentVideoForModal.id);

    if (inQueue) {
      const res = await fetch(`/api/queue/${currentVideoForModal.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, category, featured })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
    } else {
      // Add directly from search
      // First add to queue, then approve
      await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video: currentVideoForModal })
      });

      await fetch(`/api/queue/${currentVideoForModal.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, category, featured })
      });
    }

    showToast('Video published!', 'success');
    await loadQueue();
    await loadPublishedVideos();
    if (currentTab === 'search') renderSearchResults();
    closeAllModals();
  } catch (e) {
    showToast(e.message || 'Failed to publish', 'error');
  }
}

async function handleReject() {
  if (!currentVideoForModal) return;
  await removeFromQueue(currentVideoForModal.id);
}

// Helpers
function populatePresetSelect() {
  const select = document.getElementById('preset-select');
  select.innerHTML = '<option value="">Select a preset...</option>' +
    presets.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
}

function populateCategorySelect() {
  const select = document.getElementById('modal-category');
  select.innerHTML = '<option value="">Select a category...</option>' +
    categories.map(c => `<option value="${c.slug}">${escapeHtml(c.name)}</option>`).join('');
}

function getCategoryName(slug) {
  const cat = categories.find(c => c.slug === slug);
  return cat ? cat.name : slug;
}

function setViewMode(mode) {
  viewMode = mode;
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === mode);
  });
  renderQueue();
}

function closeAllModals() {
  document.querySelectorAll('.modal').forEach(modal => {
    modal.classList.add('hidden');
  });
  document.getElementById('modal-iframe').src = '';
  currentVideoForModal = null;
  editingCategorySlug = null;
  editingPresetId = null;
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDuration(duration) {
  // Convert ISO 8601 duration to readable format
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return '';

  const hours = match[1] ? parseInt(match[1]) : 0;
  const minutes = match[2] ? parseInt(match[2]) : 0;
  const seconds = match[3] ? parseInt(match[3]) : 0;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatViews(count) {
  if (!count) return '0';
  const num = parseInt(count);
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// Blocklist Management
async function loadBlocklist() {
  try {
    const res = await fetch('/api/blocklist');
    blocklist = await res.json();
    renderBlocklist();
  } catch (e) {
    console.error('Failed to load blocklist:', e);
  }
}

function renderBlocklist() {
  // Render blocked channels
  const channelsContainer = document.getElementById('blocked-channels-list');
  if (blocklist.channels.length === 0) {
    channelsContainer.innerHTML = '<p class="empty-list">No blocked channels</p>';
  } else {
    channelsContainer.innerHTML = blocklist.channels.map(channel => `
      <div class="blocklist-item">
        <span>${escapeHtml(channel)}</span>
        <button class="btn-remove-small" onclick="unblockChannel('${escapeHtml(channel)}')">&times;</button>
      </div>
    `).join('');
  }

  // Render blocked keywords
  const keywordsContainer = document.getElementById('blocked-keywords-list');
  if (blocklist.keywords.length === 0) {
    keywordsContainer.innerHTML = '<p class="empty-list">No blocked keywords</p>';
  } else {
    keywordsContainer.innerHTML = blocklist.keywords.map(keyword => `
      <div class="blocklist-item">
        <span>${escapeHtml(keyword)}</span>
        <button class="btn-remove-small" onclick="unblockKeyword('${escapeHtml(keyword)}')">&times;</button>
      </div>
    `).join('');
  }
}

async function blockChannel(channel) {
  if (!channel) return;

  try {
    const res = await fetch('/api/blocklist/channel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel })
    });

    const data = await res.json();
    if (data.error) {
      showToast(data.error, 'error');
    } else {
      showToast(`Blocked channel: ${channel}`, 'success');
      await loadBlocklist();
      if (searchResults.length > 0) renderSearchResults();
    }
  } catch (e) {
    showToast('Failed to block channel', 'error');
  }
}

async function unblockChannel(channel) {
  try {
    await fetch(`/api/blocklist/channel/${encodeURIComponent(channel)}`, { method: 'DELETE' });
    showToast(`Unblocked channel: ${channel}`, 'success');
    await loadBlocklist();
    if (searchResults.length > 0) renderSearchResults();
  } catch (e) {
    showToast('Failed to unblock channel', 'error');
  }
}

async function blockKeyword(keyword) {
  if (!keyword) return;

  try {
    const res = await fetch('/api/blocklist/keyword', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: keyword.toUpperCase() })
    });

    const data = await res.json();
    if (data.error) {
      showToast(data.error, 'error');
    } else {
      showToast(`Blocked keyword: ${keyword.toUpperCase()}`, 'success');
      await loadBlocklist();
      if (searchResults.length > 0) renderSearchResults();
    }
  } catch (e) {
    showToast('Failed to block keyword', 'error');
  }
}

async function unblockKeyword(keyword) {
  try {
    await fetch(`/api/blocklist/keyword/${encodeURIComponent(keyword)}`, { method: 'DELETE' });
    showToast(`Unblocked keyword: ${keyword}`, 'success');
    await loadBlocklist();
    if (searchResults.length > 0) renderSearchResults();
  } catch (e) {
    showToast('Failed to unblock keyword', 'error');
  }
}

// Bulk Import
function toggleBulkImport() {
  const panel = document.getElementById('bulk-import-panel');
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) {
    document.getElementById('bulk-urls').value = '';
    document.getElementById('bulk-import-status').innerHTML = '';
  }
}

function extractVideoId(url) {
  // Handle various YouTube URL formats
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/ // Just the ID itself
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

async function handleBulkImport() {
  const textarea = document.getElementById('bulk-urls');
  const statusDiv = document.getElementById('bulk-import-status');
  const submitBtn = document.getElementById('bulk-submit-btn');

  // Parse URLs - split by newlines, commas, or spaces
  const input = textarea.value.trim();
  if (!input) {
    showToast('Please enter some YouTube URLs', 'error');
    return;
  }

  const urls = input.split(/[\n,\s]+/).filter(u => u.trim());
  const videoIds = [...new Set(urls.map(extractVideoId).filter(Boolean))]; // Dedupe

  if (videoIds.length === 0) {
    showToast('No valid YouTube URLs found', 'error');
    return;
  }

  submitBtn.disabled = true;
  statusDiv.innerHTML = `<p class="pending">Processing ${videoIds.length} video(s)...</p>`;

  const results = { success: [], failed: [], skipped: [] };

  for (const videoId of videoIds) {
    // Check if already in queue or published
    if (queue.some(v => v.id === videoId)) {
      results.skipped.push({ id: videoId, reason: 'Already in queue' });
      continue;
    }
    if (publishedVideos.some(v => v.id === videoId)) {
      results.skipped.push({ id: videoId, reason: 'Already published' });
      continue;
    }

    try {
      // Fetch video details
      const res = await fetch(`/api/youtube/video/${videoId}`);
      if (!res.ok) {
        const error = await res.json();
        results.failed.push({ id: videoId, reason: error.error || 'Not found' });
        continue;
      }

      const video = await res.json();

      // Add to queue
      const queueRes = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video })
      });

      if (queueRes.ok) {
        results.success.push({ id: videoId, title: video.title });
      } else {
        const error = await queueRes.json();
        results.failed.push({ id: videoId, reason: error.error });
      }
    } catch (e) {
      results.failed.push({ id: videoId, reason: 'Network error' });
    }

    // Update status as we go
    statusDiv.innerHTML = `
      <p class="pending">Processing... ${results.success.length + results.failed.length + results.skipped.length}/${videoIds.length}</p>
    `;
  }

  // Show final results
  let html = '';
  if (results.success.length > 0) {
    html += `<p class="success">✓ Added ${results.success.length} video(s) to queue</p>`;
  }
  if (results.skipped.length > 0) {
    html += `<p class="pending">⊘ Skipped ${results.skipped.length} (already in queue/published)</p>`;
  }
  if (results.failed.length > 0) {
    html += `<p class="error">✗ Failed: ${results.failed.map(f => f.id).join(', ')}</p>`;
  }
  statusDiv.innerHTML = html;

  submitBtn.disabled = false;

  // Refresh queue
  if (results.success.length > 0) {
    await loadQueue();
    showToast(`Added ${results.success.length} video(s) to queue`, 'success');
  }
}
