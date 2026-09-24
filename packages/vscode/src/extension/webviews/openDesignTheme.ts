import * as vscode from 'vscode';

/**
 * A from-scratch reproduction (not a literal copy-paste — the values are
 * hand-transcribed from open-design's own token files) of open-design's
 * actual visual design language, for the extension's webviews to share.
 * Source (read directly, not guessed): apps/web/src/styles/tokens.css,
 * base.css, primitives.css, viewer/core.css, viewer/memory.css,
 * home/plugin-marketplace-demo.css. See openspec/changes/archive/
 * 2026-09-19-open-design-visual-language/design.md for the full mapping
 * and what was deliberately simplified (no icon system, single shadow set
 * shared across light/dark rather than open-design's fully separate ones).
 *
 * VS Code adds `vscode-dark`/`vscode-light`/`vscode-high-contrast` classes
 * to every webview's <body> automatically — used here to switch between
 * open-design's own light/dark token sets (not whatever arbitrary colors
 * the user's current VS Code theme happens to have), so the extension's
 * views look like Open Design regardless of the ambient editor theme.
 */

export function odFontFaceCss(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const fontUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'assets', 'fonts', 'AlbertSans-VariableFont_wght.ttf'));
  return `
@font-face {
  font-family: 'Albert Sans';
  src: url('${fontUri}') format('truetype');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}`;
}

export const OD_TOKENS_CSS = `
:root {
  --od-bg: #ffffff;
  --od-bg-panel: #fafafa;
  --od-bg-subtle: #ededed;
  --od-bg-muted: #dbdbdb;
  --od-text: #494949;
  --od-text-strong: #202020;
  --od-text-muted: #5c5c5c;
  --od-text-soft: #848484;
  --od-text-faint: #bdbdbd;
  --od-border: #dbdbdb;
  --od-border-strong: #bdbdbd;
  --od-border-soft: #ededed;
  --od-accent-fill: #202020;
  --od-accent-contrast: #fafafa;
  --od-brand: #87ea5c;
  --od-brand-ink: #007106;
  --od-brand-surface: #f2fff2;
  --od-blue: #1a74ff;
  --od-green: #00aa54;
  --od-red: #f04142;
  --od-amber: #ff7528;
  --od-pin: #d96a46;
  --od-pin-hover: #c95e3e;
  --od-radius-xs: 2px;
  --od-radius-sm: 4px;
  --od-radius-md: 8px;
  --od-radius-lg: 12px;
  --od-radius-xl: 16px;
  --od-radius-pill: 999px;
  --od-shadow-sm: 0 1px 2px rgba(0, 0, 0, .05), 0 1px 3px rgba(0, 0, 0, .04);
  --od-shadow-md: 0 6px 24px rgba(0, 0, 0, .07), 0 2px 6px rgba(0, 0, 0, .04);
  --od-shadow-lg: 0 24px 60px rgba(0, 0, 0, .16), 0 8px 16px rgba(0, 0, 0, .07);
  --od-font: 'Albert Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

body.vscode-dark {
  --od-bg: #202020;
  --od-bg-panel: #353535;
  --od-bg-subtle: #494949;
  --od-bg-muted: #5c5c5c;
  --od-text: #ededed;
  --od-text-strong: #fafafa;
  --od-text-muted: #b3b3b3;
  --od-text-soft: #8f8f8f;
  --od-text-faint: #6b6b6b;
  --od-border: #5c5c5c;
  --od-border-strong: #6f6f6f;
  --od-border-soft: #494949;
  --od-accent-fill: #fafafa;
  --od-accent-contrast: #202020;
  --od-brand-surface: #164111;
  --od-brand-ink: #a8f57a;
  --od-shadow-sm: 0 1px 2px rgba(0, 0, 0, .3), 0 1px 3px rgba(0, 0, 0, .25);
  --od-shadow-md: 0 6px 24px rgba(0, 0, 0, .4), 0 2px 6px rgba(0, 0, 0, .3);
  --od-shadow-lg: 0 24px 60px rgba(0, 0, 0, .55), 0 8px 16px rgba(0, 0, 0, .35);
}

* { box-sizing: border-box; }
html, body { height: 100%; }
body {
  margin: 0; padding: 0;
  font-family: var(--od-font); font-size: 14px; font-weight: 600; line-height: 1.25;
  color: var(--od-text); background: var(--od-bg);
}

.od-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 36px; padding: 0 16px; border: 1px solid var(--od-border); border-radius: var(--od-radius-sm);
  background: transparent; color: var(--od-text); font: inherit; font-weight: 600; font-size: 13px; cursor: pointer;
  transition: background 100ms, border-color 100ms;
}
.od-btn:hover { background: var(--od-bg-subtle); border-color: var(--od-border-strong); }
.od-btn:active { transform: translateY(1px); }

.od-btn-primary {
  border: none; border-radius: var(--od-radius-pill);
  background: var(--od-accent-fill); color: var(--od-accent-contrast);
}
.od-btn-primary:hover { background: var(--od-accent-fill); opacity: .88; }

.od-btn-danger { background: var(--od-red); color: #fff; border-color: var(--od-red); }

.od-tab {
  height: 28px; padding: 0 12px; border: 1px solid transparent; border-radius: var(--od-radius-sm);
  background: transparent; color: var(--od-text-muted); font: inherit; font-weight: 600; font-size: 12px; cursor: pointer;
}
.od-tab:hover { background: var(--od-bg-subtle); }
.od-tab.active {
  border-color: var(--od-border-strong);
  background: color-mix(in srgb, var(--od-text) 6%, transparent);
  color: var(--od-text-strong);
}

.od-badge {
  display: inline-flex; align-items: center; height: 18px; padding: 0 8px; border-radius: var(--od-radius-pill);
  background: color-mix(in srgb, var(--od-text) 5%, transparent); color: var(--od-text-muted);
  font-size: 12px; font-weight: 600; white-space: nowrap;
}
.od-badge-active { background: var(--od-brand-surface); color: var(--od-brand-ink); }

.od-panel {
  border-radius: var(--od-radius-lg);
  background: color-mix(in srgb, var(--od-bg-panel) 94%, transparent);
  backdrop-filter: blur(20px) saturate(1.8);
  -webkit-backdrop-filter: blur(20px) saturate(1.8);
  box-shadow: var(--od-shadow-lg);
  border: 1px solid var(--od-border-soft);
}
.od-panel-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: var(--od-text-muted); }

.od-input, .od-textarea, .od-select {
  background: var(--od-bg-subtle); color: var(--od-text); border: 1px solid var(--od-border);
  border-radius: var(--od-radius-sm); padding: 6px 8px; font: inherit; font-size: 13px; width: 100%;
}
.od-input:focus, .od-textarea:focus { outline: none; border-color: var(--od-text-strong); }
.od-input::placeholder, .od-textarea::placeholder { color: var(--od-text-faint); }
`;
