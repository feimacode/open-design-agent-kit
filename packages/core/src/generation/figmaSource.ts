// A Figma file as a design-system source (openspec
// add-design-system-from-figma). The host agent reads the file through
// Figma's MCP server — get_variable_defs maps, search_design_system items —
// and passes the raw replies here; this module does the deterministic part:
// normalising names and values, assigning roles, and reporting what it could
// not read. Pure: no network (the styles fallback takes a fetch function).

import { roleForName, fontStackFrom, colorToHex, emptyDraft, type SourceDraft } from './sourceExtraction';
import { parseFigmaUrl, firstSolidColor, FigmaApiError, type FigmaNode, type FigmaUrlRef } from './figmaPull';

export interface FigmaFrameInput {
  nodeId: string;
  name?: string;
  /** The frame's link, for the record. */
  link?: string;
  /** Figma's `get_variable_defs` reply for this frame: resolved name → value. */
  variables: Record<string, unknown>;
  /** The primary button's fill and text, when the agent read them directly. */
  fill?: string;
  text?: string;
}

export interface FigmaDesignSystemItem {
  name: string;
  collection?: string;
  scopes?: string[];
  description?: string;
  type?: string;
  modes?: string[];
}

/** Where a logo frame belongs in the design system, as brand.json's marks name it. */
export type FigmaLogoRole = 'logo' | 'logo-dark' | 'logo-on-dark' | 'icon' | 'touch-icon' | 'manifest-icon' | 'social';

export const FIGMA_LOGO_ROLES: readonly FigmaLogoRole[] = ['logo', 'logo-dark', 'logo-on-dark', 'icon', 'touch-icon', 'manifest-icon', 'social'];

/** A logo frame the agent exported from Figma (get_screenshot, or get_design_context's SVG URL). */
export interface FigmaLogoInput {
  role: FigmaLogoRole;
  /** The file name to save it as (e.g. "logo.svg"); also what the hosted gateway lists as needed. */
  name?: string;
  /** The file's bytes, base64. */
  data?: string;
  /** A workspace-relative file the agent already wrote. */
  path?: string;
  width?: number;
  height?: number;
  /** The background colour it was seen on, `#rrggbb`. */
  seenOn?: string;
}

/** A font family read from the file's variables. Figma has no font files, so these are always listed as needed. */
export interface FigmaFontInput {
  family: string;
  weights?: string[];
  source?: 'google' | 'adobe' | 'self-hosted' | 'system';
}

export const MAX_FIGMA_LOGOS = 8;
export const FIGMA_LOGO_MAX_BYTES = 1024 * 1024;

