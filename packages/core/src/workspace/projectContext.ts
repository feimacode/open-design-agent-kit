// Project context files shared with Impeccable (openspec add-impeccable-interop):
// PRODUCT.md (who the product is for) and DESIGN.md (its visual system).
// Impeccable reads them from the project root, then .agents/context/, then
// docs/, using the first place that has one. We read in the same order, never
// change a file we didn't write, and write DESIGN.md only when none exists.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { resolveDesignSystemTokens, resolveTokenValue } from '../generation/designSystemTokens';

/** Where Impeccable looks for its context files, in order (impeccable.style/docs/context). */
export const PROJECT_CONTEXT_DIRS = ['.', '.agents/context', 'docs'] as const;

/** At most this many characters of PRODUCT.md go into a brief. */
export const PRODUCT_CONTEXT_CAP = 1500;

export interface ProjectContextFile {
  /** Workspace-relative, POSIX separators. */
  path: string;
  text: string;
}

async function readFirst(workspaceRoot: string, name: string): Promise<ProjectContextFile | undefined> {
  for (const dir of PROJECT_CONTEXT_DIRS) {
    const rel = dir === '.' ? name : path.posix.join(dir, name);
    try {
      const text = await fs.readFile(path.join(workspaceRoot, rel), 'utf8');
      if (text.trim()) return { path: rel, text };
    } catch {
      // Not there: try the next place.
    }
  }
  return undefined;
}

/**
 * The text cut to `cap` characters, keeping every Markdown heading: body lines
 * are dropped from the end of each section first, so the outline survives.
 */
