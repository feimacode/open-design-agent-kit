// Pure, fetch/fs-free extraction logic for turning one bergside/awesome-design-skills
// (typeui.sh) skill entry into a REVIEW SCAFFOLD for a new local design-system
// package — not final content. See packages/content/local/README.md for the
// full scaffold -> review -> move-into-local/design-systems/ workflow this
// feeds, and the design notes below for why each field is either filled or
// deliberately left as a flagged placeholder.
//
// Grounded in what hand-authoring all 16 net-new entries actually found this
// session, not assumptions:
//   - typeui's `colors.primary` is sometimes the real accent (neon, riso,
//     pulse's actual screenshot accent) and sometimes just near-black/near-
//     white identity ink (codex, fiction, stitch) — a luminance check catches
//     the second case, but even the "safe" case still needs a screenshot
//     glance (pulse/square's real accents didn't match their own fields).
//   - `colors.secondary`'s role is inconsistent (bg-tint, second accent,
//     unrelated hue) across every sampled entry — never auto-mapped.
//   - `--muted`/`--border` and the entire A1-structure tier (type scale,
//     leading/tracking, section rhythm, container/gutters) have no typeui
//     equivalent at all. A formula/baseline default is filled in so nothing
//     ships with `missing` schema tokens (see designTokenSchema.ts), but it's
//     a starting point, not an assertion — several entries this session
//     needed real, screenshot-informed adjustment here (e.g. sega's two-
//     reading-zone dark canvas).
//   - success/warning/danger, radii, and font-family names mapped cleanly
//     across all 16 samples.
import matter from 'gray-matter';

