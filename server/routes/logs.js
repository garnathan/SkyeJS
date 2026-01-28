import { Router } from 'express';
import { getLogs, clearLogs, getLogStats } from '../utils/logger.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// Get logs with filtering
router.get('/', asyncHandler(async (req, res) => {
  const { time, level, search } = req.query;

  const logs = getLogs({
    minutes: time ? parseInt(time, 10) : undefined,
    level,
    search
  });

  const stats = getLogStats();

  res.json({
    logs,
    stats
  });
}));

// Clear logs
router.post('/clear', asyncHandler(async (req, res) => {
  clearLogs();
  res.json({ success: true, message: 'Logs cleared' });
}));

export default router;
