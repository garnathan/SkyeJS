import { Router } from 'express';
import { fetchChartData, fetchCurrentPrice } from '../../services/yahooFinance.js';
import { asyncHandler } from '../../middleware/errorHandler.js';

const router = Router();

// Get stock chart data
router.get('/stock-data', asyncHandler(async (req, res) => {
  const { symbol = 'AMZN', period = '1y' } = req.query;
  const data = await fetchChartData(symbol, period);
  res.json(data);
}));

// Get current stock price
router.get('/current-price', asyncHandler(async (req, res) => {
  const { symbol = 'AMZN', period = '1d' } = req.query;
  const data = await fetchCurrentPrice(symbol, period);
  res.json(data);
}));

export default router;
