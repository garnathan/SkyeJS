import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { TrashIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { claudeApi } from '../services/api';
import ChatMessage from '../components/features/chat/ChatMessage';
import ChatInput from '../components/features/chat/ChatInput';
import ModelSelector from '../components/features/chat/ModelSelector';
import { useLocalStorage } from '../hooks';

// Fix corrupted localStorage before component mounts
const fixStoredModel = () => {
  try {
    const stored = localStorage.getItem('claude-model');
    if (stored) {
      const parsed = JSON.parse(stored);
      // Fix if it's an object or the corrupted string "[object Object]"
      if (typeof parsed === 'object' && parsed !== null) {
        const fixed = parsed.name || parsed.id || 'claude-sonnet-4-20250514';
        localStorage.setItem('claude-model', JSON.stringify(fixed));
        return fixed;
      }
      if (parsed === '[object Object]' || !parsed || typeof parsed !== 'string') {
        localStorage.setItem('claude-model', JSON.stringify('claude-sonnet-4-20250514'));
        return 'claude-sonnet-4-20250514';
      }
    }
  } catch {
    // If parsing fails, reset to default
    localStorage.setItem('claude-model', JSON.stringify('claude-sonnet-4-20250514'));
  }
  return null;
};
fixStoredModel();

function Claude() {
  const [messages, setMessages] = useLocalStorage('claude-messages', []);
  const [selectedModel, setSelectedModel] = useLocalStorage('claude-model', 'claude-sonnet-4-20250514');
  const [selectedContexts, setSelectedContexts] = useLocalStorage('claude-contexts', ['general']);
  const [isLoading, setIsLoading] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const messagesEndRef = useRef(null);

  // Fetch available models
  const { data: modelsData, isLoading: modelsLoading } = useQuery({
    queryKey: ['claude-models'],
    queryFn: async () => {
      const response = await claudeApi.getModels();
      return response.data;
    },
  });

  // Fetch available contexts
  const { data: contextsData } = useQuery({
    queryKey: ['claude-contexts'],
    queryFn: async () => {
      const response = await claudeApi.getContexts();
      return response.data;
    },
  });

  const toggleContext = (contextName) => {
    setSelectedContexts((prev) => {
      if (prev.includes(contextName)) {
        return prev.filter((c) => c !== contextName);
      }
      return [...prev, contextName];
    });
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showContextMenu && !e.target.closest('.context-menu-container')) {
        setShowContextMenu(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showContextMenu]);

  const handleSend = async (content) => {
    // Get current messages for API call before adding loading message
    const currentMessages = messages.filter((m) => !m.isLoading && m.content);

    // Add user message
    const userMessage = {
      id: Date.now(),
      content,
      isUser: true,
      timestamp: new Date().toISOString(),
    };

    // Add loading message for assistant
    const loadingMessage = {
      id: Date.now() + 1,
      content: '',
      isUser: false,
      isLoading: true,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage, loadingMessage]);
    setIsLoading(true);

    try {
      // Build API messages from current state (not including loading message)
      const apiMessages = [
        ...currentMessages.map((m) => ({
          role: m.isUser ? 'user' : 'assistant',
          content: m.content,
        })),
        { role: 'user', content },
      ];

      // Ensure model is a string
      const modelId = typeof selectedModel === 'object'
        ? (selectedModel?.name || selectedModel?.id || 'claude-sonnet-4-20250514')
        : selectedModel;
      const response = await claudeApi.chat(apiMessages, modelId, selectedContexts);
      const responseContent = response.data?.response || response.data?.content || '';

      // Replace loading message with actual response
      setMessages((prev) =>
        prev.map((m) =>
          m.isLoading
            ? {
                id: Date.now() + 2,
                content: responseContent,
                isUser: false,
                isLoading: false,
                timestamp: new Date().toISOString(),
              }
            : m
        )
      );
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to send message');
      // Remove the loading message
      setMessages((prev) => prev.filter((m) => !m.isLoading));
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setMessages([]);
    toast.success('Chat cleared');
  };

  const models = modelsData?.models || [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
  ];

  return (
    <div className="max-w-4xl mx-auto animate-fade-in h-[calc(100vh-12rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Claude Chat
          </h1>
          <span className="px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-xs font-medium rounded-full">
            Anthropic
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Context Selector */}
          <div className="relative context-menu-container">
            <button
              onClick={() => setShowContextMenu(!showContextMenu)}
              className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedContexts.length > 0
                  ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
              }`}
              title="Select context files"
            >
              <DocumentTextIcon className="w-4 h-4" />
              <span>{selectedContexts.length || 0}</span>
            </button>
            {showContextMenu && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-50 max-h-80 overflow-y-auto">
                <div className="p-2 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Context Files
                  </p>
                  {contextsData?.contexts?.length > 0 && (
                    <button
                      onClick={() => {
                        const allNames = contextsData.contexts.map((c) => c.name);
                        const allSelected = allNames.every((name) => selectedContexts.includes(name));
                        if (allSelected) {
                          setSelectedContexts([]);
                        } else {
                          setSelectedContexts(allNames);
                        }
                      }}
                      className="text-xs text-purple-500 hover:text-purple-600 dark:text-purple-400 dark:hover:text-purple-300"
                    >
                      {contextsData.contexts.every((c) => selectedContexts.includes(c.name))
                        ? 'Deselect All'
                        : 'Select All'}
                    </button>
                  )}
                </div>
                {contextsData?.contexts?.map((context) => (
                  <label
                    key={context.name}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedContexts.includes(context.name)}
                      onChange={() => toggleContext(context.name)}
                      className="rounded border-slate-300 dark:border-slate-600 text-purple-500 focus:ring-purple-500"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      {context.displayName}
                    </span>
                  </label>
                ))}
                {(!contextsData?.contexts || contextsData.contexts.length === 0) && (
                  <p className="px-3 py-2 text-sm text-slate-500">No context files found</p>
                )}
              </div>
            )}
          </div>

          <ModelSelector
            models={models}
            selectedModel={selectedModel}
            onSelect={setSelectedModel}
            isLoading={modelsLoading}
          />
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              className="btn-ghost p-2"
              title="Clear chat"
            >
              <TrashIcon className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto card p-4 mb-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center">
            <div>
              <p className="text-lg text-slate-500 dark:text-slate-400 mb-2">
                Start a conversation with Claude
              </p>
              <p className="text-sm text-slate-400 dark:text-slate-500">
                Ask questions, get help with code, brainstorm ideas...
              </p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message.content}
                isUser={message.isUser}
                isLoading={message.isLoading}
              />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        disabled={isLoading}
        placeholder="Message Claude..."
      />
    </div>
  );
}

export default Claude;
