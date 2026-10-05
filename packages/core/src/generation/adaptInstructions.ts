// adapt_open_design_artifact (openspec poster-format-pipeline,
// "artifact-adaptation"): instructions to RE-COMPOSE a finished design for
// other canvas formats, the agent's equivalent of a "resize" that actually
// re-lays-out. Writes no design file; the only write is giving the master a
// collectionId (and role) when it doesn't have one, so master + adaptations
// browse as one collection (see ../workspace/collectionScan.ts).
import * as path from 'node:path';
import { composeCanvasSection, FORMATS, getFormat, isFluidHtml, unknownFormatError, type CanvasFormat } from '../poster/formats';
import { readArtifact, writeArtifactManifest } from '../vendored/artifactCreate';
import { findCollectionArtifacts } from '../workspace/collectionScan';

export const MAX_ADAPT_FORMATS = 6;
const ADAPTABLE_RENDERERS = new Set(['html', 'mini-app', 'svg']);

export interface AdaptArtifactInput {
  workspaceRoot: string;
  outputDir: string;
  entryPath: string;
  formats: string[];
  notes?: string;
}

/**
 * `new-file`: a fixed master is re-composed into a new file per format.
 * `tune`: a fluid master already reflows to every shape; it is tuned in place
 * with @container rules for the shapes that need it (fluid-poster-shapes D8).
 */
export type AdaptationMode = 'new-file' | 'tune';

export interface Adaptation {
  mode: AdaptationMode;
  formatId: string;
  formatLabel: string;
  instructions: string;
  /** new-file only. */
  suggestedEntryPath?: string;
  /** new-file only. */
  registerArgs?: Record<string, unknown>;
}

export type AdaptArtifactResult =
  | { ok: true; mode: 'new-file'; collectionId: string; collectionName: string; assignedCollection: boolean; adaptations: Adaptation[] }
  | { ok: true; mode: 'tune'; adaptations: Adaptation[] }
  | { ok: false; error: string };

/** The layout band a shape falls in, matching the fluid Canvas section's rules. */
function aspectBand(f: CanvasFormat): { name: string; rule: string } {
  const ratio = f.width / f.height;
  if (ratio > 1.2) return { name: 'wide', rule: '@container (aspect-ratio > 1.2)' };
  if (ratio < 0.6) return { name: 'tall', rule: '@container (aspect-ratio < 0.6)' };
  return { name: 'default (portrait and square)', rule: 'the base rules outside any @container block' };
}

