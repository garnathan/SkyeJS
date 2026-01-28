import { Router } from 'express';
import axios from 'axios';
import { spawn, execSync } from 'child_process';
import { mkdtemp, readdir, readFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { asyncHandler, ConfigError } from '../middleware/errorHandler.js';
import { strictLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Rate limit download endpoint (resource intensive)
router.use('/download-audio', strictLimiter);

// In-memory token storage (per-session via simple object)
// In production, you'd want to use proper session management
const oauthTokens = {
  source: null,
  destination: null
};

// Check if required tools are installed
let ytdlpAvailable = false;
let ffmpegAvailable = false;
let cookiesFileExists = false;

const checkDependencies = () => {
  try {
    execSync('which yt-dlp', { stdio: 'pipe' });
    ytdlpAvailable = true;
  } catch {
    ytdlpAvailable = false;
  }

  try {
    execSync('which ffmpeg', { stdio: 'pipe' });
    ffmpegAvailable = true;
  } catch {
    ffmpegAvailable = false;
  }

  // Check if cookies file exists
  cookiesFileExists = existsSync(config.youtube.cookiesFile);

  logger.info(`YouTube dependencies: yt-dlp=${ytdlpAvailable}, ffmpeg=${ffmpegAvailable}, cookies=${cookiesFileExists}`);
};

// Check on startup
checkDependencies();

const getApiKey = () => {
  const apiKey = config.youtubeApiKey;
  if (!apiKey || apiKey === 'your_youtube_api_key_here') {
    throw new ConfigError('YouTube API key not configured');
  }
  return apiKey;
};

// Get playlists for a YouTube channel
router.get('/playlists', asyncHandler(async (req, res) => {
  const channelInput = (req.query.channel || '').trim();

  if (!channelInput) {
    return res.status(400).json({ error: 'Channel handle required' });
  }

  const apiKey = getApiKey();
  let channelId = null;
  let channelName = null;

  // Method 1: If it looks like a channel ID (starts with UC)
  if (channelInput.startsWith('UC') && channelInput.length === 24) {
    channelId = channelInput;
  } else {
    // Method 2: Try channels endpoint with forHandle (for @handles)
    if (channelInput.startsWith('@')) {
      const handle = channelInput.slice(1);
      try {
        const channelsResponse = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
          params: {
            part: 'snippet',
            forHandle: handle,
            key: apiKey
          },
          timeout: 10000
        });

        if (channelsResponse.data.items?.length > 0) {
          channelId = channelsResponse.data.items[0].id;
          channelName = channelsResponse.data.items[0].snippet.title;
        }
      } catch (error) {
        if (error.response?.status === 403) {
          return res.status(403).json({
            error: 'YouTube API access denied. The API key may not have YouTube Data API v3 enabled.'
          });
        }
      }
    }

    // Method 3: Search for channel by name
    if (!channelId) {
      const searchQuery = channelInput.replace('@', '');
      try {
        const searchResponse = await axios.get('https://www.googleapis.com/youtube/v3/search', {
          params: {
            part: 'snippet',
            q: searchQuery,
            type: 'channel',
            key: apiKey,
            maxResults: 5
          },
          timeout: 10000
        });

        if (searchResponse.data.items?.length > 0) {
          // Find exact match or closest match
          for (const item of searchResponse.data.items) {
            const title = item.snippet.title.toLowerCase();
            if (searchQuery.toLowerCase().includes(title) || title.includes(searchQuery.toLowerCase())) {
              channelId = item.snippet.channelId;
              channelName = item.snippet.title;
              break;
            }
          }

          // If no exact match, use first result
          if (!channelId) {
            channelId = searchResponse.data.items[0].snippet.channelId;
            channelName = searchResponse.data.items[0].snippet.title;
          }
        }
      } catch (error) {
        if (error.response?.status === 403) {
          return res.status(403).json({
            error: 'YouTube API access denied. The API key may not have YouTube Data API v3 enabled.'
          });
        }
      }
    }
  }

  if (!channelId) {
    return res.status(404).json({
      error: `Channel "${channelInput}" not found. Try using the exact channel handle (e.g., @username) or channel name.`
    });
  }

  // Get channel name if we don't have it
  if (!channelName) {
    try {
      const channelsResponse = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
        params: {
          part: 'snippet',
          id: channelId,
          key: apiKey
        },
        timeout: 10000
      });

      if (channelsResponse.data.items?.length > 0) {
        channelName = channelsResponse.data.items[0].snippet.title;
      }
    } catch (error) {
      // Ignore error, we'll use fallback name
    }
  }

  // Get playlists for the channel with pagination
  const playlists = [];
  let nextPageToken = null;

  do {
    const playlistsResponse = await axios.get('https://www.googleapis.com/youtube/v3/playlists', {
      params: {
        part: 'snippet,contentDetails,status',
        channelId,
        key: apiKey,
        maxResults: 50,
        ...(nextPageToken && { pageToken: nextPageToken })
      },
      timeout: 10000
    });

    for (const item of playlistsResponse.data.items || []) {
      playlists.push({
        id: item.id,
        title: item.snippet.title,
        description: item.snippet.description || '',
        videoCount: item.contentDetails.itemCount,
        privacy: item.status.privacyStatus,
        thumbnail: item.snippet.thumbnails?.default?.url || ''
      });
    }

    nextPageToken = playlistsResponse.data.nextPageToken;
  } while (nextPageToken);

  logger.info(`Retrieved ${playlists.length} playlists for channel: ${channelName}`);

  return res.json({
    playlists,
    channelName: channelName || 'Unknown Channel',
    channelId
  });
}));

