// The pure parts of the evals (openspec add-output-quality-evals): brief
// loading, transcript parsing, look signatures and the results table. No
// TypeScript imports, so scripts/test can run them with plain node.
import { existsSync, promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const EVALS_DIR = path.join(REPO_ROOT, 'evals');
export const OUTPUT_DIR = '.open-design';
// A design can be registered under the workspace's .open-design/ or under a visible
// "Open Design" folder (openspec desktop-visible-design-folder), so the whole workspace is scanned.
export const DESIGN_FOLDERS = [OUTPUT_DIR, 'Open Design'];
const SKIPPED_DIRS = new Set(['node_modules', '.checks', '.git', 'exports']);

/** HTML files anywhere in the workspace, workspace-relative, posix (skipping node_modules, check runs and exports). */
export async function htmlFiles(workspaceRoot, dir = '') {
  const out = [];
  let entries = [];
  try {
    entries = await fs.readdir(path.join(workspaceRoot, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory() && !SKIPPED_DIRS.has(entry.name)) out.push(...(await htmlFiles(workspaceRoot, rel)));
    else if (entry.isFile() && /\.html?$/i.test(entry.name)) out.push(rel);
  }
  return out;
}

// js-yaml comes with gray-matter (a core dependency); resolve it from there.
const requireFromCore = createRequire(path.join(REPO_ROOT, 'packages', 'core', 'package.json'));
const yaml = requireFromCore('js-yaml');

/** Every brief in evals/briefs, sorted by id. */
export async function loadBriefs(dir = path.join(EVALS_DIR, 'briefs')) {
  const names = (await fs.readdir(dir)).filter((n) => n.endsWith('.yaml')).sort();
  const briefs = [];
  for (const name of names) {
    const brief = yaml.load(await fs.readFile(path.join(dir, name), 'utf8'));
    const problem = briefProblem(brief, name);
    if (problem) throw new Error(`${name}: ${problem}`);
    briefs.push(brief);
  }
  return briefs;
}

/** Why a brief is malformed, or undefined. */
export function briefProblem(brief, fileName) {
  if (!brief || typeof brief !== 'object') return 'not a YAML mapping';
  if (typeof brief.id !== 'string' || `${brief.id}.yaml` !== fileName) return `id must match the file name (${fileName})`;
  if (typeof brief.request !== 'string' || !brief.request.trim()) return 'request is missing';
  if (!brief.expect || typeof brief.expect.surface !== 'string') return 'expect.surface is missing';
  if (brief.answers !== undefined && (typeof brief.answers !== 'object' || Array.isArray(brief.answers))) return 'answers must be a mapping';
  if (!Array.isArray(brief.must) || brief.must.length === 0) return 'must needs at least one note';
  if (brief.fixture !== undefined && (typeof brief.fixture !== 'string' || !/^[a-z0-9-]+$/.test(brief.fixture) || !existsSync(path.join(EVALS_DIR, 'fixtures', brief.fixture)))) return `fixture must name a folder in evals/fixtures/ (got ${JSON.stringify(brief.fixture)})`;
  if (brief.site !== undefined && (typeof brief.site !== 'string' || !/^[a-z0-9-]+$/.test(brief.site) || !existsSync(path.join(EVALS_DIR, 'fixtures', brief.site)))) return `site must name a folder in evals/fixtures/ (got ${JSON.stringify(brief.site)})`;
  if (brief.site !== undefined && !brief.request.includes('{{site}}')) return 'a brief with site must put {{site}} in its request, where the address goes';
  return undefined;
}

/** The content type a fixture site's file is served with. */
export function siteContentType(file) {
  const ext = path.extname(file).toLowerCase();
  return { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' }[ext] ?? 'application/octet-stream';
}

// ---------------------------------------------------------------- transcript

/** Assistant text blocks, tool uses and the final result from a `claude -p --output-format stream-json` transcript. */
export function parseTranscript(jsonl) {
  const texts = [];
  const toolUses = [];
  let result;
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === 'assistant' && Array.isArray(event.message?.content)) {
      for (const block of event.message.content) {
        if (block.type === 'text' && typeof block.text === 'string') texts.push(block.text);
        if (block.type === 'tool_use') toolUses.push({ name: block.name, input: block.input });
      }
    }
    if (event.type === 'result') result = event;
  }
  return { texts, toolUses, result };
}

/**
 * Questions in a message the agent ended a round with: distinct lines with a "?" in them
 * (list markers ignored), so "**Print or screens?** If print, …" counts too.
 */
export function countQuestions(text) {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter((l) => l.includes('?'));
  return new Set(lines).size;
}

const ASSUMPTION_LINE = /^\s*(?:[-*•]\s*|\d+[.)]\s*)?(?:\*\*)?(?:I(?:'ve| have)? assumed|Assum(?:ed|ing|ption)s?\b|I picked|I chose|I went with)/i;

/** Assumptions the agent stated in its messages: lines that start "Assumed…", "I picked…" and the like. A fallback for when the manifest has none. */
export function countAssumptionLines(texts) {
  const lines = new Set();
  for (const text of texts) for (const line of text.split('\n')) if (ASSUMPTION_LINE.test(line)) lines.add(line.trim());
  return lines.size;
}

// ---------------------------------------------------------------- signature

/** Every custom property declared in the CSS, first declaration wins. */
function cssVars(css) {
  const vars = new Map();
  for (const m of css.matchAll(/--([\w-]+)\s*:\s*([^;}]+)/g)) if (!vars.has(m[1])) vars.set(m[1], m[2].trim());
  return vars;
}

function resolveVars(value, vars, depth = 0) {
  if (!value || depth > 5) return value;
  return value.replace(/var\(\s*--([\w-]+)\s*(?:,\s*([^)]+))?\)/g, (_, name, fallback) => resolveVars(vars.get(name) ?? fallback ?? '', vars, depth + 1));
}