function composeTuneInstructions(entry: string, html: string, title: string, format: CanvasFormat, notes: string | undefined): string {
  const band = aspectBand(format);
  const sameBand = Object.values(FORMATS)
    .filter((f) => f.id !== format.id && aspectBand(f).name === band.name)
    .map((f) => `\`${f.id}\``);
  return [
    `# Tune "${title}" for ${format.label}`,
    `\`${entry}\` is a **fluid** design (\`data-od-fluid\`): it already reflows to ${format.label} by itself. Don't create a new file. Check how it looks at this shape and fix only what's wrong, in the master file.`,
    notes?.trim() ? `## The user's notes\n\n${notes.trim()}` : '',
    `## Steps\n\n1. **Check it at this shape:** call export_open_design_artifact with \`{ "entryPath": "${entry}", "preset": "${format.id}", "checkOnly": true }\`. If you can view images, add \`"shapeSheet": true, "presets": ["${format.id}"]\` and look at the sheet it writes. (In VS Code, the preview's Shape dropdown shows the same thing.)\n2. **Decide whether it needs work.** Preflight errors (overflow, overlap, safe area) must be fixed. Beyond that, judge the composition: the headline should dominate, nothing important should be cropped, and there shouldn't be a large dead area.\n3. **Fix it in ${band.rule}.** That is the ${band.name} band, which ${sameBand.length > 0 ? `also covers ${sameBand.join(', ')}` : 'covers only this shape'}, so a change there applies to those shapes too. Keep sizes in container units. To make room, hide \`data-od-priority="3"\` and then \`"2"\` elements in this band; never hide the headline, date/time/place, call to action, QR code or logo. Adjust \`object-position\` if a photo's subject is cropped.\n4. **Re-check every shape:** call export_open_design_artifact with \`{ "entryPath": "${entry}", "shapeSheet": true, "checkOnly": true }\` and make sure you didn't break another band.`,
    `## Keep\n\nThe same message, copy hierarchy, design tokens and every \`data-od-field\`, \`data-od-qr-field\` and \`data-od-qr\` attribute.`,
    `## The master\n\n\`\`\`html\n${html.trim()}\n\`\`\``,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'design';
}

function aspectAdvice(f: CanvasFormat): string {
  const ratio = f.width / f.height;
  if (ratio >= 1.4) return 'This is a **wide** canvas: put the headline block and the key visual side by side rather than stacked.';
  if (ratio <= 0.62) return 'This is a **tall** canvas: stack the blocks vertically with generous spacing, headline in the upper third, and the call to action low but inside the safe area.';
  if (ratio > 0.9 && ratio < 1.1) return 'This is a **square** canvas: centre on one focal block, and cut anything that only works with room to spare.';
  return 'This canvas is close to the classic poster proportion: keep the master\'s vertical hierarchy, tightened to the new size.';
}

function recompositionRules(master: { medium?: CanvasFormat['medium'] }, target: CanvasFormat): string {
  const rules = [
    '1. **Same message, same design system.** Keep the copy hierarchy (headline, then subhead, then key facts, then call to action / QR code, then logo), the colors, fonts, textures and graphic motifs. Don\'t add new copy; shorten it if you must.',
    `2. **Re-compose, don't scale.** Never shrink the master into the new canvas, letterbox it or crop it. Lay the same blocks out again for this aspect ratio. ${aspectAdvice(target)}`,
    '3. **What to drop when space is tight, in this order:** secondary body text, then supporting details (lists, footnotes), then decorative elements. Never drop the headline, the date/time/place, the call to action or QR code, or the logo. Shorten copy before shrinking type below the minimum size.',
    '4. **Keep data bindings.** Every element with `data-od-field`, `data-od-qr-field` or `data-od-qr` in the master keeps the same attribute and value here, so a spreadsheet export works on every size.',
  ];
  if (target.medium === 'print' && master.medium !== 'print') {
    rules.push('5. **Screen to print:** switch the card to `mm` units at the bleed size given in the Canvas section, extend backgrounds into the bleed, and check that every raster image is large enough for print (150 ppi at its printed size).');
  } else if (target.medium === 'screen' && master.medium === 'print') {
    rules.push('5. **Print to screen:** drop the bleed, size the card in `px` exactly as the Canvas section says, and make the type bigger relative to the canvas: people see this at thumbnail size on a phone. A QR code is of little use on a phone screen (it can\'t be scanned by the same phone): show a short URL instead unless the user says it\'s for a display screen.');
  }
  return rules.join('\n');
}

export async function adaptArtifact(input: AdaptArtifactInput): Promise<AdaptArtifactResult> {
  if (!Array.isArray(input.formats) || input.formats.length < 1 || input.formats.length > MAX_ADAPT_FORMATS) {
    return { ok: false, error: `formats must list 1–${MAX_ADAPT_FORMATS} format ids.` };
  }
  const formats: CanvasFormat[] = [];
  for (const id of input.formats) {
    const f = getFormat(id);
    if (!f) return { ok: false, error: unknownFormatError(id) };
    if (formats.includes(f)) return { ok: false, error: `Format "${id}" is listed twice.` };
    formats.push(f);
  }

  let artifact;
  try {
    artifact = await readArtifact({ workspaceRoot: input.workspaceRoot, entryPath: input.entryPath });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (!artifact) return { ok: false, error: `No artifact entry file found at ${input.entryPath}.` };
  const manifest = artifact.manifest;
  if (!manifest) return { ok: false, error: `${input.entryPath} isn't registered. Call register_open_design_artifact first, then adapt it.` };
  const renderer = typeof manifest.renderer === 'string' ? manifest.renderer : 'html';
  if (!ADAPTABLE_RENDERERS.has(renderer)) return { ok: false, error: `Only HTML designs can be adapted; this artifact is rendered as "${renderer}".` };

  const entry = input.entryPath.replace(/\\/g, '/');
  if (isFluidHtml(artifact.entryContent)) {
    const title = typeof manifest.title === 'string' ? manifest.title : path.posix.basename(entry, path.posix.extname(entry));
    return {
      ok: true,
      mode: 'tune',
      adaptations: formats.map((format) => ({
        mode: 'tune',
        formatId: format.id,
        formatLabel: format.label,
        instructions: composeTuneInstructions(entry, artifact.entryContent, title, format, input.notes),
      })),
    };
  }
  const dir = path.posix.dirname(entry);
  const base = path.posix.basename(entry, path.posix.extname(entry));
  const title = typeof manifest.title === 'string' ? manifest.title : base;
  const metadata = manifest.metadata && typeof manifest.metadata === 'object' ? (manifest.metadata as Record<string, unknown>) : {};
  const masterFormat = getFormat(typeof metadata.format === 'string' ? metadata.format : undefined);
  const existingId = typeof manifest.collectionId === 'string' && manifest.collectionId ? manifest.collectionId : undefined;
  const collectionId = existingId ?? `${slug(base)}-formats`;
  const collectionName = existingId ? (typeof manifest.collectionName === 'string' ? manifest.collectionName : existingId) : title;

  if (!existingId) {
    await writeArtifactManifest({
      workspaceRoot: input.workspaceRoot,
      entryPath: input.entryPath,
      artifactManifest: { ...manifest, collectionId, collectionName, screenRole: 'master', screenIndex: 0 },
    });
  }
  const siblings = existingId ? (await findCollectionArtifacts(input.workspaceRoot, input.outputDir, collectionId)).length : 1;

  const adaptations = formats.map((format, i): Adaptation => {
    const suggestedEntryPath = path.posix.join(dir, `${base}-${format.id}.html`);
    const registerArgs: Record<string, unknown> = {
      entryPath: suggestedEntryPath,
      kind: typeof manifest.kind === 'string' ? manifest.kind : 'html',
      title: `${title} — ${format.label}`,
      collectionId,
      collectionName,
      screenIndex: siblings + i,
      screenRole: format.id,
      format: format.id,
      ...(typeof manifest.sourceSkillId === 'string' ? { sourceSkillId: manifest.sourceSkillId } : {}),
      ...(typeof manifest.designSystemId === 'string' ? { designSystemId: manifest.designSystemId } : {}),
    };
    const instructions = [
      `# Adapt "${title}" to ${format.label}`,
      `You are re-composing a finished design for a different canvas. The master is \`${entry}\`${masterFormat ? ` (${masterFormat.label})` : ''}; its full HTML is below. Leave the master file unchanged.`,
      input.notes?.trim() ? `## The user's notes\n\n${input.notes.trim()}` : '',
      composeCanvasSection(format),
      `## Re-composition rules\n\n${recompositionRules({ medium: masterFormat?.medium }, format)}`,
      `## The master\n\n\`\`\`html\n${artifact.entryContent.trim()}\n\`\`\``,
      `## Output\n\nWrite the adaptation at exactly \`${suggestedEntryPath}\`. Copy any supporting files it needs from the master's folder by relative path (it sits in the same folder, so \`assets/…\` paths keep working). Then call register_open_design_artifact with exactly these arguments (plus supportingFiles if any):\n\n\`\`\`json\n${JSON.stringify(registerArgs, null, 2)}\n\`\`\`\n\nThen run export_open_design_artifact with \`checkOnly: true\` and fix any preflight errors before exporting with \`preset: "${format.id}"\`.`,
    ]
      .filter(Boolean)
      .join('\n\n');
    return { mode: 'new-file', formatId: format.id, formatLabel: format.label, suggestedEntryPath, instructions, registerArgs };
  });

  return { ok: true, mode: 'new-file', collectionId, collectionName, assignedCollection: !existingId, adaptations };
}

/** The tool result: a short header plus the JSON payload. */
export function formatAdaptResult(result: AdaptArtifactResult): string {
  if (!result.ok) return `Can't adapt: ${result.error}`;
  if (result.mode === 'tune') {
    const header = [
      `This design is fluid, so it already reflows to every shape: no new files. ${result.adaptations.length} shape(s) to check and, where needed, tune in the master itself.`,
      'Work through the entries one at a time (each edits the same file, so not in parallel), then re-check every shape with a shape sheet.',
    ].join('\n');
    return `${header}\n\n${JSON.stringify({ mode: result.mode, adaptations: result.adaptations }, null, 2)}`;
  }
  const header = [
    `${result.adaptations.length} adaptation(s) of one master, in the collection "${result.collectionName}" (\`${result.collectionId}\`)${result.assignedCollection ? '; the master was added to it as role "master"' : ''}.`,
    'For each entry: follow its instructions, write the file at its suggestedEntryPath, and register it with its registerArgs. If you can delegate to sub-agents, adapt the formats in parallel, giving each one only its own instructions.',
  ].join('\n');
  return `${header}\n\n${JSON.stringify({ mode: result.mode, collectionId: result.collectionId, adaptations: result.adaptations }, null, 2)}`;
}
