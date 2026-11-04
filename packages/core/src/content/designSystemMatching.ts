// Design system matching (openspec add-design-system-matching): the agent
// turns the conversation into a small design profile; this module ranks the
// catalog against it, deterministically. Facets that tokens can answer
// (theme, accent, display type, corner shape) are computed from each
// system's tokens; what tokens can't say (moods, industries, surfaces,
// brand vs genre) comes from the curated design-system-descriptors.json.
// Pure helpers plus the descriptor loader; ContentIndex wires them up.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { parseTokensCss, resolveDesignSystemTokens, resolveTokenValue } from '../generation/designSystemTokens';
import type { DesignSystemDetail } from './contentIndex';

export const DESIGN_MOODS = ['minimal', 'calm', 'warm', 'friendly', 'playful', 'bold', 'premium', 'elegant', 'technical', 'editorial', 'retro', 'futuristic', 'corporate', 'artistic', 'romantic'] as const;
export const DESIGN_INDUSTRIES = ['saas', 'developer', 'ai', 'finance', 'commerce', 'consumer', 'media', 'editorial', 'brand', 'creative', 'dashboard', 'enterprise', 'wellness', 'education', 'automotive', 'travel', 'food', 'social', 'gaming', 'dating'] as const;
export const DESIGN_SURFACES = ['web', 'mobile', 'slides', 'document', 'dashboard'] as const;
export const DESIGN_THEMES = ['light', 'dark', 'either'] as const;
export const DESCRIPTORS_FILE = 'design-system-descriptors.json';

export type DesignMood = (typeof DESIGN_MOODS)[number];
export type DesignIndustry = (typeof DESIGN_INDUSTRIES)[number];
export type DesignSurface = (typeof DESIGN_SURFACES)[number];

export interface DesignSystemDescriptor {
  kind: 'brand' | 'genre';
  moods: string[];
  industries: string[];
  surfaces: string[];
}

export type AccentFamily = 'neutral' | 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'violet' | 'pink';

export interface DesignSystemFacets {
  theme: 'light' | 'dark';
  /** The accent as written in the tokens (after var() resolution), when it parsed as a color. */
  accent?: string;
  accentFamily?: AccentFamily;
  /** 0 (gray) to 1 (fully saturated). */
  accentChroma?: number;
  display: 'serif' | 'sans' | 'mono';
  /** First family of --font-display, unquoted. */
  displayFont?: string;
  shape: 'sharp' | 'soft' | 'round';
}

/** What the agent knows about the design. Every field is optional. */
export interface DesignProfile {
  industries?: string[];
  moods?: string[];
  theme?: string;
  surface?: string;
  /** Products or sites it should feel like ("Stripe", "notion"). */
  likeBrands?: string[];
  /** Design system ids or moods to leave out. */
  avoid?: string[];
  /** The request in the person's words; scored as a light keyword fallback. */
  brief?: string;
}

export interface MatchQuestion {
  id: 'purpose' | 'feel' | 'theme' | 'likeBrand';
  question: string;
  /** Short options to offer; absent for the free-text question. Each maps to a profile value. */
  options?: Array<{ label: string; value: string }>;
  /** The profile field an answer fills. */
  fills: keyof DesignProfile;
}

export interface Recommendation {
  id: string;
  name: string;
  category?: string;
  kind: 'brand' | 'genre';
  reason: string;
  facets: DesignSystemFacets;
}

export interface RecommendationResult {
  recommendations: Recommendation[];
  confidence: 'high' | 'medium' | 'low';
  /** Present only when the profile is thin and confidence is low: ask these once, in one message. */
  questions?: MatchQuestion[];
  /** Profile values outside the vocabularies, ignored. */
  ignored?: string[];
}

export interface MatchCandidate {
  detail: DesignSystemDetail;
  facets: DesignSystemFacets;
  descriptor?: DesignSystemDescriptor;
}