// Get videos from a playlist
router.get('/playlist-videos', asyncHandler(async (req, res) => {
  const playlistId = (req.query.playlistId || '').trim();

  if (!playlistId) {
    return res.status(400).json({ error: 'Playlist ID required' });
  }

  const apiKey = getApiKey();
  const videos = [];
  let nextPageToken = null;

  do {
    const response = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
      params: {
        part: 'snippet',
        playlistId,
        key: apiKey,
        maxResults: 50,
        ...(nextPageToken && { pageToken: nextPageToken })
      },
      timeout: 10000
    });

    for (const item of response.data.items || []) {
      if (item.snippet.resourceId.kind === 'youtube#video') {
        videos.push({
          videoId: item.snippet.resourceId.videoId,
          title: item.snippet.title,
          description: item.snippet.description || '',
          position: item.snippet.position,
          thumbnail: item.snippet.thumbnails?.default?.url || ''
        });
      }
    }

    nextPageToken = response.data.nextPageToken;
  } while (nextPageToken);

  logger.info(`Retrieved ${videos.length} videos from playlist: ${playlistId}`);

  return res.json({ videos });
}));

// Check if download tools are available
router.get('/download-status', (req, res) => {
  checkDependencies(); // Recheck in case tools were installed
  res.json({
    available: ytdlpAvailable && ffmpegAvailable,
    ytdlp: ytdlpAvailable,
    ffmpeg: ffmpegAvailable,
    cookiesFile: cookiesFileExists,
    cookiesPath: config.youtube.cookiesFile,
    message: ytdlpAvailable && ffmpegAvailable
      ? (cookiesFileExists
        ? 'YouTube audio download is available with cookies'
        : 'YouTube audio download is available (cookies file not found - some videos may require authentication)')
      : `Missing dependencies: ${!ytdlpAvailable ? 'yt-dlp ' : ''}${!ffmpegAvailable ? 'ffmpeg' : ''}`.trim()
  });
});

// Export cookies from browser to file
router.post('/export-cookies', asyncHandler(async (req, res) => {
  const { browser = 'firefox' } = req.body;
  const validBrowsers = ['firefox', 'chrome', 'safari', 'edge', 'brave'];

  if (!validBrowsers.includes(browser)) {
    return res.status(400).json({ error: `Invalid browser. Use one of: ${validBrowsers.join(', ')}` });
  }

  logger.info(`Exporting YouTube cookies from ${browser}`);

  try {
    await new Promise((resolve, reject) => {
      const ytdlp = spawn('yt-dlp', [
        '--cookies-from-browser', browser,
        '--cookies', config.youtube.cookiesFile,
        '--skip-download',
        'https://www.youtube.com'
      ]);

      let stderr = '';
      ytdlp.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ytdlp.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(stderr || `Failed to export cookies (exit code ${code})`));
        }
      });

      ytdlp.on('error', (err) => {
        reject(err);
      });
    });

    // Verify the file was created
    checkDependencies();

    if (cookiesFileExists) {
      logger.info(`Successfully exported cookies to ${config.youtube.cookiesFile}`);
      res.json({
        success: true,
        message: `Cookies exported from ${browser} to ${config.youtube.cookiesFile}`,
        cookiesFile: config.youtube.cookiesFile
      });
    } else {
      throw new Error('Cookies file was not created');
    }
  } catch (error) {
    logger.error(`Failed to export cookies: ${error.message}`);
    res.status(500).json({
      error: `Failed to export cookies from ${browser}: ${error.message}`,
      suggestion: `Make sure ${browser} is installed and you're logged into YouTube in that browser.`
    });
  }
}));

