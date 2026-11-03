// Shared fragments for collections (openspec add-linked-flows): a screen
// writes `<template data-od-include="_shared/nav.html"></template>` where the
// shared navigation goes, and the kit puts the fragment's markup there when it
// serves the page (preview, check, export). The template stays in place and
// the inserted elements carry data-od-preview-only, so a save from the preview
// writes the screen back with the include, not a copy of the navigation.
// `data-od-current="<screen>"` on <body> marks the matching
// `data-od-goto` link in the fragment with aria-current="page".
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as cheerio from 'cheerio';
import { hasDataBinds, resolveSampleData } from './sampleData';

const INCLUDE = /<template\b([^>]*?)\bdata-od-include\s*=\s*(["'])([^"']+)\2([^>]*)>([\s\S]*?)<\/template>/gi;
const MAX_INCLUDES = 8;
const MAX_FRAGMENT_BYTES = 200_000;

export function currentScreenOf(html: string): string | undefined {
  const body = /<body\b[^>]*>/i.exec(html)?.[0];
  return body ? /\bdata-od-current\s*=\s*(["'])([^"']+)\1/i.exec(body)?.[2] : undefined;
}

/** The fragment's markup, its top-level elements marked preview-only and its current link marked. */
export function prepareFragment(fragment: string, includePath: string, current: string | undefined): string {
  const $ = cheerio.load(fragment, null, false);
  $.root()
    .children()
    .each((_, el) => {
      $(el).attr('data-od-preview-only', '').attr('data-od-included', includePath);
    });
  if (current) {
    $('a[data-od-goto], button[data-od-goto]').each((_, el) => {
      if ($(el).attr('data-od-goto') === current) $(el).attr('aria-current', 'page');
      else if ($(el).attr('aria-current') === 'page') $(el).removeAttr('aria-current');
    });
  }
  return $.html();
}

/** True when the page needs filling when served: shared fragments, or sample data binds (sampleData.ts). */
export function hasIncludes(html: string): boolean {
  return /\bdata-od-include\s*=/i.test(html) || hasDataBinds(html);
}

/**
 * Resolves `data-od-include` templates in an HTML document at `fileAbs`.
 * Paths are relative to the file's directory and must stay inside `rootAbs`;
 * a missing or out-of-bounds fragment leaves the template as it is. Then fills
 * sample data binds and repeats from the screen's data file (sampleData.ts).
 */
export async function resolveIncludes(html: string, fileAbs: string, rootAbs: string): Promise<{ html: string; included: string[]; missing: string[] }> {
  if (!hasIncludes(html)) return { html, included: [], missing: [] };
  const withFragments = await resolveFragments(html, fileAbs, rootAbs);
  // Sample data after fragments, so shared navigation can bind too (openspec add-sample-data).
  if (!hasDataBinds(withFragments.html)) return withFragments;
  const data = await resolveSampleData(withFragments.html, fileAbs, rootAbs);
  return { ...withFragments, html: data.html };
}

async function resolveFragments(html: string, fileAbs: string, rootAbs: string): Promise<{ html: string; included: string[]; missing: string[] }> {
  const current = currentScreenOf(html);
  const matches = [...html.matchAll(INCLUDE)].slice(0, MAX_INCLUDES);
  const included: string[] = [];
  const missing: string[] = [];
  let out = '';
  let last = 0;
  for (const m of matches) {
    const rel = m[3];
    const abs = path.resolve(path.dirname(fileAbs), rel);
    const within = path.relative(rootAbs, abs);
    let fragment: string | undefined;
    if (!within.startsWith('..') && !path.isAbsolute(within) && /\.html?$/i.test(abs)) {
      try {
        const stat = await fs.stat(abs);
        if (stat.isFile() && stat.size <= MAX_FRAGMENT_BYTES) fragment = await fs.readFile(abs, 'utf8');
      } catch {
        fragment = undefined;
      }
    }
    out += html.slice(last, m.index! + m[0].length);
    last = m.index! + m[0].length;
    if (fragment === undefined) {
      missing.push(rel);
      continue;
    }
    included.push(rel);
    out += prepareFragment(fragment, rel, current);
  }
  out += html.slice(last);
  return { html: out, included, missing };
}
