import { Router } from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MUSIC_CONFIG_PATH = path.join(__dirname, '..', '..', 'data', 'music-recommendations.json');
const DEFAULT_MUSIC_CONFIG = { artists: {}, current_search: null };

function ensureMusicConfigExists() {
  const dir = path.dirname(MUSIC_CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(MUSIC_CONFIG_PATH)) {
    fs.writeFileSync(MUSIC_CONFIG_PATH, JSON.stringify(DEFAULT_MUSIC_CONFIG, null, 2));
  }
}

function loadMusicConfig() {
  ensureMusicConfigExists();
  return JSON.parse(fs.readFileSync(MUSIC_CONFIG_PATH, 'utf-8'));
}

function saveMusicConfig(config) {
  ensureMusicConfigExists();
  fs.writeFileSync(MUSIC_CONFIG_PATH, JSON.stringify(config, null, 2));
}

// Search for similar artists on music-map.com
router.get('/search', asyncHandler(async (req, res) => {
  const artist = (req.query.artist || '').trim();

  if (!artist) {
    return res.status(400).json({ error: 'Artist name required' });
  }

  logger.info(`Music search requested for artist: ${artist}`);

  // Fetch from music-map.com
  const artistSlug = artist.toLowerCase().replace(/ /g, '+');
  const url = `https://www.music-map.com/${artistSlug}`;

  try {
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000
    });

    // Parse HTML to extract similar artists
    const html = response.data;
    const similarArtists = [];

    // Extract artist links from the HTML
    const pattern = /<a href="([^"]+)" class=S id=s\d+>([^<]+)<\/a>/g;
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const artistName = match[2];
      // Skip the search artist itself
      if (artistName.toLowerCase() !== artist.toLowerCase()) {
        similarArtists.push(artistName);
      }
    }

    if (similarArtists.length === 0) {
      logger.warn(`No similar artists found for: ${artist}`);
      return res.status(404).json({ error: 'No similar artists found' });
    }

    logger.info(`Found ${similarArtists.length} similar artists for: ${artist}`);

    // Load music config
    const musicConfig = loadMusicConfig();

    // Check if this is a re-search
    const artistKey = artist.toLowerCase();
    if (musicConfig.artists[artistKey]) {
      const existingArtists = new Set(musicConfig.artists[artistKey].all_recommendations || []);
      const newArtists = similarArtists.filter(a => !existingArtists.has(a));

      // If re-searching, add new artists to the pending list
      if (newArtists.length > 0) {
        musicConfig.artists[artistKey].all_recommendations.push(...newArtists);
        musicConfig.artists[artistKey].pending.push(...newArtists);
      }
    } else {
      // New search
      musicConfig.artists[artistKey] = {
        search_artist: artist,
        all_recommendations: [...similarArtists],
        pending: [...similarArtists],
        listened: [],
        history: similarArtists.length > 0 ? [similarArtists[0]] : [],
        current_index: 0
      };
    }

    // Set as current search
    musicConfig.current_search = artistKey;

    // Save config
    saveMusicConfig(musicConfig);

    // Return current state
    const artistData = musicConfig.artists[artistKey];
    const currentRec = artistData.pending[0] || null;

    return res.json({
      search_artist: artist,
      current_recommendation: currentRec,
      total_count: artistData.all_recommendations.length,
      listened_count: artistData.listened.length,
      current_index: artistData.current_index || 0
    });
  } catch (error) {
    logger.error(`Music search error for artist ${artist}: ${error.message}`);
    return res.status(500).json({ error: 'Failed to search for artist' });
  }
}));

// Mark a recommendation as listened
router.post('/listened', asyncHandler(async (req, res) => {
  const artist = (req.body.artist || '').trim();
  const recommended = (req.body.recommended || '').trim();

  if (!artist || !recommended) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  const musicConfig = loadMusicConfig();
  const artistKey = artist.toLowerCase();

  if (!musicConfig.artists[artistKey]) {
    return res.status(404).json({ error: 'Artist not found' });
  }

  const artistData = musicConfig.artists[artistKey];

  // Initialize history and current_index if not present
  if (!artistData.history) artistData.history = [];
  if (artistData.current_index === undefined) artistData.current_index = 0;

  // Move from pending to listened
  const pendingIndex = artistData.pending.indexOf(recommended);
  if (pendingIndex !== -1) {
    artistData.pending.splice(pendingIndex, 1);
    if (!artistData.listened.includes(recommended)) {
      artistData.listened.push(recommended);
    }
  }

  // Move forward in navigation
  let nextRec;
  if (artistData.current_index < artistData.history.length - 1) {
    artistData.current_index += 1;
    nextRec = artistData.history[artistData.current_index];
  } else {
    nextRec = artistData.pending[0] || null;
    if (nextRec) {
      artistData.history.push(nextRec);
      artistData.current_index += 1;
    }
  }

  saveMusicConfig(musicConfig);

  return res.json({
    search_artist: artist,
    current_recommendation: nextRec,
    total_count: artistData.all_recommendations.length,
    listened_count: artistData.listened.length,
    current_index: artistData.current_index || 0
  });
}));

