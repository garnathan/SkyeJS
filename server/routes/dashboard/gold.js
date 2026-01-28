import { Router } from 'express';
import { fetchChartData, fetchCurrentPrice } from '../../services/yahooFinance.js';
import { asyncHandler } from '../../middleware/errorHandler.js';

const router = Router();

// Get gold price data
router.get('/gold-data', asyncHandler(async (req, res) => {
  const { period = '1y' } = req.query;
  const data = await fetchChartData('GC=F', period);

  // Convert to EUR using current exchange rate
  const eurRate = await fetchCurrentPrice('EURUSD=X');
  const rate = eurRate.price;

  const goldDataEur = {
    ...data,
    symbol: 'Gold (EUR)',
    data: data.data.map(d => ({
      ...d,
      price: parseFloat((d.price / rate).toFixed(2))
    })),
    currency: 'EUR'
  };

  res.json(goldDataEur);
}));

// Get current gold price
router.get('/gold-price', asyncHandler(async (req, res) => {
  const { period = '1d' } = req.query;
  const [goldData, eurRate] = await Promise.all([
    fetchCurrentPrice('GC=F', period),
    fetchCurrentPrice('EURUSD=X', period)
  ]);

  const rate = eurRate.price;
  const priceEur = goldData.price / rate;
  const periodStartEur = goldData.periodStartPrice / eurRate.periodStartPrice;

  res.json({
    symbol: 'Gold',
    price: parseFloat(priceEur.toFixed(2)),
    periodStartPrice: parseFloat(periodStartEur.toFixed(2)),
    change: parseFloat((priceEur - periodStartEur).toFixed(2)),
    changePercent: parseFloat((((priceEur - periodStartEur) / periodStartEur) * 100).toFixed(2)),
    currency: 'EUR',
    period,
    fetchedAt: goldData.fetchedAt
  });
}));

export default router;
