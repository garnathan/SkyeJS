import { useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { PlusIcon, StarIcon, BellIcon, XMarkIcon } from '@heroicons/react/24/outline';
import TodoItem from './TodoItem';

function TodoList({ todos, onAdd, onToggle, onDelete, onUpdate, onReorder, onMove, currentList, lists }) {
  const [newTodoText, setNewTodoText] = useState('');
  const [newTodoNotes, setNewTodoNotes] = useState('');
  const [newTodoPriority, setNewTodoPriority] = useState(false);
  const [newTodoReminder, setNewTodoReminder] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = () => {
    if (newTodoText.trim()) {
      onAdd({
        text: newTodoText.trim(),
        notes: newTodoNotes.trim(),
        priority: newTodoPriority,
        reminder: newTodoReminder || null,
      });
      setNewTodoText('');
      setNewTodoNotes('');
      setNewTodoPriority(false);
      setNewTodoReminder('');
      setIsAdding(false);
    }
  };

  // Sort todos: priority items first (within pending), then by order
  const sortTodos = (todoList) => {
    return [...todoList].sort((a, b) => {
      // Priority items come first (only if not completed)
      if (!a.completed && !b.completed) {
        if (a.priority && !b.priority) return -1;
        if (!a.priority && b.priority) return 1;
      }
      // Then sort by order
      return (a.order || 0) - (b.order || 0);
    });
  };

  const pendingTodos = sortTodos(todos.filter((t) => !t.completed));
  const completedTodos = sortTodos(todos.filter((t) => t.completed));

  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const { source, destination, type } = result;

    // Don't do anything if dropped in same position
    if (source.droppableId === destination.droppableId && source.index === destination.index) {
      return;
    }

    // Determine which list we're working with
    let items;
    if (type === 'pending') {
      items = [...pendingTodos];
    } else {
      items = [...completedTodos];
    }

    // Reorder within the same list
    const [reorderedItem] = items.splice(source.index, 1);
    items.splice(destination.index, 0, reorderedItem);

    // Create the new order for all todos
    const otherList = type === 'pending' ? completedTodos : pendingTodos;
    const allTodos = type === 'pending' ? [...items, ...otherList] : [...otherList, ...items];

    // Call onReorder with the new order
    if (onReorder) {
      onReorder(allTodos.map(t => t.id));
    }
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="space-y-4">
        {/* Add Item Form */}
        {isAdding ? (
          <div className="card p-4 border-2 border-accent-500 animate-fade-in">
            <input
              type="text"
              value={newTodoText}
              onChange={(e) => setNewTodoText(e.target.value)}
              className="input mb-2"
              placeholder="What needs to be done?"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAdd()}
            />
            <textarea
              value={newTodoNotes}
              onChange={(e) => setNewTodoNotes(e.target.value)}
              className="input min-h-[60px] resize-none"
              placeholder="Add notes (optional)..."
            />
            <div className="flex items-center gap-2 mt-2">
              <BellIcon className="w-4 h-4 text-slate-400" />
              <input
                type="date"
                value={newTodoReminder}
                onChange={(e) => setNewTodoReminder(e.target.value)}
                className="input flex-1"
                min={new Date().toISOString().split('T')[0]}
                placeholder="Set reminder..."
              />
              {newTodoReminder && (
                <button
                  onClick={() => setNewTodoReminder('')}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                  title="Clear reminder"
                >
                  <XMarkIcon className="w-4 h-4 text-slate-500" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-4 mt-3">
              <button onClick={handleAdd} className="btn-primary text-sm">
                Add Item
              </button>
              <button
                onClick={() => {
                  setIsAdding(false);
                  setNewTodoText('');
                  setNewTodoNotes('');
                  setNewTodoPriority(false);
                  setNewTodoReminder('');
                }}
                className="btn-secondary text-sm"
              >
                Cancel
              </button>
              <label className="flex items-center gap-2 ml-auto cursor-pointer">
                <input
                  type="checkbox"
                  checked={newTodoPriority}
                  onChange={(e) => setNewTodoPriority(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-600 text-amber-500 focus:ring-amber-500"
                />
                <StarIcon className="w-4 h-4 text-amber-500" />
                <span className="text-sm text-slate-600 dark:text-slate-400">Priority</span>
              </label>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="w-full card p-4 flex items-center justify-center gap-2 text-slate-500 hover:text-accent-500 hover:border-accent-500 transition-colors"
          >
            <PlusIcon className="w-5 h-5" />
            Add new item
          </button>
        )}

        {/* Pending Items */}
        {pendingTodos.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 px-1">
              Pending ({pendingTodos.length})
            </h3>
            <Droppable droppableId="pending" type="pending">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`space-y-2 min-h-[40px] rounded-lg transition-colors ${
                    snapshot.isDraggingOver ? 'bg-slate-100 dark:bg-slate-800/50' : ''
                  }`}
                >
                  {pendingTodos.map((todo, index) => (
                    <Draggable key={todo.id} draggableId={todo.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          style={provided.draggableProps.style}
                          className={snapshot.isDragging ? 'opacity-90 shadow-lg' : ''}
                        >
                          <TodoItem
                            todo={todo}
                            onToggle={onToggle}
                            onDelete={onDelete}
                            onUpdate={onUpdate}
                            onMove={onMove}
                            currentList={currentList}
                            lists={lists}
                            dragHandleProps={provided.dragHandleProps}
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        )}

        {/* Completed Items */}
        {completedTodos.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 px-1">
              Completed ({completedTodos.length})
            </h3>
            <Droppable droppableId="completed" type="completed">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`space-y-2 min-h-[40px] rounded-lg transition-colors ${
                    snapshot.isDraggingOver ? 'bg-slate-100 dark:bg-slate-800/50' : ''
                  }`}
                >
                  {completedTodos.map((todo, index) => (
                    <Draggable key={todo.id} draggableId={todo.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          style={provided.draggableProps.style}
                          className={snapshot.isDragging ? 'opacity-90 shadow-lg' : ''}
                        >
                          <TodoItem
                            todo={todo}
                            onToggle={onToggle}
                            onDelete={onDelete}
                            onUpdate={onUpdate}
                            onMove={onMove}
                            currentList={currentList}
                            lists={lists}
                            dragHandleProps={provided.dragHandleProps}
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        )}

        {/* Empty State */}
        {todos.length === 0 && !isAdding && (
          <div className="text-center py-12 text-slate-500 dark:text-slate-400">
            <p>No items yet. Add your first one!</p>
          </div>
        )}
      </div>
    </DragDropContext>
  );
}

export default TodoList;
