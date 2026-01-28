import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircleIcon, XCircleIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { settingsApi, systemApi } from '../services/api';

function Settings() {
  const queryClient = useQueryClient();
  const [editingField, setEditingField] = useState(null);
  const [fieldValue, setFieldValue] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Fetch settings schema
  const { data: schema, isLoading, error } = useQuery({
    queryKey: ['settings-schema'],
    queryFn: async () => {
      const response = await settingsApi.getSchema();
      return response.data;
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ key, value }) => {
      const response = await settingsApi.update({ [key]: value });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settings-schema'] });
      toast.success(data.message);
      setEditingField(null);
      setFieldValue('');
      setShowPassword(false);
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to update setting');
    },
  });

  // Clear mutation
  const clearMutation = useMutation({
    mutationFn: async (key) => {
      const response = await settingsApi.clear(key);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settings-schema'] });
      toast.success(data.message);
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to clear setting');
    },
  });

  // Restart server
  const handleRestart = async () => {
    toast.loading('Restarting server...', { id: 'restart' });
    try {
      await systemApi.restart();
      setTimeout(() => {
        toast.success('Server restarted, reloading...', { id: 'restart' });
        setTimeout(() => window.location.reload(), 500);
      }, 1500);
    } catch (error) {
      if (error.code === 'ERR_NETWORK' || error.message.includes('Network Error')) {
        setTimeout(() => {
          toast.success('Server restarting, reloading...', { id: 'restart' });
          setTimeout(() => window.location.reload(), 500);
        }, 1500);
      } else {
        toast.error('Failed to restart server', { id: 'restart' });
      }
    }
  };

  const handleEdit = (key, field) => {
    setEditingField(key);
    // Pre-fill with existing value for visible fields
    setFieldValue(field.visible && field.value ? field.value : '');
    setShowPassword(false);
  };

  const handleSave = (key) => {
    if (!fieldValue.trim()) {
      toast.error('Please enter a value');
      return;
    }
    updateMutation.mutate({ key, value: fieldValue.trim() });
  };

  const handleCancel = () => {
    setEditingField(null);
    setFieldValue('');
    setShowPassword(false);
  };

  const handleClear = (key) => {
    if (confirm('Are you sure you want to clear this setting?')) {
      clearMutation.mutate(key);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto animate-fade-in">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Settings</h1>
        <div className="card p-6">
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-slate-200 dark:bg-slate-700 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto animate-fade-in">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Settings</h1>
        <div className="card p-6 text-center">
          <p className="text-red-500">Failed to load settings</p>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Settings</h1>
        <button
          onClick={handleRestart}
          className="px-4 py-2 text-sm bg-accent-500 hover:bg-accent-600 text-white rounded-lg transition-colors"
        >
          Restart Server
        </button>
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Configure your API keys and personal settings. For security, sensitive values are never displayed.
        Changes require a server restart to take effect.
      </p>

      {Object.entries(schema).map(([groupKey, group]) => (
        <div key={groupKey} className="card p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            {group.label}
          </h2>

          <div className="space-y-4">
            {Object.entries(group.fields).map(([fieldKey, field]) => (
              <div
                key={fieldKey}
                className="border border-slate-200 dark:border-slate-700 rounded-lg p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900 dark:text-white">
                        {field.label}
                      </span>
                      {field.isSet ? (
                        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                          <CheckCircleIcon className="w-4 h-4" />
                          Configured
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                          <XCircleIcon className="w-4 h-4" />
                          Not set
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                      {field.description}
                    </p>
                    {/* Show current value for visible fields */}
                    {field.visible && field.isSet && field.value && (
                      <p className="text-sm font-mono text-slate-700 dark:text-slate-300 mt-2 px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded">
                        {field.value}
                      </p>
                    )}
                  </div>
                </div>

                {editingField === fieldKey ? (
                  <div className="mt-3 space-y-3">
                    <div className="relative">
                      <input
                        type={field.type === 'password' && !showPassword ? 'password' : field.type === 'number' ? 'number' : 'text'}
                        value={fieldValue}
                        onChange={(e) => setFieldValue(e.target.value)}
                        placeholder={field.placeholder}
                        className="w-full px-3 py-2 pr-10 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-500"
                        autoFocus
                      />
                      {field.type === 'password' && (
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        >
                          {showPassword ? (
                            <EyeSlashIcon className="w-5 h-5" />
                          ) : (
                            <EyeIcon className="w-5 h-5" />
                          )}
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSave(fieldKey)}
                        disabled={updateMutation.isPending}
                        className="px-3 py-1.5 text-sm bg-accent-500 hover:bg-accent-600 text-white rounded-lg transition-colors disabled:opacity-50"
                      >
                        {updateMutation.isPending ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={handleCancel}
                        className="px-3 py-1.5 text-sm bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => handleEdit(fieldKey, field)}
                      className="px-3 py-1.5 text-sm bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg transition-colors"
                    >
                      {field.isSet ? 'Update' : 'Set'}
                    </button>
                    {field.isSet && (
                      <button
                        onClick={() => handleClear(fieldKey)}
                        disabled={clearMutation.isPending}
                        className="px-3 py-1.5 text-sm bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded-lg transition-colors disabled:opacity-50"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="text-xs text-slate-400 dark:text-slate-500 text-center pb-6">
        Settings are stored in the .env file on the server.
      </div>
    </div>
  );
}

export default Settings;