// Skip a recommendation
router.post('/skip', asyncHandler(async (req, res) => {
  const artist = (req.body.artist || '').trim();
  const recommended = (req.body.recommended || '').trim();

  if (!artist || !recommended) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  const musicConfig = loadMusicConfig();
  const artistKey = artist.toLowerCase();

  if (!musicConfig.artists[artistKey]) {
    return res.status(404).json({ error: 'Artist not found' });
  }

  const artistData = musicConfig.artists[artistKey];

  // Initialize history and current_index if not present
  if (!artistData.history) artistData.history = [];
  if (artistData.current_index === undefined) artistData.current_index = 0;

  // Move from front to back of pending queue
  const pendingIndex = artistData.pending.indexOf(recommended);
  if (pendingIndex !== -1) {
    artistData.pending.splice(pendingIndex, 1);
    artistData.pending.push(recommended);
  }

  // Move forward in navigation
  let nextRec;
  if (artistData.current_index < artistData.history.length - 1) {
    artistData.current_index += 1;
    nextRec = artistData.history[artistData.current_index];
  } else {
    nextRec = artistData.pending[0] || null;
    if (nextRec) {
      artistData.history.push(nextRec);
      artistData.current_index += 1;
    }
  }

  saveMusicConfig(musicConfig);

  return res.json({
    search_artist: artist,
    current_recommendation: nextRec,
    total_count: artistData.all_recommendations.length,
    listened_count: artistData.listened.length,
    current_index: artistData.current_index || 0
  });
}));

// Go back to previous recommendation
router.post('/back', asyncHandler(async (req, res) => {
  const artist = (req.body.artist || '').trim();

  if (!artist) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  const musicConfig = loadMusicConfig();
  const artistKey = artist.toLowerCase();

  if (!musicConfig.artists[artistKey]) {
    return res.status(404).json({ error: 'Artist not found' });
  }

  const artistData = musicConfig.artists[artistKey];

  // Initialize history and current_index if not present
  if (!artistData.history) artistData.history = [];
  if (artistData.current_index === undefined) artistData.current_index = 0;

  // Check if we can go back
  if (artistData.current_index <= 0) {
    return res.status(400).json({ error: 'No previous recommendations to go back to' });
  }

  // Move back one step in history
  artistData.current_index -= 1;
  const previousRec = artistData.history[artistData.current_index];

  saveMusicConfig(musicConfig);

  return res.json({
    search_artist: artist,
    current_recommendation: previousRec,
    total_count: artistData.all_recommendations.length,
    listened_count: artistData.listened.length,
    current_index: artistData.current_index
  });
}));

// Get current recommendation state
router.get('/current', asyncHandler(async (req, res) => {
  const musicConfig = loadMusicConfig();

  const currentSearch = musicConfig.current_search;
  if (!currentSearch || !musicConfig.artists[currentSearch]) {
    return res.json({});
  }

  const artistData = musicConfig.artists[currentSearch];

  // Initialize history and current_index if not present
  if (!artistData.history) artistData.history = [];
  if (artistData.current_index === undefined) artistData.current_index = 0;

  // Get current recommendation
  let currentRec = artistData.pending[0] || null;

  // If history is empty but we have a current recommendation, initialize history
  if (artistData.history.length === 0 && currentRec) {
    artistData.history = [currentRec];
    artistData.current_index = 0;
    saveMusicConfig(musicConfig);
  } else if (artistData.history.length > 0 && artistData.current_index < artistData.history.length) {
    currentRec = artistData.history[artistData.current_index];
  }

  return res.json({
    search_artist: artistData.search_artist,
    current_recommendation: currentRec,
    total_count: artistData.all_recommendations.length,
    listened_count: artistData.listened.length,
    current_index: artistData.current_index || 0
  });
}));

