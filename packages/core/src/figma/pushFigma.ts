// push_open_design_artifact_to_figma (openspec connect-figma): captures the
// artifact (or reuses a fresh capture), writes ready-to-run use_figma parts and
// image files under the artifact's exports/figma/, and composes instructions
// for the agent to run them through the user's Figma MCP connection. Never
// contacts Figma itself.
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { readArtifact } from '../vendored/artifactCreate';
import { figmaCaptureSidecarPath, type FigmaCaptureDocument } from '../workspace/figmaCapture';
import { captureArtifactForFigma } from './captureRunner';
import { buildFigmaPushParts } from './pushParts';

export const FIGMA_PUSH_TOOL_NAME = 'push_open_design_artifact_to_figma';
/** Above this many parts, the agent warns the user before starting. */
export const FIGMA_MANY_PARTS = 8;

export interface PrepareFigmaPushOptions {
  workspaceRoot: string;
  entryPath: string;
  /** Re-capture even when a capture newer than the entry file exists. */
  refresh?: boolean;
  browserPath?: string;
}

export type PrepareFigmaPushResult = { ok: boolean; text: string };

async function mtime(p: string): Promise<number | undefined> {
  try {
    return (await fs.stat(p)).mtimeMs;
  } catch {
    return undefined;
  }
}