// Download audio from YouTube
router.post('/download-audio', asyncHandler(async (req, res) => {
  const { url, savePath = 'audio.mp3' } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'No URL provided' });
  }

  // Check dependencies
  if (!ytdlpAvailable || !ffmpegAvailable) {
    checkDependencies(); // Recheck
    if (!ytdlpAvailable || !ffmpegAvailable) {
      return res.status(501).json({
        error: 'YouTube audio download requires yt-dlp and ffmpeg to be installed on the server.',
        instructions: 'Install with: brew install yt-dlp ffmpeg',
        ytdlp: ytdlpAvailable,
        ffmpeg: ffmpegAvailable
      });
    }
  }

  // Validate YouTube URL
  const validHosts = ['www.youtube.com', 'youtube.com', 'youtu.be'];
  let isValid = false;
  try {
    const parsedUrl = new URL(url);
    isValid = validHosts.some(host => parsedUrl.hostname.includes(host));
  } catch {
    isValid = false;
  }

  if (!isValid) {
    return res.status(400).json({ error: 'Invalid YouTube URL' });
  }

  logger.info(`YouTube audio download requested: ${url}`);

  // Create temporary directory
  let tempDir;
  try {
    tempDir = await mkdtemp(join(tmpdir(), 'skye-ytdl-'));

    // Run yt-dlp
    const outputTemplate = join(tempDir, '%(title)s.%(ext)s');

    // Build strategies - prioritize direct browser cookie access (more complete)
    // The key insight: --cookies-from-browser gets ALL cookies including httpOnly ones
    // that cannot be exported to a file. This is essential for YouTube's bot detection.
    const strategies = [
      // Strategy 1: Chrome browser cookies (best success rate)
      ['--cookies-from-browser', 'chrome'],
      // Strategy 2: Firefox browser cookies
      ['--cookies-from-browser', 'firefox'],
      // Strategy 3: Safari browser cookies
      ['--cookies-from-browser', 'safari'],
    ];

    // Add cookies file as fallback if it exists
    checkDependencies();
    if (cookiesFileExists) {
      strategies.push(
        ['--cookies', config.youtube.cookiesFile],
      );
    }

    // Add no-cookie fallbacks (unlikely to work but worth trying)
    strategies.push(
      ['--extractor-args', 'youtube:player_client=android'],
      ['--extractor-args', 'youtube:player_client=ios'],
    );

    let lastError = null;
    let success = false;

    for (let i = 0; i < strategies.length && !success; i++) {
      const strategy = strategies[i];
      logger.info(`YouTube download attempt ${i + 1}/${strategies.length}: ${strategy.join(' ')}`);

      // Build yt-dlp arguments
      const ytdlpArgs = [
        '--format', 'bestaudio/best',
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '320K',
        '--output', outputTemplate,
        '--no-playlist',
        ...strategy,
        url
      ];

      try {
        await new Promise((resolve, reject) => {
          const ytdlp = spawn('yt-dlp', ytdlpArgs);

          let stderr = '';
          let stdout = '';

          ytdlp.stdout.on('data', (data) => {
            stdout += data.toString();
          });

          ytdlp.stderr.on('data', (data) => {
            stderr += data.toString();
          });

          ytdlp.on('close', (code) => {
            if (code === 0) {
              resolve();
            } else {
              // Check if it's a bot detection error
              const output = stderr + stdout;
              if (output.includes('Sign in to confirm') || output.includes('bot')) {
                reject(new Error('BOT_DETECTION'));
              } else {
                reject(new Error(stderr || `yt-dlp exited with code ${code}`));
              }
            }
          });

          ytdlp.on('error', (err) => {
            reject(err);
          });
        });
        success = true;
        logger.info(`YouTube download succeeded with strategy ${i + 1}`);
      } catch (err) {
        lastError = err;
        if (err.message !== 'BOT_DETECTION') {
          // Non-bot error, don't retry
          break;
        }
        logger.warn(`Strategy ${i + 1} failed with bot detection, trying next...`);
      }
    }

    if (!success) {
      throw lastError || new Error('All download strategies failed');
    }

    // Find the downloaded MP3 file
    const files = await readdir(tempDir);
    const mp3Files = files.filter(f => f.endsWith('.mp3'));

    if (mp3Files.length === 0) {
      throw new Error('No MP3 file was created');
    }

    const mp3File = mp3Files[0];
    const mp3Path = join(tempDir, mp3File);

    // Read file and encode as base64
    const fileData = await readFile(mp3Path);
    const base64Data = fileData.toString('base64');

    // Use the original YouTube title as filename (already has .mp3 extension)
    // Only use savePath if explicitly provided and not the default
    const filename = (savePath && savePath !== 'audio.mp3')
      ? (savePath.endsWith('.mp3') ? savePath : `${savePath}.mp3`)
      : mp3File;

    logger.info(`YouTube audio download successful: ${mp3File}`);

    res.json({
      success: true,
      filename: filename,
      fileData: base64Data,
      originalFilename: mp3File
    });
  } catch (error) {
    logger.error(`YouTube download error: ${error.message}`);

    // Provide helpful error message for bot detection
    if (error.message === 'BOT_DETECTION' || error.message.includes('Sign in to confirm')) {
      return res.status(503).json({
        error: 'YouTube is requiring sign-in verification.',
        suggestion: cookiesFileExists
          ? 'Your cookies file may be stale. Try exporting fresh cookies using POST /api/youtube/export-cookies'
          : 'Export cookies from your browser using POST /api/youtube/export-cookies with {"browser": "firefox"} or {"browser": "chrome"}',
        cookiesFile: cookiesFileExists,
        technical: 'YouTube bot detection triggered on all client strategies'
      });
    }

    return res.status(500).json({
      error: `Download failed: ${error.message}`
    });
  } finally {
    // Clean up temp directory
    if (tempDir) {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch (err) {
        logger.warn(`Failed to clean up temp dir: ${err.message}`);
      }
    }
  }
}));

