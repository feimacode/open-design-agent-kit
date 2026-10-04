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

.od-btn:disabled, .od-icon-btn:disabled { opacity: .4; cursor: default; pointer-events: none; }
.od-btn:focus-visible, .od-icon-btn:focus-visible, .od-seg-btn:focus-visible, .od-menu-item:focus-visible {
  outline: 2px solid var(--od-blue); outline-offset: 1px;
}
.od-icon { flex: none; display: block; }

/* Square, borderless button holding a single icon; label lives in
   aria-label/title. */
.od-icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; padding: 0; border: none; border-radius: var(--od-radius-sm);
  background: transparent; color: var(--od-text-muted); cursor: pointer;
}
.od-icon-btn:hover { background: var(--od-bg-subtle); color: var(--od-text-strong); }

/* Segmented control: mutually exclusive options in one track. */
.od-segmented {
  display: inline-flex; gap: 2px; padding: 2px; border-radius: var(--od-radius-md);
  background: color-mix(in srgb, var(--od-text) 6%, transparent);
}
.od-seg-btn {
  display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px;
  border: none; border-radius: calc(var(--od-radius-md) - 2px);
  background: transparent; color: var(--od-text-muted); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
}
.od-seg-btn:hover { color: var(--od-text-strong); }
.od-seg-btn.active { background: var(--od-bg); color: var(--od-text-strong); box-shadow: var(--od-shadow-sm); }
body.vscode-dark .od-seg-btn.active { background: var(--od-bg-subtle); }

/* Split button: a primary action plus a chevron that opens related
   actions, joined into one outlined pill. */
.od-split { display: inline-flex; }
.od-split .od-split-main { border-top-right-radius: 0; border-bottom-right-radius: 0; }
.od-split .od-split-toggle { margin-left: -1px; padding: 0 6px; border-top-left-radius: 0; border-bottom-left-radius: 0; }

/* Dropdown menu (see src/webview/dom/menuButton.ts). */
.od-menu {
  position: fixed; z-index: 1000; min-width: 220px; max-width: 320px; padding: 6px;
  display: flex; flex-direction: column;
  border: 1px solid var(--od-border-soft); border-radius: var(--od-radius-md);
  background: var(--od-bg-panel); box-shadow: var(--od-shadow-md);
}
.od-menu-heading { padding: 6px 8px 4px; font-size: 11px; color: var(--od-text-soft); text-transform: uppercase; letter-spacing: .04em; }
.od-menu-sep { height: 1px; margin: 4px 2px; background: var(--od-border-soft); }
.od-menu-item {
  display: flex; align-items: flex-start; gap: 10px; width: 100%; padding: 7px 8px;
  border: none; border-radius: var(--od-radius-sm); background: transparent;
  color: var(--od-text); font: inherit; font-size: 13px; text-align: left; cursor: pointer;
}
.od-menu-item .od-icon { width: 16px; height: 16px; margin-top: 1px; color: var(--od-text-muted); }
.od-menu-item:hover, .od-menu-item:focus { background: var(--od-bg-subtle); outline: none; }
.od-menu-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.od-menu-label { color: var(--od-text-strong); }
.od-menu-desc { font-size: 11px; font-weight: 500; color: var(--od-text-soft); }

.od-count {
  display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px;
  border-radius: var(--od-radius-pill); background: color-mix(in srgb, var(--od-accent-contrast) 22%, transparent);
  font-size: 11px;
}
.od-count:empty { display: none; }

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