export interface FigmaSourceInput {
  kind: 'figma';
  /** The file link (or a bare file key). */
  file: string;
  /** The file key parsed from the link, when it parsed. */
  fileKey?: string;
  name?: string;
  frames?: FigmaFrameInput[];
  designSystem?: FigmaDesignSystemItem[];
  /** Read published styles through the REST API (local server with a token only). */
  styles?: boolean;
  /** Collections and modes the design-system search named. */
  modes?: Array<{ collection: string; modes: string[]; read?: string }>;
  /** Logo frames the agent exported (saved locally; listed as needed on the hosted gateway). */
  logos?: FigmaLogoInput[];
  /** Font families read from the file; their files are always listed as needed. */
  fonts?: FigmaFontInput[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Keys that are ids, not names: Figma node ids and variable ids. */
function usableName(key: string): boolean {
  const name = key.trim();
  if (!name) return false;
  if (/^\d+:\d+$/.test(name)) return false;
  if (/^variableid:/i.test(name)) return false;
  return true;
}

/** A variable value as a string: numbers as-is, `{ value }` unwrapped. */
function valueOf(raw: unknown): string | undefined {
  if (typeof raw === 'string') return raw.trim() || undefined;
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  if (isRecord(raw)) return valueOf(raw.value);
  return undefined;
}

/** The name inside `var(--x)`, or the value unchanged. */
function stripVar(value: string): string {
  const match = /^var\(\s*(--[^)\s]+)\s*\)$/.exec(value.trim());
  return match ? match[1] : value.trim();
}

/** A frame's variables with `var()` aliases resolved against the same map. */
function resolvedVariables(frames: FigmaFrameInput[]): Map<string, string> {
  const flat = new Map<string, string>();
  const put = (key: string, value: string) => {
    flat.set(key, value);
    if (key.startsWith('--')) flat.set(key.slice(2), value);
    else flat.set(`--${key}`, value);
  };
  for (const frame of frames) for (const [key, raw] of Object.entries(frame.variables ?? {})) {
    const value = valueOf(raw);
    if (value !== undefined) put(key, value);
  }
  for (const [key, value] of [...flat]) {
    const inner = stripVar(value);
    if (inner !== value) flat.set(key, stripVar(flat.get(inner) ?? flat.get(inner.replace(/^--/, '')) ?? inner));
  }
  return flat;
}

/** The payload of a source: flat on the object, or on `data`. */
function payloadOf(raw: Record<string, unknown>): Record<string, unknown> | undefined {
  const data = raw.data;
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data) as unknown;
      return isRecord(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  if (isRecord(data)) return data;
  return raw;
}

const isFrames = (raw: unknown): raw is unknown[] => Array.isArray(raw);

/** The file key from a Figma file link, or the key when "file" is one already. */
export function figmaFileKey(file: string): string | undefined {
  return parseFigmaUrl(file)?.fileKey ?? (/^[A-Za-z0-9]+$/.test(file) ? file : undefined);
}

/** Validates a `figma` source; returns an error message or the normalised source. */
export function validateFigmaSource(raw: unknown): { ok: true; source: FigmaSourceInput } | { ok: false; error: string } {
  if (!isRecord(raw)) return { ok: false, error: 'A figma source must be an object.' };
  if (raw.kind !== undefined && raw.kind !== 'figma') return { ok: false, error: 'A figma source needs kind: "figma".' };
  const payload = payloadOf(raw);
  if (!payload) return { ok: false, error: 'A figma source needs its payload as an object (or data as JSON).' };

  const file = typeof payload.file === 'string' ? payload.file.trim() : '';
  if (!file) return { ok: false, error: 'A figma source needs "file": the Figma file link.' };
  const fileKey = figmaFileKey(file);

  if (payload.frames !== undefined && !isFrames(payload.frames)) return { ok: false, error: '"frames" must be a list.' };
  const frames: FigmaFrameInput[] = [];
  for (const [i, entry] of (isFrames(payload.frames) ? payload.frames : []).entries()) {
    if (!isRecord(entry)) return { ok: false, error: `frames[${i}] must be an object.` };
    const nodeId = typeof entry.nodeId === 'string' ? entry.nodeId.trim() : '';
    if (!nodeId) return { ok: false, error: `frames[${i}] needs "nodeId": the frame's id (e.g. "12:345").` };
    if (!isRecord(entry.variables)) return { ok: false, error: `frames[${i}] needs "variables": the get_variable_defs reply as a name-to-value map.` };
    frames.push({
      nodeId,
      name: typeof entry.name === 'string' ? entry.name : undefined,
      link: typeof entry.link === 'string' ? entry.link : undefined,
      variables: entry.variables,
      fill: typeof entry.fill === 'string' ? entry.fill : undefined,
      text: typeof entry.text === 'string' ? entry.text : undefined,
    });
  }
  if (frames.length === 0 && payload.styles !== true) {
    return { ok: false, error: 'A figma source needs "frames" with variables (or styles: true to read published styles).' };
  }

  if (payload.designSystem !== undefined && !isFrames(payload.designSystem)) return { ok: false, error: '"designSystem" must be a list.' };
  const designSystem: FigmaDesignSystemItem[] = [];
  for (const [i, entry] of (isFrames(payload.designSystem) ? payload.designSystem : []).entries()) {
    if (!isRecord(entry) || typeof entry.name !== 'string' || !entry.name.trim()) return { ok: false, error: `designSystem[${i}] needs "name".` };
    designSystem.push({
      name: entry.name.trim(),
      collection: typeof entry.collection === 'string' ? entry.collection : undefined,
      scopes: Array.isArray(entry.scopes) ? entry.scopes.filter((s): s is string => typeof s === 'string') : undefined,
      description: typeof entry.description === 'string' ? entry.description : undefined,
      type: typeof entry.type === 'string' ? entry.type : undefined,
      modes: Array.isArray(entry.modes) ? entry.modes.filter((m): m is string => typeof m === 'string') : undefined,
    });
  }

  const modes: FigmaSourceInput['modes'] = [];
  for (const entry of isFrames(payload.modes) ? payload.modes : []) {
    if (!isRecord(entry) || typeof entry.collection !== 'string' || !Array.isArray(entry.modes)) continue;
    modes.push({
      collection: entry.collection,
      modes: entry.modes.filter((m): m is string => typeof m === 'string'),
      read: typeof entry.read === 'string' ? entry.read : undefined,
    });
  }

  if (payload.logos !== undefined && !isFrames(payload.logos)) return { ok: false, error: '"logos" must be a list.' };
  const logoEntries = isFrames(payload.logos) ? payload.logos : [];
  if (logoEntries.length > MAX_FIGMA_LOGOS) return { ok: false, error: `"logos" takes at most ${MAX_FIGMA_LOGOS} entries.` };
  const logos: FigmaLogoInput[] = [];
  for (const [i, entry] of logoEntries.entries()) {
    if (!isRecord(entry)) return { ok: false, error: `logos[${i}] must be an object.` };
    const role = typeof entry.role === 'string' ? entry.role.trim() : '';
    if (!(FIGMA_LOGO_ROLES as readonly string[]).includes(role)) return { ok: false, error: `logos[${i}].role must be one of: ${FIGMA_LOGO_ROLES.join(', ')}.` };
    const data = typeof entry.data === 'string' ? entry.data.trim() : undefined;
    const logoPath = typeof entry.path === 'string' ? entry.path.trim() : undefined;
    if (data && logoPath) return { ok: false, error: `logos[${i}] takes "data" or "path", not both.` };
    const name = typeof entry.name === 'string' ? entry.name.trim() : undefined;
    if (name && /[\\/]|\.\./.test(name)) return { ok: false, error: `logos[${i}].name must be a bare file name.` };
    if (logoPath && (/^([A-Za-z]:)?[\\/]/.test(logoPath) || logoPath.split(/[\\/]/).includes('..'))) {
      return { ok: false, error: `logos[${i}].path must stay inside the workspace.` };
    }
    if (data) {
      const bytes = base64Bytes(data);
      if (bytes === undefined) return { ok: false, error: `logos[${i}].data must be base64.` };
      if (bytes > FIGMA_LOGO_MAX_BYTES) return { ok: false, error: `logos[${i}] is over ${FIGMA_LOGO_MAX_BYTES / 1024 / 1024} MB.` };
    }
    const seenOn = typeof entry.seenOn === 'string' && /^#[0-9a-f]{6}$/i.test(entry.seenOn.trim()) ? entry.seenOn.trim().toLowerCase() : undefined;
    logos.push({
      role: role as FigmaLogoRole,
      name,
      data,
      path: logoPath,
      width: typeof entry.width === 'number' && entry.width > 0 ? entry.width : undefined,
      height: typeof entry.height === 'number' && entry.height > 0 ? entry.height : undefined,
      seenOn,
    });
  }

  if (payload.fonts !== undefined && !isFrames(payload.fonts)) return { ok: false, error: '"fonts" must be a list.' };
  const fonts: FigmaFontInput[] = [];
  for (const [i, entry] of (isFrames(payload.fonts) ? payload.fonts : []).entries()) {
    if (!isRecord(entry) || typeof entry.family !== 'string' || !entry.family.trim()) return { ok: false, error: `fonts[${i}] needs "family".` };
    const fontSource = typeof entry.source === 'string' ? entry.source : undefined;
    if (fontSource && !['google', 'adobe', 'self-hosted', 'system'].includes(fontSource)) {
      return { ok: false, error: `fonts[${i}].source must be one of: google, adobe, self-hosted, system.` };
    }
    fonts.push({
      family: entry.family.trim(),
      weights: Array.isArray(entry.weights) ? entry.weights.filter((w): w is string => typeof w === 'string') : undefined,
      source: fontSource as FigmaFontInput['source'],
    });
  }

  return {
    ok: true,
    source: {
      kind: 'figma',
      file,
      fileKey,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      frames,
      designSystem,
      styles: payload.styles === true,
      modes,
      logos,
      fonts,
    },
  };
}

/** A base64 payload's decoded size in bytes; undefined when it isn't base64 (a `data:` prefix is allowed). */
function base64Bytes(value: string): number | undefined {
  const body = value.replace(/^data:[^,]*;base64,/i, '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(body) || body.length % 4 === 1) return undefined;
  const padding = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0;
  return Math.floor((body.length * 3) / 4) - padding;
}

export function figmaSourceLabel(source: FigmaSourceInput): string {
  return source.name ?? `Figma ${source.fileKey ?? 'file'}`;
}

/** A logo the agent exported, as evidence.json and brand.json keep it. */
export interface FigmaLogoRecord {
  role: FigmaLogoRole;
  name?: string;
  /** Workspace-relative path in the extraction bundle, when it was saved. */
  path?: string;
  width?: number;
  height?: number;
  seenOn?: string;
}

/** What evidence.json and brand.json keep about a Figma draft: file link, frame links, logos, fonts, date. */
export interface FigmaSourceRecord {
  source: 'figma';
  file: string;
  fileKey?: string;
  name?: string;
  frames: Array<{ nodeId: string; name?: string; link?: string }>;
  /** Exported logos: saved into the bundle locally, listed as needed on the hosted gateway. */
  logos?: FigmaLogoRecord[];
  /** Font families read from the file; their files are listed as needed. */
  fonts?: FigmaFontInput[];
  readAt: string;
}

export function figmaSourceRecord(source: FigmaSourceInput, readAt = new Date().toISOString()): FigmaSourceRecord {
  const record: FigmaSourceRecord = {
    source: 'figma',
    file: source.file,
    fileKey: source.fileKey ?? figmaFileKey(source.file),
    name: source.name,
    frames: (source.frames ?? []).map((frame) => ({ nodeId: frame.nodeId, name: frame.name, link: frame.link })),
    readAt,
  };
  if (source.fonts?.length) record.fonts = source.fonts;
  return record;
}

export interface ComposeFigmaReadInstructionsInput {
  link: string;
  ref: FigmaUrlRef;
  /** A personal access token is configured on this host (the styles fallback is available). */
  tokenConfigured?: boolean;
  /** Running on the hosted gateway: no local token, and logos are listed rather than stored. */
  hosted?: boolean;
}

/**
 * What the agent must do to read a Figma file, after passing its link to
 * extract_open_design_design_system: check the connector, load Figma's
 * guidance, find the token frames, read their variables, read the
 * design-system index, export the logos, then call back with a figma source.
 * Nothing here contacts Figma.
 */
export function composeFigmaReadInstructions(input: ComposeFigmaReadInstructionsInput): string {
  const { ref, link } = input;
  const ids = ref.nodeId
    ? `\`fileKey: "${ref.fileKey}"\` and \`nodeId: "${ref.nodeId}"\``
    : `\`fileKey: "${ref.fileKey}"\``;
  const fallback = input.hosted
    ? 'If they would rather not connect it, ask for a screenshot of the file\'s foundations page and pass it as a `screenshot` source (the Figma link may stay in `url`; it is never opened). The hosted server cannot read the file itself, so don\'t call Figma\'s variables REST API, and don\'t guess the design from the link alone.'
    : input.tokenConfigured
      ? 'If they would rather not connect it, call again with the same `url` and `sources: [{ "kind": "figma", "file": "<the link>", "styles": true }]`: the local server reads the file\'s published fill and text styles with the access token this machine already has. Don\'t call Figma\'s variables REST API; only published styles are read that way.'
      : 'If they would rather not connect it: when this host has a Figma access token configured, call again with the same `url` and `sources: [{ "kind": "figma", "file": "<the link>", "styles": true }]` to read the published fill and text styles. Otherwise ask for a screenshot of the file\'s foundations page and pass it as a `screenshot` source (the Figma link may stay in `url`; it is never opened). Don\'t call Figma\'s variables REST API, and don\'t guess the design from the link alone.';
  const sourceOfReading = input.hosted ? 'read the file with the Figma connector' : 'read the file with the Figma connector (or a local access token)';
  const logoBytes = input.hosted
    ? 'This is the hosted server, so pass each logo\'s `role` and a `name` only: the design system lists them as needed, and the person attaches the files once it is saved.'
    : 'Pass each file\'s bytes as base64 `data`, or save it in the workspace and pass its relative `path`. Saving a design system from this bundle copies them into its `assets/`.';
  const logoData = input.hosted ? '' : ', "data": "<base64>"';

  return `# Read a Figma file's design system

You passed a Figma link to \`extract_open_design_design_system\`. Open Design doesn't contact Figma: ${sourceOfReading}, then call the tool again with the replies as a \`figma\` source.

## Step 1 — check the Figma connector

Call \`list_open_design_integrations\` with \`integration: "figma"\`, and check your own tools, including deferred ones you can search for, for \`get_metadata\`, \`get_variable_defs\` and \`search_design_system\`.

If they aren't there, offer to connect Figma once, using the setup steps the integrations list returned, and only after the person says yes. ${fallback}

## Step 2 — open a Figma session and load Figma's guidance

If your Figma tools include \`create_session\`, call it first with \`fileKey: "${ref.fileKey}"\` and a short task description (for example "Read this file's design-system variables"); Figma's server requires it before \`search_design_system\` and its other file tools. Pass the \`sessionId\` it returns on every later Figma call that takes one.

Then, as Figma requires: call \`get_figma_skill\` with \`uri: "skill://figma/figma-design-to-code/SKILL.md"\`.

## Step 3 — find the frames

Call \`get_metadata\` with ${ids}. The reply can be large: search it rather than reading it whole. Find:
- the token frames: names containing colour/color, tokens, foundations or styles; typography, type, text or font; spacing; radius or corner.
- the logo frames: logo or brand mark.
- the primary button: the component with button, btn or cta in its name, the primary variant.

${ref.nodeId ? `The link selects node ${ref.nodeId}; if that selection lacks the token frames, read the whole file's metadata with only the file key.` : 'The link names the whole file, so read the page that holds the foundations.'}

## Step 4 — read the variables

Call \`get_variable_defs\` once for each token frame and once for the primary button, with the same ids. The reply is a flat, resolved name-to-value map. Pass each reply under \`frames\` with the frame's \`nodeId\`, its \`name\` (keep it: the name says which role it plays) and its \`link\`. For the primary button also pass \`fill\` and \`text\` — its fill colour and the colour of the text on it — when you can see them.

## Step 5 — read the design-system index

Call \`search_design_system\` for the file's variable collections and pass what it returns under \`designSystem\`: each variable's \`name\`, \`collection\`, \`scopes\` and \`description\`, and each collection's \`modes\`. Scopes matter: they decide roles the names alone don't (a fill used for text is a text colour; a corner-radius variable is a radius).

## Step 6 — export the logos, name the fonts

For each logo frame from Step 3, read it with \`get_screenshot\` for a PNG, or take the SVG URL \`get_design_context\` returns. Pass them under \`logos\`, one entry per role — \`logo\`, \`logo-dark\`, \`logo-on-dark\`, \`icon\`, \`touch-icon\`, \`manifest-icon\` or \`social\` — up to ${MAX_FIGMA_LOGOS}, each under ${FIGMA_LOGO_MAX_BYTES / 1024 / 1024} MB. ${logoBytes}

The type variables name font families, but Figma holds no font files: pass each family under \`fonts\` with its \`weights\` when the type styles give them. Font files are always listed as needed, with a free match named when one exists.

## Step 7 — call back

Call \`extract_open_design_design_system\` again with the same \`url\` and a \`figma\` source:

\`\`\`json
{
  "url": ${JSON.stringify(link)},
  "sources": [{
    "kind": "figma",
    "file": ${JSON.stringify(link)},
    "name": "<the file's name>",
    "frames": [{ "nodeId": "12:345", "name": "Foundations / Color", "variables": { "color/bg/default": "#FFFFFF" } }],
    "designSystem": [{ "name": "color/bg/default", "collection": "Theme", "scopes": ["FRAME_FILL"], "description": "Page background" }],
    "logos": [{ "role": "logo", "name": "acme-logo.svg"${logoData} }],
    "fonts": [{ "family": "Inter", "weights": ["400", "600"] }]
  }]
}
\`\`\`

Pass the replies as they came: don't rename variables, invent values or fill gaps. Say which mode you read when the search named several; the draft reports the modes and collections that weren't read. The tool returns the draft token set with its roles, confidence, conflicts and a review page.`;
}


/** A px value as a number ("16", "16px", 16.5); undefined for anything else. */
function parsePx(value: string): number | undefined {
  const match = /^(-?\d+(?:\.\d+)?)(px)?$/.exec(value.trim());
  return match ? Number(match[1]) : undefined;
}

/** The dasherised, lower-case form of a Figma name, for pattern matching. */
function nameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

const SPACE_BY_PX = new Map<number, string>([
  [4, '--space-1'],
  [8, '--space-2'],
  [12, '--space-3'],
  [16, '--space-4'],
  [20, '--space-5'],
  [24, '--space-6'],
  [32, '--space-8'],
  [48, '--space-12'],
]);

const SPACE_STEPS = new Set(['1', '2', '3', '4', '5', '6', '8', '12']);

const TYPE_TIER = /(?:^|-)(2xl|3xl|4xl|xs|sm|base|md|lg|xl)(?:$|-)/i;

function typeTierRole(name: string): string | undefined {
  const match = TYPE_TIER.exec(nameKey(name));
  if (!match) return undefined;
  const tier = match[1].toLowerCase() === 'md' ? 'base' : match[1].toLowerCase();
  return `--text-${tier}`;
}

function fontSizeRole(name: string, px: number | undefined): string | undefined {
  const named = typeTierRole(name);
  if (named) return named;
  if (px === undefined) return undefined;
  if (px <= 12) return '--text-xs';
  if (px <= 14) return '--text-sm';
  if (px <= 16) return '--text-base';
  if (px <= 20) return '--text-lg';
  if (px <= 24) return '--text-xl';
  if (px <= 32) return '--text-2xl';
  if (px <= 40) return '--text-3xl';
  return '--text-4xl';
}

function lineHeightRole(name: string, value: string): string | undefined {
  const n = nameKey(name);
  if (/tight|heading|display|title/.test(n)) return '--leading-tight';
  if (/body|text|reading|base|default|paragraph/.test(n)) return '--leading-body';
  return Number(value) >= 1.6 ? '--leading-body' : '--leading-tight';
}

function radiusRole(name: string, px: number | undefined): string | undefined {
  const n = nameKey(name);
  if (/pill|full|round/.test(n)) return '--radius-pill';
  if (/(?:^|-)sm(?:$|-)/.test(n)) return '--radius-sm';
  if (/(?:^|-)lg(?:$|-)/.test(n)) return '--radius-lg';
  if (/(?:^|-)(md|base|default|medium)(?:$|-)/.test(n)) return '--radius-md';
  if (px === undefined) return undefined;
  if (px >= 100) return '--radius-pill';
  if (px <= 8) return '--radius-sm';
  if (px <= 16) return '--radius-md';
  return '--radius-lg';
}

function spacingRole(name: string, px: number | undefined): string | undefined {
  const named = /(?:space|spacing|gap)[-/](\d+)$/.exec(nameKey(name));
  if (named && SPACE_STEPS.has(named[1])) return `--space-${named[1]}`;
  return px !== undefined ? SPACE_BY_PX.get(px) : undefined;
}

function textFillRole(name: string): string {
  const n = nameKey(name);
  if (/muted|tertiary|hint|placeholder|disabled/.test(n)) return '--muted';
  if (/secondary|subtle|subdued/.test(n)) return '--fg-2';
  return '--fg';
}

function fillRole(name: string): string | undefined {
  const n = nameKey(name);
  if (/surface|card|panel|elevated|container/.test(n)) return '--surface';
  if (/background|canvas|page|base|bg/.test(n)) return '--bg';
  return undefined;
}

function strokeRole(name: string): string {
  return /soft|subtle/.test(nameKey(name)) ? '--border-soft' : '--border';
}

/** The roles a variable's Figma scopes assign, for its name and value. */
function scopeRoles(scopes: string[] | undefined, name: string, value: string): string[] {
  const roles: string[] = [];
  const px = parsePx(value);
  for (const raw of scopes ?? []) {
    const scope = raw.toUpperCase();
    if (scope === 'TEXT_FILL') roles.push(textFillRole(name));
    else if (scope === 'FRAME_FILL' || scope === 'SHAPE_FILL' || scope === 'ALL_FILLS') {
      const role = fillRole(name);
      if (role) roles.push(role);
    } else if (scope === 'STROKE_COLOR') roles.push(strokeRole(name));
    else if (scope === 'CORNER_RADIUS') {
      const role = radiusRole(name, px);
      if (role) roles.push(role);
    } else if (scope === 'GAP' || scope === 'WIDTH_HEIGHT') {
      const role = spacingRole(name, px);
      if (role) roles.push(role);
    } else if (scope === 'FONT_FAMILY') {
      const role = roleForName(name, 'font');
      if (role) roles.push(role);
    } else if (scope === 'FONT_SIZE') {
      const role = fontSizeRole(name, px);
      if (role) roles.push(role);
    } else if (scope === 'LINE_HEIGHT') {
      const role = lineHeightRole(name, value);
      if (role) roles.push(role);
    }
  }
  return roles;
}

/** Roles from a variable's name alone, for values that aren't colours. */
function nameNumberRoles(name: string, value: string): string[] {
  const n = nameKey(name);
  const px = parsePx(value);
  const roles: string[] = [];
  if (/radius|corner|rounded/.test(n)) {
    const role = radiusRole(name, px);
    if (role) roles.push(role);
  }
  if (/space|spacing|gap/.test(n)) {
    const role = spacingRole(name, px);
    if (role) roles.push(role);
  }
  if (/font-?size|text-?size|type-?size|type-?scale/.test(n)) {
    const role = fontSizeRole(name, px);
    if (role) roles.push(role);
  }
  if (/line-?height|leading/.test(n)) {
    const role = lineHeightRole(name, value);
    if (role) roles.push(role);
  }
  return roles;
}

/** px for lengths, the value unchanged for line-heights. */
function lengthValue(value: string): string {
  const px = parsePx(value);
  return px === undefined ? value : `${px}px`;
}

/** A line height as written: unitless when it already is a ratio, px otherwise. */
function lineHeightValue(value: string): string {
  const n = parsePx(value);
  if (n === undefined) return value;
  return !/px$/i.test(value.trim()) && n <= 4 ? String(n) : `${n}px`;
}

/**
 * Figma line heights are usually px ("24"), but --leading-* is a ratio applied at
 * every text size: a fixed 24px would overlap lines on larger text. A px value is
 * divided by the size it belongs with (body by --text-base, tight by the largest
 * drafted heading size); with no such size, or an implausible ratio, it is left
 * out with a note (candidates are colours only).
 */
function leadingAsRatios(draft: SourceDraft): void {
  const sizeOf = (token: string) => {
    const value = draft.tokens[token]?.value;
    return value === undefined ? undefined : parsePx(value);
  };
  const pairs: Array<[string, string[]]> = [
    ['--leading-body', ['--text-base']],
    ['--leading-tight', ['--text-4xl', '--text-3xl', '--text-2xl', '--text-xl']],
  ];
  for (const [role, sizes] of pairs) {
    const token = draft.tokens[role];
    if (!token || !/px$/i.test(token.value)) continue;
    const px = parsePx(token.value)!;
    const sizeToken = sizes.find((size) => sizeOf(size) !== undefined);
    const size = sizeToken ? sizeOf(sizeToken) : undefined;
    const ratio = size ? Math.round((px / size) * 100) / 100 : undefined;
    if (ratio !== undefined && ratio >= 0.9 && ratio <= 2.5) {
      draft.tokens[role] = { ...token, value: String(ratio) };
      draft.notes.push(`${role} is ${token.value} in Figma ("${token.where}"); drafted as ${ratio}, its ratio to ${sizeToken} (${size}px).`);
    } else {
      delete draft.tokens[role];
      draft.notes.push(`${role} is ${token.value} in Figma ("${token.where}") with no matching font size to turn it into a ratio, so it is left out; set it by hand as a unitless ratio.`);
    }
  }
}

/** Notes for the collections and modes the design-system search named. */
function oneModeNotes(source: FigmaSourceInput, frameKeys: Set<string>): string[] {
  interface Collection { name: string; modes: string[]; read?: string; touched: boolean; }
  const collections = new Map<string, Collection>();
  const noteCollection = (name: string, modes?: string[], read?: string) => {
    const key = name.toLowerCase();
    const collection = collections.get(key) ?? { name, modes: [], read: undefined, touched: false };
    if (modes?.length) collection.modes = modes;
    if (read) collection.read = read;
    collections.set(key, collection);
  };
  for (const entry of source.modes ?? []) noteCollection(entry.collection, entry.modes, entry.read);
  for (const item of source.designSystem ?? []) {
    if (item.modes?.length) {
      noteCollection(item.name, item.modes);
      continue;
    }
    if (item.collection) {
      noteCollection(item.collection);
      if (frameKeys.has(nameKey(item.name))) {
        const collection = collections.get(item.collection.toLowerCase());
        if (collection) collection.touched = true;
      }
    }
  }
  const notes: string[] = [];
  const unread: string[] = [];
  for (const collection of collections.values()) {
    if (collection.modes.length === 0) {
      if (!collection.touched) unread.push(collection.name);
      continue;
    }
    const read = collection.read ?? collection.modes[0];
    const rest = collection.modes.filter((mode) => mode !== read);
    if (rest.length) notes.push(`Read one mode per collection: ${collection.name} ${read}. Not read: ${rest.join(', ')}.`);
  }
  if (unread.length) notes.push(`Other collections not read: ${unread.join(', ')}.`);
  return notes;
}

/**
 * A Figma source as a draft: every value declared, roles from variable names
 * and Figma scopes, and the primary button's fill for the accent when nothing
 * is named primary. Values with no role stay candidates; keys that aren't
 * names are skipped and listed.
 */
export function parseFigmaSource(source: FigmaSourceInput): SourceDraft {
  const draft = emptyDraft(figmaSourceLabel(source), 'declared');
  const frames = source.frames ?? [];
  const values = resolvedVariables(frames);
  const skipped: string[] = [];
  const seenCandidates = new Set<string>();
  const scopesByName = new Map<string, string[]>();
  for (const item of source.designSystem ?? []) {
    if (item.scopes?.length) scopesByName.set(nameKey(item.name), item.scopes);
  }

  const add = (token: string, value: string, where: string) => {
    if (!value || draft.tokens[token]) return;
    draft.tokens[token] = { value, where };
  };
  const addCandidate = (value: string, label: string) => {
    const key = `${value} ${label}`;
    if (seenCandidates.has(key)) return;
    seenCandidates.add(key);
    draft.candidates.push({ value, label });
  };

  for (const frame of frames) {
    for (const [key, raw] of Object.entries(frame.variables ?? {})) {
      if (!usableName(key)) {
        skipped.push(key);
        continue;
      }
      const given = valueOf(raw);
      if (given === undefined) {
        skipped.push(key);
        continue;
      }
      const value = stripVar(given);
      const resolved = values.get(stripVar(key)) ?? values.get(key) ?? value;
      const scopes = scopesByName.get(nameKey(key));
      const hex = colorToHex(resolved);
      if (hex) {
        const role = roleForName(key) ?? scopeRoles(scopes, key, resolved)[0];
        if (role) add(role, hex, key);
        else addCandidate(hex, key);
        continue;
      }
      const px = parsePx(resolved);
      if (px !== undefined) {
        for (const role of [...nameNumberRoles(key, resolved), ...scopeRoles(scopes, key, resolved)]) {
          add(role, role.startsWith('--leading-') ? lineHeightValue(resolved) : lengthValue(resolved), key);
        }
        continue;
      }
      const fontRole = roleForName(key, 'font') ?? scopeRoles(scopes, key, resolved).find((role) => role.startsWith('--font-'));
      if (fontRole) {
        const stack = fontStackFrom(resolved);
        if (stack) add(fontRole, stack, key);
      }
    }
  }

  leadingAsRatios(draft);

  // The button carries the accent even when no variable is named "primary".
  const buttons = frames.filter((frame) => /button|btn|cta/i.test(frame.name ?? ''));
  const button = buttons.find((frame) => /primary/i.test(frame.name ?? '')) ?? buttons[0];
  if (button && !draft.tokens['--accent']) {
    const entries = Object.entries(button.variables ?? {})
      .map(([key, raw]) => [key, valueOf(raw)] as const)
      .map(([key, value]) => [key, value === undefined ? undefined : colorToHex(stripVar(value))] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1]));
    const explicit = (name: string | undefined): readonly [string, string] | undefined => {
      if (!name) return undefined;
      const direct = colorToHex(name);
      if (direct) return [name, direct] as const;
      const value = values.get(name) ?? values.get(stripVar(name)) ?? values.get(`--${name}`);
      const hex = value && colorToHex(value);
      return hex ? ([name, hex] as const) : undefined;
    };
    const fill =
      explicit(button.fill) ??
      entries.find(([key]) => /fill|bg|background|brand|primary|accent/i.test(key)) ??
      entries[0];
    const text =
      explicit(button.text) ??
      entries.find(([key]) => /text|fg|foreground|label|on-primary|content/i.test(key) && key !== fill?.[0]);
    if (fill) {
      add('--accent', fill[1], fill[0]);
      draft.notes.push(`The accent came from ${button.name ? `the "${button.name}"` : 'the primary button'}'s fill ("${fill[0]}"): no variable is named primary or accent.`);
      const index = draft.candidates.findIndex((candidate) => candidate.label === fill[0] && candidate.value === fill[1]);
      if (index >= 0) draft.candidates.splice(index, 1);
    }
    if (text && !draft.tokens['--accent-on']) add('--accent-on', text[1], text[0]);
  }

