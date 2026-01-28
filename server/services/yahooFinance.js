import axios from 'axios';
import dayjs from 'dayjs';
import logger from '../utils/logger.js';
import { cache } from './cache.js';
import config from '../config/index.js';

const YAHOO_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

// Period to interval mapping
const periodConfig = {
  '1d': { interval: '5m', range: '1d' },
  '1wk': { interval: '30m', range: '5d' },
  '1mo': { interval: '1d', range: '1mo' },
  '3mo': { interval: '1d', range: '3mo' },
  '6mo': { interval: '1d', range: '6mo' },
  '1y': { interval: '1d', range: '1y' },
  '18mo': { interval: '1d', range: '2y' }, // Use 2y range, will trim to 18mo
  '5y': { interval: '1wk', range: '5y' }
};

export const fetchChartData = async (symbol, period = '1y') => {
  const cacheKey = `chart:${symbol}:${period}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const { interval, range } = periodConfig[period] || periodConfig['1y'];

  logger.info(`Fetching chart data: ${symbol}, period=${period}`);

  const url = `${YAHOO_BASE_URL}/${symbol}`;
  const response = await axios.get(url, {
    params: { interval, range },
    timeout: 10000
  });

  const result = response.data?.chart?.result?.[0];
  if (!result) {
    throw new Error('No data returned from Yahoo Finance');
  }

  const timestamps = result.timestamp || [];
  const quotes = result.indicators?.quote?.[0] || {};
  const closes = quotes.close || [];

  // Build data points
  let data = timestamps.map((ts, i) => ({
    date: formatDate(ts * 1000, period),
    timestamp: ts * 1000,
    price: closes[i] !== null ? parseFloat(closes[i].toFixed(2)) : null
  })).filter(d => d.price !== null);

  // For 18mo, we fetch 2y but trim to 18 months
  if (period === '18mo') {
    const eighteenMonthsAgo = dayjs().subtract(18, 'month').valueOf();
    data = data.filter(d => d.timestamp >= eighteenMonthsAgo);
  }

  const chartData = {
    symbol,
    period,
    data,
    meta: {
      currency: result.meta?.currency || 'USD',
      exchangeTimezoneName: result.meta?.exchangeTimezoneName
    },
    fetchedAt: new Date().toISOString()
  };

  cache.set(cacheKey, chartData, config.cache.charts);
  return chartData;
};

export const fetchCurrentPrice = async (symbol, period = '1d') => {
  const cacheKey = `price:${symbol}:${period}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  logger.info(`Fetching current price: ${symbol}, period=${period}`);

  const url = `${YAHOO_BASE_URL}/${symbol}`;

  // First, get current price
  const currentResponse = await axios.get(url, {
    params: { interval: '1m', range: '1d' },
    timeout: 10000
  });

  const currentResult = currentResponse.data?.chart?.result?.[0];
  if (!currentResult) {
    throw new Error('No data returned from Yahoo Finance');
  }

  const meta = currentResult.meta;
  const currentPrice = meta.regularMarketPrice;

  // Get the starting price for the selected period
  let periodStartPrice = meta.previousClose; // default to previous close for 1d

  if (period !== '1d') {
    // Fetch historical data to get the period start price
    const { interval, range } = periodConfig[period] || periodConfig['1y'];

    const historicalResponse = await axios.get(url, {
      params: { interval, range },
      timeout: 10000
    });

    const historicalResult = historicalResponse.data?.chart?.result?.[0];
    if (historicalResult) {
      const timestamps = historicalResult.timestamp || [];
      const closes = historicalResult.indicators?.quote?.[0]?.close || [];

      // For 18mo, find the price closest to 18 months ago
      if (period === '18mo') {
        const eighteenMonthsAgo = dayjs().subtract(18, 'month').valueOf();
        for (let i = 0; i < timestamps.length; i++) {
          if (timestamps[i] * 1000 >= eighteenMonthsAgo && closes[i] !== null) {
            periodStartPrice = closes[i];
            break;
          }
        }
      } else {
        // Find the first valid (non-null) price
        const firstPrice = closes.find(p => p !== null);
        if (firstPrice) {
          periodStartPrice = firstPrice;
        }
      }
    }
  }

  const change = currentPrice - periodStartPrice;
  const changePercent = ((change / periodStartPrice) * 100);

  const priceData = {
    symbol,
    price: currentPrice,
    periodStartPrice: parseFloat(periodStartPrice.toFixed(4)),
    change: parseFloat(change.toFixed(4)),
    changePercent: parseFloat(changePercent.toFixed(2)),
    period,
    currency: meta.currency,
    fetchedAt: new Date().toISOString()
  };

  cache.set(cacheKey, priceData, config.cache.prices);
  return priceData;
};

const formatDate = (timestamp, period) => {
  const date = dayjs(timestamp);
  switch (period) {
    case '1d':
      return date.format('HH:mm');
    case '1wk':
      return date.format('ddd HH:mm');
    case '1mo':
    case '3mo':
      return date.format('MMM D');
    case '6mo':
    case '1y':
    case '18mo':
    case '5y':
      return date.format('MMM YYYY');
    default:
      return date.format('MMM D, YYYY');
  }
};

export default {
  fetchChartData,
  fetchCurrentPrice
};
