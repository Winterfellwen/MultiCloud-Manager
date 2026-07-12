import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const toolsPath = join(__dirname, '..', 'ai-gateway', 'src', 'agent', 'tools.ts');
const content = readFileSync(toolsPath, 'utf-8');

const toolRegex = /name:\s*['"]([^'"]+)['"][\s\S]*?supportedProviders:\s*(\[[^\]]*\])/g;
let match;
const results = [];

while ((match = toolRegex.exec(content)) !== null) {
  const name = match[1];
  const providers = JSON.parse(match[2].replace(/'/g, '"'));
  results.push({ name, providers });
}

console.log('# Tool-Cloud Compatibility Matrix\n');
console.log('| Tool | ' + [...new Set(results.flatMap(r => r.providers))].join(' | ') + ' |');
console.log('|' + ['---', ...new Set(results.flatMap(r => r.providers))].map(() => '---').join('|') + '|');

for (const tool of results) {
  const allProviders = [...new Set(results.flatMap(r => r.providers))];
  const row = allProviders.map(p => tool.providers.includes(p) ? '✓' : '-');
  console.log(`| ${tool.name} | ${row.join(' | ')} |`);
}

console.log(`\nTotal tools with declared providers: ${results.length}`);

process.exit(0);
