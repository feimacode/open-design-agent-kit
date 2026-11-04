// export_open_design_design_system (openspec connect-brand-design-systems):
// writes a design system in Claude Design's `project/` format into the
// output folder, with the brand's logo and icons under project/assets/ for an
// own brand, a fonts note, and a brand.html page to look at. Publishing is
// the host's job (Claude's Artifact tool); this only writes files, so it
// needs no checkout of the kit.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { DesignSystemDetail } from '../content/contentIndex';
import type { BrandRecord } from './brandKit';
import { toClaudeDesignSystem } from './claudeDesignSystem';
import { validateClaudeDesignSystem } from './claudeDesignSystemFormat';
import { renderDesignSystemPreviewTab } from './designSystemPreview';

export const DESIGN_SYSTEM_EXPORT_DIR = 'claude-design';
export const BRAND_PAGE_FILE = 'brand.html';

export interface DesignSystemExportResult {
  /** Workspace-relative folder holding project/ and brand.html. */
  dir: string;
  /** Workspace-relative paths written, project files first. */
  files: string[];
  /** Workspace-relative brand.html. */
  brandPage: string;
  /** What didn't carry across, and why assets were or weren't included. */
  notes: string[];
  warnings: string[];
}

const ASSET_EXT = /\.(svg|png|jpe?g|webp|gif|ico|woff2?|ttf|otf)$/i;
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** The display name: brand.json's, else the DESIGN.md heading without "Design System Inspired by". */
function exportName(detail: DesignSystemDetail): string {
  if (detail.brand?.name) return detail.brand.kind === 'reference' ? `${detail.brand.name.replace(/[\s-]+inspired$/i, '')}-inspired` : detail.brand.name;
  const heading = /^#\s+(.+)$/m.exec(detail.body)?.[1].trim();
  const inspired = heading ? /^Design System Inspired by (.+)$/i.exec(heading)?.[1] : undefined;
  if (inspired) return `${inspired.trim()}-inspired`;
  return heading?.replace(/\s+Design System$/i, '').replace(/^Design System\s+/i, '') || detail.name;
}

