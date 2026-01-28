import { ArrowTrendingUpIcon, ArrowTrendingDownIcon } from '@heroicons/react/24/outline';

function PortfolioSummary({ portfolio, isLoading = false, title = 'Portfolio Value' }) {
  if (isLoading) {
    return (
      <div className="card p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mb-2"></div>
          <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/2 mb-2"></div>
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  const currentValue = portfolio?.currentValue || 0;
  const change = portfolio?.change || 0;
  const changePercent = portfolio?.changePercent || 0;
  const shares = portfolio?.shares || 0;
  const isPositive = change >= 0;

  return (
    <div className="card p-4">
      <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
        {title}
      </h3>
      <p className="text-2xl font-bold text-slate-900 dark:text-white">
        €{currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
      {shares > 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {shares} AMZN shares
        </p>
      )}
      {change !== 0 && (
        <div className={`flex items-center gap-1 text-sm mt-1 ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
          {isPositive ? (
            <ArrowTrendingUpIcon className="w-4 h-4" />
          ) : (
            <ArrowTrendingDownIcon className="w-4 h-4" />
          )}
          <span>
            {isPositive ? '+' : ''}€{change.toLocaleString()} ({isPositive ? '+' : ''}{changePercent}%)
          </span>
        </div>
      )}
    </div>
  );
}

export default PortfolioSummary;
