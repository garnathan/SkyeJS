import { CheckCircleIcon, ExclamationCircleIcon, XCircleIcon } from '@heroicons/react/24/solid';

const recommendationConfig = {
  EXCELLENT: {
    color: 'bg-green-500',
    textColor: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    icon: CheckCircleIcon,
  },
  GOOD: {
    color: 'bg-emerald-500',
    textColor: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
    icon: CheckCircleIcon,
  },
  FAIR: {
    color: 'bg-yellow-500',
    textColor: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    icon: ExclamationCircleIcon,
  },
  POOR: {
    color: 'bg-orange-500',
    textColor: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    icon: ExclamationCircleIcon,
  },
  'VERY POOR': {
    color: 'bg-red-500',
    textColor: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    icon: XCircleIcon,
  },
  UNKNOWN: {
    color: 'bg-slate-500',
    textColor: 'text-slate-600 dark:text-slate-400',
    bgColor: 'bg-slate-50 dark:bg-slate-900/20',
    icon: ExclamationCircleIcon,
  },
};

function SellRecommendation({ data, isLoading }) {
  if (isLoading) {
    return (
      <div className="card p-6">
        <div className="animate-pulse">
          <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mb-4"></div>
          <div className="h-12 bg-slate-200 dark:bg-slate-700 rounded w-1/2 mb-4"></div>
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full mb-2"></div>
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  const config = recommendationConfig[data?.recommendation] || recommendationConfig.UNKNOWN;
  const Icon = config.icon;

  return (
    <div className="card p-6">
      <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-4">
        AMZN Sell Recommendation
      </h3>

      <div className={`rounded-lg p-4 ${config.bgColor} mb-4`}>
        <div className="flex items-center gap-3 mb-2">
          <Icon className={`w-8 h-8 ${config.textColor}`} />
          <div>
            <span className={`text-2xl font-bold ${config.textColor}`}>
              {data?.recommendation || 'UNKNOWN'}
            </span>
            <div className="flex items-center gap-2 mt-1">
              <div className={`h-2 w-24 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden`}>
                <div
                  className={`h-full ${config.color} transition-all duration-500`}
                  style={{ width: `${data?.score || 0}%` }}
                />
              </div>
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                {data?.score || 0}%
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 text-sm">
        <div className="flex justify-between items-center">
          <span className="text-slate-500 dark:text-slate-400">Stock Score</span>
          <div className="flex items-center gap-2">
            <div className="h-2 w-16 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-500"
                style={{ width: `${data?.stockScore || 0}%` }}
              />
            </div>
            <span className="font-medium text-slate-900 dark:text-white w-8 text-right">
              {data?.stockScore || 0}%
            </span>
          </div>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-slate-500 dark:text-slate-400">Currency Score</span>
          <div className="flex items-center gap-2">
            <div className="h-2 w-16 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div
                className="h-full bg-purple-500 transition-all duration-500"
                style={{ width: `${data?.currencyScore || 0}%` }}
              />
            </div>
            <span className="font-medium text-slate-900 dark:text-white w-8 text-right">
              {data?.currencyScore || 0}%
            </span>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
          <p className="text-slate-600 dark:text-slate-400 mb-2">
            <span className="font-medium">Stock:</span> {data?.stockTrend || 'Unknown'}
          </p>
          <p className="text-slate-600 dark:text-slate-400 mb-2">
            <span className="font-medium">Currency:</span> {data?.currencyTrend || 'Unknown'}
          </p>
          <p className="text-slate-500 dark:text-slate-400 italic text-xs mt-2">
            {data?.reasoning || ''}
          </p>
        </div>
      </div>
    </div>
  );
}

export default SellRecommendation;