/** The first declaration of a property inside rules whose selector matches. */
function ruleValue(css, selector, property) {
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selector.test(m[1])) continue;
    const decl = new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*([^;]+)`, 'i').exec(m[2]);
    if (decl) return decl[1].trim();
  }
  return undefined;
}

function rgbOf(colour) {
  const hex = /#([0-9a-f]{3}|[0-9a-f]{6})\b/i.exec(colour ?? '');
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const m = /rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/i.exec(colour ?? '');
  return m ? [m[1], m[2], m[3]].map(Number) : undefined;
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function chroma([r, g, b]) {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function firstFamily(value) {
  return value?.split(',')[0].replace(/["']/g, '').trim() || undefined;
}

function hex(rgb) {
  return `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Signature parts read statically from an HTML file's <style> blocks. Exported for tests. */
export function signatureFromHtml(html) {
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  const vars = cssVars(css);
  const font = (selector) => firstFamily(resolveVars(ruleValue(css, selector, 'font-family'), vars));
  // The page's own surface: the document, else the card, slide or main wrapper the kit's formats use.
  const surface = /(^|[\s,])(?:body|html|:root|\[data-od-card\]|main|\.poster|\.card|\.slide|\.page)(?=[\s,:{[]|$)/i;
  const body = font(surface) ?? font(/./);
  const display = font(/(^|[\s,>])h1\b|(^|[\s,])\.(?:title|headline|display|hero)\b/i) ?? font(/(^|[\s,>])h2\b/i) ?? body;
  let bg;
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!surface.test(m[1])) continue;
    const decl = /(?:^|[;\s])background(?:-color)?\s*:\s*([^;]+)/i.exec(m[2]);
    bg = decl ? rgbOf(resolveVars(decl[1], vars)) : undefined;
    if (bg) break;
  }
  const theme = bg ? (luminance(bg) < 0.2 ? 'dark' : 'light') : undefined;
  // The accent: the most colourful colour the CSS declares.
  let accent;
  for (const m of css.matchAll(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b|rgba?\([^)]*\)/gi)) {
    const rgb = rgbOf(m[0]);
    if (rgb && chroma(rgb) > 60 && (!accent || chroma(rgb) > chroma(accent))) accent = rgb;
  }
  return { accent: accent ? hex(accent) : undefined, display, body, theme };
}

/**
 * A design's look signature: accent, display and body fonts, theme. Taken from
 * .open-design/history.json when variety memory (openspec add-variety-memory)
 * has recorded one, else read statically from the entry's HTML.
 */
export async function lookSignature(workspaceRoot, entryPath) {
  try {
    const history = JSON.parse(await fs.readFile(path.join(workspaceRoot, OUTPUT_DIR, 'history.json'), 'utf8'));
    const entries = Array.isArray(history) ? history : history?.entries;
    const hit = Array.isArray(entries) ? entries.find((e) => e?.entryPath === entryPath && e.signature) : undefined;
    if (hit) return { source: 'history', ...hit.signature };
  } catch {
    // No history yet: read the HTML.
  }
  try {
    return { source: 'html', ...signatureFromHtml(await fs.readFile(path.join(workspaceRoot, entryPath), 'utf8')) };
  } catch {
    return { source: 'html' };
  }
}

export function signatureKey(signature) {
  return [signature.accent, signature.display, signature.body, signature.theme].map((v) => v ?? '-').join(' / ');
}

// ---------------------------------------------------------------- results