export async function prepareFigmaPush(options: PrepareFigmaPushOptions): Promise<PrepareFigmaPushResult> {
  const entryPath = options.entryPath.replace(/\\/g, '/');
  const absEntry = path.join(options.workspaceRoot, entryPath);
  const entryTime = await mtime(absEntry);
  if (entryTime === undefined) return { ok: false, text: `No artifact entry file found at ${entryPath}.` };

  const sidecar = figmaCaptureSidecarPath(entryPath);
  const absSidecar = path.join(options.workspaceRoot, sidecar);
  const sidecarTime = await mtime(absSidecar);
  let capture: FigmaCaptureDocument;
  let truncated = false;
  let reused = false;
  const warnings: string[] = [];
  if (!options.refresh && sidecarTime !== undefined && sidecarTime >= entryTime) {
    capture = JSON.parse(await fs.readFile(absSidecar, 'utf8')) as FigmaCaptureDocument;
    reused = true;
  } else {
    const captured = await captureArtifactForFigma({ workspaceRoot: options.workspaceRoot, entryPath, browserPath: options.browserPath });
    if (!captured.ok) return { ok: false, text: `${captured.error}\n\nNothing was prepared for Figma.` };
    capture = captured.capture;
    truncated = captured.truncated;
    warnings.push(...captured.warnings);
  }

  const artifact = await readArtifact({ workspaceRoot: options.workspaceRoot, entryPath }).catch(() => null);
  const title = typeof artifact?.manifest?.title === 'string' ? artifact.manifest.title : capture.source?.title;
  if (title && capture.source) capture.source.title = title;

  let built;
  try {
    built = buildFigmaPushParts(capture, { runId: randomBytes(3).toString('hex') });
  } catch (err) {
    return { ok: false, text: `Couldn't prepare the Figma parts: ${err instanceof Error ? err.message : String(err)}` };
  }

  const outDir = path.posix.join(path.posix.dirname(entryPath), 'exports', 'figma');
  const absOut = path.join(options.workspaceRoot, outDir);
  await fs.rm(absOut, { recursive: true, force: true });
  await fs.mkdir(path.join(absOut, 'images'), { recursive: true });
  const partFiles: string[] = [];
  for (let i = 0; i < built.parts.length; i++) {
    const name = `part-${String(i + 1).padStart(2, '0')}.js`;
    await fs.writeFile(path.join(absOut, name), built.parts[i]);
    partFiles.push(path.posix.join(outDir, name));
  }
  const imageFiles = [];
  for (const img of built.images) {
    const name = `images/${img.ref}.${img.ext}`;
    await fs.writeFile(path.join(absOut, name), img.bytes);
    imageFiles.push({ ref: img.ref, file: path.posix.join(outDir, name), contentType: img.mimeType });
  }
  const manifest = { runId: built.runId, title, parts: partFiles, images: imageFiles, layers: built.nodeCount, truncated, capture: sidecar };
  await fs.writeFile(path.join(absOut, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  return {
    ok: true,
    text: composeFigmaPushInstructions({ entryPath, title, partFiles, imageFiles, layers: built.nodeCount, truncated, reused, sidecar, warnings }),
  };
}

export interface ComposeFigmaPushInstructionsInput {
  entryPath: string;
  title?: string;
  partFiles: string[];
  imageFiles: Array<{ ref: number; file: string; contentType: string }>;
  layers: number;
  truncated: boolean;
  reused: boolean;
  sidecar: string;
  warnings?: string[];
}

export function composeFigmaPushInstructions(input: ComposeFigmaPushInstructionsInput): string {
  const { partFiles, imageFiles } = input;
  const buildParts = partFiles.slice(0, -1);
  const cleanupPart = partFiles[partFiles.length - 1];
  const name = input.title ? `"${input.title}" (\`${input.entryPath}\`)` : `\`${input.entryPath}\``;
  const out: string[] = [];

  out.push(
    `# Push ${name} into Figma\n\nThe design was ${input.reused ? 'taken from its existing capture' : 'captured in a headless browser'} (${input.layers} layers${input.truncated ? ', truncated at the capture limit, so mention that the bottom of the page may be missing' : ''}) and turned into ${partFiles.length} ready-to-run Figma code parts${imageFiles.length ? ` plus ${imageFiles.length} image file(s)` : ''}. You run them through the user's Figma connection. Follow the steps in order.`,
  );
  if (input.warnings?.length) out.push(`\n\nCapture notes:\n${input.warnings.map((w) => `- ${w}`).join('\n')}`);

  out.push(
    `\n\n## Step 1 — is Figma connected?\n\nCall \`list_open_design_integrations\` with \`integration: "figma"\` and check your own tools, including deferred ones you can search for, for Figma's \`use_figma\`.\n\n- **Connected:** continue with step 2.\n- **Not connected:** offer to set it up once, using the steps that tool returns, and only after the user says yes. If they decline, use the manual route at the end.`,
  );

  out.push(
    `\n\n## Step 2 — choose where the layers go (wait for the user)\n\nAsk the user, and wait for the answer before writing anything to Figma:\n- **An existing Figma file:** they paste its link; take the file key from \`figma.com/design/<fileKey>/…\` (for a branch link, the branch key). The design is added as a new frame on the current page, beside what's there; nothing existing is changed.\n- **A new file:** call Figma's \`whoami\`. With one plan, use its \`key\`; with several, ask which team. Then call \`create_new_file\` with \`editorType: "design"\`, that \`planKey\` and \`fileName\` ${input.title ? `"${input.title}"` : 'named after the design'}.${partFiles.length > FIGMA_MANY_PARTS ? `\n\nThis push has ${partFiles.length} parts, so tell the user it will take ${partFiles.length} Figma calls before starting.` : ''}`,
  );

  out.push(
    `\n\n## Step 3 — load Figma's guidance\n\nCall Figma's \`get_figma_skill\` with \`uri: "skill://figma/figma-use/SKILL.md"\` (Figma requires it before \`use_figma\`).`,
  );

  out.push(
    `\n\n## Step 4 — build the layers\n\nFor each file below, in this order, read it and call Figma's \`use_figma\` with the chosen \`fileKey\`, a short \`description\` ("Open Design push, part N of ${partFiles.length}") and \`code\` set to the file's contents **exactly as written**. Never edit, shorten or reformat the code: each part finds the layers the previous parts made by name. If a call fails, show the user the error and stop; don't write replacement code.\n\n${buildParts.map((p, i) => `${i + 1}. \`${p}\``).join('\n')}\n${buildParts.length + 1}. \`${cleanupPart}\` (clean-up: removes the build markers from layer names and returns \`containerId\` and \`imageNodes\`)\n\nEach build part returns \`failedFonts\`: fonts Figma doesn't have, which fell back to Inter. Mention them to the user.`,
  );

  out.push(
    imageFiles.length
      ? `\n\n## Step 5 — upload the images\n\nThe clean-up part returned \`imageNodes\`: \`[{ ref, id }]\`. Call Figma's \`upload_assets\` with the \`fileKey\`, \`count\` = the number of images (at most 60 per call) and \`nodeIds\` = their ids in \`ref\` order. Then send each image's raw bytes to its submit URL, in the same order:\n\n\`curl -sS -X POST -H "Content-Type: <type>" --data-binary @"<file>" "<submit URL>"\`\n\n${imageFiles.map((f) => `- ref ${f.ref}: \`${f.file}\` (\`${f.contentType}\`)`).join('\n')}\n\nSubmit URLs are single-use and expire after 10 minutes; if one fails or expires, call \`upload_assets\` again for the remaining images. Skip any image whose \`id\` is null.`
      : `\n\n## Step 5 — images\n\nThis design has no images to upload.`,
  );

  out.push(
    `\n\n## Step 6 — check and report\n\nCall Figma's \`get_screenshot\` with the \`fileKey\` and \`nodeId\` = the \`containerId\`, then compare it with the design and tell the user what didn't carry over (gradients become their first color, inline SVG icons aren't captured, unavailable fonts fall back to Inter). Give them the file link, \`https://www.figma.com/design/<fileKey>\`.`,
  );

  out.push(
    `\n\n## Manual route (Figma not connected)\n\nThe capture is saved at \`${input.sidecar}\`. Tell the user:\n1. One-time setup: install the "OD Figma Import" plugin in Figma desktop (Plugins → Development → Import plugin from manifest…). In VS Code, the command **Open Design: Show Figma Import Plugin Folder** reveals its \`manifest.json\`.\n2. In Figma, run **OD Figma Import** and paste the contents of \`${input.sidecar}\`.`,
  );
  return out.join('');
}
