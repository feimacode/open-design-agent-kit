#!/usr/bin/env node
// Renders the supported-integrations tables in docs/guides/integrations.md and
// README.md from the integration registry (packages/content/local/
// integrations.json), between `<!-- integrations:start -->` and
// `<!-- integrations:end -->` markers. check-docs.mjs re-renders them and
// fails on drift (openspec connect-figma). Run: node scripts/generate-integrations-docs.mjs
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REGISTRY_PATH = path.join(repoRoot, 'packages', 'content', 'local', 'integrations.json');
export const TARGETS = [
  { file: 'docs/guides/integrations.md', render: (r) => renderGuideTable(r) },
  { file: 'README.md', render: (r) => renderReadmeTable(r) },
];
const START = '<!-- integrations:start -->';
const END = '<!-- integrations:end -->';
// Services first, then posting services, then a platform's own server.
const TIER_ORDER = ['official-service', 'aggregator', 'official-platform'];

function ordered(registry) {
  const list = Array.isArray(registry?.integrations) ? registry.integrations : [];
  return list
    .map((e, i) => ({ e, i }))
    .sort((a, b) => TIER_ORDER.indexOf(a.e.tier) - TIER_ORDER.indexOf(b.e.tier) || a.i - b.i)
    .map(({ e }) => e);
}

const shortName = (e) => e.displayName.replace(/\s*\(.*\)\s*$/, '');
const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const summaryOf = (e, registry) => e.docs?.summary ?? Object.keys(e.capabilities ?? {}).map((k) => registry.capabilities?.[k] ?? k).join('; ');

export function renderGuideTable(registry) {
  const rows = ordered(registry).map((e) => `| ${cell(shortName(e))} | ${cell(summaryOf(e, registry))} | ${cell(e.docs?.signIn ?? `${e.vendor} account`)} | ${cell(e.docs?.notes ?? '')} |`);
  return ['| Integration | What the agent can do with it | Sign-in | Notes |', '|---|---|---|---|', ...rows].join('\n');
}

export function renderReadmeTable(registry) {
  const rows = ordered(registry).map((e) => `| ${cell(shortName(e))} | ${cell(summaryOf(e, registry))} |`);
  return ['| Integration | What your agent can do with it |', '|---|---|', ...rows].join('\n');
}

/** Replaces the text between the markers; returns undefined when the markers are missing. */
export function replaceBetweenMarkers(text, rendered) {
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  if (start === -1 || end === -1 || end < start) return undefined;
  return `${text.slice(0, start + START.length)}\n${rendered}\n${text.slice(end)}`;
}

/** Files whose generated section differs from the registry (or lacks the markers). */
export async function staleIntegrationDocs(root = repoRoot) {
  const registry = JSON.parse(await fs.readFile(path.join(root, 'packages', 'content', 'local', 'integrations.json'), 'utf8'));
  const stale = [];
  for (const t of TARGETS) {
    const text = await fs.readFile(path.join(root, t.file), 'utf8');
    const next = replaceBetweenMarkers(text, t.render(registry));
    if (next === undefined) stale.push(`${t.file}: missing the ${START} / ${END} markers`);
    else if (next !== text) stale.push(`${t.file}: integrations table is out of date; run \`node scripts/generate-integrations-docs.mjs\``);
  }
  return stale;
}

async function main() {
  const registry = JSON.parse(await fs.readFile(REGISTRY_PATH, 'utf8'));
  for (const t of TARGETS) {
    const abs = path.join(repoRoot, t.file);
    const text = await fs.readFile(abs, 'utf8');
    const next = replaceBetweenMarkers(text, t.render(registry));
    if (next === undefined) throw new Error(`${t.file} has no ${START} / ${END} markers.`);
    if (next !== text) await fs.writeFile(abs, next);
    console.log(`${next === text ? 'Unchanged' : 'Updated'} ${t.file}`);
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
