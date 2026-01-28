import { Router } from 'express';
import { fetchChartData } from '../../services/yahooFinance.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import config from '../../config/index.js';
import { cache } from '../../services/cache.js';
import logger from '../../utils/logger.js';

const router = Router();

// Get portfolio value over time
router.get('/portfolio-value', asyncHandler(async (req, res) => {
  const { period = '1y' } = req.query;
  const shares = config.portfolio.amznShares;

  if (!shares) {
    return res.json({
      data: [],
      currentValue: 0,
      change: 0,
      changePercent: 0
    });
  }

  const cacheKey = `portfolio:${period}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  logger.info(`Calculating portfolio value for period=${period}`);

  // Fetch AMZN and EUR/USD data
  const [amznData, eurUsdData] = await Promise.all([
    fetchChartData('AMZN', period),
    fetchChartData('EURUSD=X', period)
  ]);

  // Calculate portfolio value (AMZN price * shares / EUR rate)
  const portfolioData = amznData.data.map((amzn, i) => {
    const eurRate = eurUsdData.data[i]?.price || eurUsdData.data[eurUsdData.data.length - 1]?.price || 1;
    const valueEur = (amzn.price * shares) / eurRate;
    return {
      date: amzn.date,
      timestamp: amzn.timestamp,
      value: parseFloat(valueEur.toFixed(2))
    };
  });

  const currentValue = portfolioData[portfolioData.length - 1]?.value || 0;
  const startValue = portfolioData[0]?.value || currentValue;
  const change = currentValue - startValue;
  const changePercent = startValue > 0 ? ((change / startValue) * 100).toFixed(2) : 0;

  const result = {
    data: portfolioData,
    currentValue,
    startValue,
    change: parseFloat(change.toFixed(2)),
    changePercent: parseFloat(changePercent),
    shares,
    period,
    fetchedAt: new Date().toISOString()
  };

  cache.set(cacheKey, result, config.cache.portfolio);
  res.json(result);
}));

// Get cash assets value over time (how EUR cash value tracks with exchange rate)
router.get('/cash-assets-value', asyncHandler(async (req, res) => {
  const { period = '1y' } = req.query;
  const eurCash = config.portfolio.cashAssetsEur;

  if (!eurCash) {
    return res.json({
      data: [],
      currentValue: 0,
      change: 0,
      changePercent: 0
    });
  }

  const cacheKey = `cash-assets:${period}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  logger.info(`Calculating cash assets value for period=${period}`);

  // Fetch EUR/USD data with selected period
  const eurUsdData = await fetchChartData('EURUSD=X', period);

  // Get current rate to calculate the USD equivalent
  const currentEurUsdRate = eurUsdData.data[eurUsdData.data.length - 1]?.price || 1.17;
  const usdCash = eurCash * currentEurUsdRate;

  // Calculate historical value (as if holding USD cash)
  const cashData = eurUsdData.data.map((point) => {
    const usdEurRate = 1 / point.price;
    const cashValueEur = usdCash * usdEurRate;
    return {
      date: point.date,
      timestamp: point.timestamp,
      value: parseFloat(cashValueEur.toFixed(2))
    };
  });

  const currentValue = cashData[cashData.length - 1]?.value || eurCash;
  const startValue = cashData[0]?.value || currentValue;
  const change = currentValue - startValue;
  const changePercent = startValue > 0 ? ((change / startValue) * 100).toFixed(2) : 0;
  const currentUsdEurRate = 1 / currentEurUsdRate;

  const result = {
    data: cashData,
    eurAmount: eurCash,
    currentValue,
    startValue,
    change: parseFloat(change.toFixed(2)),
    changePercent: parseFloat(changePercent),
    usdEurRate: parseFloat(currentUsdEurRate.toFixed(4)),
    period,
    fetchedAt: new Date().toISOString()
  };

  cache.set(cacheKey, result, config.cache.charts);
  res.json(result);
}));

export default router;
