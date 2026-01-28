import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import config from './config/index.js';
import logger from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';

// Routes
import claudeRoutes from './routes/claude.js';
import weatherRoutes from './routes/weather.js';
import todosRoutes from './routes/todos.js';
import logsRoutes from './routes/logs.js';
import musicRoutes from './routes/music.js';
import youtubeRoutes from './routes/youtube.js';
import toolsRoutes from './routes/tools.js';
import settingsRoutes from './routes/settings.js';
import networkRoutes from './routes/network.js';
import homeRoutes from './routes/home.js';
import dashboardRoutes from './routes/dashboard/index.js';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: config.clientUrl,
    methods: ['GET', 'POST']
  }
});

// Middleware
// Security headers (configured for localhost use)
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for localhost development
  crossOriginEmbedderPolicy: false, // Allow embedding for local dev
}));
app.use(cors({ origin: config.clientUrl }));
app.use(express.json({ limit: '10mb' })); // Limit request body size
app.use(requestLogger);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Restart endpoint - triggers server restart by touching a watched file
app.post('/api/restart', async (req, res) => {
  const { utimes } = await import('fs/promises');
  const { fileURLToPath } = await import('url');

  logger.info('Restart requested via API');
  res.json({ message: 'Server restarting...' });

  // Touch this file (index.js) to trigger node --watch restart
  const __filename = fileURLToPath(import.meta.url);

  setTimeout(async () => {
    try {
      const now = new Date();
      await utimes(__filename, now, now);
      logger.info('Triggered restart via file touch');
    } catch (err) {
      logger.error('Failed to trigger restart:', err);
    }
  }, 100);
});

// API Routes
app.use('/api/claude', claudeRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/todos', todosRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/music-next', musicRoutes);
app.use('/api/youtube', youtubeRoutes);
app.use('/api/tools', toolsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/network', networkRoutes);
app.use('/api/home', homeRoutes);
app.use('/api', dashboardRoutes);

// OAuth callback routes (outside /api prefix for cleaner URLs)
app.use('/oauth/youtube', youtubeRoutes);

// Error handler (must be last)
app.use(errorHandler);

// Socket.IO for real-time updates
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Export io for use in routes
export { io };

// Start server
const PORT = config.port;
httpServer.listen(PORT, () => {
  logger.info(`SkyeJS server running on port ${PORT}`);
  logger.info(`Environment: ${config.nodeEnv}`);
});
