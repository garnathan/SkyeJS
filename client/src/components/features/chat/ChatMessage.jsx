import { UserIcon } from '@heroicons/react/24/outline';
import { SparklesIcon } from '@heroicons/react/24/solid';
import MarkdownRenderer from './MarkdownRenderer';

function ChatMessage({ message, isUser, isLoading = false }) {
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser
            ? 'bg-accent-500 text-white'
            : 'bg-purple-500 text-white'
        }`}
      >
        {isUser ? (
          <UserIcon className="w-5 h-5" />
        ) : (
          <SparklesIcon className="w-5 h-5" />
        )}
      </div>

      {/* Message Content */}
      <div
        className={`flex-1 max-w-[80%] ${
          isUser ? 'text-right' : 'text-left'
        }`}
      >
        <div
          className={`inline-block p-3 rounded-2xl ${
            isUser
              ? 'bg-accent-500 text-white rounded-tr-sm'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded-tl-sm'
          }`}
        >
          {isLoading ? (
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          ) : isUser ? (
            <p className="whitespace-pre-wrap text-sm">{message}</p>
          ) : (
            <MarkdownRenderer content={message} />
          )}
        </div>
      </div>
    </div>
  );
}

export default ChatMessage;