// ============================================
// YouTube OAuth and Playlist Copier Routes
// ============================================

// Get OAuth configuration status
router.get('/oauth/status', (req, res) => {
  const { clientId, clientSecret } = config.youtube.oauth;
  const configured = clientId && clientSecret &&
    clientId !== 'your_client_id.apps.googleusercontent.com';

  res.json({
    configured,
    sourceAuthorized: !!oauthTokens.source,
    destinationAuthorized: !!oauthTokens.destination
  });
});

// Start YouTube OAuth flow for source or destination account
router.get('/oauth/authorize/:accountType', asyncHandler(async (req, res) => {
  const { accountType } = req.params;

  if (!['source', 'destination'].includes(accountType)) {
    return res.status(400).json({ error: 'Invalid account type' });
  }

  const { clientId, redirectUri } = config.youtube.oauth;

  if (!clientId || clientId === 'your_client_id.apps.googleusercontent.com') {
    return res.status(500).json({
      error: 'YouTube OAuth not configured. Please set youtube_oauth.client_id and client_secret in config.json or environment variables.'
    });
  }

  // YouTube OAuth scopes for playlist management
  const scopes = 'https://www.googleapis.com/auth/youtube';

  const authUrl = `https://accounts.google.com/o/oauth2/auth?` +
    `client_id=${encodeURIComponent(clientId)}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `scope=${encodeURIComponent(scopes)}&` +
    `response_type=code&` +
    `access_type=offline&` +
    `state=${accountType}`;

  logger.info(`YouTube OAuth initiated for ${accountType} account`);

  res.json({ auth_url: authUrl });
}));

// Handle YouTube OAuth callback
router.get('/oauth/callback', asyncHandler(async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).send('OAuth authorization failed - no code received');
  }

  if (!['source', 'destination'].includes(state)) {
    return res.status(400).send('Invalid state parameter');
  }

  const { clientId, clientSecret, redirectUri } = config.youtube.oauth;

  try {
    // Exchange code for access token
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    });

    const tokenInfo = tokenResponse.data;

    // Store tokens
    oauthTokens[state] = {
      accessToken: tokenInfo.access_token,
      refreshToken: tokenInfo.refresh_token,
      expiresAt: Date.now() + (tokenInfo.expires_in * 1000)
    };

    logger.info(`YouTube OAuth successful for ${state} account`);

    // Return HTML that communicates with the opener window
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>YouTube Authorization Successful</title>
        <style>
          body { font-family: system-ui, sans-serif; text-align: center; padding: 50px; background: #1e293b; color: white; }
          h2 { color: #22c55e; }
          p { color: #94a3b8; }
        </style>
      </head>
      <body>
        <h2>YouTube Authorization Successful!</h2>
        <p>${state.charAt(0).toUpperCase() + state.slice(1)} account authorized. You can close this window.</p>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'oauth_success', accountType: '${state}' }, '*');
          }
          setTimeout(() => window.close(), 2000);
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    logger.error(`YouTube OAuth token exchange failed: ${error.response?.data?.error_description || error.message}`);
    res.status(400).send(`Token exchange failed: ${error.response?.data?.error_description || error.message}`);
  }
}));

// Revoke OAuth tokens (logout)
router.post('/oauth/revoke/:accountType', asyncHandler(async (req, res) => {
  const { accountType } = req.params;

  if (!['source', 'destination'].includes(accountType)) {
    return res.status(400).json({ error: 'Invalid account type' });
  }

  oauthTokens[accountType] = null;
  logger.info(`YouTube OAuth revoked for ${accountType} account`);

  res.json({ success: true, message: `${accountType} account logged out` });
}));

// Copy playlists from source to destination account
router.post('/copy-playlists', asyncHandler(async (req, res) => {
  // Check if both accounts are authenticated
  if (!oauthTokens.source) {
    logger.warn('YouTube playlist copy failed: Source account not authenticated');
    return res.status(401).json({
      error: 'Source account not authenticated. Please authorize source account first.',
      auth_required: 'source'
    });
  }

  if (!oauthTokens.destination) {
    logger.warn('YouTube playlist copy failed: Destination account not authenticated');
    return res.status(401).json({
      error: 'Destination account not authenticated. Please authorize destination account first.',
      auth_required: 'destination'
    });
  }

  const { playlistIds, copyPrivate = true, copyDescriptions = true } = req.body;

  if (!playlistIds || playlistIds.length === 0) {
    return res.status(400).json({ error: 'No playlists selected' });
  }

  logger.info(`YouTube playlist copy requested: ${playlistIds.length} playlists, private=${copyPrivate}, descriptions=${copyDescriptions}`);

  const apiKey = getApiKey();
  const destToken = oauthTokens.destination.accessToken;
  const copiedPlaylists = [];

  for (const playlistId of playlistIds) {
    try {
      // Get original playlist details
      const playlistResponse = await axios.get('https://www.googleapis.com/youtube/v3/playlists', {
        params: {
          part: 'snippet,status',
          id: playlistId,
          key: apiKey
        },
        timeout: 10000
      });

      if (!playlistResponse.data.items?.length) {
        logger.warn(`Playlist ${playlistId} not found, skipping`);
        continue;
      }

      const originalPlaylist = playlistResponse.data.items[0];

      // Skip private playlists if not copying private
      if (!copyPrivate && originalPlaylist.status.privacyStatus === 'private') {
        continue;
      }

      // Create new playlist in destination account
      const createData = {
        snippet: {
          title: `Copy of ${originalPlaylist.snippet.title}`,
          description: copyDescriptions ? originalPlaylist.snippet.description : ''
        },
        status: {
          privacyStatus: 'private'  // Always create as private initially
        }
      };

      const createResponse = await axios.post(
        'https://www.googleapis.com/youtube/v3/playlists?part=snippet,status',
        createData,
        {
          headers: {
            'Authorization': `Bearer ${destToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      const newPlaylist = createResponse.data;
      const newPlaylistId = newPlaylist.id;

      // Get all videos from original playlist (with pagination)
      let nextPageToken = null;
      let videosAdded = 0;

      do {
        const videosResponse = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
          params: {
            part: 'snippet',
            playlistId,
            maxResults: 50,
            key: apiKey,
            ...(nextPageToken && { pageToken: nextPageToken })
          },
          timeout: 10000
        });

        // Add each video to new playlist
        for (const video of videosResponse.data.items || []) {
          if (video.snippet.resourceId.kind === 'youtube#video') {
            const videoId = video.snippet.resourceId.videoId;

            try {
              await axios.post(
                'https://www.googleapis.com/youtube/v3/playlistItems?part=snippet',
                {
                  snippet: {
                    playlistId: newPlaylistId,
                    resourceId: {
                      kind: 'youtube#video',
                      videoId
                    }
                  }
                },
                {
                  headers: {
                    'Authorization': `Bearer ${destToken}`,
                    'Content-Type': 'application/json'
                  },
                  timeout: 10000
                }
              );
              videosAdded++;
            } catch (err) {
              logger.warn(`Failed to add video ${videoId} to playlist: ${err.message}`);
            }
          }
        }

        nextPageToken = videosResponse.data.nextPageToken;
      } while (nextPageToken);

      copiedPlaylists.push({
        original_id: playlistId,
        new_id: newPlaylistId,
        title: newPlaylist.snippet.title,
        videos_added: videosAdded
      });

      logger.info(`Copied playlist "${originalPlaylist.snippet.title}" with ${videosAdded} videos`);

    } catch (error) {
      logger.error(`Error copying playlist ${playlistId}: ${error.message}`);
      continue;
    }
  }

  logger.info(`Successfully copied ${copiedPlaylists.length} playlists`);

  res.json({
    success: true,
    copied_playlists: copiedPlaylists,
    message: `Successfully copied ${copiedPlaylists.length} playlists`
  });
}));

export default router;
