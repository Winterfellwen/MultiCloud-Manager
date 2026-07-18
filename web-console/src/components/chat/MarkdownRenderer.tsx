import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

function CodeBlock({ className, children, ...props }: React.ComponentPropsWithoutRef<'code'>) {
  const [copied, setCopied] = useState(false);
  const code = String(children).replace(/\n$/, '');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const match = /language-(\w+)/.exec(className || '');

  return (
    <div className="relative group my-2 rounded-md border bg-muted overflow-hidden">
      {match && (
        <div className="flex items-center justify-between px-3 py-1 text-xs text-muted-foreground border-b bg-muted/50">
          <span>{match[1]}</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? '已复制' : '复制'}
          </button>
        </div>
      )}
      <pre className="p-3 overflow-x-auto text-sm">
        <code className={className} {...props}>{children}</code>
      </pre>
    </div>
  );
}

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="markdown-body text-sm">
      <ReactMarkdown
        rehypePlugins={[rehypeHighlight]}
        components={{
          code: CodeBlock,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
