// QR codes (openspec poster-format-pipeline, "qr-codes"): generated offline
// as SVG with `qrcode`, verified by decoding screenshots with `jsqr`.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import * as QRCode from 'qrcode';
import { readArtifact, writeArtifactManifest } from '../vendored/artifactCreate';

export type QrErrorCorrection = 'L' | 'M' | 'Q' | 'H';

export interface QrOptions {
  errorCorrection?: QrErrorCorrection;
  /** Quiet zone, in modules. */
  margin?: number;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * SVG markup for `text`, scaling to its container (`width: 100%`) and
 * carrying `data-od-qr` so preflight can check it decodes to the right value.
 */
export async function qrSvg(text: string, options: QrOptions = {}): Promise<string> {
  const svg = await QRCode.toString(text, {
    type: 'svg',
    errorCorrectionLevel: options.errorCorrection ?? 'M',
    margin: options.margin ?? 4,
    color: { dark: '#000000', light: '#ffffff' },
  });
  return svg
    .trim()
    .replace(/^<svg\b/, `<svg data-od-qr="${escapeAttr(text)}" role="img" aria-label="QR code" style="display:block;width:100%;height:auto"`);
}

/** Decodes the first QR code in a PNG, or undefined when none is found. */
export function decodeQrPng(png: Buffer): string | undefined {
  const image = PNG.sync.read(png);
  const result = jsQR(new Uint8ClampedArray(image.data.buffer, image.data.byteOffset, image.data.byteLength), image.width, image.height);
  return result?.data;
}

export interface CreateQrCodeInput {
  workspaceRoot: string;
  /** The registered artifact the code belongs to. */
  entryPath: string;
  text: string;
  /** File name stem under the artifact's assets/ (default "qr"). */
  name?: string;
  errorCorrection?: QrErrorCorrection;
  margin?: number;
}

export type CreateQrCodeResult =
  | { ok: true; assetPath: string; workspacePath: string; svg: string; errorCorrection: QrErrorCorrection }
  | { ok: false; error: string };

const MAX_QR_TEXT = 2000;

/**
 * create_open_design_qr_code: writes `<artifact-dir>/assets/<name>.svg` and lists
 * it in the manifest's supportingFiles. A QR code is generated data, not design,
 * which is why this tool may write it (qr-codes spec).
 */
export async function createArtifactQrCode(input: CreateQrCodeInput): Promise<CreateQrCodeResult> {
  if (!input.text || input.text.length > MAX_QR_TEXT) return { ok: false, error: `text must be 1–${MAX_QR_TEXT} characters.` };
  const errorCorrection = input.errorCorrection ?? 'M';
  if (!['L', 'M', 'Q', 'H'].includes(errorCorrection)) return { ok: false, error: 'errorCorrection must be one of L, M, Q, H.' };
  const margin = input.margin ?? 4;
  if (!(Number.isInteger(margin) && margin >= 0 && margin <= 16)) return { ok: false, error: 'margin must be an integer from 0 to 16 (modules of quiet zone; 4 is the standard).' };
  const stem = (input.name ?? 'qr').toLowerCase().replace(/\.svg$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'qr';

  let artifact;
  try {
    artifact = await readArtifact({ workspaceRoot: input.workspaceRoot, entryPath: input.entryPath });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (!artifact) return { ok: false, error: `No artifact entry file found at ${input.entryPath}.` };
  if (!artifact.manifest) return { ok: false, error: `${input.entryPath} isn't registered yet. Call register_open_design_artifact first, then create the QR code.` };

  const svg = await qrSvg(input.text, { errorCorrection, margin });
  const assetPath = `assets/${stem}.svg`;
  const entryDir = path.posix.dirname(input.entryPath.replace(/\\/g, '/'));
  const workspacePath = path.posix.join(entryDir, assetPath);
  await fs.mkdir(path.join(input.workspaceRoot, entryDir, 'assets'), { recursive: true });
  await fs.writeFile(path.join(input.workspaceRoot, workspacePath), `${svg}\n`, 'utf8');
  const supporting = Array.isArray(artifact.manifest.supportingFiles) ? (artifact.manifest.supportingFiles as string[]) : [];
  if (!supporting.includes(assetPath)) {
    await writeArtifactManifest({
      workspaceRoot: input.workspaceRoot,
      entryPath: input.entryPath,
      artifactManifest: { ...artifact.manifest, supportingFiles: [...supporting, assetPath] },
    });
  }
  return { ok: true, assetPath, workspacePath, svg, errorCorrection };
}

export function formatQrCodeResult(result: CreateQrCodeResult): string {
  if (!result.ok) return `QR code not created: ${result.error}`;
  const lines = [
    `Wrote ${result.workspacePath} (listed in the manifest's supportingFiles as ${result.assetPath}).`,
    '',
    'Paste this inline SVG into the design where the code goes. Size its container, not the SVG (it fills 100% of the width); keep it at least 20 mm (print) or 160 px (screen) wide, dark on a light background, with its white quiet zone intact:',
    '',
    result.svg,
    '',
    'Keep the data-od-qr attribute: export preflight decodes the rendered code and checks it matches.',
  ];
  if (result.errorCorrection !== 'H') lines.push('If a logo will sit on top of the code, regenerate it with errorCorrection "H" so it still scans.');
  return lines.join('\n');
}