  const frameKeys = new Set(frames.flatMap((frame) => Object.keys(frame.variables ?? {}).map(nameKey)));
  draft.notes.push('Aliases arrive from Figma as resolved values; the draft records the value, not the alias.');
  draft.notes.push(...oneModeNotes(source, frameKeys));

  if (skipped.length) draft.notes.push(`Skipped ${skipped.length} entr${skipped.length === 1 ? 'y' : 'ies'} that isn't a variable name: ${skipped.slice(0, 6).join(', ')}${skipped.length > 6 ? '…' : ''}.`);
  return draft;
}

export interface FigmaStyleMeta {
  key: string;
  name: string;
  style_type: string;
  description?: string;
  node_id?: string;
}

/** The `/styles` and `/nodes` REST replies, combined. */
export interface FigmaStylesReply {
  styles: FigmaStyleMeta[];
  nodes?: Record<string, FigmaNode>;
}

/**
 * A draft from the file's published styles, for when Figma isn't connected
 * and only a REST token is available. Styles are `declared`; fills are
 * candidates named from the style, since a published style name doesn't say
 * which Open Design role it plays.
 */
export function parseFigmaStyles(reply: FigmaStylesReply, name?: string): SourceDraft {
  const draft = emptyDraft(name ?? 'Figma styles', 'declared');
  const seen = new Set<string>();
  const unmapped: string[] = [];
  for (const style of reply.styles) {
    const node = style.node_id ? reply.nodes?.[style.node_id] : undefined;
    if (style.style_type === 'FILL') {
      const hex = firstSolidColor(node?.fills);
      if (hex) {
        const key = `${hex} ${style.name}`;
        if (!seen.has(key)) {
          seen.add(key);
          draft.candidates.push({ value: hex, label: style.name });
        }
      } else {
        draft.notes.push(`Fill style "${style.name}" has no solid colour in the reply.`);
      }
      continue;
    }
    if (style.style_type === 'TEXT') {
      const text = node?.style;
      if (!text) {
        draft.notes.push(`Text style "${style.name}" has no type details in the reply.`);
        continue;
      }
      const parts = [
        text.fontFamily,
        text.fontSize === undefined ? undefined : `${text.fontSize}px`,
        text.fontWeight === undefined ? undefined : `weight ${text.fontWeight}`,
        text.lineHeightPx === undefined ? undefined : `${text.lineHeightPx}px line height`,
      ].filter((part): part is string => Boolean(part));
      draft.notes.push(`Text style "${style.name}": ${parts.join(', ')}.`);
      continue;
    }
    unmapped.push(style.name);
  }
  if (unmapped.length) draft.notes.push(`Effect styles are not mapped: ${unmapped.join(', ')}.`);
  draft.notes.push('Published styles only: variables, scopes and modes were not read.');
  return draft;
}