// ---- Descriptors ----------------------------------------------------------

export async function loadDesignSystemDescriptors(assetsRoot: string): Promise<Map<string, DesignSystemDescriptor>> {
  const out = new Map<string, DesignSystemDescriptor>();
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(path.join(assetsRoot, DESCRIPTORS_FILE), 'utf8'));
  } catch {
    return out;
  }
  const systems = raw && typeof raw === 'object' ? (raw as { systems?: unknown }).systems : undefined;
  if (!systems || typeof systems !== 'object') return out;
  for (const [id, value] of Object.entries(systems as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const row = value as Record<string, unknown>;
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    out.set(id, { kind: row.kind === 'brand' ? 'brand' : 'genre', moods: list(row.moods), industries: list(row.industries), surfaces: list(row.surfaces) });
  }
  return out;
}

// ---- Facets ---------------------------------------------------------------

/** sRGB 0–1 triple from a hex, rgb()/rgba() or oklch() value; undefined for anything else. */
export function parseColor(value: string): { rgb?: [number, number, number]; oklch?: [number, number, number] } | undefined {
  const v = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})\b/.exec(v);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((c) => c + c).join('');
    if (h.length < 6) return undefined;
    return { rgb: [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number] };
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(v);
  if (rgb) return { rgb: [rgb[1], rgb[2], rgb[3]].map((n) => Math.min(1, Number(n) / 255)) as [number, number, number] };
  const ok = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/.exec(v);
  if (ok) {
    const l = ok[2] === '%' ? Number(ok[1]) / 100 : Number(ok[1]);
    return { oklch: [l, Number(ok[3]), Number(ok[4])] };
  }
  return undefined;
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function hueLightChroma(color: NonNullable<ReturnType<typeof parseColor>>): { hue: number; light: number; chroma: number } {
  if (color.oklch) {
    const [l, c, h] = color.oklch;
    return { hue: h, light: l, chroma: Math.min(1, c / 0.25) };
  }
  const [r, g, b] = color.rgb!;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { hue: 0, light, chroma: 0 };
  let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue = (hue * 60 + 360) % 360;
  const sat = d / (1 - Math.abs(2 * light - 1));
  // Saturation alone overrates near-black/near-white tints; scale by distance from the extremes.
  return { hue, light, chroma: Math.min(1, sat * Math.min(1, light * 4, (1 - light) * 4)) };
}

function accentFamily(hue: number, chroma: number, light: number): AccentFamily {
  if (chroma < 0.15 || light < 0.1 || light > 0.95) return 'neutral';
  if (hue < 15 || hue >= 340) return 'red';
  if (hue < 45) return 'orange';
  if (hue < 70) return 'yellow';
  if (hue < 165) return 'green';
  if (hue < 200) return 'teal';
  if (hue < 255) return 'blue';
  if (hue < 290) return 'violet';
  return 'pink';
}

const SERIF_HINT = /georgia|garamond|times|playfair|charter|iowan|baskerville|fraunces|didot|cormorant|bodoni|newsreader|lora|merriweather|tiempos|canela|caslon|instrument serif|dm serif|source serif|noto serif|crimson|libre caslon|nastaliq/;

