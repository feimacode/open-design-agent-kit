// What a shared page gets on top of the artifact: the optional "Made with
// Open Design" footer badge and link-preview (Open Graph / Twitter) tags.
// Both are applied to export output only, never to the artifact's own files.
// openspec: add-artifact-sharing (artifact-publishing).
import { findRealClosingTag, parseHtmlTags } from './htmlReferences';

export type PackageFormat = 'standalone' | 'site';

export const BADGE_PROJECT_URL = 'https://github.com/feimacode/open-design-agent-kit?ref=badge';
export const BADGE_REMIX_URL = 'https://github.com/feimacode/awesome-open-design?ref=badge';

/**
 * Whether to add the badge: the call's own `badge` argument, then
 * OPEN_DESIGN_SHARE_BADGE (1/true, 0/false), then the host setting (false
 * turns the badge off; true leaves the format default), then the format
 * default — on for `site` (publishing), off for `standalone` (downloads).
 */
export function resolveBadge(
  format: PackageFormat,
  badge: boolean | undefined,
  env: string | undefined = process.env.OPEN_DESIGN_SHARE_BADGE,
  settingAllowsBadge?: boolean,
): boolean {
  if (badge !== undefined) return badge;
  const fromEnv = env?.trim().toLowerCase();
  if (fromEnv === '1' || fromEnv === 'true') return true;
  if (fromEnv === '0' || fromEnv === 'false') return false;
  if (settingAllowsBadge === false) return false;
  return format === 'site';
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Inline styles only (no class names to collide with the page's CSS), `all:
// initial` so the page's own styles don't leak in, and no external requests.
const LINK_STYLE = 'all:initial;font:inherit;color:inherit;text-decoration:underline;cursor:pointer';
export const BADGE_HTML =
  '<aside data-od-badge style="all:initial;position:fixed;right:12px;bottom:12px;z-index:2147483647;display:flex;align-items:center;gap:6px;' +
  'padding:6px 8px 6px 12px;border-radius:999px;background:rgba(17,17,17,.82);color:#fff;' +
  'font:500 12px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.25)">' +
  `<a href="${BADGE_PROJECT_URL}" target="_blank" rel="noopener" style="${LINK_STYLE}">Made with Open Design</a>` +
  '<span aria-hidden="true">·</span>' +
  `<a href="${BADGE_REMIX_URL}" target="_blank" rel="noopener" style="${LINK_STYLE}">Remix this</a>` +
  '<button type="button" aria-label="Hide this badge" onclick="this.parentNode.remove()" ' +
  'style="all:initial;cursor:pointer;color:inherit;font:inherit;font-size:14px;line-height:1;padding:0 4px;opacity:.7">×</button>' +
  '</aside>';

/** Inserts the badge before the real `</body>` (never one inside a script string), else appends it. */
export function injectBadge(html: string): string {
  const at = findRealClosingTag(html, 'body');
  return at >= 0 ? `${html.slice(0, at)}${BADGE_HTML}${html.slice(at)}` : `${html}${BADGE_HTML}`;
}

export interface LinkPreviewInput {
  title?: string;
  description?: string;
  /** Absolute https URL of the published site; enables og:image when `hasImage`. */
  baseUrl?: string;
  /** The bundle contains og.png. */
  hasImage: boolean;
}

/** Adds missing <title>, og:* and twitter:* tags. Tags the page already has are kept as written. */
export function injectLinkPreviewTags(html: string, input: LinkPreviewInput): string {
  const existing = new Set<string>();
  let hasTitle = false;
  let pageDescription: string | undefined;
  for (const tag of parseHtmlTags(html)) {
    if (tag.name === 'title') hasTitle = true;
    if (tag.name !== 'meta') continue;
    const key = (tag.attrs.get('property') ?? tag.attrs.get('name') ?? '').toLowerCase();
    if (key) existing.add(key);
    if (key === 'description') pageDescription = tag.attrs.get('content');
  }
  const title = input.title?.trim();
  const description = (pageDescription ?? input.description)?.trim() || (title ? `${title} — made with Open Design` : undefined);
  const imageUrl = input.hasImage && input.baseUrl ? new URL('og.png', input.baseUrl.endsWith('/') ? input.baseUrl : `${input.baseUrl}/`).toString() : undefined;

  const tags: string[] = [];
  if (!hasTitle && title) tags.push(`<title>${escapeAttr(title)}</title>`);
  const add = (attr: 'property' | 'name', key: string, value: string | undefined) => {
    if (value && !existing.has(key)) tags.push(`<meta ${attr}="${key}" content="${escapeAttr(value)}">`);
  };
  add('property', 'og:title', title);
  add('property', 'og:description', description);
  add('property', 'og:type', 'website');
  add('name', 'twitter:card', imageUrl ? 'summary_large_image' : 'summary');
  add('property', 'og:image', imageUrl);
  add('name', 'twitter:image', imageUrl);
  if (tags.length === 0) return html;

  const block = tags.join('\n');
  const headClose = findRealClosingTag(html, 'head');
  if (headClose >= 0) return `${html.slice(0, headClose)}${block}\n${html.slice(headClose)}`;
  const doctype = /^\uFEFF?\s*<!doctype[^>]*>/i.exec(html);
  const at = doctype ? doctype[0].length : 0;
  return `${html.slice(0, at)}\n${block}\n${html.slice(at)}`;
}
