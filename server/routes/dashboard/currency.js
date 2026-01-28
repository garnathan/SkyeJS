import { Router } from 'express';
import { fetchChartData, fetchCurrentPrice } from '../../services/yahooFinance.js';
import { asyncHandler } from '../../middleware/errorHandler.js';

const router = Router();

// Get USD/EUR exchange rate data
router.get('/currency-data', asyncHandler(async (req, res) => {
  const { period = '1y' } = req.query;

  // Yahoo uses EURUSD=X, we need to invert for USD/EUR
  const data = await fetchChartData('EURUSD=X', period);

  // Invert the rates (EUR/USD to USD/EUR)
  const invertedData = {
    ...data,
    symbol: 'USD/EUR',
    data: data.data.map(d => ({
      ...d,
      price: parseFloat((1 / d.price).toFixed(4))
    }))
  };

  res.json(invertedData);
}));

// Get current USD/EUR rate
router.get('/currency-rate', asyncHandler(async (req, res) => {
  const { period = '1d' } = req.query;
  const data = await fetchCurrentPrice('EURUSD=X', period);

  // Invert for USD/EUR
  const invertedRate = 1 / data.price;
  const invertedPeriodStart = 1 / data.periodStartPrice;

  res.json({
    symbol: 'USD/EUR',
    price: parseFloat(invertedRate.toFixed(4)),
    periodStartPrice: parseFloat(invertedPeriodStart.toFixed(4)),
    change: parseFloat((invertedRate - invertedPeriodStart).toFixed(4)),
    changePercent: parseFloat((((invertedRate - invertedPeriodStart) / invertedPeriodStart) * 100).toFixed(2)),
    period,
    fetchedAt: data.fetchedAt
  });
}));

export default router;