/** Reads `/v1/files/:key/styles`, then the style nodes' paints and text styles. */
export async function fetchFigmaStyles(fileKey: string, token: string, fetchImpl: typeof fetch = fetch): Promise<FigmaStylesReply> {
  const stylesResponse = await fetchImpl(`https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}/styles`, {
    headers: { 'X-Figma-Token': token },
  });
  if (!stylesResponse.ok) {
    throw new FigmaApiError(`Figma API responded with HTTP ${stylesResponse.status} while listing published styles.`);
  }
  const stylesBody = (await stylesResponse.json()) as { meta?: { styles?: FigmaStyleMeta[] } };
  const styles = (stylesBody.meta?.styles ?? []).filter((style) => style && typeof style.name === 'string' && typeof style.style_type === 'string');
  const ids = [...new Set(styles.map((style) => style.node_id).filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return { styles, nodes: {} };

  const nodesResponse = await fetchImpl(
    `https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}/nodes?ids=${encodeURIComponent(ids.join(','))}`,
    { headers: { 'X-Figma-Token': token } },
  );
  if (!nodesResponse.ok) {
    throw new FigmaApiError(`Figma API responded with HTTP ${nodesResponse.status} while reading style nodes.`);
  }
  const nodesBody = (await nodesResponse.json()) as { nodes?: Record<string, { document?: FigmaNode }> };
  const nodes: Record<string, FigmaNode> = {};
  for (const [id, entry] of Object.entries(nodesBody.nodes ?? {})) {
    if (entry.document) nodes[id] = entry.document;
  }
  return { styles, nodes };
}
