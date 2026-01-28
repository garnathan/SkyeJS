import { useMemo } from 'react';

// Simple markdown renderer without external dependencies
function MarkdownRenderer({ content }) {
  const rendered = useMemo(() => {
    if (!content) return '';

    let html = content;

    // Escape HTML first to prevent XSS
    html = html
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Code blocks (``` ... ```)
    html = html.replace(
      /```(\w+)?\n([\s\S]*?)```/g,
      (_, lang, code) => {
        const langClass = lang ? ` data-lang="${lang}"` : '';
        return `<pre class="code-block"${langClass}><code>${code.trim()}</code></pre>`;
      }
    );

    // Inline code (` ... `)
    html = html.replace(
      /`([^`\n]+)`/g,
      '<code class="inline-code">$1</code>'
    );

    // Bold (**text** or __text__)
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

    // Italic (*text* or _text_)
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

    // Strikethrough (~~text~~)
    html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    // Headers (# ... to ###### ...)
    html = html.replace(/^######\s+(.+)$/gm, '<h6 class="md-h6">$1</h6>');
    html = html.replace(/^#####\s+(.+)$/gm, '<h5 class="md-h5">$1</h5>');
    html = html.replace(/^####\s+(.+)$/gm, '<h4 class="md-h4">$1</h4>');
    html = html.replace(/^###\s+(.+)$/gm, '<h3 class="md-h3">$1</h3>');
    html = html.replace(/^##\s+(.+)$/gm, '<h2 class="md-h2">$1</h2>');
    html = html.replace(/^#\s+(.+)$/gm, '<h1 class="md-h1">$1</h1>');

    // Horizontal rules (---, ***, ___)
    html = html.replace(/^[-*_]{3,}$/gm, '<hr class="md-hr" />');

    // Unordered lists
    html = html.replace(/^[\s]*[-*+]\s+(.+)$/gm, '<li class="md-li">$1</li>');
    html = html.replace(/(<li class="md-li">.*<\/li>\n?)+/g, (match) => {
      return `<ul class="md-ul">${match}</ul>`;
    });

    // Ordered lists
    html = html.replace(/^[\s]*\d+\.\s+(.+)$/gm, '<li class="md-oli">$1</li>');
    html = html.replace(/(<li class="md-oli">.*<\/li>\n?)+/g, (match) => {
      return `<ol class="md-ol">${match}</ol>`;
    });

    // Blockquotes
    html = html.replace(/^>\s+(.+)$/gm, '<blockquote class="md-blockquote">$1</blockquote>');

    // Merge consecutive blockquotes
    html = html.replace(/<\/blockquote>\n<blockquote class="md-blockquote">/g, '<br/>');

    // Links [text](url)
    html = html.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" class="md-link" target="_blank" rel="noopener noreferrer">$1</a>'
    );

    // Line breaks - convert double newlines to paragraph breaks
    html = html.replace(/\n\n+/g, '</p><p class="md-p">');

    // Wrap in paragraph if not already wrapped
    if (!html.startsWith('<')) {
      html = `<p class="md-p">${html}</p>`;
    }

    // Clean up empty paragraphs
    html = html.replace(/<p class="md-p"><\/p>/g, '');
    html = html.replace(/<p class="md-p">(\s*<(?:pre|ul|ol|h[1-6]|blockquote|hr))/g, '$1');
    html = html.replace(/(<\/(?:pre|ul|ol|h[1-6]|blockquote)>)\s*<\/p>/g, '$1');

    return html;
  }, [content]);

  return (
    <div
      className="markdown-content"
      dangerouslySetInnerHTML={{ __html: rendered }}
    />
  );
}

export default MarkdownRenderer;