function displayClass(fontStack: string): { display: DesignSystemFacets['display']; displayFont?: string } {
  const families = fontStack.split(',').map((f) => f.trim().replace(/^['"]|['"]$/g, ''));
  const first = families[0] ?? '';
  const low = first.toLowerCase();
  if (/mono|courier|code|terminal|pixel|press start/.test(low)) return { display: 'mono', displayFont: first || undefined };
  const last = (families[families.length - 1] ?? '').toLowerCase();
  const serif = SERIF_HINT.test(low) || (/serif/.test(low) && !/sans/.test(low)) || (last === 'serif' && !/sans/.test(low) && families.length <= 3);
  return { display: serif ? 'serif' : 'sans', displayFont: first || undefined };
}

function pxOf(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const m = /([\d.]+)\s*(px|rem|em)?/.exec(value);
  if (!m) return undefined;
  const n = Number(m[1]);
  return m[2] === 'rem' || m[2] === 'em' ? n * 16 : n;
}

/** Facets from a design system's resolved tokens (tokens.css, its override, else DESIGN.md heuristics). */
export function computeDesignSystemFacets(detail: Pick<DesignSystemDetail, 'body' | 'tokensCss' | 'tokensOverrideCss'>): DesignSystemFacets {
  const tokens = detail.tokensCss
    ? new Map([...parseTokensCss(detail.tokensCss), ...(detail.tokensOverrideCss ? parseTokensCss(detail.tokensOverrideCss) : [])])
    : resolveDesignSystemTokens({ designMd: detail.body, tokensCss: undefined }).tokens;
  const get = (name: string) => resolveTokenValue(tokens, name);

  const bg = parseColor(get('--bg') ?? '');
  let theme: DesignSystemFacets['theme'] = 'light';
  if (bg?.rgb) theme = relativeLuminance(bg.rgb) < 0.2 ? 'dark' : 'light';
  else if (bg?.oklch) theme = bg.oklch[0] < 0.5 ? 'dark' : 'light';

  const accentValue = get('--accent');
  const accent = accentValue ? parseColor(accentValue) : undefined;
  let family: AccentFamily | undefined;
  let chroma: number | undefined;
  if (accent) {
    const hlc = hueLightChroma(accent);
    family = accentFamily(hlc.hue, hlc.chroma, hlc.light);
    chroma = Math.round(hlc.chroma * 100) / 100;
  }

  const radius = pxOf(get('--radius-md')) ?? pxOf(get('--radius'));
  const shape: DesignSystemFacets['shape'] = radius === undefined ? 'soft' : radius <= 2 ? 'sharp' : radius <= 8 ? 'soft' : 'round';

  return { theme, accent: accent ? accentValue : undefined, accentFamily: family, accentChroma: chroma, ...displayClass(get('--font-display') ?? ''), shape };
}

// ---- Ranking --------------------------------------------------------------

/** What a mood implies about facets, so a system without a curated mood tag can still fit. */
const MOOD_FACETS: Record<DesignMood, (f: DesignSystemFacets) => boolean> = {
  minimal: (f) => f.accentFamily === 'neutral' || (f.accentChroma ?? 1) < 0.5,
  calm: (f) => (f.accentChroma ?? 1) < 0.6 && f.shape !== 'sharp',
  warm: (f) => f.accentFamily === 'orange' || f.accentFamily === 'red' || f.accentFamily === 'yellow',
  friendly: (f) => f.shape === 'round',
  playful: (f) => f.shape === 'round' && (f.accentChroma ?? 0) >= 0.5,
  bold: (f) => (f.accentChroma ?? 0) >= 0.6,
  premium: (f) => f.theme === 'dark' || f.display === 'serif',
  elegant: (f) => f.display === 'serif',
  technical: (f) => f.display === 'mono' || f.shape !== 'round',
  editorial: (f) => f.display === 'serif',
  retro: (f) => f.display === 'mono' || f.display === 'serif',
  futuristic: (f) => f.theme === 'dark',
  corporate: (f) => f.display === 'sans' && f.shape !== 'round',
  artistic: (f) => (f.accentChroma ?? 0) >= 0.5,
  romantic: (f) => f.accentFamily === 'pink' || (f.display === 'serif' && (f.accentFamily === 'red' || f.accentFamily === 'orange')),
};

/** Shown when the profile gives nothing to go on: `default` first, then deliberately different starters. */
export const FALLBACK_DESIGN_SYSTEMS = ['default', 'minimal', 'warm-editorial', 'tom-modern', 'neobrutalism'];

const WEIGHTS = { moods: 0.35, industries: 0.3, facets: 0.15, brief: 0.1, surface: 0.1 };
const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'make', 'build', 'create', 'design', 'page', 'site', 'website', 'want', 'like', 'feel', 'look', 'some', 'our', 'your', 'my', 'new', 'please', 'an', 'of', 'to', 'in', 'on', 'it', 'is', 'we', 'me', 'us', 'or', 'by', 'at']);

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function words(s: string | undefined): string[] {
  return (s ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}

function cleanList<T extends string>(values: string[] | undefined, vocab: readonly T[], field: string, ignored: string[]): T[] {
  const out: T[] = [];
  for (const raw of values ?? []) {
    const v = raw.trim().toLowerCase();
    if (!v) continue;
    if ((vocab as readonly string[]).includes(v)) {
      if (!out.includes(v as T)) out.push(v as T);
    } else ignored.push(`${field}: ${raw}`);
  }
  return out;
}

/** Brand ids that are also everyday words, so a brief only names them through likeBrands ("a clay-toned palette" is not Clay). */
const AMBIGUOUS_BRAND_WORDS = new Set(['arc', 'cal', 'clay', 'loom', 'meta', 'wise', 'warp', 'expo', 'square', 'notion']);

/** True when a product name or id in `names` refers to this system ("Stripe" → stripe, "Spotify" → spotify and spotify-ios). */
function namesSystem(names: string[], c: MatchCandidate): boolean {
  const id = norm(c.detail.id.replace(/-ios$/, ''));
  const name = norm(c.detail.name.replace(/^design system inspired by /i, ''));
  return names.some((n) => {
    const k = norm(n);
    return k.length >= 2 && (k === id || k === name || k === norm(c.detail.id));
  });
}

export interface NormalizedProfile {
  industries: DesignIndustry[];
  moods: DesignMood[];
  theme?: 'light' | 'dark' | 'either';
  surface?: DesignSurface;
  likeBrands: string[];
  avoid: string[];
  brief?: string;
  ignored: string[];
}

export function normalizeDesignProfile(profile: DesignProfile | undefined): NormalizedProfile {
  const ignored: string[] = [];
  const p = profile ?? {};
  const theme = p.theme?.trim().toLowerCase();
  const surface = p.surface?.trim().toLowerCase();
  if (theme && !(DESIGN_THEMES as readonly string[]).includes(theme)) ignored.push(`theme: ${p.theme}`);
  if (surface && !(DESIGN_SURFACES as readonly string[]).includes(surface)) ignored.push(`surface: ${p.surface}`);
  return {
    industries: cleanList(p.industries, DESIGN_INDUSTRIES, 'industries', ignored),
    moods: cleanList(p.moods, DESIGN_MOODS, 'moods', ignored),
    theme: theme && (DESIGN_THEMES as readonly string[]).includes(theme) ? (theme as NormalizedProfile['theme']) : undefined,
    surface: surface && (DESIGN_SURFACES as readonly string[]).includes(surface) ? (surface as DesignSurface) : undefined,
    likeBrands: (p.likeBrands ?? []).map((b) => b.trim()).filter(Boolean),
    avoid: (p.avoid ?? []).map((a) => a.trim().toLowerCase()).filter(Boolean),
    brief: p.brief?.trim() || undefined,
    ignored,
  };
}

/** How many profile fields carry a signal (brief and avoid don't count: they refine, they don't steer). */
export function profileSignalCount(p: NormalizedProfile): number {
  return [p.industries.length > 0, p.moods.length > 0, p.theme !== undefined, p.surface !== undefined, p.likeBrands.length > 0].filter(Boolean).length;
}

export function matchQuestions(p: NormalizedProfile): MatchQuestion[] {
  const out: MatchQuestion[] = [];
  if (p.industries.length === 0) {
    out.push({
      id: 'purpose',
      question: 'What is it for?',
      fills: 'industries',
      options: [
        { label: 'A product or SaaS', value: 'saas' },
        { label: 'A developer tool', value: 'developer' },
        { label: 'An AI product', value: 'ai' },
        { label: 'Finance', value: 'finance' },
        { label: 'A shop or consumer app', value: 'consumer' },
        { label: 'Editorial or content', value: 'editorial' },
        { label: 'A brand, event or portfolio', value: 'brand' },
        { label: 'An internal tool or dashboard', value: 'dashboard' },
        { label: 'Dating or relationships', value: 'dating' },
      ],
    });
  }
  if (p.moods.length === 0) {
    out.push({
      id: 'feel',
      question: 'How should it feel?',
      fills: 'moods',
      options: [
        { label: 'Calm and minimal', value: 'minimal' },
        { label: 'Warm and friendly', value: 'warm' },
        { label: 'Bold and loud', value: 'bold' },
        { label: 'Premium and elegant', value: 'premium' },
        { label: 'Technical and precise', value: 'technical' },
        { label: 'Playful', value: 'playful' },
        { label: 'Editorial', value: 'editorial' },
        { label: 'Retro', value: 'retro' },
        { label: 'Romantic', value: 'romantic' },
      ],
    });
  }
  if (p.theme === undefined) {
    out.push({
      id: 'theme',
      question: 'Light or dark?',
      fills: 'theme',
      options: [
        { label: 'Light', value: 'light' },
        { label: 'Dark', value: 'dark' },
        { label: 'Either', value: 'either' },
      ],
    });
  }
  if (p.likeBrands.length === 0) out.push({ id: 'likeBrand', question: 'Any product or site you would like it to feel like? (optional)', fills: 'likeBrands' });
  return out;
}

interface Scored {
  c: MatchCandidate;
  score: number;
  named: boolean;
  /** The user's own brand (brand.json kind own), ranked first unless another look is named. */
  own?: boolean;
  matchedMoods: string[];
  matchedIndustries: string[];
}

function scoreCandidate(c: MatchCandidate, p: NormalizedProfile, briefWords: string[]): Scored {
  const d = c.descriptor;
  const named = namesSystem(p.likeBrands, c) || (d?.kind === 'brand' && namesSystem(briefWords.filter((w) => !AMBIGUOUS_BRAND_WORDS.has(w)), c));
  const matchedMoods = p.moods.filter((m) => d?.moods.includes(m));
  const matchedIndustries = p.industries.filter((i) => d?.industries.includes(i));
  let score = 0;
  if (p.moods.length) {
    score += WEIGHTS.moods * (matchedMoods.length / p.moods.length);
    score += WEIGHTS.facets * (p.moods.filter((m) => MOOD_FACETS[m](c.facets)).length / p.moods.length);
  }
  if (p.industries.length) score += WEIGHTS.industries * (matchedIndustries.length / p.industries.length);
  if (p.surface) {
    // Without descriptors (custom systems) assume a web system.
    const surfaces = d?.surfaces ?? ['web'];
    if (surfaces.includes(p.surface)) score += WEIGHTS.surface;
    else if (p.surface === 'mobile') score -= 0.3;
  }
  if (briefWords.length) {
    const hay = new Set(words([c.detail.id, c.detail.name, c.detail.summary, c.detail.category ?? '', ...(d ? [...d.moods, ...d.industries] : [])].join(' ')));
    const hits = briefWords.filter((w) => hay.has(w)).length;
    score += WEIGHTS.brief * Math.min(1, hits / Math.min(3, briefWords.length));
  }
  if (named) score += 2;
  // The user's own brand comes first unless the profile names another look.
  const own = c.detail.brand?.kind === 'own' && (p.likeBrands.length === 0 || named);
  if (own) score += 3;
  return { c, score, named, own, matchedMoods, matchedIndustries };
}

/** Everyday words in a brief that point at a mood or an industry, used only for fields the profile left empty. */
const BRIEF_HINTS: Record<string, { moods?: DesignMood[]; industries?: DesignIndustry[] }> = {
  yoga: { industries: ['wellness'], moods: ['calm'] },
  meditation: { industries: ['wellness'], moods: ['calm'] },
  spa: { industries: ['wellness'], moods: ['calm'] },
  wellness: { industries: ['wellness'] },
  fitness: { industries: ['wellness'], moods: ['bold'] },
  health: { industries: ['wellness'] },
  coffee: { industries: ['food'], moods: ['warm'] },
  cafe: { industries: ['food'], moods: ['warm'] },
  restaurant: { industries: ['food'] },
  bakery: { industries: ['food'], moods: ['warm'] },
  food: { industries: ['food'] },
  bank: { industries: ['finance'] },
  banking: { industries: ['finance'] },
  fintech: { industries: ['finance'] },
  payments: { industries: ['finance'] },
  crypto: { industries: ['finance'] },
  invoice: { industries: ['finance'] },
  api: { industries: ['developer'], moods: ['technical'] },
  sdk: { industries: ['developer'], moods: ['technical'] },
  devtool: { industries: ['developer'], moods: ['technical'] },
  developer: { industries: ['developer'] },
  developers: { industries: ['developer'] },
  ai: { industries: ['ai'] },
  llm: { industries: ['ai'] },
  agent: { industries: ['ai'] },
  saas: { industries: ['saas'] },
  startup: { industries: ['saas'] },
  dashboard: { industries: ['dashboard'] },
  analytics: { industries: ['dashboard'], moods: ['technical'] },
  admin: { industries: ['dashboard'] },
  report: { industries: ['editorial'], moods: ['editorial'] },
  magazine: { industries: ['editorial'], moods: ['editorial'] },
  blog: { industries: ['editorial'], moods: ['editorial'] },
  newsletter: { industries: ['editorial'], moods: ['editorial'] },
  resume: { industries: ['editorial'], moods: ['editorial'] },
  portfolio: { industries: ['creative'], moods: ['artistic'] },
  agency: { industries: ['creative'], moods: ['artistic'] },
  festival: { industries: ['brand'], moods: ['bold'] },
  event: { industries: ['brand'] },
  conference: { industries: ['brand'] },
  launch: { industries: ['brand'] },
  shop: { industries: ['commerce'] },
  store: { industries: ['commerce'] },
  ecommerce: { industries: ['commerce'] },
  fashion: { industries: ['commerce'], moods: ['elegant'] },
  luxury: { moods: ['premium', 'elegant'] },
  game: { industries: ['gaming'], moods: ['playful'] },
  gaming: { industries: ['gaming'] },
  kids: { industries: ['education'], moods: ['playful'] },
  school: { industries: ['education'] },
  course: { industries: ['education'] },
  learning: { industries: ['education'] },
  travel: { industries: ['travel'] },
  hotel: { industries: ['travel'] },
  car: { industries: ['automotive'] },
  cars: { industries: ['automotive'] },
  music: { industries: ['media'] },
  podcast: { industries: ['media'] },
  video: { industries: ['media'] },
  chat: { industries: ['social'] },
  community: { industries: ['social'] },
  enterprise: { industries: ['enterprise'], moods: ['corporate'] },
  internal: { industries: ['dashboard'] },
  dating: { industries: ['dating'], moods: ['romantic'] },
  date: { industries: ['dating'], moods: ['romantic'] },
  dates: { industries: ['dating'], moods: ['romantic'] },
  flirty: { industries: ['dating'], moods: ['romantic', 'playful'] },
  flirting: { industries: ['dating'], moods: ['romantic', 'playful'] },
  romantic: { moods: ['romantic'] },
  romance: { moods: ['romantic'] },
  love: { moods: ['romantic'] },
  relationship: { industries: ['dating'] },
  relationships: { industries: ['dating'] },
  wedding: { industries: ['brand'], moods: ['romantic', 'elegant'] },
};

function briefHints(ws: string[]): { moods: DesignMood[]; industries: DesignIndustry[] } {
  const moods: DesignMood[] = [];
  const industries: DesignIndustry[] = [];
  for (const w of ws) {
    const h = BRIEF_HINTS[w];
    if (!h) continue;
    for (const m of h.moods ?? []) if (!moods.includes(m)) moods.push(m);
    for (const i of h.industries ?? []) if (!industries.includes(i)) industries.push(i);
  }
  return { moods, industries };
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

/** Ranking tier: named systems, then matching genres, then matching brands, then the rest. */
function tier(s: Scored): number {
  if (s.named || s.own) return 0;
  const brand = s.c.descriptor?.kind === 'brand';
  if (s.score > 0) return brand ? 2 : 1;
  return 3;
}

function completeness(c: MatchCandidate): number {
  return (c.detail.hasTokens ? 1 : 0) + (c.detail.tokensCss?.includes('--space-') ? 1 : 0);
}

/** The first sentence that describes the look: the manifest description, unless it's the generic bundling note. */
function shortSummary(detail: DesignSystemDetail): string | undefined {
  let text = detail.summary;
  if (!text || /^bundled opendesign package/i.test(text) || /^\s*category\s*:/i.test(text)) {
    const lines = detail.body.split('\n').map((l) => l.trim());
    const quote = lines.find((l) => l.startsWith('>') && !/^>\s*category\s*:/i.test(l));
    text = quote ? quote.replace(/^>\s?/, '') : '';
  }
  const first = text.split(/(?<=\.)\s/)[0]?.trim();
  return first && first.length <= 200 ? first : first?.slice(0, 197).concat('…');
}

function reasonFor(s: Scored, p: NormalizedProfile): string {
  const parts: string[] = [];
  if (s.own) parts.push('your own brand');
  if (s.named) parts.push('the look you named');
  if (s.matchedMoods.length) parts.push(s.matchedMoods.join(', '));
  if (s.matchedIndustries.length) parts.push(`fits ${s.matchedIndustries.join(', ')}`);
  if (p.surface && (s.c.descriptor?.surfaces ?? []).includes(p.surface)) parts.push(`made for ${p.surface}`);
  const f = s.c.facets;
  parts.push(`${f.theme}, ${f.display} display${f.accentFamily && f.accentFamily !== 'neutral' ? `, ${f.accentFamily} accent` : ''}`);
  const summary = shortSummary(s.c.detail);
  return summary ? `${parts.join('; ')}. ${summary}` : parts.join('; ');
}

function toRecommendation(s: Scored, p: NormalizedProfile): Recommendation {
  return {
    id: s.c.detail.id,
    name: s.c.detail.name,
    category: s.c.detail.category,
    kind: s.c.descriptor?.kind ?? 'genre',
    reason: reasonFor(s, p),
    facets: s.c.facets,
  };
}

/** Rank candidates against a profile. Same inputs, same output: no randomness, ties broken by completeness then id. */
export function rankDesignSystems(candidates: MatchCandidate[], profile: DesignProfile | undefined, limit = 5): RecommendationResult {
  const p = normalizeDesignProfile(profile);
  const max = Math.max(3, Math.min(5, limit));
  const briefWords = words(p.brief);
  // Fill empty fields from the brief's words, and from a named system's own descriptors so the rest of the shortlist resembles it.
  const hinted = briefHints(briefWords);
  const named = candidates.find((c) => namesSystem(p.likeBrands, c))?.descriptor;
  const scoring: NormalizedProfile = {
    ...p,
    industries: p.industries.length ? p.industries : uniq([...hinted.industries, ...((named?.industries ?? []) as DesignIndustry[])]),
    moods: p.moods.length ? p.moods : uniq([...hinted.moods, ...((named?.moods ?? []) as DesignMood[])]),
  };
  const avoided = (c: MatchCandidate) =>
    p.avoid.includes(c.detail.id) || (c.descriptor?.moods ?? []).some((m) => p.avoid.includes(m));
  const pool = candidates.filter((c) => !avoided(c) && (p.theme === undefined || p.theme === 'either' || c.facets.theme === p.theme || namesSystem(p.likeBrands, c)));

  const signals = profileSignalCount(p);
  if (signals === 0 && briefWords.length === 0) {
    const byId = new Map(pool.map((c) => [c.detail.id, c]));
    const owned = pool.filter((c) => c.detail.brand?.kind === 'own').sort((a, b) => a.detail.id.localeCompare(b.detail.id));
    const picks = [...owned, ...FALLBACK_DESIGN_SYSTEMS.map((id) => byId.get(id)).filter((c): c is MatchCandidate => c !== undefined)];
    const recs = picks.slice(0, max).map((c) => toRecommendation({ c, score: 0, named: false, own: c.detail.brand?.kind === 'own', matchedMoods: [], matchedIndustries: [] }, p));
    return {
      recommendations: recs,
      confidence: owned.length > 0 ? 'high' : 'low',
      ...(owned.length > 0 ? {} : { questions: matchQuestions(p) }),
      ...(p.ignored.length ? { ignored: p.ignored } : {}),
    };
  }

  const scored = pool.map((c) => scoreCandidate(c, scoring, briefWords));
  scored.sort((a, b) => tier(a) - tier(b) || b.score - a.score || completeness(b.c) - completeness(a.c) || a.c.detail.id.localeCompare(b.c.detail.id));
  // Nothing scored for the tail: offer the starters there rather than whatever sorts first alphabetically.
  const top = scored.filter((s) => s.score > 0).slice(0, max);
  for (const id of FALLBACK_DESIGN_SYSTEMS) {
    if (top.length >= max) break;
    const s = scored.find((x) => x.c.detail.id === id);
    if (s && !top.includes(s)) top.push(s);
  }
  const s1 = top[0]?.score ?? 0;
  const s4 = scored[3]?.score ?? 0;
  const confidence: RecommendationResult['confidence'] = top[0]?.named || (s1 >= 0.5 && s1 - s4 >= 0.1) ? 'high' : s1 >= 0.3 ? 'medium' : 'low';
  const result: RecommendationResult = { recommendations: top.map((s) => toRecommendation(s, scoring)), confidence };
  if (signals < 2 && confidence === 'low') result.questions = matchQuestions(p);
  if (p.ignored.length) result.ignored = p.ignored;
  return result;
}

/** Every whitespace-separated word of `query` appears in at least one haystack (case-insensitive). */
export function matchesAllWords(haystacks: string[], query: string): boolean {
  const ws = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (ws.length === 0) return true;
  const lowered = haystacks.map((h) => h.toLowerCase());
  return ws.every((w) => lowered.some((h) => h.includes(w)));
}

/**
 * A note for a brief prepared without the user's own brand (openspec
 * connect-brand-design-systems): names their brand systems and how to use
 * one. Undefined when they have none or this brief already uses one.
 */
export function ownBrandHint(ownBrands: Array<{ id: string; name: string }>, used: { id: string; name: string } | undefined): string | undefined {
  if (ownBrands.length === 0 || ownBrands.some((b) => b.id === used?.id)) return undefined;
  const list = ownBrands.map((b) => `${b.name} (${b.id})`).join(', ');
  const next = used
    ? `This brief uses ${used.name} instead; that's fine if the user asked for it, otherwise prepare it again with designSystemId "${ownBrands[0].id}".`
    : `Unless the user wants another look, prepare the brief again with designSystemId "${ownBrands[0].id}".`;
  return `The user has their own brand design system${ownBrands.length > 1 ? 's' : ''}: ${list}. ${next}`;
}