// Get search history
router.get('/history', asyncHandler(async (req, res) => {
  const musicConfig = loadMusicConfig();

  const history = Object.values(musicConfig.artists || {}).map(data => data.search_artist);

  return res.json({ history });
}));

// Get artist image from Wikipedia
router.get('/artist-image', asyncHandler(async (req, res) => {
  const artist = (req.query.artist || '').trim();

  if (!artist) {
    return res.status(400).json({ error: 'Artist name required' });
  }

  // Helper to extract image URL from Wikipedia page data
  const extractImageUrl = (pages) => {
    for (const page of Object.values(pages)) {
      // Prefer original, fall back to thumbnail
      if (page.original?.source) {
        return page.original.source;
      }
      if (page.thumbnail?.source) {
        // Request larger thumbnail by modifying the URL
        return page.thumbnail.source.replace(/\/\d+px-/, '/500px-');
      }
    }
    return null;
  };

  // Helper to fetch image for a given Wikipedia title
  const fetchImageForTitle = async (title) => {
    const encodedTitle = encodeURIComponent(title);
    const imageUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=original|thumbnail&pithumbsize=500&titles=${encodedTitle}`;

    const imgResponse = await axios.get(imageUrl, {
      headers: { 'User-Agent': 'SkyeJS/1.0 (music discovery app)' },
      timeout: 5000
    });

    const imgPages = imgResponse.data?.query?.pages || {};
    return extractImageUrl(imgPages);
  };

  try {
    const encodedArtist = encodeURIComponent(artist);

    // Strategy 1: Try explicit music-related page titles first
    // Many artists have disambiguation, e.g., "Muse (band)" instead of "Muse"
    const musicSuffixes = ['(band)', '(musician)', '(singer)', '(rapper)', '(group)'];
    for (const suffix of musicSuffixes) {
      const explicitTitle = `${artist} ${suffix}`;
      const imageUrl = await fetchImageForTitle(explicitTitle);
      if (imageUrl) {
        return res.json({ image_url: imageUrl });
      }
    }

    // Strategy 2: Search Wikipedia and prioritize music-related results
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&format=json&search=${encodedArtist}&limit=10`;
    const searchResponse = await axios.get(searchUrl, {
      headers: { 'User-Agent': 'SkyeJS/1.0 (music discovery app)' },
      timeout: 5000
    });

    const searchData = searchResponse.data;
    const titles = searchData[1] || [];
    const descriptions = searchData[2] || [];

    if (titles.length > 0) {
      const musicKeywords = ['band', 'musician', 'singer', 'artist', 'group', 'rapper', 'duo', 'rock', 'pop', 'music'];

      // Score each result: lower score = better match
      const scoredResults = titles.map((title, i) => {
        const desc = (descriptions[i] || '').toLowerCase();
        const titleLower = title.toLowerCase();
        let score = 100;

        // Strong preference for titles with music suffixes
        if (titleLower.includes('(band)') || titleLower.includes('(musician)') ||
            titleLower.includes('(singer)') || titleLower.includes('(rapper)')) {
          score = 0;
        }
        // Preference for descriptions with music keywords
        else if (musicKeywords.some(k => desc.includes(k))) {
          score = 10;
        }
        // Exact title match (could be disambiguation page)
        else if (titleLower === artist.toLowerCase()) {
          score = 50;
        }
        // Skip obviously wrong results
        else if (titleLower.includes('(album)') || titleLower.includes('(song)') ||
                 titleLower.includes('(film)') || titleLower.includes('(tv series)')) {
          score = 200;
        }

        return { title, score, index: i };
      });

      // Sort by score
      scoredResults.sort((a, b) => a.score - b.score);

      // Try each result in order
      for (const result of scoredResults) {
        if (result.score >= 200) continue; // Skip bad matches
        const imageUrl = await fetchImageForTitle(result.title);
        if (imageUrl) {
          return res.json({ image_url: imageUrl });
        }
      }
    }

    // Strategy 3: Final fallback - try exact title match
    const directImageUrl = await fetchImageForTitle(artist);
    if (directImageUrl) {
      return res.json({ image_url: directImageUrl });
    }

    return res.json({ image_url: null });
  } catch (error) {
    logger.error(`Music artist image error: ${error.message}`);
    return res.json({ image_url: null });
  }
}));

export default router;
