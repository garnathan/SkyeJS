import { Router } from 'express';
import stocksRoutes from './stocks.js';
import portfolioRoutes from './portfolio.js';
import cryptoRoutes from './crypto.js';
import currencyRoutes from './currency.js';
import goldRoutes from './gold.js';
import recommendationsRoutes from './recommendations.js';

const router = Router();

router.use(stocksRoutes);
router.use(portfolioRoutes);
router.use(cryptoRoutes);
router.use(currencyRoutes);
router.use(goldRoutes);
router.use(recommendationsRoutes);

export default router;