export function capKeepingHeadings(text: string, cap = PRODUCT_CONTEXT_CAP): string {
  const trimmed = text.trim();
  if (trimmed.length <= cap) return trimmed;
  const lines = trimmed.split(/\r?\n/);
  const headingChars = lines.filter((l) => /^#{1,6}\s/.test(l)).reduce((n, l) => n + l.length + 1, 0);
  let budget = Math.max(0, cap - headingChars - 2);
  const out: string[] = [];
  for (const line of lines) {
    if (/^#{1,6}\s/.test(line)) {
      out.push(line);
      continue;
    }
    if (budget <= 0) continue;
    if (line.length + 1 <= budget) {
      out.push(line);
      budget -= line.length + 1;
    } else {
      out.push(`${line.slice(0, Math.max(0, budget - 1)).trimEnd()}…`);
      budget = 0;
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').slice(0, cap);
}

/** The project's PRODUCT.md, capped for a brief, or undefined when there is none. */
export async function readProductContext(workspaceRoot: string | undefined): Promise<ProjectContextFile | undefined> {
  if (!workspaceRoot) return undefined;
  const file = await readFirst(workspaceRoot, 'PRODUCT.md');
  return file ? { path: file.path, text: capKeepingHeadings(file.text) } : undefined;
}

/** The project's DESIGN.md path (not its text), or undefined when there is none. */
export async function findProjectDesignMd(workspaceRoot: string | undefined): Promise<string | undefined> {
  if (!workspaceRoot) return undefined;
  return (await readFirst(workspaceRoot, 'DESIGN.md'))?.path;
}

export interface ProjectDesignSystemSource {
  name: string;
  summary?: string;
  body: string;
  tokensCss?: string;
  tokensOverrideCss?: string;
}

const PLAIN_COLOR = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\([^()]*\))$/i;

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function firstFamily(stack: string | undefined): string | undefined {
  const first = stack?.split(',')[0]?.trim().replace(/^["']|["']$/g, '');
  return first || undefined;
}

/**
 * YAML front matter in the DESIGN.md format Impeccable's detector reads
 * (name, description, colors, typography, rounded, spacing), built from the
 * design system's resolved tokens so it can't disagree with what renders.
 */
export function designMdFrontMatter(ds: ProjectDesignSystemSource): string {
  const { tokens } = resolveDesignSystemTokens({ designMd: ds.body, tokensCss: ds.tokensCss, overrideCss: ds.tokensOverrideCss });
  const value = (name: string) => resolveTokenValue(tokens, name)?.trim();
  const lines = ['---', `name: ${yamlString(ds.name)}`];
  if (ds.summary?.trim()) lines.push(`description: ${yamlString(ds.summary.trim())}`);

  const colors: Array<[string, string]> = [
    ['primary', '--accent'],
    ['on-primary', '--accent-on'],
    ['background', '--bg'],
    ['surface', '--surface'],
    ['text', '--fg'],
    ['text-secondary', '--fg-2'],
    ['muted', '--muted'],
    ['border', '--border'],
    ['success', '--success'],
    ['warning', '--warn'],
    ['danger', '--danger'],
  ];
  const colorLines = colors.flatMap(([key, token]) => {
    const v = value(token);
    return v && PLAIN_COLOR.test(v) ? [`  ${key}: ${yamlString(v)}`] : [];
  });
  if (colorLines.length) lines.push('colors:', ...colorLines);

  const type: Array<[string, string, string, string | undefined]> = [
    ['display', '--font-display', '--text-4xl', '--leading-tight'],
    ['headline', '--font-display', '--text-2xl', '--leading-tight'],
    ['title', '--font-display', '--text-xl', undefined],
    ['body', '--font-body', '--text-base', '--leading-body'],
    ['label', '--font-body', '--text-sm', undefined],
    ['code', '--font-mono', '--text-sm', undefined],
  ];
  const typeLines = type.flatMap(([key, family, size, leading]) => {
    const fontFamily = firstFamily(value(family));
    const fontSize = value(size);
    if (!fontFamily || !fontSize) return [];
    const out = [`  ${key}:`, `    fontFamily: ${yamlString(fontFamily)}`, `    fontSize: ${yamlString(fontSize)}`];
    const lineHeight = leading ? value(leading) : undefined;
    if (lineHeight) out.push(`    lineHeight: ${yamlString(lineHeight)}`);
    if (key === 'display' || key === 'headline') {
      const tracking = value('--tracking-display');
      if (tracking) out.push(`    letterSpacing: ${yamlString(tracking)}`);
    }
    return out;
  });
  if (typeLines.length) lines.push('typography:', ...typeLines);

  const scale = (pairs: Array<[string, string]>) =>
    pairs.flatMap(([key, token]) => {
      const v = value(token);
      return v && /^-?\d+(\.\d+)?(px|rem|em)$/.test(v) ? [`  ${key}: ${yamlString(v)}`] : [];
    });
  const rounded = scale([
    ['sm', '--radius-sm'],
    ['md', '--radius-md'],
    ['lg', '--radius-lg'],
    ['full', '--radius-pill'],
  ]);
  if (rounded.length) lines.push('rounded:', ...rounded);
  const spacing = scale([
    ['xs', '--space-1'],
    ['sm', '--space-2'],
    ['md', '--space-4'],
    ['lg', '--space-6'],
    ['xl', '--space-8'],
  ]);
  if (spacing.length) lines.push('spacing:', ...spacing);

  lines.push('---');
  return lines.join('\n');
}

/** The DESIGN.md text written to a project: front matter plus the system's body (kept as-is if it already has front matter). */
export function projectDesignMd(ds: ProjectDesignSystemSource): string {
  const body = ds.body.trimStart();
  if (body.startsWith('---\n') || body.startsWith('---\r\n')) return `${body.trimEnd()}\n`;
  return `${designMdFrontMatter(ds)}\n\n<!-- Written by Open Design from the "${ds.name.replace(/-->/g, '')}" design system. Open Design never changes this file again; edit it freely. -->\n\n${body.trimEnd()}\n`;
}

export type WriteProjectDesignMdOutcome = { outcome: 'written'; path: string } | { outcome: 'kept-existing'; path: string };

/** Writes <workspace>/DESIGN.md only when no project DESIGN.md exists in any place Impeccable looks. Never overwrites. */
export async function writeProjectDesignMd(workspaceRoot: string, ds: ProjectDesignSystemSource): Promise<WriteProjectDesignMdOutcome> {
  const existing = await findProjectDesignMd(workspaceRoot);
  if (existing) return { outcome: 'kept-existing', path: existing };
  try {
    await fs.writeFile(path.join(workspaceRoot, 'DESIGN.md'), projectDesignMd(ds), { encoding: 'utf8', flag: 'wx' });
    return { outcome: 'written', path: 'DESIGN.md' };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return { outcome: 'kept-existing', path: 'DESIGN.md' };
    throw err;
  }
}
