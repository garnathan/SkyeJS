import { useState } from 'react';
import {
  CheckCircleIcon,
  TrashIcon,
  PencilIcon,
  StarIcon,
  Bars3Icon,
  BellIcon,
  XMarkIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';
import {
  CheckCircleIcon as CheckCircleSolidIcon,
  StarIcon as StarSolidIcon,
  BellIcon as BellSolidIcon,
} from '@heroicons/react/24/solid';

// Helper to format reminder date
const formatReminderDate = (dateStr) => {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Reset times for comparison
  today.setHours(0, 0, 0, 0);
  tomorrow.setHours(0, 0, 0, 0);
  const reminderDate = new Date(date);
  reminderDate.setHours(0, 0, 0, 0);

  if (reminderDate.getTime() === today.getTime()) {
    return 'Today';
  }
  if (reminderDate.getTime() === tomorrow.getTime()) {
    return 'Tomorrow';
  }
  if (reminderDate < today) {
    return 'Overdue';
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// Check if reminder is overdue
const isOverdue = (dateStr) => {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return date < today;
};

// Check if reminder is today
const isToday = (dateStr) => {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return date.getTime() === today.getTime();
};

function TodoItem({ todo, onToggle, onDelete, onUpdate, onMove, currentList, lists, dragHandleProps }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(todo.text);
  const [editNotes, setEditNotes] = useState(todo.notes || '');
  const [editReminder, setEditReminder] = useState(todo.reminder || '');

  const handleSave = () => {
    if (editText.trim()) {
      onUpdate(todo.id, {
        text: editText.trim(),
        notes: editNotes.trim(),
        reminder: editReminder || null,
      });
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setEditText(todo.text);
    setEditNotes(todo.notes || '');
    setEditReminder(todo.reminder || '');
    setIsEditing(false);
  };

  const handleTogglePriority = () => {
    onUpdate(todo.id, { priority: !todo.priority });
  };

  const handleClearReminder = (e) => {
    e.stopPropagation();
    onUpdate(todo.id, { reminder: null });
  };

  const reminderText = formatReminderDate(todo.reminder);
  const reminderOverdue = isOverdue(todo.reminder);
  const reminderIsToday = isToday(todo.reminder);

  if (isEditing) {
    return (
      <div className="card p-4 animate-fade-in">
        <input
          type="text"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          className="input mb-2"
          placeholder="Item text..."
          autoFocus
        />
        <textarea
          value={editNotes}
          onChange={(e) => setEditNotes(e.target.value)}
          className="input min-h-[80px] resize-none mb-2"
          placeholder="Notes (optional)..."
        />
        <div className="flex items-center gap-2 mb-3">
          <BellIcon className="w-4 h-4 text-slate-400" />
          <input
            type="date"
            value={editReminder}
            onChange={(e) => setEditReminder(e.target.value)}
            className="input flex-1"
            min={new Date().toISOString().split('T')[0]}
          />
          {editReminder && (
            <button
              onClick={() => setEditReminder('')}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
              title="Clear reminder"
            >
              <XMarkIcon className="w-4 h-4 text-slate-500" />
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={handleSave} className="btn-primary text-sm">
            Save
          </button>
          <button onClick={handleCancel} className="btn-secondary text-sm">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`card p-4 transition-all duration-200 hover:shadow-md group ${
        todo.completed ? 'opacity-60' : ''
      } ${todo.priority && !todo.completed ? 'border-l-4 border-l-amber-500' : ''} ${
        reminderOverdue && !todo.completed ? 'border-l-4 border-l-red-500' : ''
      } ${reminderIsToday && !todo.completed && !todo.priority ? 'border-l-4 border-l-blue-500' : ''}`}
    >
      <div className="flex items-start gap-3">
        {/* Drag Handle */}
        <div
          {...dragHandleProps}
          className="flex-shrink-0 mt-1 cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
        >
          <Bars3Icon className="w-5 h-5" />
        </div>

        <button
          onClick={() => onToggle(todo.id)}
          className="flex-shrink-0 mt-0.5 transition-transform hover:scale-110"
        >
          {todo.completed ? (
            <CheckCircleSolidIcon className="w-6 h-6 text-green-500" />
          ) : (
            <CheckCircleIcon className="w-6 h-6 text-slate-400 hover:text-green-500" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p
              className={`text-slate-900 dark:text-white ${
                todo.completed ? 'line-through text-slate-500 dark:text-slate-500' : ''
              }`}
            >
              {todo.text}
            </p>
            {todo.priority && !todo.completed && (
              <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded">
                Priority
              </span>
            )}
            {reminderText && !todo.completed && (
              <span
                className={`text-xs px-1.5 py-0.5 rounded flex items-center gap-1 ${
                  reminderOverdue
                    ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                    : reminderIsToday
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                <BellSolidIcon className="w-3 h-3" />
                {reminderText}
                <button
                  onClick={handleClearReminder}
                  className="ml-0.5 hover:text-red-500"
                  title="Clear reminder"
                >
                  <XMarkIcon className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
          {todo.notes && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {todo.notes}
            </p>
          )}
        </div>

        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleTogglePriority}
            className="p-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
            title={todo.priority ? 'Remove priority' : 'Mark as priority'}
          >
            {todo.priority ? (
              <StarSolidIcon className="w-4 h-4 text-amber-500" />
            ) : (
              <StarIcon className="w-4 h-4 text-slate-400 hover:text-amber-500" />
            )}
          </button>
          {onMove && lists && lists.length > 1 && (
            <button
              onClick={() => {
                const targetList = lists.find(l => l.id !== currentList);
                if (targetList) onMove(todo.id, targetList.id);
              }}
              className="p-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
              title={`Move to ${lists.find(l => l.id !== currentList)?.name || 'other list'}`}
            >
              <ArrowRightIcon className="w-4 h-4 text-blue-500" />
            </button>
          )}
          <button
            onClick={() => setIsEditing(true)}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <PencilIcon className="w-4 h-4 text-slate-500" />
          </button>
          <button
            onClick={() => onDelete(todo.id)}
            className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
          >
            <TrashIcon className="w-4 h-4 text-red-500" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default TodoItem;
