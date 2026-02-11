import { Router } from 'express';
import weatherRoutes from './weather.js';
import todosRoutes from './todos.js';
import logsRoutes from './logs.js';
import toolsRoutes from './tools.js';
import networkRoutes from './network.js';
import dashboardRoutes from './dashboard/index.js';

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount routes
router.use('/weather', weatherRoutes);
router.use('/todos', todosRoutes);
router.use('/logs', logsRoutes);
router.use('/tools', toolsRoutes);
router.use('/network', networkRoutes);

// Dashboard routes are mounted at root level for backwards compatibility
router.use('/', dashboardRoutes);

export default router;
