import { Router } from 'express';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import Anthropic from '@anthropic-ai/sdk';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { asyncHandler, ConfigError } from '../middleware/errorHandler.js';
import { strictLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Apply rate limiting to Claude API calls (expensive)
router.use('/chat', strictLimiter);

let anthropicClient = null;

// Context directory path - configurable via env var, defaults to ./contexts relative to project root
const CONTEXT_DIR = process.env.CLAUDE_CONTEXT_DIR || join(process.cwd(), 'contexts');

// Cache for context files
let contextCache = null;
let contextCacheTime = 0;
const CACHE_TTL = 60000; // 1 minute

// Load context files from disk
const loadContextFiles = async () => {
  const now = Date.now();
  if (contextCache && (now - contextCacheTime) < CACHE_TTL) {
    return contextCache;
  }

  try {
    const files = await readdir(CONTEXT_DIR);
    const mdFiles = files.filter(f => f.endsWith('.md'));

    const contexts = await Promise.all(
      mdFiles.map(async (filename) => {
        const filepath = join(CONTEXT_DIR, filename);
        const content = await readFile(filepath, 'utf-8');
        const name = filename.replace('.md', '');
        const displayName = name
          .split('-')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
        return { name, displayName, filename, content };
      })
    );

    contextCache = contexts;
    contextCacheTime = now;
    return contexts;
  } catch (error) {
    logger.error('Failed to load context files:', error);
    return [];
  }
};

const getClient = () => {
  if (!config.anthropicApiKey) {
    throw new ConfigError('Anthropic API key not configured');
  }
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: config.anthropicApiKey,
      timeout: 120000, // 2 minute timeout for AI responses
    });
  }
  return anthropicClient;
};

// List available models
router.get('/models', (req, res) => {
  const models = [
    { name: 'claude-sonnet-4-20250514', displayName: 'Claude Sonnet 4' },
    { name: 'claude-opus-4-20250514', displayName: 'Claude Opus 4' },
    { name: 'claude-3-5-haiku-20241022', displayName: 'Claude 3.5 Haiku' },
    { name: 'claude-3-5-sonnet-20241022', displayName: 'Claude 3.5 Sonnet' },
    { name: 'claude-3-opus-20240229', displayName: 'Claude 3 Opus' }
  ];
  res.json({ models });
});

// List available context files
router.get('/contexts', asyncHandler(async (req, res) => {
  const contexts = await loadContextFiles();
  // Return without content to keep response small
  const contextList = contexts.map(({ name, displayName, filename }) => ({
    name,
    displayName,
    filename
  }));
  res.json({ contexts: contextList });
}));

// Chat endpoint
router.post('/chat', asyncHandler(async (req, res) => {
  const { message, model: rawModel = 'claude-sonnet-4-20250514', history = [], contexts: contextNames = [] } = req.body;

  // Log raw model for debugging
  logger.info(`Claude chat raw model type: ${typeof rawModel}, value: ${JSON.stringify(rawModel)}`);

  // Ensure model is a string (handle if object was passed)
  let model;
  if (typeof rawModel === 'object' && rawModel !== null) {
    model = rawModel.name || rawModel.id || 'claude-sonnet-4-20250514';
    logger.info(`Converted object model to string: ${model}`);
  } else if (typeof rawModel === 'string') {
    model = rawModel;
  } else {
    model = 'claude-sonnet-4-20250514';
    logger.info(`Using default model due to invalid type`);
  }

  if (!message?.trim()) {
    return res.status(400).json({ error: 'No message provided' });
  }

  // Build system prompt from selected contexts
  let systemPrompt = '';
  if (contextNames.length > 0) {
    const allContexts = await loadContextFiles();
    const selectedContexts = allContexts.filter(c => contextNames.includes(c.name));

    if (selectedContexts.length > 0) {
      systemPrompt = selectedContexts
        .map(c => `# Context: ${c.displayName}\n\n${c.content}`)
        .join('\n\n---\n\n');
      logger.info(`Using ${selectedContexts.length} context files: ${selectedContexts.map(c => c.name).join(', ')}`);
    }
  }

  logger.info(`Claude chat request: model=${model}, messageLength=${message.length}, contexts=${contextNames.length}`);

  const client = getClient();

  // Build messages array, filtering out any with empty content
  const messages = [
    ...history
      .filter(msg => msg.content && msg.content.trim())
      .map(msg => ({
        role: msg.role,
        content: msg.content
      })),
    { role: 'user', content: message }
  ];

  const requestParams = {
    model,
    max_tokens: 4096,
    messages
  };

  // Add system prompt if we have contexts
  if (systemPrompt) {
    requestParams.system = systemPrompt;
  }

  const response = await client.messages.create(requestParams);

  if (response.content?.[0]?.text) {
    const responseText = response.content[0].text;
    logger.info(`Claude response generated: length=${responseText.length}`);
    return res.json({ response: responseText });
  }

  return res.status(500).json({ error: 'No response generated' });
}));

export default router;
