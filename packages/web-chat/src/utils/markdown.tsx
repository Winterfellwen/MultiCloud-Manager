import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownRendererProps {
  content: string
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          const isBlock = String(children).includes('\n')
          if (isBlock) {
            return (
              <pre className="code-block">
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            )
          }
          return (
            <code className={className || 'inline-code'} {...props}>
              {children}
            </code>
          )
        },
        table({ children }) {
          return <div className="table-wrapper"><table>{children}</table></div>
        },
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