/** "Do" and "Don't" bullets from DESIGN.md, up to 8 each. */
export function doAndDont(designMd: string): { dos: string[]; donts: string[] } {
  const dos: string[] = [];
  const donts: string[] = [];
  let bucket: string[] | undefined;
  for (const line of designMd.split('\n')) {
    const heading = /^#{2,4}\s+(.+)$/.exec(line);
    if (heading) {
      const h = heading[1].toLowerCase();
      bucket = /don['’]?t|avoid/.test(h) ? donts : /\bdos?\b/.test(h) ? dos : undefined;
      continue;
    }
    const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
    if (!bullet) continue;
    const text = bullet[1].trim();
    if (bucket) bucket.push(text);
    else if (/^(do not|don['’]t|never|avoid)\b/i.test(text)) donts.push(text);
  }
  return { dos: dos.slice(0, 8), donts: donts.slice(0, 8) };
}

/** A fonts section for project/README.md: each family, where it comes from, and what to do about licences. */
export function fontsNote(brand: BrandRecord | undefined): string | undefined {
  const fonts = brand?.fonts ?? [];
  if (fonts.length === 0) return undefined;
  const lines = fonts.map((f) => {
    const where = f.source === 'google' ? `Google Fonts${f.stylesheet ? ` (${f.stylesheet})` : ''}` : f.source === 'adobe' ? 'Adobe Fonts (needs the brand\'s kit)' : f.source === 'system' ? 'a system font' : `self-hosted${f.files?.length ? ` (files in assets/fonts/)` : ''}`;
    const licence = f.source === 'self-hosted' && f.licence !== 'confirmed' ? `; licence not confirmed${f.freeMatch ? `, use ${f.freeMatch} in its place` : ''}` : '';
    return `- **${f.family}** ${f.weights.length ? `(${f.weights.join(', ')}) ` : ''}from ${where}${licence}.`;
  });
  return `\n\n## Fonts\n\n${lines.join('\n')}\n`;
}

/** brand.html: the showcase, then the marks, the voice and DESIGN.md's do and don't. */
export function renderBrandPage(detail: DesignSystemDetail, name: string, assets: string[]): string {
  const showcase = renderDesignSystemPreviewTab(detail, 'showcase');
  const brand = detail.brand;
  const parts: string[] = [];
  const marks = assets.filter((a) => !/\.(woff2?|ttf|otf)$/i.test(a));
  if (marks.length > 0) {
    parts.push(
      `<h2>Marks</h2><div class="od-brand-marks">${marks
        .map((a) => `<figure><img src="${esc(a)}" alt="${esc(name)} ${esc(path.posix.basename(a))}"><figcaption>${esc(path.posix.basename(a))}</figcaption></figure>`)
        .join('')}</div>`,
    );
  }
  const voice = brand?.voice;
  if (voice) {
    const facts = [
      voice.headingCase ? `Headings in ${voice.headingCase} case` : '',
      voice.avgSentenceWords ? `about ${voice.avgSentenceWords} words a sentence` : '',
      voice.person ? { 'first-plural': 'speaks as "we"', second: 'speaks to "you"', third: 'speaks in the third person', mixed: 'mixes "we" and "you"' }[voice.person] : '',
      voice.exclamations === 0 ? 'no exclamation marks' : '',
    ].filter(Boolean);
    const samples = (voice.samples ?? []).filter((s) => s.kind !== 'nav').slice(0, 5);
    parts.push(
      `<h2>Voice</h2>${facts.length ? `<p>${esc(facts.join(', '))}.</p>` : ''}${samples.length ? `<ul>${samples.map((s) => `<li>“${esc(s.text)}”</li>`).join('')}</ul>` : ''}`,
    );
  }
  const { dos, donts } = doAndDont(detail.body);
  if (dos.length || donts.length) {
    parts.push(
      `<div class="od-brand-rules">${dos.length ? `<div><h2>Do</h2><ul>${dos.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></div>` : ''}${donts.length ? `<div><h2>Don't</h2><ul>${donts.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></div>` : ''}</div>`,
    );
  }
  if (parts.length === 0) return showcase;
  const section = `<section class="od-brand" aria-label="${esc(name)} brand"><style>
  .od-brand{max-width:1100px;margin:64px auto;padding:0 24px;font:16px/1.55 system-ui,sans-serif;color:inherit}
  .od-brand h2{font-size:22px;margin:40px 0 12px}
  .od-brand-marks{display:flex;flex-wrap:wrap;gap:24px}
  .od-brand-marks figure{margin:0;padding:16px;border:1px solid rgba(127,127,127,.3);border-radius:8px;text-align:center}
  .od-brand-marks img{display:block;max-height:64px;max-width:200px;margin:0 auto 8px}
  .od-brand-marks figcaption{font-size:12px;opacity:.7}
  .od-brand-rules{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px}
</style>${parts.join('\n')}</section>`;
  return showcase.includes('</body>') ? showcase.replace('</body>', `${section}\n</body>`) : showcase + section;
}

/**
 * Writes `<outputDir>/claude-design/<slug>/project/…` and brand.html for a
 * design system. Assets (logo, icons, licensed fonts) go along only for an
 * own brand. Throws when the export doesn't match Claude's format.
 */
export async function exportDesignSystemForClaude(input: { workspaceRoot: string; outputDir: string; detail: DesignSystemDetail; by?: string }): Promise<DesignSystemExportResult> {
  const { detail } = input;
  const name = exportName(detail);
  const slug = detail.id.replace(/^user:/, '').replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
  const tokensCss = detail.tokensCss === undefined ? undefined : detail.tokensOverrideCss ? `${detail.tokensCss}\n${detail.tokensOverrideCss}` : detail.tokensCss;
  const converted = toClaudeDesignSystem({ name, id: detail.id, designMd: detail.body, tokensCss, by: input.by });
  const notes = [...converted.notes];
  const files = { ...converted.files };
  const note = fontsNote(detail.brand);
  if (note && files['project/README.md'] !== undefined) files['project/README.md'] += note;
  const { errors, warnings } = validateClaudeDesignSystem(files);
  if (errors.length > 0) throw new Error(`The export doesn't match Claude's Design System format:\n${errors.join('\n')}`);

  const dirRel = path.posix.join(input.outputDir.split(path.sep).join('/'), DESIGN_SYSTEM_EXPORT_DIR, slug);
  const dir = path.join(input.workspaceRoot, dirRel);
  const written: string[] = [];
  for (const [rel, text] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await fs.writeFile(path.join(dir, rel), text);
    written.push(path.posix.join(dirRel, rel));
  }

  // Own brands only: the logo, icons and confirmed font files, under project/assets/.
  const assets: string[] = [];
  if (detail.id.startsWith('user:') && detail.brand?.kind === 'own') {
    const src = path.join(input.workspaceRoot, input.outputDir, 'design-systems', detail.id.slice('user:'.length), 'assets');
    const walk = async (rel: string): Promise<void> => {
      for (const e of await fs.readdir(path.join(src, rel), { withFileTypes: true }).catch(() => [])) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) await walk(r);
        else if (ASSET_EXT.test(e.name)) {
          const to = path.join(dir, 'project', 'assets', r);
          await fs.mkdir(path.dirname(to), { recursive: true });
          await fs.copyFile(path.join(src, r), to);
          assets.push(`project/assets/${r}`);
          written.push(path.posix.join(dirRel, 'project', 'assets', r));
        }
      }
    };
    await walk('');
    if (assets.length === 0) notes.push('The brand has no files in its assets/ folder, so no logo or icons were exported.');
  } else if (detail.brand?.kind === 'reference' || !detail.id.startsWith('user:')) {
    notes.push('No logo or icons: this design system is a reference, not the user\'s own brand, so its marks are not copied.');
  }

  const brandPage = path.posix.join(dirRel, BRAND_PAGE_FILE);
  await fs.writeFile(path.join(dir, BRAND_PAGE_FILE), renderBrandPage(detail, name, assets));
  return { dir: dirRel, files: written, brandPage, notes, warnings };
}
