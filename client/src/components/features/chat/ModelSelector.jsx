import { ChevronDownIcon } from '@heroicons/react/24/outline';

function ModelSelector({ models = [], selectedModel, onSelect, isLoading = false }) {
  // Ensure selectedModel is always a string for the select value
  const selectedValue = typeof selectedModel === 'object'
    ? (selectedModel?.name || selectedModel?.id || '')
    : selectedModel;

  if (isLoading) {
    return (
      <div className="animate-pulse h-10 bg-slate-200 dark:bg-slate-700 rounded-lg w-48" />
    );
  }

  return (
    <div className="relative">
      <select
        value={selectedValue}
        onChange={(e) => onSelect(e.target.value)}
        className="appearance-none bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 pr-8 text-sm font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-500"
      >
        {models.map((model) => {
          const modelId = model.id || model.name || model;
          const modelName = model.displayName || model.name || model.id || model;
          return (
            <option key={modelId} value={modelId}>
              {modelName}
            </option>
          );
        })}
      </select>
      <ChevronDownIcon className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
    </div>
  );
}

export default ModelSelector;