export function total(counts) {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

function codes(counts) {
  const parts = Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([code, n]) => (n > 1 ? `${code}×${n}` : code));
  return parts.length ? parts.join(', ') : '—';
}

function inRange(value, range) {
  if (value === undefined || !range) return true;
  return (range.min === undefined || value >= range.min) && (range.max === undefined || value <= range.max);
}

/** The markdown table rows: one per design, or one per run that produced none. */
export function scoreRows(scores, briefsById = new Map()) {
  const rows = [];
  for (const s of scores) {
    const brief = briefsById.get(s.brief);
    const q = s.questions === undefined ? 'n/a' : `${s.questions}${inRange(s.questions, brief?.expect?.questions) ? '' : ' ⚠'}`;
    const common = {
      brief: s.brief ?? path.basename(s.workspace),
      repeat: s.repeat ?? '—',
      questions: q,
      toolCalls: s.toolCalls ?? 'n/a',
      time: s.wallSeconds === undefined ? 'n/a' : `${Math.round(s.wallSeconds)}s`,
    };
    if (s.designs.length === 0) {
      const why = s.agentError ?? (s.unregistered?.length ? `made ${s.unregistered.join(', ')} without registering it` : undefined);
      rows.push({ ...common, design: why ? `no design (${why})` : 'no design', skill: '—', errors: '—', errorCodes: '—', warnings: '—', critic: 'n/a', assumptions: 'n/a', signature: '—' });
      continue;
    }
    for (const d of s.designs) {
      const skills = brief?.expect?.skills;
      // Manifests carry catalog ids such as od:prototype:poster-hero; briefs name the last part.
      const skillMark = skills && d.skill ? (skills.includes(d.skill.split(':').pop()) ? '' : ' ⚠') : '';
      rows.push({
        ...common,
        design: d.entryPath,
        skill: `${d.skill ?? '—'}${skillMark}`,
        errors: d.checkOk ? String(total(d.errors)) : `check failed: ${d.checkError}`,
        errorCodes: codes(d.errors),
        warnings: d.checkOk ? `${total(d.warnings)} (${codes(d.warnings)})` : '—',
        critic: d.critic ? `${d.critic.verdict}, ${d.critic.findings}` : 'n/a',
        assumptions: d.assumptions ?? 'n/a',
        signature: signatureKey(d.signature),
      });
    }
  }
  return rows;
}

const COLUMNS = [
  ['brief', 'Brief'],
  ['repeat', '#'],
  ['design', 'Design'],
  ['skill', 'Skill'],
  ['errors', 'Errors'],
  ['errorCodes', 'Error codes'],
  ['warnings', 'Warnings'],
  ['critic', 'Critic'],
  ['questions', 'Questions'],
  ['assumptions', 'Assumptions'],
  ['toolCalls', 'Tool calls'],
  ['time', 'Time'],
  ['signature', 'Signature (accent / display / body / theme)'],
];

function cell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

export function scoreTable(scores, briefsById) {
  const rows = scoreRows(scores, briefsById);
  return [`| ${COLUMNS.map(([, h]) => h).join(' | ')} |`, `|${COLUMNS.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${COLUMNS.map(([k]) => cell(r[k])).join(' | ')} |`)].join('\n');
}

/** Error totals per repeat, distinct signatures, critic availability. */
export function summary(scores) {
  const byRepeat = new Map();
  for (const s of scores) {
    const key = s.repeat ?? 1;
    const errors = s.designs.reduce((a, d) => a + total(d.errors), 0);
    byRepeat.set(key, (byRepeat.get(key) ?? 0) + errors);
  }
  const designs = scores.flatMap((s) => s.designs);
  const signatures = new Set(designs.map((d) => signatureKey(d.signature)));
  const critic = designs.some((d) => d.critic);
  const lines = [
    `- Designs: ${designs.length} from ${scores.length} run(s); runs with no design: ${scores.filter((s) => s.designs.length === 0).length}.`,
    `- Check errors by repeat: ${[...byRepeat].sort((a, b) => a[0] - b[0]).map(([r, n]) => `#${r} ${n}`).join(', ')}.`,
    `- Distinct look signatures: ${signatures.size} of ${designs.length}${designs.some((d) => d.signature.source === 'html') ? ' (read from the HTML; variety memory not recorded)' : ''}.`,
    `- Critic: ${critic ? 'verdicts from metadata.critique' : 'n/a (no critique recorded)'}.`,
  ];
  const cost = scores.reduce((a, s) => a + (s.costUsd ?? 0), 0);
  if (cost > 0) lines.push(`- Agent cost: $${cost.toFixed(2)}.`);
  return lines.join('\n');
}
