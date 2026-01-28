import { ArrowTrendingUpIcon, ArrowTrendingDownIcon } from '@heroicons/react/24/outline';

function PriceCard({ title, subtitle, price, change, changePercent, currency = '$', isLoading = false }) {
  const isPositive = change >= 0;

  if (isLoading) {
    return (
      <div className="card p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2 mb-2"></div>
          <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3"></div>
        </div>
      </div>
    );
  }

  const formattedPrice = typeof price === 'number'
    ? price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : (price || '—');

  return (
    <div className="card p-4 hover:shadow-md transition-shadow">
      <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
        {title}
      </h3>
      <p className="text-2xl font-bold text-slate-900 dark:text-white">
        {currency}{formattedPrice}
      </p>
      {subtitle && (
        <p className="text-sm text-slate-400 dark:text-slate-500">{subtitle}</p>
      )}
      {change !== undefined && changePercent !== undefined && (
        <div className={`flex items-center gap-1 text-sm mt-1 ${
          isPositive ? 'text-green-500' : 'text-red-500'
        }`}>
          {isPositive ? (
            <ArrowTrendingUpIcon className="w-4 h-4" />
          ) : (
            <ArrowTrendingDownIcon className="w-4 h-4" />
          )}
          <span>
            {isPositive ? '+' : ''}{typeof changePercent === 'number' ? changePercent.toFixed(2) : changePercent}%
          </span>
        </div>
      )}
    </div>
  );
}

export default PriceCard;
