/// <reference lib="dom" />
// The brand-kit capture (openspec add-brand-kit-capture): what a designer asks
// for in a brand kit that a rendered page shows. Marks with their variants,
// where each font comes from, component specs, voice samples and counted
// facts, imagery and the icon set. The in-page part runs after the token
// measurement (it finds the primary button and card by the marks that pass
// left); the rest is pure and unit-tested.

import type { BrandComponents, BrandFont, BrandImagery, BrandMark, BrandVoice, ComponentSpec } from './brandKit';
import type { LoadedFont } from './evidenceToTokens';

/** Voice samples are capped at this many characters per page, so the bundle never holds a page's copy wholesale. */
export const VOICE_MAX_CHARS = 1_500;

export interface CapturedSpec extends ComponentSpec {
  /** Document rect, for its crop. */
  rect?: { x: number; y: number; width: number; height: number };
}

export interface CapturedKit {
  links: { icons: Array<{ href: string; sizes?: string; rel: string }>; manifest?: string; ogImage?: string; themeColor?: string; stylesheets: string[] };
  logo?: { svg?: string; src?: string; seenOn?: string; width: number; height: number };
  /** The logo over a dark hero or header, when the header logo sits on a light one and another logo shows on dark. */
  logoOnDark?: { svg?: string; src?: string; seenOn?: string; width: number; height: number };
  components: { button?: { primary?: CapturedSpec; secondary?: CapturedSpec; ghost?: CapturedSpec }; input?: CapturedSpec; card?: CapturedSpec; nav?: CapturedSpec; badge?: CapturedSpec };
  voice: BrandVoice['samples'];
  imagery: BrandImagery;
}

