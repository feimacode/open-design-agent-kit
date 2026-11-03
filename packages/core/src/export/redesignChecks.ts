// Checks for a redesign of a live site (openspec add-redesign-from-url),
// read from the entry HTML: rewritten copy must keep its original, and a
// concept of a site the user doesn't own must carry the concept ribbon.

import type { Finding } from '../poster/preflight';

const TAG = /<([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTR = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function attributes(raw: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of raw.matchAll(ATTR)) out.set(m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}

/** The site a redesign is of, from `data-od-redesign` on <body> (or any element), if any. */
export function redesignSiteOf(html: string): string | undefined {
  for (const m of html.matchAll(TAG)) {
    const value = attributes(m[2]).get('data-od-redesign');
    if (value !== undefined && value.trim()) return value.trim();
  }
  return undefined;
}

/** Whether the page carries the concept ribbon. */
export function hasConceptRibbon(html: string): boolean {
  for (const m of html.matchAll(TAG)) if (attributes(m[2]).has('data-od-concept')) return true;
  return false;
}

export function redesignFindings(html: string): Finding[] {
  const findings: Finding[] = [];
  let redesign = false;
  let owned = false;
  let ribbon = false;
  let edits = 0;
  for (const m of html.matchAll(TAG)) {
    const attrs = attributes(m[2]);
    if (attrs.has('data-od-redesign')) redesign = true;
    if (attrs.has('data-od-owned')) owned = true;
    if (attrs.has('data-od-concept')) ribbon = true;
    if (!attrs.has('data-od-copy-edit')) continue;
    edits++;
    const original = attrs.get('data-od-original');
    if (original === undefined || !original.trim()) {
      const id = attrs.get('id');
      const cls = attrs.get('class')?.split(/\s+/).filter(Boolean)[0];
      findings.push({
        check: 'copy-edit-original-missing',
        severity: 'warning',
        message: `Copy edit ${edits} has no data-od-original. Put the site's original text, verbatim, in data-od-original on the same element, so the client can see what changed and the before/after page can list it.`,
        selector: `${m[1].toLowerCase()}${id ? `#${id}` : cls ? `.${cls}` : ''}[data-od-copy-edit]`,
      });
    }
  }
  if (redesign && !owned && !ribbon) {
    findings.push({
      check: 'concept-unmarked',
      severity: 'warning',
      message:
        "This is a redesign of a site (data-od-redesign) with no concept ribbon. Unless the user has said the site is theirs or the work is commissioned, add the <aside data-od-concept> ribbon from the brief; if they have, add data-od-owned to <body> instead.",
      selector: 'body',
    });
  }
  return findings;
}
