// Scoring for the extraction benchmark (openspec add-extraction-benchmark).
// Pure functions, no browser: run.ts feeds them a site's truth and the draft
// the kit returned, and the tests in scripts/test pin the rules.

/** '#abc' or '#aabbcc' (alpha ignored) → [r, g, b] in 0–255, or undefined. */
export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(String(hex ?? '').trim());
  if (!m) return undefined;
  const h = m[1].length <= 4 ? [...m[1].slice(0, 3)].map((c) => c + c).join('') : m[1].slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/** sRGB 0–255 → CIE Lab (D65). */
export function rgbToLab([r, g, b]) {
  const lin = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const x = (lin[0] * 0.4124564 + lin[1] * 0.3575761 + lin[2] * 0.1804375) / 0.95047;
  const y = lin[0] * 0.2126729 + lin[1] * 0.7151522 + lin[2] * 0.072175;
  const z = (lin[0] * 0.0193339 + lin[1] * 0.119192 + lin[2] * 0.9503041) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** CIEDE2000 colour difference between two Lab colours (Sharma, Wu and Dalal 2005). */
export function deltaE2000([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const hp = (b, a) => {
    if (b === 0 && a === 0) return 0;
    const h = Math.atan2(b, a) / rad;
    return h < 0 ? h + 360 : h;
  };
  const h1p = hp(b1, a1p);
  const h2p = hp(b2, a2p);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lbp = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2;
    else hbp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  }
  const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad) + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.2 * Math.cos((4 * hbp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

/** CIEDE2000 between two hex colours, or Infinity when either can't be read. */
export function deltaEHex(a, b) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return x && y ? deltaE2000(rgbToLab(x), rgbToLab(y)) : Infinity;
}

export const COLOUR_HIT = 10;

/**
 * A drafted colour against a site's truth colours: null when there is no truth
 * (not scored), otherwise a hit when within ΔE 10 of any of them.
 */
export function scoreColour(drafted, truth) {
  if (!truth || truth.length === 0) return null;
  const distances = truth.map((t) => deltaEHex(drafted, t));
  const deltaE = Math.min(...distances);
  return { hit: deltaE <= COLOUR_HIT, deltaE: Number.isFinite(deltaE) ? Math.round(deltaE * 10) / 10 : null, drafted: drafted ?? null, truth };
}

/** A font family name reduced for comparison: case, accents, quotes, separators and variable suffixes ignored. */
export function normaliseFont(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/["']/g, '')
    .replace(/[\s_-]+(variable|var|vf)$/g, '')
    .replace(/(variable|var|vf)$/g, '')
    .replace(/[\s_-]+/g, '')
    .trim();
}

/** The first family of a CSS font stack. */
export function firstFamily(stack) {
  return String(stack ?? '').split(',')[0].trim().replace(/^["']|["']$/g, '');
}

/** A drafted font stack against truth names: null with no truth, a hit when its first family matches one. */
export function scoreFont(stack, truth) {
  if (!truth || truth.length === 0) return null;
  const drafted = firstFamily(stack);
  const n = normaliseFont(drafted);
  return { hit: n !== '' && truth.some((t) => normaliseFont(t) === n), drafted: drafted || null, truth };
}

/**
 * One site's score. `outcome` is the run: `{ status: 'ok' | 'partial' | 'blocked' | 'failed', tokens?, ms? }`.
 * A run with no tokens is a miss wherever truth exists.
 */
export function scoreSite(entry, outcome) {
  const tokens = outcome.tokens ?? {};
  const accent = scoreColour(tokens['--accent'], entry.accent);
  const font = scoreFont(tokens['--font-body'], entry.font);
  const bg = entry.bg ? scoreColour(tokens['--bg'], [entry.bg]) : null;
  const fg = entry.fg ? scoreColour(tokens['--fg'], [entry.fg]) : null;
  return { site: entry.site, status: outcome.status, ms: outcome.ms ?? null, error: outcome.error, accent, font, bg, fg };
}

const median = (xs) => {
  const s = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  if (s.length === 0) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

/** Hit counts per dimension over scored sites only, plus failures and the median time. */
export function summarise(scores) {
  const tally = (key) => {
    const scored = scores.filter((s) => s[key]);
    return { hits: scored.filter((s) => s[key].hit).length, scored: scored.length };
  };
  return {
    sites: scores.length,
    accent: tally('accent'),
    font: tally('font'),
    bg: tally('bg'),
    fg: tally('fg'),
    blocked: scores.filter((s) => s.status === 'blocked').map((s) => s.site),
    failed: scores.filter((s) => s.status === 'failed').map((s) => s.site),
    medianMs: median(scores.map((s) => s.ms)),
  };
}

/** The hits lost and gained between two runs' scores, by site, for a PR description. */
export function compareRuns(before, after) {
  const by = new Map(before.map((s) => [s.site, s]));
  const lost = [];
  const gained = [];
  for (const s of after) {
    const b = by.get(s.site);
    if (!b) continue;
    for (const key of ['accent', 'font']) {
      if (b[key]?.hit && s[key] && !s[key].hit) lost.push(`${s.site} ${key}`);
      if (b[key] && !b[key].hit && s[key]?.hit) gained.push(`${s.site} ${key}`);
    }
  }
  return { lost, gained };
}

const pct = ({ hits, scored }) => (scored ? `${hits}/${scored} (${Math.round((hits / scored) * 100)}%)` : '—');
const mark = (r) => (r === null ? '·' : r.hit ? '✓' : '✗');

/** The markdown result: summary for each set, then every site with truth beside the drafted value. */
export function resultMarkdown(run) {
  const lines = [`# Extraction benchmark, ${run.date}`, '', `Kit ${run.kitVersion} · ${run.browser} · colour hit at ΔE ${COLOUR_HIT} (CIEDE2000) · ${run.label ?? 'no label'}`, ''];
  lines.push('| Set | Sites | Accent | Body font | Blocked | Failed | Median time |', '|---|---|---|---|---|---|---|');
  for (const set of run.sets) {
    const s = set.summary;
    lines.push(`| ${set.name} | ${s.sites} | ${pct(s.accent)} | ${pct(s.font)} | ${s.blocked.length} | ${s.failed.length} | ${s.medianMs === null ? '—' : `${(s.medianMs / 1000).toFixed(1)} s`} |`);
  }
  for (const set of run.sets) {
    lines.push('', `## ${set.name}`, '', '| Site | Status | Accent | Drafted | Truth | ΔE | Font | Drafted | Truth |', '|---|---|---|---|---|---|---|---|---|');
    for (const r of set.scores) {
      lines.push(
        `| ${r.site} | ${r.status} | ${mark(r.accent)} | ${r.accent?.drafted ?? ''} | ${(r.accent?.truth ?? []).join(' ')} | ${r.accent?.deltaE ?? ''} | ${mark(r.font)} | ${r.font?.drafted ?? ''} | ${(r.font?.truth ?? []).join(', ')} |`,
      );
    }
  }
  lines.push('', '✓ hit · ✗ miss · · not scored (no truth for this site)', '');
  return lines.join('\n');
}
