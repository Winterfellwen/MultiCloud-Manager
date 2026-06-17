// Simple markdown parser for AI chat messages
// Supports: code blocks, inline code, bold, italic, links, lists, tables

export function parseMarkdown(text) {
  if (!text) return '';

  let html = escapeHtml(text);

  // Code blocks with syntax highlighting hint
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr>');

  // Line breaks (double newline = paragraph)
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');

  // Wrap in paragraph if not already wrapped
  if (!html.startsWith('<')) {
    html = '<p>' + html + '</p>';
  }

  return html;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Parse simple tables (| col1 | col2 |)
export function parseTable(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return text;

  const rows = lines.filter(line => line.trim().startsWith('|'));
  if (rows.length < 2) return text;

  const headers = rows[0].split('|').filter(c => c.trim()).map(c => c.trim());
  const body = rows.slice(2).map(row => row.split('|').filter(c => c.trim()).map(c => c.trim()));

  let html = '<table class="markdown-table">';
  html += '<thead><tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr></thead>';
  html += '<tbody>';
  for (const row of body) {
    html += '<tr>' + row.map(c => `<td>${c}</td>`).join('') + '</tr>';
  }
  html += '</tbody></table>';

  return html;
}
