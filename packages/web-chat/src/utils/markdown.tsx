import { useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Copy, Check } from 'lucide-react'

interface MarkdownRendererProps {
  content: string
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [text])

  return (
    <button className="code-copy-btn" onClick={handleCopy} title="Copy code">
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function CodeBlock({ language, children }: { language: string; children: string }) {
  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span className="code-block-lang">{language || 'code'}</span>
        <CopyButton text={children} />
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={language || 'text'}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: '0 0 8px 8px',
          fontSize: '12.5px',
          lineHeight: '1.6',
          background: '#1a1b26',
        }}
        codeTagProps={{
          style: { fontFamily: 'var(--font-mono)' },
        }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  )
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ref: _ref, ...props }) {
          const match = /language-(\w+)/.exec(className || '')
          const lang = match ? match[1] : ''
          const codeString = String(children).replace(/\n$/, '')

          // Check if it's a block (has newline or is long)
          const isBlock = codeString.includes('\n') || codeString.length > 120

          if (isBlock) {
            return <CodeBlock language={lang} children={codeString} />
          }

          return (
            <code className={className || 'inline-code'} {...props}>
              {children}
            </code>
          )
        },
        table({ children }) {
          return (
            <div className="table-wrapper">
              <table>{children}</table>
            </div>
          )
        },
        a({ children, href, ref: _ref, ...props }) {
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
              {children}
            </a>
          )
        },
        ul({ children, ref: _ref, ...props }) {
          return <ul className="md-list" {...props}>{children}</ul>
        },
        ol({ children, ref: _ref, ...props }) {
          return <ol className="md-list" {...props}>{children}</ol>
        },
        li({ children, ref: _ref, ...props }) {
          return <li className="md-list-item" {...props}>{children}</li>
        },
        blockquote({ children, ref: _ref, ...props }) {
          return <blockquote className="md-blockquote" {...props}>{children}</blockquote>
        },
        h1({ children, ref: _ref, ...props }) {
          return <h1 className="md-heading md-h1" {...props}>{children}</h1>
        },
        h2({ children, ref: _ref, ...props }) {
          return <h2 className="md-heading md-h2" {...props}>{children}</h2>
        },
        h3({ children, ref: _ref, ...props }) {
          return <h3 className="md-heading md-h3" {...props}>{children}</h3>
        },
        hr() {
          return <hr className="md-hr" />
        },
        img({ src, alt, ref: _ref, ...props }) {
          return <img className="md-image" src={src} alt={alt || ''} loading="lazy" {...props} />
        },
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
