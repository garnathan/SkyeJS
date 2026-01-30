import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../services/api';
import PriceCard from '../components/features/dashboard/PriceCard';
import StockChart from '../components/features/dashboard/StockChart';
import PortfolioSummary from '../components/features/dashboard/PortfolioSummary';
import SellRecommendation from '../components/features/dashboard/SellRecommendation';
import RecommendationHistory from '../components/features/dashboard/RecommendationHistory';

const periods = [
  { value: '1d', label: '1D' },
  { value: '1wk', label: '1W' },
  { value: '1mo', label: '1M' },
  { value: '6mo', label: '6M' },
  { value: '1y', label: '1Y' },
  { value: '18mo', label: '18M' },
];

function Dashboard() {
  const [period, setPeriod] = useState('1y');

  // Fetch AMZN stock data
  const { data: amznData, isLoading: amznLoading } = useQuery({
    queryKey: ['stockData', 'AMZN', period],
    queryFn: async () => {
      const response = await dashboardApi.getStockData('AMZN', period);
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch current AMZN price
  const { data: amznPrice, isLoading: amznPriceLoading } = useQuery({
    queryKey: ['currentPrice', 'AMZN', period],
    queryFn: async () => {
      const response = await dashboardApi.getCurrentPrice('AMZN', period);
      return response.data;
    },
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });

  // Fetch ORCL stock data
  const { data: orclData, isLoading: orclLoading } = useQuery({
    queryKey: ['stockData', 'ORCL', period],
    queryFn: async () => {
      const response = await dashboardApi.getStockData('ORCL', period);
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch current ORCL price
  const { data: orclPrice, isLoading: orclPriceLoading } = useQuery({
    queryKey: ['currentPrice', 'ORCL', period],
    queryFn: async () => {
      const response = await dashboardApi.getCurrentPrice('ORCL', period);
      return response.data;
    },
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });

  // Fetch portfolio value
  const { data: portfolio, isLoading: portfolioLoading } = useQuery({
    queryKey: ['portfolio', period],
    queryFn: async () => {
      const response = await dashboardApi.getPortfolioValue(period);
      return response.data;
    },
    staleTime: 2 * 60 * 1000,
  });

  // Fetch XRP data
  const { data: xrpData, isLoading: xrpLoading } = useQuery({
    queryKey: ['xrpData', period],
    queryFn: async () => {
      const response = await dashboardApi.getXrpData(period);
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch XRP price
  const { data: xrpPrice, isLoading: xrpPriceLoading } = useQuery({
    queryKey: ['xrpPrice', period],
    queryFn: async () => {
      const response = await dashboardApi.getXrpPrice(period);
      return response.data;
    },
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });

  // Fetch currency data (USD/EUR)
  const { data: currencyData, isLoading: currencyLoading } = useQuery({
    queryKey: ['currencyData', period],
    queryFn: async () => {
      const response = await dashboardApi.getCurrencyData(period);
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch currency rate
  const { data: currencyRate, isLoading: rateLoading } = useQuery({
    queryKey: ['currencyRate', period],
    queryFn: async () => {
      const response = await dashboardApi.getCurrencyRate(period);
      return response.data;
    },
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });

  // Fetch gold data
  const { data: goldData, isLoading: goldLoading } = useQuery({
    queryKey: ['goldData', period],
    queryFn: async () => {
      const response = await dashboardApi.getGoldData(period);
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch gold price
  const { data: goldPrice, isLoading: goldPriceLoading } = useQuery({
    queryKey: ['goldPrice', period],
    queryFn: async () => {
      const response = await dashboardApi.getGoldPrice(period);
      return response.data;
    },
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });

  // Fetch sell recommendation
  const { data: sellRec, isLoading: sellRecLoading } = useQuery({
    queryKey: ['sellRecommendation'],
    queryFn: async () => {
      const response = await dashboardApi.getSellRecommendation();
      return response.data;
    },
    staleTime: 10 * 60 * 1000,
  });

  // Fetch recommendation history
  const { data: recHistory, isLoading: recHistoryLoading } = useQuery({
    queryKey: ['recommendationHistory'],
    queryFn: async () => {
      const response = await dashboardApi.getRecommendationHistory();
      return response.data;
    },
    staleTime: 10 * 60 * 1000,
  });

  // XRP holdings value (1400 coins)
  const xrpQuantity = 1400;
  const xrpHoldingsValue = xrpPrice?.price ? (xrpPrice.price * xrpQuantity).toFixed(2) : null;

  return (
    <div className="max-w-7xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Dashboard
        </h1>
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
          {periods.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                period === p.value
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Market Prices Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <PriceCard
          title="AMZN"
          price={amznPrice?.price}
          change={amznPrice?.change}
          changePercent={amznPrice?.changePercent}
          isLoading={amznPriceLoading}
        />
        <PriceCard
          title="ORCL"
          price={orclPrice?.price}
          change={orclPrice?.change}
          changePercent={orclPrice?.changePercent}
          isLoading={orclPriceLoading}
        />
        <PriceCard
          title="XRP/EUR"
          price={xrpPrice?.price}
          change={xrpPrice?.change}
          changePercent={xrpPrice?.changePercent}
          currency="€"
          isLoading={xrpPriceLoading}
        />
        <PriceCard
          title="USD/EUR"
          price={currencyRate?.price}
          change={currencyRate?.change}
          changePercent={currencyRate?.changePercent}
          currency=""
          isLoading={rateLoading}
        />
        <PriceCard
          title="Gold"
          price={goldPrice?.price}
          change={goldPrice?.change}
          changePercent={goldPrice?.changePercent}
          currency="€"
          isLoading={goldPriceLoading}
        />
      </div>

      {/* Portfolio Holdings Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <PortfolioSummary
          portfolio={portfolio}
          isLoading={portfolioLoading}
          title="AMZN Portfolio Value"
        />
        <div className="card p-4">
          <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
            XRP Holdings
          </h3>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">
            {xrpPriceLoading ? '—' : `€${xrpHoldingsValue ? parseFloat(xrpHoldingsValue).toLocaleString() : '—'}`}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {xrpQuantity.toLocaleString()} XRP
          </p>
          {xrpPrice?.changePercent !== undefined && (
            <p className={`text-sm mt-1 ${xrpPrice.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {xrpPrice.changePercent >= 0 ? '+' : ''}{xrpPrice.changePercent}%
            </p>
          )}
        </div>
      </div>

      {/* Sell Recommendation Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <RecommendationHistory data={recHistory} isLoading={recHistoryLoading} />
        <SellRecommendation data={sellRec} isLoading={sellRecLoading} />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <StockChart
          title="Amazon (AMZN)"
          data={amznData?.data}
          color="#3b82f6"
          isLoading={amznLoading}
          currency="$"
        />
        <StockChart
          title="Portfolio Value (EUR)"
          data={portfolio?.data}
          dataKey="value"
          color="#10b981"
          isLoading={portfolioLoading}
          currency="€"
        />
        <StockChart
          title="USD/EUR Exchange Rate"
          data={currencyData?.data}
          color="#8b5cf6"
          isLoading={currencyLoading}
        />
        <StockChart
          title="Oracle (ORCL)"
          data={orclData?.data}
          color="#dc2626"
          isLoading={orclLoading}
          currency="$"
        />
        <StockChart
          title="XRP Holdings (EUR)"
          data={xrpData?.data}
          color="#06b6d4"
          isLoading={xrpLoading}
          currency="€"
          subtitle={`${xrpQuantity} XRP`}
          referenceLine={{ value: 0.25, label: '€0.25', color: '#00ff00' }}
        />
        <StockChart
          title="Gold Price (EUR/oz)"
          data={goldData?.data}
          color="#eab308"
          isLoading={goldLoading}
          currency="€"
          referenceLine={{ value: 3321, label: '€3,321', color: '#ff0000' }}
        />
      </div>
    </div>
  );
}

export default Dashboard;
