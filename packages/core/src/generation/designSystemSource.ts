// The preview's side panel: a design system's DESIGN.md or tokens.css as a
// lightly syntax-coloured, monospace source view. The Markdown classifier
// and inline highlighter are ported from upstream's DesignSpecView
// (apps/web/src/components/DesignSpecView.tsx, open-design-v0.22.2) from
// React elements to an HTML string. Every piece of source text is
// HTML-escaped; only class names and validated hex colours are emitted as
// markup, so the result is safe to inject into the webview directly.

import { escapeHtml } from '../vendored/designSystemKit';

export type SourceViewKind = 'markdown' | 'css';

function classifyMarkdownLine(line: string): string {
  if (/^#{1,6}\s+/.test(line)) {
    const hashes = /^(#+)\s/.exec(line)?.[1]?.length ?? 1;
    return `is-h${Math.min(hashes, 4)}`;
  }
  if (/^>\s/.test(line)) return 'is-quote';
  if (/^[-*+]\s/.test(line.trimStart())) return 'is-list';
  if (/^\|.*\|\s*$/.test(line)) return 'is-table';
  if (/^\s*```/.test(line)) return 'is-fence';
  if (/^\s*$/.test(line)) return 'is-blank';
  return '';
}

function classifyCssLine(line: string): string {
  const t = line.trim();
  if (/^(\/\*|\*)/.test(t)) return 'is-comment';
  if (/\{\s*$/.test(t) || t === '}') return 'is-selector';
  if (/^--[a-zA-Z0-9_-]+\s*:/.test(t)) return 'is-decl';
  if (t === '') return 'is-blank';
  return '';
}

const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;

function colorToken(hex: string): string {
  // Only a validated hex literal ever reaches the style attribute.
  const swatch = HEX_RE.test(hex) ? `<span class="md-tk-color-swatch" style="background-color: ${hex}" aria-hidden="true"></span>` : '';
  return `<span class="md-tk-color">${swatch}${escapeHtml(hex)}</span>`;
}

const MARKDOWN_TOKEN_RE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|#[0-9a-fA-F]{3,8}\b)/g;

function renderMarkdownInline(line: string): string {
  let out = '';
  let last = 0;
  for (const match of line.matchAll(MARKDOWN_TOKEN_RE)) {
    const start = match.index ?? 0;
    if (start > last) out += escapeHtml(line.slice(last, start));
    const token = match[0];
    if (token.startsWith('**')) out += `<span class="md-tk-bold">${escapeHtml(token.slice(2, -2))}</span>`;
    else if (token.startsWith('*')) out += `<span class="md-tk-em">${escapeHtml(token.slice(1, -1))}</span>`;
    else if (token.startsWith('`')) out += `<span class="md-tk-code">${escapeHtml(token.slice(1, -1))}</span>`;
    else out += colorToken(token);
    last = start + token.length;
  }
  return out + escapeHtml(line.slice(last));
}

function renderCssInline(line: string): string {
  const decl = /^(\s*)(--[a-zA-Z0-9_-]+)(\s*:\s*)(.*)$/.exec(line);
  if (!decl) return escapeHtml(line);
  const [, indent, name, colon, rest] = decl;
  let value = '';
  let last = 0;
  for (const match of rest.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    const start = match.index ?? 0;
    value += escapeHtml(rest.slice(last, start)) + colorToken(match[0]);
    last = start + match[0].length;
  }
  value += escapeHtml(rest.slice(last));
  return `${escapeHtml(indent)}<span class="css-tk-name">${escapeHtml(name)}</span>${escapeHtml(colon)}${value}`;
}

/** `<pre class="design-spec-pre"><code>…</code></pre>` for a DESIGN.md or tokens.css text. */
export function renderSourceView(text: string, kind: SourceViewKind): string {
  const classify = kind === 'markdown' ? classifyMarkdownLine : classifyCssLine;
  const inline = kind === 'markdown' ? renderMarkdownInline : renderCssInline;
  const lines = text
    .split(/\r?\n/)
    .map((line) => `<span class="design-spec-line ${classify(line)}">${inline(line)}\n</span>`)
    .join('');
  return `<pre class="design-spec-pre design-spec-${kind}"><code>${lines}</code></pre>`;
}
