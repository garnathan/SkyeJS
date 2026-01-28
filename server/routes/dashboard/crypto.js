import { Router } from 'express';
import { fetchChartData, fetchCurrentPrice } from '../../services/yahooFinance.js';
import { asyncHandler } from '../../middleware/errorHandler.js';

const router = Router();

// Get XRP price data in EUR
router.get('/xrp-data', asyncHandler(async (req, res) => {
  const { period = '1y' } = req.query;
  const data = await fetchChartData('XRP-EUR', period);
  res.json(data);
}));

// Get current XRP price
router.get('/xrp-price', asyncHandler(async (req, res) => {
  const { period = '1d' } = req.query;
  const data = await fetchCurrentPrice('XRP-EUR', period);
  res.json(data);
}));

export default router;