/** In-page. Self-contained, for page.evaluate. `voiceMax` caps the samples' characters. */
export function captureBrandKitInBrowser(voiceMax: number): CapturedKit {
  const doc = document;
  const win = window;
  const cs = (el: Element) => win.getComputedStyle(el);
  const visible = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    const s = cs(el);
    return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
  };
  const all = (sel: string): Element[] => {
    try {
      return Array.from(doc.querySelectorAll(sel)).filter(visible).slice(0, 400);
    } catch {
      return [];
    }
  };
  const transparent = (c: string) => c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c);
  // Modern colour syntaxes (oklch, lab, color(display-p3 …)): let the browser convert through a 1×1 canvas.
  const canvasRgba = (c: string): number[] | undefined => {
    try {
      const cv = doc.createElement('canvas');
      cv.width = 1;
      cv.height = 1;
      const ctx = cv.getContext('2d');
      if (!ctx) return undefined;
      ctx.fillStyle = '#010203';
      ctx.fillStyle = c;
      if (String(ctx.fillStyle) === '#010203') return undefined;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    } catch {
      return undefined;
    }
  };
  const hex = (c: string): string | undefined => {
    const m = /rgba?\(([^)]+)\)/.exec(c);
    const p = m ? m[1].split(/[\s,/]+/).filter(Boolean).map(Number) : canvasRgba(c);
    if (!p) return undefined;
    if (p.length > 3 && p[3] < 0.5) return undefined;
    return `#${p.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  };
  const px = (v: string) => Math.round(Number.parseFloat(v) * 10) / 10 || 0;
  const selectorFor = (el: Element): string => {
    if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) return `#${el.id}`;
    const cls = Array.from(el.classList).filter((c) => /^[A-Za-z_][\w-]*$/.test(c) && c.length < 40).slice(0, 2);
    return el.tagName.toLowerCase() + cls.map((c) => `.${c}`).join('');
  };
  const rectOf = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { x: Math.max(0, r.left + win.scrollX), y: Math.max(0, r.top + win.scrollY), width: Math.min(r.width, 1440), height: Math.min(r.height, 900) };
  };
  // The background an element is seen on: the nearest ancestor (or itself) with a fill.
  const seenOn = (el: Element): string | undefined => {
    for (let e: Element | null = el; e; e = e.parentElement) {
      const bg = cs(e).backgroundColor;
      if (!transparent(bg)) return hex(bg);
    }
    return '#ffffff';
  };
  const spec = (el: Element): CapturedSpec => {
    const s = cs(el);
    const r = el.getBoundingClientRect();
    const border = px(s.borderTopWidth);
    const out: CapturedSpec = {
      selector: selectorFor(el),
      rect: rectOf(el),
      height: Math.round(r.height),
      paddingY: px(s.paddingTop),
      paddingX: px(s.paddingLeft),
      fontWeight: Number(s.fontWeight) || undefined,
      fontSize: px(s.fontSize),
      textTransform: s.textTransform !== 'none' ? s.textTransform : undefined,
      borderWidth: border || undefined,
      borderColor: border ? hex(s.borderTopColor) : undefined,
      radius: px(s.borderTopLeftRadius),
      background: hex(s.backgroundColor),
      color: hex(s.color),
      shadow: s.boxShadow !== 'none' ? s.boxShadow : undefined,
      width: Math.round(r.width),
      label: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40) || (el as HTMLInputElement).placeholder || undefined,
      fontFamily: s.fontFamily || undefined,
      letterSpacing: s.letterSpacing === 'normal' ? 0 : px(s.letterSpacing),
      textAlign: s.textAlign || undefined,
    };
    return out;
  };

  // ── Marks ──
  const links: CapturedKit['links'] = { icons: [], stylesheets: [] };
  for (const l of Array.from(doc.querySelectorAll('link[rel]')) as HTMLLinkElement[]) {
    const rel = l.rel.toLowerCase();
    if (/\bicon\b|apple-touch-icon|mask-icon/.test(rel) && l.href) links.icons.push({ href: l.href, sizes: l.getAttribute('sizes') ?? undefined, rel });
    else if (rel === 'manifest' && l.href) links.manifest = l.href;
    else if (rel === 'stylesheet' && l.href) links.stylesheets.push(l.href);
  }
  const meta = (sel: string) => (doc.querySelector(sel) as HTMLMetaElement | null)?.content?.trim() || undefined;
  links.ogImage = meta('meta[property="og:image"], meta[name="og:image"], meta[name="twitter:image"]');
  if (links.ogImage) {
    try {
      links.ogImage = new URL(links.ogImage, doc.baseURI).toString();
    } catch {
      links.ogImage = undefined;
    }
  }
  links.themeColor = meta('meta[name="theme-color"]');

  const logoCandidates = all('header [class*="logo" i] svg, header [class*="logo" i] img, header a[href="/"] svg, header a[href="/"] img, [class*="logo" i] svg, [class*="logo" i] img, a[aria-label*="home" i] svg, header svg, header img');
  type LogoRead = { svg?: string; src?: string; seenOn?: string; width: number; height: number };
  const readLogo = (el: Element | undefined): LogoRead | undefined => {
    if (!el) return undefined;
    const r = el.getBoundingClientRect();
    const base = { seenOn: seenOn(el), width: Math.round(r.width), height: Math.round(r.height) };
    if (el.tagName.toLowerCase() === 'svg') {
      const markup = el.outerHTML;
      return markup.length < 200_000 ? { ...base, svg: markup } : undefined;
    }
    const src = (el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src;
    return src ? { ...base, src } : undefined;
  };
  const headerLogo = logoCandidates.find((el) => el.getBoundingClientRect().top + win.scrollY < 240);
  const logo = readLogo(headerLogo);
  // A second logo shown on a dark surface (a footer or hero), when the header one is on a light one.
  const lum = (h: string | undefined) => {
    if (!h) return 1;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  let logoOnDark: CapturedKit['logoOnDark'];
  if (logo && lum(logo.seenOn) > 0.5) {
    const onDark = all('footer [class*="logo" i] svg, footer [class*="logo" i] img, [class*="logo" i] svg, [class*="logo" i] img').find((el) => el !== headerLogo && lum(seenOn(el)) < 0.25);
    const read = readLogo(onDark);
    if (read && (read.svg ?? read.src) !== (logo.svg ?? logo.src)) logoOnDark = read;
  }

  // ── Components ──
  const components: CapturedKit['components'] = {};
  const primary = doc.querySelector('[data-od-extract-primary]');
  const buttons = all('button, a[class*="btn" i], a[class*="button" i], [role="button"], input[type="submit"]').filter((el) => {
    const r = el.getBoundingClientRect();
    return r.height >= 24 && r.height <= 80 && r.width >= 40 && (el.textContent ?? '').trim().length <= 40;
  });
  if (primary) components.button = { primary: spec(primary) };
  const outlined = buttons.find((el) => el !== primary && transparent(cs(el).backgroundColor) && px(cs(el).borderTopWidth) >= 1);
  const ghost = buttons.find((el) => el !== primary && el !== outlined && transparent(cs(el).backgroundColor) && px(cs(el).borderTopWidth) === 0 && px(cs(el).paddingLeft) >= 8);
  const filled = buttons.find((el) => el !== primary && !transparent(cs(el).backgroundColor) && hex(cs(el).backgroundColor) !== (primary ? hex(cs(primary).backgroundColor) : undefined));
  const secondary = outlined ?? filled;
  if (secondary) components.button = { ...components.button, secondary: spec(secondary) };
  if (ghost) components.button = { ...components.button, ghost: spec(ghost) };
  const input = all('input[type="text"], input[type="email"], input[type="search"], input:not([type]), textarea, select')[0];
  if (input) {
    const s = spec(input);
    // The focus style: focus it and read the ring.
    (input as HTMLInputElement).focus({ preventScroll: true });
    const f = cs(input);
    const ring = f.boxShadow !== 'none' ? f.boxShadow : f.outlineStyle !== 'none' && px(f.outlineWidth) > 0 ? `outline ${px(f.outlineWidth)}px ${hex(f.outlineColor) ?? f.outlineColor}` : px(f.borderTopWidth) > 0 && hex(f.borderTopColor) !== s.borderColor ? `border ${hex(f.borderTopColor)}` : undefined;
    (input as HTMLInputElement).blur();
    components.input = { ...s, focus: ring };
  }
  const card = doc.querySelector('[data-od-extract-surface]');
  if (card && visible(card)) {
    const c = spec(card);
    components.card = { ...c, gap: px(cs(card).rowGap) || undefined };
  }
  const nav = all('header, nav, [role="banner"]').find((el) => el.getBoundingClientRect().top + win.scrollY < 120 && el.getBoundingClientRect().width > win.innerWidth * 0.6);
  if (nav) {
    const position = cs(nav).position;
    let sticky = position === 'sticky' || position === 'fixed';
    for (let e = nav.parentElement; !sticky && e && e !== doc.body; e = e.parentElement) sticky = ['sticky', 'fixed'].includes(cs(e).position);
    components.nav = { ...spec(nav), sticky };
  }
  const badge = all('[class*="badge" i], [class*="tag" i]:not(html), [class*="pill" i], [class*="chip" i]').find((el) => {
    const r = el.getBoundingClientRect();
    return r.height >= 14 && r.height <= 36 && (el.textContent ?? '').trim().length > 0 && (el.textContent ?? '').trim().length <= 24;
  });
  if (badge) components.badge = spec(badge);

  // ── Voice ──
  const samples: CapturedKit['voice'] = [];
  let used = 0;
  const page = win.location.pathname || '/';
  const push = (kind: BrandVoice['samples'][number]['kind'], text: string | undefined | null) => {
    const t = (text ?? '').replace(/\s+/g, ' ').trim();
    if (!t || t.length < 2 || used + t.length > voiceMax || samples.some((s) => s.text === t)) return;
    samples.push({ page, kind, text: t });
    used += t.length;
  };
  push('title', doc.title);
  push('description', meta('meta[name="description"]'));
  push('h1', all('h1')[0]?.textContent);
  for (const h of all('h2').slice(0, 6)) push('h2', h.textContent);
  if (primary) push('cta', primary.textContent);
  for (const b of buttons.filter((b) => b !== primary).slice(0, 4)) push('cta', b.textContent);
  for (const a of all('nav a, header a').slice(0, 6)) push('nav', a.textContent);
  const para = all('main p, article p, section p, p').find((p) => (p.textContent ?? '').trim().length > 60);
  if (para) push('paragraph', (para.textContent ?? '').trim().slice(0, 400));

  // ── Imagery ──
  const imagery: BrandImagery = {};
  const fold = all('main img, main video, main picture, main svg, main canvas, section img, section video, img, video, canvas').filter((el) => {
    const r = el.getBoundingClientRect();
    return r.top + win.scrollY < win.innerHeight * 1.2 && r.width * r.height > win.innerWidth * win.innerHeight * 0.06;
  });
  const heroMedia = fold.sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
  if (!heroMedia) imagery.hero = 'none';
  else {
    const tag = heroMedia.tagName.toLowerCase();
    const src = ((heroMedia as HTMLImageElement).currentSrc || (heroMedia as HTMLImageElement).src || '').toLowerCase();
    if (tag === 'video') imagery.hero = 'video';
    else if (tag === 'canvas') imagery.hero = '3d';
    else if (tag === 'svg' || /\.svg(\?|$)/.test(src)) imagery.hero = 'illustration';
    else if (/3d|render|spline/.test(`${src} ${heroMedia.getAttribute('class') ?? ''}`)) imagery.hero = '3d';
    else if (/\.png(\?|$)/.test(src)) imagery.hero = 'illustration';
    else imagery.hero = 'photo';
  }
  const imgs = all('img').filter((el) => el.getBoundingClientRect().width >= 120);
  const radii = new Map<number, number>();
  const ratios = new Map<string, number>();
  const ratioName = (w: number, h: number) => {
    const r = w / h;
    const named: Array<[string, number]> = [['1:1', 1], ['4:3', 4 / 3], ['3:2', 1.5], ['16:9', 16 / 9], ['3:4', 0.75], ['2:3', 2 / 3], ['21:9', 21 / 9], ['9:16', 9 / 16]];
    const best = named.sort((a, b) => Math.abs(a[1] - r) - Math.abs(b[1] - r))[0];
    return Math.abs(best[1] - r) / best[1] < 0.06 ? best[0] : undefined;
  };
  for (const img of imgs) {
    let radius = px(cs(img).borderTopLeftRadius);
    if (!radius && img.parentElement && cs(img.parentElement).overflow !== 'visible') radius = px(cs(img.parentElement).borderTopLeftRadius);
    radii.set(radius, (radii.get(radius) ?? 0) + 1);
    const r = img.getBoundingClientRect();
    const name = ratioName(r.width, r.height);
    if (name) ratios.set(name, (ratios.get(name) ?? 0) + 1);
  }
  if (radii.size > 0) imagery.imageRadius = [...radii].sort((a, b) => b[1] - a[1])[0][0];
  if (ratios.size > 0) imagery.aspectRatios = [...ratios].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n);
  // Icon set: small inline SVGs, by class names and stroke.
  const icons = all('svg').filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width >= 10 && r.width <= 48 && r.height >= 10 && r.height <= 48 && el !== headerLogo;
  });
  if (icons.length >= 2) {
    const classes = icons.map((el) => `${el.getAttribute('class') ?? ''} ${el.getAttribute('data-icon') ?? ''} ${el.parentElement?.getAttribute('class') ?? ''}`.toLowerCase()).join(' ');
    const sets: Array<[string, RegExp]> = [
      ['lucide', /\blucide\b/],
      ['heroicons', /\bheroicon/],
      ['feather', /\bfeather\b/],
      ['font-awesome', /\b(fa|fas|far|fab|svg-inline--fa)\b/],
      ['material', /\bmaterial|\bmui-?svg/],
      ['phosphor', /\bph(-|\b)|phosphor/],
      ['tabler', /\btabler/],
      ['bootstrap', /\bbi(-|\b)/],
      ['remix', /\bri-/],
    ];
    const set = sets.find(([, re]) => re.test(classes))?.[0] ?? 'custom';
    const strokes = icons.map((el) => {
      const sw = el.getAttribute('stroke-width') ?? el.querySelector('[stroke-width]')?.getAttribute('stroke-width');
      const stroked = (el.getAttribute('stroke') && el.getAttribute('stroke') !== 'none') || el.querySelector('[stroke]:not([stroke="none"])');
      const filled = el.getAttribute('fill') !== 'none';
      return { sw: sw ? Number(sw) : undefined, outline: !!stroked && !filled };
    });
    const sw = strokes.map((s) => s.sw).filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
    const outline = strokes.filter((s) => s.outline).length >= strokes.length / 2;
    imagery.icons = { set, style: outline ? 'outline' : 'filled', strokeWidth: sw.length ? sw.sort((a, b) => a - b)[Math.floor(sw.length / 2)] : undefined };
  }

  return { links, logo, logoOnDark, components, voice: samples, imagery };
}

