// Vendored from open-design's scripts/generate-design-system-system-assets.ts
// at open-design-v0.22.2 (commit 73953213a6fe). Apache-2.0 — see ./SOURCE.md.
//
// Upstream is a CLI script that reads each bundled design system's
// tokens.css + design-tokens.json from disk and writes system/kit.html and
// kit.dark.html. Only the pure rendering part is kept here (escapeHtml,
// token helpers, cssVars, baseStyle, renderKitHtml), exported, and fed a
// token map + identity by the caller instead of reading files. The template
// markup and CSS are unchanged; the only edits are the exports, the
// `KitIdentity` parameter type (upstream took its Manifest type), and
// dropping the file-reading/index/artifact-page parts.

export type TokenMap = Map<string, string>;

/** What renderKitHtml needs about the design system itself (upstream: its manifest). */
export interface KitIdentity {
  name: string;
  category: string;
  description?: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function token(tokens: TokenMap, names: string[], fallback: string): string {
  for (const name of names) {
    const value = tokens.get(name);
    if (value) return value;
  }
  return fallback;
}

function firstHex(tokens: TokenMap, fallback: string): string {
  for (const value of tokens.values()) {
    const match = value.match(/#[0-9a-fA-F]{6}\b/);
    if (match) return match[0];
  }
  return fallback;
}

export function cssVars(tokens: TokenMap): string {
  const lines = Array.from(tokens.entries())
    .filter(([name]) => /^--[a-zA-Z0-9_-]+$/.test(name))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `    ${name}: ${value};`);
  return [":root {", ...lines, "}"].join("\n");
}

export function baseStyle(tokens: TokenMap, mode: "light" | "dark"): string {
  const bg = mode === "dark" ? "#0f1115" : token(tokens, ["--bg", "--surface"], "#ffffff");
  const surface = mode === "dark" ? "#171a21" : token(tokens, ["--surface", "--bg"], "#ffffff");
  const fg = mode === "dark" ? "#f8fafc" : token(tokens, ["--fg", "--text"], "#111827");
  const muted = mode === "dark" ? "#a7adba" : token(tokens, ["--muted", "--fg-2"], "#6b7280");
  const border = mode === "dark" ? "#2a2f3a" : token(tokens, ["--border"], "#e5e7eb");
  const accent = token(tokens, ["--accent", "--primary"], firstHex(tokens, "#2563eb"));
  const fontBody = token(tokens, ["--font-body", "--font-display"], "Inter, system-ui, sans-serif");
  const fontDisplay = token(tokens, ["--font-display", "--font-body"], fontBody);
  const radius = token(tokens, ["--radius-md", "--radius"], "12px");
  return `
${cssVars(tokens)}
:root {
  --od-page-bg: ${bg};
  --od-surface: ${surface};
  --od-text: ${fg};
  --od-muted: ${muted};
  --od-border: ${border};
  --od-accent: ${accent};
  --od-radius: ${radius};
  --od-font-body: ${fontBody};
  --od-font-display: ${fontDisplay};
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  background: var(--od-page-bg);
  color: var(--od-text);
  font-family: var(--od-font-body);
  -webkit-font-smoothing: antialiased;
}
a { color: inherit; }
.page { width: min(1100px, calc(100vw - 48px)); margin: 0 auto; padding: 72px 0; }
.eyebrow { color: var(--od-accent); font-size: 12px; font-weight: 750; letter-spacing: 0; text-transform: uppercase; }
.hero { display: grid; grid-template-columns: 1.05fr .95fr; gap: 32px; align-items: center; }
h1, h2, h3, p { margin: 0; }
h1, h2, h3 { font-family: var(--od-font-display); letter-spacing: 0; line-height: 1.05; }
h1 { margin-top: 12px; font-size: 64px; }
h2 { font-size: 40px; }
h3 { font-size: 22px; }
.lead { margin-top: 18px; color: var(--od-muted); font-size: 20px; line-height: 1.55; }
.actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 28px; }
.button { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; border-radius: var(--od-radius); padding: 0 18px; font-weight: 750; text-decoration: none; border: 1px solid var(--od-border); }
.button.primary { background: var(--od-accent); border-color: var(--od-accent); color: ${mode === "dark" ? "#0b0b0b" : "#ffffff"}; }
.button.secondary { background: var(--od-surface); }
.panel, .card, .field, .slide, .email, .poster { border: 1px solid var(--od-border); border-radius: var(--od-radius); background: var(--od-surface); }
.panel { padding: 24px; box-shadow: 0 24px 80px rgba(15, 17, 23, ${mode === "dark" ? "0.32" : "0.08"}); }
.metric-grid, .card-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-top: 22px; }
.metric, .card { padding: 18px; }
.metric strong { display: block; font-size: 30px; line-height: 1; }
.metric span, .card p, .field span { color: var(--od-muted); font-size: 14px; line-height: 1.5; }
.chip-row { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
.chip { border: 1px solid var(--od-border); border-radius: 999px; padding: 8px 12px; color: var(--od-muted); }
input, textarea, select { width: 100%; min-height: 44px; border: 1px solid var(--od-border); border-radius: var(--od-radius); background: var(--od-page-bg); color: var(--od-text); font: inherit; padding: 10px 12px; }
label { display: grid; gap: 8px; color: var(--od-muted); font-size: 13px; font-weight: 700; }
@media (max-width: 820px) { .hero, .metric-grid, .card-grid { grid-template-columns: 1fr; } .page { width: min(100vw - 28px, 1100px); padding: 40px 0; } h1 { font-size: 42px; } h2 { font-size: 30px; } }
`;
}

export function renderKitHtml(manifest: KitIdentity, tokens: TokenMap, mode: "light" | "dark"): string {
  const name = escapeHtml(manifest.name);
  const description = escapeHtml(manifest.description ?? `${manifest.name} reference component kit.`);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${name} - ${mode === "dark" ? "dark " : ""}component kit</title>
  <style>${baseStyle(tokens, mode)}</style>
</head>
<body>
  <main class="page">
    <section class="hero">
      <div>
        <p class="eyebrow">${escapeHtml(manifest.category)} system</p>
        <h1>${name} component kit</h1>
        <p class="lead">${description}</p>
        <div class="actions">
          <a class="button primary" href="#">Primary</a>
          <a class="button secondary" href="#">Default</a>
          <a class="button secondary" href="#">Dashed</a>
        </div>
      </div>
      <article class="panel">
        <p class="eyebrow">Reference module</p>
        <h3>Token-driven surface</h3>
        <div class="metric-grid">
          <div class="metric"><strong>12</strong><span>Components</span></div>
          <div class="metric"><strong>4</strong><span>States</span></div>
          <div class="metric"><strong>1</strong><span>Token contract</span></div>
        </div>
        <div class="chip-row">
          <span class="chip">Hover</span>
          <span class="chip">Focus</span>
          <span class="chip">Active</span>
          <span class="chip">Disabled</span>
        </div>
      </article>
    </section>
    <section class="card-grid" aria-label="Component examples">
      <article class="card"><h3>Buttons</h3><p>Primary, secondary, text, and destructive treatments resolve through shared color tokens.</p></article>
      <article class="card"><h3>Inputs</h3><p>Labels, helper text, and focus state use the same spacing and radius scale.</p></article>
      <article class="card"><h3>Cards</h3><p>Information modules keep elevation, border, and padding consistent across breakpoints.</p></article>
    </section>
  </main>
</body>
</html>
`;
}
