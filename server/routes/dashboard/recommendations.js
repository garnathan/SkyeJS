import { Router } from 'express';
import axios from 'axios';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { cache } from '../../services/cache.js';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';

const router = Router();

const YAHOO_FINANCE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const USER_AGENT = 'Mozilla/5.0';

// Stock score thresholds: [min_change_pct, score, description]
const STOCK_SCORE_THRESHOLDS = [
  [30, 95, 'Exceptional growth'],
  [20, 85, 'Strong growth'],
  [10, 75, 'Good growth'],
  [5, 65, 'Moderate growth'],
  [0, 55, 'Slight growth'],
  [-5, 45, 'Minor decline'],
  [-10, 35, 'Moderate decline'],
  [-20, 25, 'Significant decline'],
  [-999, 10, 'Major decline']
];

// Currency score thresholds: [min_change_pct, score, description]
const CURRENCY_SCORE_THRESHOLDS = [
  [5, 80, 'USD very strong'],
  [2, 70, 'USD strengthening'],
  [-1, 60, 'USD stable'],
  [-3, 40, 'USD weakening'],
  [-999, 20, 'USD very weak']
];

function calculateStockScore(changePct) {
  for (const [threshold, score, description] of STOCK_SCORE_THRESHOLDS) {
    if (changePct >= threshold) {
      const sign = changePct >= 0 ? '+' : '';
      return { score, trend: `${description} (${sign}${changePct.toFixed(1)}%)` };
    }
  }
  return { score: 10, trend: `Major decline (${changePct.toFixed(1)}%)` };
}

function calculateCurrencyScore(changePct) {
  for (const [threshold, score, description] of CURRENCY_SCORE_THRESHOLDS) {
    if (changePct >= threshold) {
      const sign = changePct >= 0 ? '+' : '';
      return { score, trend: `${description} (${sign}${changePct.toFixed(1)}%)` };
    }
  }
  return { score: 20, trend: `USD very weak (${changePct.toFixed(1)}%)` };
}

