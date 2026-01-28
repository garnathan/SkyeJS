import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { BellAlertIcon, BriefcaseIcon, UserIcon } from '@heroicons/react/24/outline';
import TodoList from '../components/features/todo/TodoList';
import { todosApi } from '../services/api';
import { SkeletonCard } from '../components/ui/Skeleton';

// Helper to check if a date is today or overdue
const isReminderDue = (dateStr) => {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(23, 59, 59, 999); // End of today
  date.setHours(0, 0, 0, 0);
  return date <= today;
};

const LISTS = [
  { id: 'work', name: 'Work', icon: BriefcaseIcon },
  { id: 'personal', name: 'Personal', icon: UserIcon },
];

function Todo() {
  const queryClient = useQueryClient();
  const [activeList, setActiveList] = useState('work');

  // Fetch all todos (both lists)
  const { data: allTodos = { work: [], personal: [] }, isLoading, error } = useQuery({
    queryKey: ['todos'],
    queryFn: async () => {
      const response = await todosApi.getAll();
      // Handle both old format (array) and new format (object with work/personal)
      if (Array.isArray(response.data)) {
        return { work: response.data, personal: [] };
      }
      return response.data;
    },
  });

  // Get todos for the active list
  const todos = allTodos[activeList] || [];

  // Add todo mutation
  const addMutation = useMutation({
    mutationFn: (todo) => todosApi.create({ ...todo, list: activeList }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      toast.success('Item added');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to add item');
    },
  });

  // Toggle todo mutation
  const toggleMutation = useMutation({
    mutationFn: (id) => {
      const todo = todos.find((t) => t.id === id);
      return todosApi.update(id, { completed: !todo?.completed });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to update item');
    },
  });

  // Update todo mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, updates }) => todosApi.update(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      toast.success('Item updated');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to update item');
    },
  });

  // Delete todo mutation
  const deleteMutation = useMutation({
    mutationFn: (id) => todosApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      toast.success('Item deleted');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to delete item');
    },
  });

  // Reorder mutation
  const reorderMutation = useMutation({
    mutationFn: (orderedIds) => todosApi.reorder(orderedIds, activeList),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to reorder items');
    },
  });

  // Move todo to different list
  const moveMutation = useMutation({
    mutationFn: ({ id, targetList }) => todosApi.update(id, { list: targetList }),
    onSuccess: (_, { targetList }) => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      toast.success(`Moved to ${targetList}`);
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to move item');
    },
  });

  const handleAdd = (todo) => {
    addMutation.mutate(todo);
  };

  const handleToggle = (id) => {
    toggleMutation.mutate(id);
  };

  const handleUpdate = (id, updates) => {
    updateMutation.mutate({ id, updates });
  };

  const handleDelete = (id) => {
    deleteMutation.mutate(id);
  };

  const handleReorder = (orderedIds) => {
    reorderMutation.mutate(orderedIds);
  };

  const handleMove = (id, targetList) => {
    moveMutation.mutate({ id, targetList });
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto animate-fade-in">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
          To-Do List
        </h1>
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto animate-fade-in">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
          To-Do List
        </h1>
        <div className="card p-6 text-center">
          <p className="text-red-500">Failed to load to-dos</p>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            {error.message}
          </p>
        </div>
      </div>
    );
  }

  // Count items with due reminders across all lists
  const allTodosList = [...(allTodos.work || []), ...(allTodos.personal || [])];
  const dueItems = allTodosList.filter((t) => !t.completed && isReminderDue(t.reminder));

  // Get pending counts for each list
  const getCounts = (list) => {
    const items = allTodos[list] || [];
    return {
      pending: items.filter((t) => !t.completed).length,
      total: items.length,
    };
  };

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          To-Do List
        </h1>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {todos.filter((t) => !t.completed).length} pending
        </span>
      </div>

      {/* Due reminders banner */}
      {dueItems.length > 0 && (
        <div className="card p-4 mb-4 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-3">
            <BellAlertIcon className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                {dueItems.length === 1
                  ? '1 item needs attention'
                  : `${dueItems.length} items need attention`}
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {dueItems.map((t) => t.text).join(', ')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* List tabs */}
      <div className="flex gap-2 mb-4">
        {LISTS.map((list) => {
          const counts = getCounts(list.id);
          const isActive = activeList === list.id;
          const Icon = list.icon;

          return (
            <button
              key={list.id}
              onClick={() => setActiveList(list.id)}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all
                ${isActive
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }
              `}
            >
              <Icon className="w-4 h-4" />
              {list.name}
              {counts.pending > 0 && (
                <span
                  className={`
                    px-1.5 py-0.5 text-xs rounded-full
                    ${isActive
                      ? 'bg-blue-500 text-blue-100'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }
                  `}
                >
                  {counts.pending}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <TodoList
        todos={todos}
        onAdd={handleAdd}
        onToggle={handleToggle}
        onDelete={handleDelete}
        onUpdate={handleUpdate}
        onReorder={handleReorder}
        onMove={handleMove}
        currentList={activeList}
        lists={LISTS}
      />
    </div>
  );
}

export default Todo;
