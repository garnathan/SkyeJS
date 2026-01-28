import { Router } from 'express';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import logger from '../utils/logger.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import crypto from 'crypto';

const router = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const todosPath = join(__dirname, '..', '..', 'data', 'todos.json');

// Valid list types
const VALID_LISTS = ['work', 'personal'];
const DEFAULT_LIST = 'work';

// Input length limits (security)
const MAX_TEXT_LENGTH = 500;
const MAX_NOTES_LENGTH = 2000;

// Ensure data file exists with new format
const ensureDataFile = async () => {
  try {
    await fs.access(todosPath);
  } catch {
    await fs.writeFile(todosPath, JSON.stringify({ work: [], personal: [] }, null, 2));
  }
};

// Migrate old format to new format if needed
const migrateIfNeeded = (data) => {
  // Old format was an array of todos
  if (Array.isArray(data)) {
    logger.info('Migrating todos to new format with work/personal lists');
    return {
      work: data.map(t => ({ ...t, list: 'work' })),
      personal: [],
    };
  }

  // Old format with { todos: [], notes: '' }
  if (data.todos && Array.isArray(data.todos)) {
    logger.info('Migrating todos from legacy format');
    return {
      work: data.todos.map(t => ({ ...t, list: 'work' })),
      personal: [],
    };
  }

  // Already in new format
  return data;
};

// Read todos from file
const readTodos = async () => {
  await ensureDataFile();
  const data = await fs.readFile(todosPath, 'utf-8');
  const parsed = JSON.parse(data);
  return migrateIfNeeded(parsed);
};

// Write todos to file
const writeTodos = async (data) => {
  await fs.writeFile(todosPath, JSON.stringify(data, null, 2));
};

// Get all todos (optionally filtered by list)
router.get('/', asyncHandler(async (req, res) => {
  const { list } = req.query;
  const data = await readTodos();

  // If list specified, return only that list
  if (list && VALID_LISTS.includes(list)) {
    return res.json(data[list] || []);
  }

  // Return all lists
  res.json(data);
}));

// Create a new todo
router.post('/', asyncHandler(async (req, res) => {
  const { text, notes = '', priority = false, list = DEFAULT_LIST } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Todo text is required' });
  }

  // Input length validation (security)
  if (text.length > MAX_TEXT_LENGTH) {
    return res.status(400).json({ error: `Todo text must be ${MAX_TEXT_LENGTH} characters or less` });
  }

  if (notes && notes.length > MAX_NOTES_LENGTH) {
    return res.status(400).json({ error: `Notes must be ${MAX_NOTES_LENGTH} characters or less` });
  }

  if (!VALID_LISTS.includes(list)) {
    return res.status(400).json({ error: `Invalid list. Must be one of: ${VALID_LISTS.join(', ')}` });
  }

  const data = await readTodos();
  const todos = data[list] || [];

  // Find the highest order value
  const maxOrder = todos.reduce((max, t) => Math.max(max, t.order || 0), 0);

  const newTodo = {
    id: crypto.randomUUID(),
    text: text.trim(),
    notes: notes.trim(),
    completed: false,
    priority: Boolean(priority),
    order: maxOrder + 1,
    list,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  todos.unshift(newTodo); // Add to beginning
  data[list] = todos;
  await writeTodos(data);

  logger.info(`Created todo in ${list}: ${newTodo.id}`);
  res.status(201).json(newTodo);
}));

// Update a todo
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  // Input length validation (security)
  if (updates.text && updates.text.length > MAX_TEXT_LENGTH) {
    return res.status(400).json({ error: `Todo text must be ${MAX_TEXT_LENGTH} characters or less` });
  }

  if (updates.notes && updates.notes.length > MAX_NOTES_LENGTH) {
    return res.status(400).json({ error: `Notes must be ${MAX_NOTES_LENGTH} characters or less` });
  }

  const data = await readTodos();

  // Find the todo in any list
  let foundList = null;
  let foundIndex = -1;

  for (const listName of VALID_LISTS) {
    const index = (data[listName] || []).findIndex((t) => t.id === id);
    if (index !== -1) {
      foundList = listName;
      foundIndex = index;
      break;
    }
  }

  if (foundIndex === -1) {
    return res.status(404).json({ error: 'Todo not found' });
  }

  const todo = data[foundList][foundIndex];

  // Check if moving to a different list
  const newList = updates.list;
  if (newList && newList !== foundList && VALID_LISTS.includes(newList)) {
    // Remove from old list
    data[foundList].splice(foundIndex, 1);

    // Add to new list
    const updatedTodo = {
      ...todo,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    data[newList] = data[newList] || [];
    data[newList].unshift(updatedTodo);

    await writeTodos(data);
    logger.info(`Moved todo ${id} from ${foundList} to ${newList}`);
    return res.json(updatedTodo);
  }

  // Update in place
  data[foundList][foundIndex] = {
    ...todo,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await writeTodos(data);

  logger.info(`Updated todo: ${id}`);
  res.json(data[foundList][foundIndex]);
}));

// Delete a todo
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const data = await readTodos();

  // Find the todo in any list
  let foundList = null;
  let foundIndex = -1;

  for (const listName of VALID_LISTS) {
    const index = (data[listName] || []).findIndex((t) => t.id === id);
    if (index !== -1) {
      foundList = listName;
      foundIndex = index;
      break;
    }
  }

  if (foundIndex === -1) {
    return res.status(404).json({ error: 'Todo not found' });
  }

  data[foundList].splice(foundIndex, 1);
  await writeTodos(data);

  logger.info(`Deleted todo: ${id}`);
  res.json({ success: true });
}));

// Reorder todos within a list
router.post('/reorder', asyncHandler(async (req, res) => {
  const { orderedIds, list = DEFAULT_LIST } = req.body;

  if (!Array.isArray(orderedIds)) {
    return res.status(400).json({ error: 'orderedIds must be an array' });
  }

  if (!VALID_LISTS.includes(list)) {
    return res.status(400).json({ error: `Invalid list. Must be one of: ${VALID_LISTS.join(', ')}` });
  }

  const data = await readTodos();
  const todos = data[list] || [];

  // Create a map for quick lookup
  const todoMap = new Map(todos.map(t => [t.id, t]));

  // Update order based on position in orderedIds
  orderedIds.forEach((id, index) => {
    if (todoMap.has(id)) {
      todoMap.get(id).order = index;
      todoMap.get(id).updatedAt = new Date().toISOString();
    }
  });

  // Sort by the new order
  data[list] = Array.from(todoMap.values()).sort((a, b) => (a.order || 0) - (b.order || 0));

  await writeTodos(data);

  logger.info(`Reordered ${orderedIds.length} todos in ${list}`);
  res.json(data[list]);
}));

export default router;