// Get current sell recommendation
router.get('/sell-recommendation', asyncHandler(async (req, res) => {
  const cacheKey = 'sell-recommendation';
  const cached = cache.get(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  logger.info('Calculating sell recommendation');

  try {
    const headers = { 'User-Agent': USER_AGENT };

    // Get 12 months of AMZN data
    const [amznResponse, eurResponse] = await Promise.all([
      axios.get(`${YAHOO_FINANCE_URL}/AMZN?range=1y&interval=1wk`, { headers, timeout: 10000 }),
      axios.get(`${YAHOO_FINANCE_URL}/EURUSD=X?range=1y&interval=1wk`, { headers, timeout: 10000 })
    ]);

    let stockScore = 50;
    let currencyScore = 50;
    let stockTrend = 'Unknown';
    let currencyTrend = 'Unknown';

    // Analyze AMZN stock trend
    if (amznResponse.data?.chart?.result?.[0]) {
      const result = amznResponse.data.chart.result[0];
      if (result.indicators?.quote?.[0]?.close) {
        const closes = result.indicators.quote[0].close.filter(c => c !== null);
        if (closes.length >= 2) {
          const startPrice = closes[0];
          const endPrice = closes[closes.length - 1];
          const changePct = ((endPrice - startPrice) / startPrice) * 100;
          const stockResult = calculateStockScore(changePct);
          stockScore = stockResult.score;
          stockTrend = stockResult.trend;
        }
      }
    }

    // Analyze EUR/USD currency trend (inverted for USD strength)
    if (eurResponse.data?.chart?.result?.[0]) {
      const result = eurResponse.data.chart.result[0];
      if (result.indicators?.quote?.[0]?.close) {
        const closes = result.indicators.quote[0].close.filter(c => c !== null);
        if (closes.length >= 2) {
          const startRate = closes[0];
          const endRate = closes[closes.length - 1];
          const startUsdEur = 1 / startRate;
          const endUsdEur = 1 / endRate;
          const rateChangePct = ((endUsdEur - startUsdEur) / startUsdEur) * 100;
          const currencyResult = calculateCurrencyScore(rateChangePct);
          currencyScore = currencyResult.score;
          currencyTrend = currencyResult.trend;
        }
      }
    }

    // Calculate overall score (weighted: 70% stock, 30% currency)
    const overallScore = Math.round((stockScore * 0.7) + (currencyScore * 0.3));

    // Generate recommendation text
    let recommendation, reasoning;
    if (overallScore >= 80) {
      recommendation = 'EXCELLENT';
      reasoning = 'Outstanding conditions for selling - strong stock performance and favorable currency trends.';
    } else if (overallScore >= 65) {
      recommendation = 'GOOD';
      reasoning = 'Favorable conditions for selling - positive market indicators.';
    } else if (overallScore >= 50) {
      recommendation = 'FAIR';
      reasoning = 'Neutral conditions - consider your personal financial goals.';
    } else if (overallScore >= 35) {
      recommendation = 'POOR';
      reasoning = 'Unfavorable conditions - consider waiting for better market timing.';
    } else {
      recommendation = 'VERY POOR';
      reasoning = 'Poor conditions for selling - significant headwinds present.';
    }

    const result = {
      recommendation,
      score: overallScore,
      stockScore,
      currencyScore,
      stockTrend,
      currencyTrend,
      reasoning
    };

    cache.set(cacheKey, result, config.cache.recommendations);
    return res.json(result);
  } catch (error) {
    logger.error(`Sell recommendation error: ${error.message}`);
    return res.json({
      recommendation: 'UNKNOWN',
      score: 0,
      stockScore: 0,
      currencyScore: 0,
      stockTrend: 'Analysis failed',
      currencyTrend: 'Analysis failed',
      reasoning: `Error: ${error.message}`
    });
  }
}));

// Get historical recommendation scores over 12 months
router.get('/recommendation-history', asyncHandler(async (req, res) => {
  const cacheKey = 'recommendation-history';
  const cached = cache.get(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  logger.info('Calculating recommendation history');

  try {
    const headers = { 'User-Agent': USER_AGENT };

    // Get 12 months of data (weekly intervals)
    const [amznResponse, eurResponse] = await Promise.all([
      axios.get(`${YAHOO_FINANCE_URL}/AMZN?range=1y&interval=1wk`, { headers, timeout: 10000 }),
      axios.get(`${YAHOO_FINANCE_URL}/EURUSD=X?range=1y&interval=1wk`, { headers, timeout: 10000 })
    ]);

    const dates = [];
    const scores = [];

    if (amznResponse.data?.chart?.result?.[0] && eurResponse.data?.chart?.result?.[0]) {
      const amznResult = amznResponse.data.chart.result[0];
      const eurResult = eurResponse.data.chart.result[0];

      if (amznResult.timestamp && amznResult.indicators?.quote?.[0]?.close &&
          eurResult.indicators?.quote?.[0]?.close) {

        const amznTimestamps = amznResult.timestamp;
        const amznCloses = amznResult.indicators.quote[0].close;
        const eurCloses = eurResult.indicators.quote[0].close;

        for (let i = 0; i < amznTimestamps.length; i++) {
          if (i < amznCloses.length && i < eurCloses.length &&
              amznCloses[i] !== null && eurCloses[i] !== null) {

            // Calculate stock performance from start to current point
            let stockChange = 0;
            if (i > 0) {
              const startPrice = amznCloses.slice(0, i + 1).find(p => p !== null) || amznCloses[i];
              stockChange = ((amznCloses[i] - startPrice) / startPrice) * 100;
            }
            const { score: stockScore } = calculateStockScore(stockChange);

            // Calculate currency change
            let currencyChange = 0;
            if (i > 0) {
              const startRate = eurCloses.slice(0, i + 1).find(r => r !== null) || eurCloses[i];
              const startUsdEur = 1 / startRate;
              const currentUsdEur = 1 / eurCloses[i];
              currencyChange = ((currentUsdEur - startUsdEur) / startUsdEur) * 100;
            }
            const { score: currencyScore } = calculateCurrencyScore(currencyChange);

            // Calculate overall score (70% stock, 30% currency)
            const overallScore = Math.round((stockScore * 0.7) + (currencyScore * 0.3));

            const date = new Date(amznTimestamps[i] * 1000);
            dates.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
            scores.push(overallScore);
          }
        }
      }
    }

    if (dates.length > 0 && scores.length > 0) {
      const result = { dates, scores };
      cache.set(cacheKey, result, config.cache.recommendations);
      return res.json(result);
    }

    return res.status(503).json({ error: 'Historical data unavailable' });
  } catch (error) {
    logger.error(`Recommendation history error: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
}));

export default router;