/** WCAG-style relative luminance from a #rrggbb (or #rgb) hex string, 0 (black) to 1 (white). */
export function relativeLuminance(hex) {
  const normalized = hex.replace('#', '');
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// Thresholds tuned against this session's actual near-black/near-white
// "primary is ink, not accent" cases (codex #000000, fiction #222222,
// stitch #072C2C all read well under 0.25; pulse/riso/neon's real accents
// all read well above 0.35) — a modest dead zone, not a hard cutoff.
const INK_LUMINANCE_MAX = 0.22;
const INK_LUMINANCE_MIN_FOR_WHITE = 0.85;

export function looksLikeIdentityInkNotAccent(hex) {
  const lum = relativeLuminance(hex);
  return lum <= INK_LUMINANCE_MAX || lum >= INK_LUMINANCE_MIN_FOR_WHITE;
}

// Measured once against the real bundled catalog this session (neon/
// corporate for light; comparable dark-bg bundled entries for dark) — a
// reasonable structural default, not a brand-specific decision. Every
// entry authored by hand this session used a baseline in this neighborhood.
export const A1_STRUCTURE_BASELINES = {
  light: {
    '--text-xs': '12px',
    '--text-sm': '14px',
    '--text-base': '16px',
    '--text-lg': '18px',
    '--text-xl': '24px',
    '--text-2xl': '36px',
    '--text-3xl': '54px',
    '--text-4xl': '76px',
    '--leading-body': '1.5',
    '--leading-tight': '1.1',
    '--tracking-display': '-0.02em',
    '--section-y-desktop': '96px',
    '--section-y-tablet': '68px',
    '--section-y-phone': '48px',
    '--container-max': '1180px',
    '--container-gutter-desktop': '24px',
    '--container-gutter-tablet': '16px',
    '--container-gutter-phone': '16px',
  },
  dark: {
    '--text-xs': '12px',
    '--text-sm': '14px',
    '--text-base': '16px',
    '--text-lg': '18px',
    '--text-xl': '26px',
    '--text-2xl': '38px',
    '--text-3xl': '56px',
    '--text-4xl': '76px',
    '--leading-body': '1.5',
    '--leading-tight': '1.05',
    '--tracking-display': '-0.01em',
    '--section-y-desktop': '96px',
    '--section-y-tablet': '68px',
    '--section-y-phone': '48px',
    '--container-max': '1180px',
    '--container-gutter-desktop': '24px',
    '--container-gutter-tablet': '16px',
    '--container-gutter-phone': '16px',
  },
};

/**
 * Parses one typeui entry's two files. Colors/typography/rounded/spacing
 * live in DESIGN.md's frontmatter, NOT SKILL.md's — SKILL.md's own
 * frontmatter only carries `name`/`description`/`metadata.author` (verified
 * directly against riso/claude/neon's real files this session; SKILL.md's
 * body is templated boilerplate identical across entries, see module
 * header). `description` prefers SKILL.md's (fuller prose) over DESIGN.md's.
 */
export function parseTypeuiEntry(skillMdRaw, designMdRaw) {
  const skillMeta = matter(skillMdRaw).data ?? {};
  const { data } = matter(designMdRaw);
  const colors = data.colors ?? {};
  const typography = data.typography ?? {};
  const rounded = data.rounded ?? {};
  return {
    name: (typeof data.name === 'string' && data.name.trim()) || (typeof skillMeta.name === 'string' && skillMeta.name.trim()) || undefined,
    description:
      (typeof skillMeta.description === 'string' && skillMeta.description.trim()) ||
      (typeof data.description === 'string' && data.description.trim()) ||
      undefined,
    colors: {
      primary: colors.primary,
      secondary: colors.secondary,
      background: colors.background,
      surface: colors.surface,
      text: colors.text,
      success: colors.success,
      warning: colors.warning,
      danger: colors.danger,
    },
    typography: {
      displayFont: typography.h1?.fontFamily,
      bodyFont: typography['body-md']?.fontFamily,
      monoFont: typography['label-caps']?.fontFamily,
      scale: typography.sourceScale,
      weights: typography.weights,
    },
    roundedSm: rounded.sm,
    roundedMd: rounded.md,
    spacingScale: data.spacing?.sourceScale,
  };
}

export function classifyCollision(slug, upstreamIds, localIds) {
  if (upstreamIds.has(slug)) return 'upstream';
  if (localIds.has(slug)) return 'local';
  return null;
}

/**
 * Classifies every known typeui slug against what's currently vendored
 * (upstream) and already ported (local) — the reusable version of the
 * one-off `comm`-diff analysis done by hand at the start of this session.
 */
export function classifyCandidates(typeuiSlugs, upstreamIds, localIds) {
  const result = { redundant: [], ported: [], candidate: [] };
  for (const slug of [...typeuiSlugs].sort()) {
    const collision = classifyCollision(slug, upstreamIds, localIds);
    if (collision === 'upstream') result.redundant.push(slug);
    else if (collision === 'local') result.ported.push(slug);
    else result.candidate.push(slug);
  }
  return result;
}

function cssComment(text) {
  return `/* ${text} */`;
}

/**
 * Builds the review scaffold for one typeui skill entry. Never returns
 * "final" content — every field either came from a reliable typeui field
 * (see module header) or is a flagged placeholder a human/agent must
 * resolve against the DESIGN.md prose and the marketing screenshot before
 * this can move into packages/content/local/design-systems/.
 */
export function extractDesignSystemScaffold(slug, skillMdRaw, designMdRaw, upstreamIds, localIds, availableCategories) {
  const parsed = parseTypeuiEntry(skillMdRaw, designMdRaw);
  const notes = [];
  const collision = classifyCollision(slug, upstreamIds, localIds);
  if (collision) {
    notes.push(
      `COLLISION: "${slug}" already exists ${collision === 'upstream' ? 'upstream (a richer, already-authored bundled entry)' : 'under local/design-systems/'} — this scaffold should not be used without --force, and even then, check whether porting is still worth it.`,
    );
  }

  const name = parsed.name || slug;
  const bgHex = parsed.colors.background || parsed.colors.surface || '#ffffff';
  // typeui only ever gives ONE shade for canvas (colors.background, when
  // present at all — only `pulse` had it — or colors.surface otherwise);
  // our schema wants a distinct --bg (canvas) vs --surface (card) tier.
  // Every one of the 16 hand-authored entries this session differentiated
  // them (e.g. riso's #F2EEE1 canvas vs #FBF8EF card) rather than leaving
  // them flatly identical, so default --surface to a real, if modest,
  // color-mix step apart from --bg instead of literally the same value.
  const surfaceIsDistinct = Boolean(parsed.colors.background) && parsed.colors.surface && parsed.colors.surface !== parsed.colors.background;
  // Mix a small step toward --fg (not a fixed white/black) so this works
  // regardless of whether --bg itself is light or dark — always nudges
  // toward more contrast, never toward "no visible change."
  const surfaceHex = surfaceIsDistinct ? parsed.colors.surface : 'color-mix(in oklab, var(--bg), var(--fg) 4%)';
  const fgHex = parsed.colors.text || '#111111';
  const primaryHex = parsed.colors.primary;

  let accentLine;
  if (!primaryHex) {
    accentLine = `--accent: #ff00ff; ${cssComment('TODO: typeui had no primary color at all — pick a real accent from DESIGN.md prose / the marketing screenshot.')}`;
    notes.push('No colors.primary in the source skill — accent has no starting guess at all.');
  } else if (looksLikeIdentityInkNotAccent(primaryHex)) {
    accentLine = `--accent: #ff00ff; ${cssComment(`TODO: primary (${primaryHex}) reads as identity ink, not a distinct accent — check DESIGN.md prose and registry-examples/${slug}-marketing.png for the real accent.`)}`;
    notes.push(`primary (${primaryHex}) is near-black/near-white — very likely identity ink (--fg-like), not the real accent. Check the screenshot.`);
  } else {
    accentLine = `--accent: ${primaryHex}; ${cssComment(`TODO: confirm against registry-examples/${slug}-marketing.png — primary isn't always the real rendered accent (e.g. pulse, square).`)}`;
    notes.push(`primary (${primaryHex}) is a plausible accent — still confirm against the screenshot before treating this as final.`);
  }

  if (!surfaceIsDistinct) {
    notes.push(
      `typeui gave one shade for canvas (${bgHex}) with no separate card tier — --surface was derived with a small color-mix step, not asserted. Check the screenshot for the real canvas/card distinction.`,
    );
  }

  if (parsed.colors.secondary) {
    notes.push(
      `colors.secondary (${parsed.colors.secondary}) was NOT mapped to any token — its role is inconsistent across sampled entries (bg-tint / second accent / unrelated hue). Judge from the screenshot whether it's worth a DESIGN.md "content-only flourish" mention.`,
    );
  }

  const isDarkCanvas = relativeLuminance(bgHex) <= INK_LUMINANCE_MAX;
  const baseline = A1_STRUCTURE_BASELINES[isDarkCanvas ? 'dark' : 'light'];
  notes.push(`A1-structure type-scale/layout tokens filled from the ${isDarkCanvas ? 'dark' : 'light'}-canvas baseline (a structural default, not brand-specific) — adjust if the aesthetic calls for something looser/tighter (see e.g. sketch, matrix, fiction in local/design-systems/ for real examples of departing from it).`);

  notes.push(
    `--muted/--border have no typeui equivalent — filled with a color-mix formula as a starting guess only. Several entries this session needed real adjustment here; do not ship without checking.`,
  );

  if (!parsed.typography.bodyFont || parsed.typography.bodyFont === parsed.typography.displayFont) {
    notes.push(
      `typography.body-md.fontFamily is the same as h1's (or missing) — 3 of 16 entries this session had a wrong/overly-literal body font here that needed overriding to a plain sans. Check the screenshot's actual body text.`,
    );
  }

  notes.push(`category left as __TODO__ — pick one of: ${availableCategories.join(', ')}.`);

  const tokensCss = `/* ─────────────────────────────────────────────────────────────────────────
 * design-systems/${slug}/tokens.css — SCAFFOLD, NOT FINAL. See NOTES.md.
 * ─────────────────────────────────────────────────────────────────── */

:root {
  /* Surface */
  --bg: ${bgHex};
  --surface: ${surfaceHex};
  --surface-warm: color-mix(in oklab, var(--surface), var(--fg) 6%);

  /* Foreground */
  --fg: ${fgHex};
  --fg-2: color-mix(in oklab, var(--fg), var(--bg) 15%);
  --muted: color-mix(in oklab, var(--fg), var(--bg) 45%); ${cssComment('TODO: starting guess only — see NOTES.md')}
  --meta: color-mix(in oklab, var(--fg), var(--bg) 65%);

  /* Border */
  --border: color-mix(in oklab, var(--fg), var(--bg) 88%); ${cssComment('TODO: starting guess only — see NOTES.md')}
  --border-soft: color-mix(in oklab, var(--fg), var(--bg) 94%);

  /* Accent */
  ${accentLine}
  --accent-on: ${isDarkCanvas ? '#0a0a0a' : '#ffffff'}; ${cssComment('TODO: starting guess — depends on the real accent hue, see NOTES.md')}
  --accent-hover: color-mix(in oklab, var(--accent), black 8%);
  --accent-active: color-mix(in oklab, var(--accent), black 14%);

  /* Semantic */
  --success: ${parsed.colors.success || '#16a34a'};
  --warn: ${parsed.colors.warning || '#d97706'};
  --danger: ${parsed.colors.danger || '#dc2626'};

  /* Typography — fonts */
  --font-display: "${parsed.typography.displayFont || 'Inter'}", sans-serif;
  --font-body: "${parsed.typography.bodyFont || parsed.typography.displayFont || 'Inter'}", sans-serif; ${cssComment('TODO: verify — see NOTES.md')}
  --font-mono: "${parsed.typography.monoFont || 'JetBrains Mono'}", ui-monospace, monospace;

  /* Radius */
  --radius-sm: ${parsed.roundedSm || '4px'};
  --radius-md: ${parsed.roundedMd || '8px'};

  /* Typography — type scale */
${Object.entries(baseline)
  .filter(([k]) => k.startsWith('--text-'))
  .map(([k, v]) => `  ${k}: ${v};`)
  .join('\n')}

  /* Typography — leading & tracking */
${Object.entries(baseline)
  .filter(([k]) => k.startsWith('--leading-') || k.startsWith('--tracking-'))
  .map(([k, v]) => `  ${k}: ${v};`)
  .join('\n')}

  /* Section rhythm */
${Object.entries(baseline)
  .filter(([k]) => k.startsWith('--section-y-'))
  .map(([k, v]) => `  ${k}: ${v};`)
  .join('\n')}

  /* Layout */
${Object.entries(baseline)
  .filter(([k]) => k.startsWith('--container-'))
  .map(([k, v]) => `  ${k}: ${v};`)
  .join('\n')}
}
`;

  const designMdSkeleton = `# ${name}

> Category: __TODO__

${parsed.description || 'TODO: one-paragraph overview.'}

## Style Foundations

- **Visual style:** TODO
- **Typography scale:** ${parsed.typography.scale || 'TODO'}
- **Typography fonts:** display=${parsed.typography.displayFont || 'TODO'}, body=${parsed.typography.bodyFont || 'TODO'}, mono=${parsed.typography.monoFont || 'TODO'}
- **Spacing scale:** ${parsed.spacingScale || 'TODO'}

## Colors

TODO — fill in once tokens.css's TODOs are resolved.

## Typography

TODO

## Craft notes

TODO
`;

  const manifest = {
    schemaVersion: 'od-design-system-project/v1',
    id: slug,
    name,
    category: '__TODO__',
    description: parsed.description || 'TODO',
    source: {
      type: 'inspired',
      origin: 'Aesthetic concept from bergside/awesome-design-skills (typeui.sh), independently re-authored',
      url: `https://github.com/bergside/awesome-design-skills/tree/main/skills/${slug}`,
    },
    files: {
      design: 'DESIGN.md',
      tokens: 'tokens.css',
    },
    craft: {
      applies: [],
      suggested: ['color', 'accessibility-baseline'],
      exemptions: [],
    },
  };

  return { manifest, tokensCss, designMdSkeleton, notes, collision };
}
