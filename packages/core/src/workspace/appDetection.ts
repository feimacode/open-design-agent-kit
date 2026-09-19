// A cheap, deterministic signal — not a framework classifier — used only to
// decide whether prepare_open_design_brief's composed instructions should
// nudge the model to check a real existing app's conventions before
// generating. It never changes where/how an artifact gets written; the
// model does all the actual judgment about which conventions matter.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';

// Deliberately reports every match found rather than picking one "primary"
// framework (a Next.js app's package.json lists both `next` and `react` —
// reporting both is fine, the nudge only needs "there's a real app here").
const FRAMEWORK_PACKAGES: Record<string, string> = {
  react: 'React',
  next: 'Next.js',
  vue: 'Vue',
  nuxt: 'Nuxt',
  svelte: 'Svelte',
  '@angular/core': 'Angular',
  astro: 'Astro',
  'solid-js': 'Solid',
};

export async function detectExistingApp(workspaceRoot: string | undefined): Promise<string[]> {
  if (!workspaceRoot) return [];

  let raw: string;
  try {
    raw = await fs.readFile(path.join(workspaceRoot, 'package.json'), 'utf8');
  } catch {
    return [];
  }

  let pkg: { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> };
  try {
    pkg = JSON.parse(raw);
  } catch {
    return [];
  }

  const deps = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
  const found: string[] = [];
  for (const [pkgName, displayName] of Object.entries(FRAMEWORK_PACKAGES)) {
    if (deps.has(pkgName)) found.push(displayName);
  }
  return found;
}
