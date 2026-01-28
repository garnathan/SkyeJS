import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { TrashIcon, MagnifyingGlassIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { logsApi } from '../services/api';
import dayjs from 'dayjs';

const levelColors = {
  error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  warn: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  debug: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-400',
};

function Logs() {
  const [filter, setFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const queryClient = useQueryClient();

  // Fetch logs
  const { data: logsData, isLoading, refetch } = useQuery({
    queryKey: ['logs', levelFilter],
    queryFn: async () => {
      const params = levelFilter !== 'all' ? { level: levelFilter } : {};
      const response = await logsApi.getAll(params);
      return response.data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Handle both array format and { logs, stats } format from server
  const logs = Array.isArray(logsData) ? logsData : (logsData?.logs || []);

  // Clear logs mutation
  const clearMutation = useMutation({
    mutationFn: () => logsApi.clear(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['logs'] });
      toast.success('Logs cleared');
    },
    onError: () => {
      toast.error('Failed to clear logs');
    },
  });

  // Filter logs by search term
  const filteredLogs = logs.filter((log) => {
    if (!filter) return true;
    const searchTerm = filter.toLowerCase();
    return (
      log.message?.toLowerCase().includes(searchTerm) ||
      log.level?.toLowerCase().includes(searchTerm)
    );
  });

  return (
    <div className="max-w-6xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Logs
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="btn-ghost p-2"
            title="Refresh logs"
          >
            <ArrowPathIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => clearMutation.mutate()}
            className="btn-ghost p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
            title="Clear all logs"
            disabled={clearMutation.isPending}
          >
            <TrashIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search logs..."
              className="input pl-10"
            />
          </div>

          {/* Level Filter */}
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="input w-auto"
          >
            <option value="all">All Levels</option>
            <option value="error">Error</option>
            <option value="warn">Warning</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
          </select>
        </div>
      </div>

      {/* Logs List */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full mx-auto"></div>
            <p className="text-slate-500 dark:text-slate-400 mt-2">Loading logs...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400">
            {filter || levelFilter !== 'all' ? 'No logs match your filters' : 'No logs yet'}
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-700 max-h-[600px] overflow-y-auto">
            {filteredLogs.map((log, index) => (
              <div
                key={log.id || index}
                className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`px-2 py-0.5 text-xs font-medium rounded ${
                      levelColors[log.level] || levelColors.info
                    }`}
                  >
                    {log.level?.toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-900 dark:text-white break-words">
                      {log.message}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                      {dayjs(log.timestamp).format('MMM D, HH:mm:ss')}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stats */}
      {logs.length > 0 && (
        <div className="mt-4 text-sm text-slate-500 dark:text-slate-400 text-center">
          Showing {filteredLogs.length} of {logs.length} logs
        </div>
      )}
    </div>
  );
}

export default Logs;