// ── Voice facts ──

/** Counted facts from the samples: heading case, sentence length, person, exclamations and emoji. */
export function voiceFacts(samples: BrandVoice['samples']): Omit<BrandVoice, 'samples'> {
  const headings = samples.filter((s) => s.kind === 'h1' || s.kind === 'h2').map((s) => s.text);
  const caseOf = (t: string): 'sentence' | 'title' | 'upper' | undefined => {
    const words = t.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w));
    if (words.length < 2) return undefined;
    if (t === t.toUpperCase() && /[A-Z]/.test(t)) return 'upper';
    const small = /^(a|an|the|and|or|but|of|for|to|in|on|at|by|with|vs|via|is)$/i;
    const rest = words.slice(1).filter((w) => !small.test(w));
    if (rest.length === 0) return undefined;
    const capped = rest.filter((w) => /^[A-Z]/.test(w)).length;
    if (capped === rest.length) return 'title';
    return capped <= rest.length / 3 ? 'sentence' : undefined;
  };
  const cases = headings.map(caseOf).filter(Boolean) as string[];
  const counts = new Map<string, number>();
  for (const c of cases) counts.set(c, (counts.get(c) ?? 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1])[0];
  const headingCase = !top ? undefined : top[1] >= cases.length * 0.7 ? (top[0] as 'sentence' | 'title' | 'upper') : 'mixed';

  const prose = samples.filter((s) => s.kind === 'paragraph' || s.kind === 'description').map((s) => s.text);
  const sentences = prose.flatMap((p) => p.split(/(?<=[.!?])\s+/)).filter((s) => s.split(/\s+/).length >= 3);
  const avgSentenceWords = sentences.length ? Math.round(sentences.reduce((n, s) => n + s.split(/\s+/).length, 0) / sentences.length) : undefined;

  const text = samples.filter((s) => s.kind !== 'nav').map((s) => s.text).join(' ');
  const count = (re: RegExp) => (text.match(re) ?? []).length;
  const we = count(/\b(we|our|us|we're|we've)\b/gi);
  const you = count(/\b(you|your|you're|yours)\b/gi);
  const person = we + you === 0 ? 'third' : we > you * 2 ? 'first-plural' : you > we * 2 ? 'second' : 'mixed';
  return {
    headingCase,
    avgSentenceWords,
    person,
    exclamations: count(/!/g),
    emoji: count(/\p{Extended_Pictographic}/gu),
  };
}

// ── Fonts ──

/** Families that ship with the major operating systems. */
const SYSTEM_FONTS = new Set(
  ['system-ui', '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'roboto', 'helvetica', 'helvetica neue', 'arial', 'georgia', 'times new roman', 'times', 'courier new', 'menlo', 'monaco', 'consolas', 'sf pro', 'sf pro text', 'sf pro display', 'verdana', 'tahoma', 'trebuchet ms'].map((f) => f.toLowerCase()),
);

/** Reviewed free near-matches for common commercial brand faces (Google Fonts families). */
export const FREE_FONT_MATCHES: Record<string, string> = {
  'helvetica neue': 'Inter',
  'neue haas grotesk': 'Inter',
  'neue haas unica': 'Inter',
  'sf pro': 'Inter',
  'sf pro display': 'Inter',
  'sf pro text': 'Inter',
  'graphik': 'Inter',
  'circular': 'DM Sans',
  'circular std': 'DM Sans',
  'circular xx': 'DM Sans',
  'gt walsheim': 'DM Sans',
  'gt america': 'Public Sans',
  'gt sectra': 'Fraunces',
  'gt super': 'Fraunces',
  'gt alpina': 'Newsreader',
  'gt eesti': 'Manrope',
  'gt flexa': 'Space Grotesk',
  'avenir': 'Nunito Sans',
  'avenir next': 'Nunito Sans',
  'futura': 'Jost',
  'futura pt': 'Jost',
  'proxima nova': 'Montserrat',
  'gotham': 'Montserrat',
  'brandon grotesque': 'Josefin Sans',
  'gilroy': 'Plus Jakarta Sans',
  'sofia pro': 'Plus Jakarta Sans',
  'aeonik': 'Manrope',
  'euclid circular a': 'Manrope',
  'founders grotesk': 'Archivo',
  'akzidenz-grotesk': 'Archivo',
  'univers': 'Roboto',
  'din': 'Barlow',
  'din pro': 'Barlow',
  'din next': 'Barlow',
  'gill sans': 'Lato',
  'frutiger': 'Hind',
  'myriad pro': 'PT Sans',
  'söhne': 'Inter',
  'sohne': 'Inter',
  'suisse intl': 'Inter',
  'calibre': 'Work Sans',
  'tiempos': 'Source Serif 4',
  'tiempos text': 'Source Serif 4',
  'tiempos headline': 'Playfair Display',
  'freight text': 'Crimson Pro',
  'freight display': 'Playfair Display',
  'canela': 'Cormorant',
  'chronicle': 'Libre Caslon Text',
  'caslon': 'Libre Caslon Text',
  'garamond': 'EB Garamond',
  'baskerville': 'Libre Baskerville',
  'didot': 'Playfair Display',
  'operator mono': 'JetBrains Mono',
  'sf mono': 'JetBrains Mono',
  'berkeley mono': 'IBM Plex Mono',
};

/** The nearest free family: the reviewed table, then a guess from the name's class (serif, mono, display, sans). */
export function freeFontMatch(family: string): string {
  const key = family.trim().toLowerCase();
  if (FREE_FONT_MATCHES[key]) return FREE_FONT_MATCHES[key];
  const stem = Object.keys(FREE_FONT_MATCHES).filter((k) => key.startsWith(k)).sort((a, b) => b.length - a.length)[0];
  if (stem) return FREE_FONT_MATCHES[stem];
  if (/mono|code|courier/.test(key)) return 'JetBrains Mono';
  if (/serif|text|book|caslon|garamond|times|roman|antiqua|slab/.test(key) && !/sans/.test(key)) return 'Source Serif 4';
  if (/display|headline|poster/.test(key)) return 'Space Grotesk';
  return 'Inter';
}

/** Where each loaded family comes from, its weights, a Google stylesheet, and a free match for a self-hosted face. */
export function fontAvailability(fonts: LoadedFont[], stylesheets: string[]): BrandFont[] {
  const google = stylesheets.filter((s) => /fonts\.googleapis\.com/.test(s));
  const adobe = stylesheets.some((s) => /use\.typekit\.net|p\.typekit\.net/.test(s));
  const byFamily = new Map<string, { weights: Set<string>; source?: string }>();
  for (const f of fonts) {
    const cur = byFamily.get(f.family) ?? { weights: new Set<string>(), source: f.source };
    for (const w of String(f.weight).split(/\s+/)) if (w) cur.weights.add(w === 'normal' ? '400' : w === 'bold' ? '700' : w);
    cur.source = cur.source ?? f.source;
    byFamily.set(f.family, cur);
  }
  const out: BrandFont[] = [];
  for (const [family, v] of byFamily) {
    const weights = [...v.weights].sort();
    const enc = encodeURIComponent(family).replace(/%20/g, '+');
    const inGoogle = google.some((s) => decodeURIComponent(s).replace(/\+/g, ' ').toLowerCase().includes(`family=${family.toLowerCase()}`)) || /fonts\.gstatic\.com/.test(v.source ?? '');
    if (inGoogle) {
      out.push({ family, weights, source: 'google', licence: 'free', stylesheet: `https://fonts.googleapis.com/css2?family=${enc}:wght@${weights.filter((w) => /^\d+$/.test(w)).join(';') || '400'}&display=swap` });
    } else if (adobe && /typekit/.test(v.source ?? '')) {
      out.push({ family, weights, source: 'adobe', licence: 'unknown', freeMatch: freeFontMatch(family) });
    } else if (!v.source && SYSTEM_FONTS.has(family.toLowerCase())) {
      out.push({ family, weights, source: 'system', licence: 'free' });
    } else {
      out.push({ family, weights, source: 'self-hosted', licence: 'unknown', freeMatch: freeFontMatch(family) });
    }
  }
  return out;
}

// ── Assembly ──

/** Drops the crop rects (kept beside the evidence) and empty groups. */
export function componentSpecs(captured: CapturedKit['components'], crops: Record<string, string>): BrandComponents {
  const clean = (key: string, s: CapturedSpec | undefined): ComponentSpec | undefined => {
    if (!s) return undefined;
    const out = Object.fromEntries(Object.entries({ ...s, crop: crops[key] }).filter(([k, v]) => k !== 'rect' && v !== undefined)) as unknown as ComponentSpec;
    return out;
  };
  const out: BrandComponents = {};
  const button = captured.button ? { primary: clean('button-primary', captured.button.primary), secondary: clean('button-secondary', captured.button.secondary), ghost: clean('button-ghost', captured.button.ghost) } : undefined;
  if (button && (button.primary || button.secondary || button.ghost)) out.button = Object.fromEntries(Object.entries(button).filter(([, v]) => v)) as BrandComponents['button'];
  for (const k of ['input', 'card', 'nav', 'badge'] as const) {
    const s = clean(k, captured[k]);
    if (s) out[k] = s;
  }
  return out;
}

/** Each spec's crop key and rect, for cropping. */
export function componentRects(captured: CapturedKit['components']): Array<[string, NonNullable<CapturedSpec['rect']>]> {
  const out: Array<[string, NonNullable<CapturedSpec['rect']>]> = [];
  for (const [k, v] of Object.entries(captured.button ?? {})) if (v?.rect) out.push([`button-${k}`, v.rect]);
  for (const k of ['input', 'card', 'nav', 'badge'] as const) if (captured[k]?.rect) out.push([k, captured[k]!.rect!]);
  return out;
}

/** The largest declared icon, and the touch icon, from the page's link tags. */
export function pickIcons(icons: CapturedKit['links']['icons']): { icon?: string; touch?: string } {
  const size = (s?: string) => Math.max(0, ...(s ?? '').split(/\s+/).map((x) => Number(x.split('x')[0]) || (x === 'any' ? 512 : 0)));
  const touch = icons.find((i) => /apple-touch-icon/.test(i.rel))?.href;
  const plain = icons.filter((i) => /\bicon\b/.test(i.rel) && !/apple-touch-icon|mask-icon/.test(i.rel)).sort((a, b) => size(b.sizes) - size(a.sizes) || (/\.svg(\?|$)/.test(b.href) ? 1 : 0) - (/\.svg(\?|$)/.test(a.href) ? 1 : 0));
  return { icon: plain[0]?.href, touch };
}

/** One mark entry, with its format from the file name. */
export function markEntry(role: BrandMark['role'], file: string, extra: Partial<BrandMark> = {}): BrandMark {
  const format = /\.([a-z0-9]+)$/i.exec(file)?.[1]?.toLowerCase();
  return { role, path: file, ...(format ? { format } : {}), ...extra };
}
