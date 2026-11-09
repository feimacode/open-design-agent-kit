// The artifact preview's chrome (toolbar, stage, highlights, pins, panels,
// Tweaks), shared by the VS Code Artifact Preview and the browser preview
// (openspec add-browser-preview). Uses the --od-* tokens from theme.ts.
export const PREVIEW_CHROME_CSS = `
  #root { display: flex; flex-direction: column; height: 100%; }

  /* FileViewer's own toolbar is deliberately flat — no border, no blur
     ("nothing scrolls under this bar... a glass film served no function").
     A hairline bottom border is kept here since, unlike open-design's own
     multi-panel app shell, this webview has no other visual seam separating
     it from VS Code's chrome above it. */
  /* Grouped left to right: mode (segmented) · sibling pager · contextual
     primary (send comments) · output actions (promote, export menu, share
     split). Everything is flex: none except the sibling title, which
     ellipsizes first; then labels collapse to icons via container queries
     instead of wrapping. Every collapsed control keeps its
     title/aria-label. */
  .od-toolbar {
    container-type: inline-size;
    display: flex; align-items: center; gap: 8px; padding: 8px 12px; min-height: 44px;
    background: var(--od-bg); border-bottom: 1px solid var(--od-border-soft); white-space: nowrap; overflow: hidden;
  }
  .od-toolbar [hidden] { display: none !important; }
  .od-toolbar .od-btn { height: 28px; padding: 0 10px; font-size: 12px; flex: none; }
  .od-toolbar .od-btn-primary { padding: 0 12px; }
  .od-toolbar > .od-toolbar-spacer { flex: 1; min-width: 0; }
  .od-toolbar > * { flex: none; }
  .od-toolbar-actions { display: flex; align-items: center; gap: 6px; }

  .od-pager {
    display: flex; align-items: center; gap: 2px;
    padding-left: 8px; border-left: 1px solid var(--od-border-soft);
  }
  .od-pager-pos { font-size: 12px; color: var(--od-text-strong); font-variant-numeric: tabular-nums; padding: 0 2px; }
  .od-pager-kind { color: var(--od-text-muted); }
  .od-shape { display: flex; align-items: center; gap: 4px; padding-left: 8px; border-left: 1px solid var(--od-border-soft); }
  .od-shape-select { height: 28px; max-width: 220px; font-size: 12px; }
  .od-shape-result { font-size: 12px; }
  .od-zoom-select { height: 28px; width: auto; font-size: 12px; }
  .od-shape-result.od-shape-bad { color: #d23b3b; }
  .od-shape-findings { margin: 0; padding-left: 18px; font-size: 12px; line-height: 1.45; }
  .od-shape-finding { margin-bottom: 6px; }
  .od-sev-error b { color: #d23b3b; }
  .od-sev-warning b { color: #c27a00; }
  .od-toolbar > .od-pager-title {
    flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis;
    font-size: 12px; font-weight: 500; color: var(--od-text-muted);
  }

  @container (max-width: 880px) {
    .od-toolbar-actions .od-label, #od-send-comments .od-label { display: none; }
    .od-toolbar-actions .od-btn:not(.od-split-toggle) { padding: 0 8px; }
  }
  @container (max-width: 700px) {
    .od-seg-btn .od-label { display: none; }
    .od-seg-btn { padding: 0 8px; }
  }
  @container (max-width: 640px) {
    .od-toolbar > .od-pager-title, .od-pager-kind { display: none; }
    .od-shape .od-label { display: none; }
  }
  @container (max-width: 480px) {
    .od-toolbar { gap: 4px; padding: 8px; }
    .od-toolbar-actions { gap: 4px; }
    .od-seg-btn { padding: 0 6px; }
    #od-export .od-icon:last-child { display: none; }
  }
  .od-stage { position: relative; flex: 1; min-height: 0; }
  .od-preview { width: 100%; height: 100%; border: none; background: white; }
  .od-pins { position: fixed; inset: 0; pointer-events: none; }

  /* Hover/selection highlight, ported from open-design's own comment-mode
     overlay (apps/web/src/runtime/srcdoc.ts's injectSelectionBridge +
     apps/web/src/styles/viewer/core.css's .comment-target-overlay): a
     single positioned box per state, hover thin, selection thick, same
     blue accent + translucent fill. */
  .od-hover-box, .od-select-box { position: absolute; box-sizing: border-box; border-radius: 2px; pointer-events: none; }
  .od-hover-box { border: 1px solid var(--od-blue); background: color-mix(in srgb, var(--od-blue) 12%, transparent); }
  .od-select-box { border: 2px solid var(--od-blue); background: color-mix(in srgb, var(--od-blue) 16%, transparent); }

  /* Alignment guides for the selected element — a simplified version of
     upstream's edit-mode guide layer (bridge.ts's crosshair reference
     lines), without its live gap/measurement labels between hover and
     selection. */
  .od-guide-line { position: absolute; pointer-events: none; }
  .od-guide-h { height: 0; border-top: 1px dashed color-mix(in srgb, var(--od-blue) 55%, transparent); }
  .od-guide-v { width: 0; border-left: 1px dashed color-mix(in srgb, var(--od-blue) 55%, transparent); }

  /* Comment pin: open-design's actual recipe (viewer/core.css) — a
     42x42 teardrop (round with one squared-off corner), terracotta fill,
     thick white ring, soft shadow. This is open-design's one deliberately
     "hot" accent, reserved specifically for annotations. */
  .od-pin {
    position: absolute; width: 42px; height: 42px; margin-left: -21px; margin-top: -42px;
    border: 3px solid #fff; border-radius: 50% 50% 50% 10px;
    background: var(--od-pin); box-shadow: 0 10px 22px rgba(33, 24, 18, .22);
    cursor: pointer; transition: background 100ms, transform 100ms;
  }
  .od-pin:hover { background: var(--od-pin-hover); transform: translateY(-1px); }
  .od-pin.lost { background: var(--od-text-faint); }
  .od-pin.sent { opacity: .65; }
  .od-comment-note { margin: 0 0 6px; font-weight: 500; white-space: pre-wrap; color: var(--od-text-strong); }
  .od-comment-target { font-size: 11px; color: var(--od-text-muted); word-break: break-all; }

  /* ManualEditPanel's floating variant: glass surface, xlarge radius, soft
     shadow — header/body/footer shape and field density modeled directly
     on open-design's own ManualEditPanel.tsx (a fixed-width floating aside
     with a titlebar, a scrollable field list, and a footer action row). */
  .od-panel { position: absolute; right: 12px; bottom: 12px; width: 340px; max-height: calc(100% - 24px); padding: 0; flex-direction: column; overflow: hidden; }
  .od-panel:not([hidden]) { display: flex; }
  .od-panel-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--od-border-soft); }
  .od-panel-header-title { font-size: 12px; font-weight: 700; color: var(--od-text-strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .od-panel-close { background: none; border: none; color: var(--od-text-muted); cursor: pointer; font-size: 18px; line-height: 1; padding: 0 2px; }
  .od-panel-close:hover { color: var(--od-text-strong); }
  .od-panel-body { padding: 10px 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
  .od-panel-section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--od-text-faint); margin-top: 10px; }
  .od-panel-section-title:first-child { margin-top: 0; }
  .od-panel label { font-size: 11px; color: var(--od-text-muted); margin-top: 4px; display: block; }
  .od-panel textarea, .od-panel input, .od-panel select { margin-top: 2px; }
  .od-row-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .od-row-quad { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .od-row-quad label { text-align: center; }
  .od-color-input { height: 30px; padding: 2px; cursor: pointer; }
  .od-panel-footer { display: flex; align-items: center; gap: 6px; padding: 10px 12px; border-top: 1px solid var(--od-border-soft); }
  .od-panel-footer .od-spacer { flex: 1; }
  .od-verbs { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
  .od-verbs .od-verb { height: 26px; padding: 0 9px; font-size: 11px; border-radius: 13px; }
  .od-panel-footer button { height: 30px; padding: 0 14px; }
  .od-errors { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); z-index: 5; max-width: min(720px, calc(100% - 24px)); display: flex; align-items: center; gap: 10px; padding: 8px 10px 8px 12px; border: 1px solid var(--od-red); border-radius: 8px; background: var(--od-bg); box-shadow: 0 4px 16px rgba(0,0,0,.18); font-size: 12px; }
  .od-errors[hidden] { display: none; }
  .od-errors-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .od-errors-text strong { color: var(--od-red); }
  .od-errors-text code { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--od-text-muted); }
  .od-errors .od-btn { flex: none; height: 28px; }
  .od-tweaks { top: 12px; bottom: 12px; width: 320px; max-height: none; }
  .od-tweaks .od-panel-footer { flex-wrap: wrap; }
  .od-tweaks .od-panel-footer button { padding: 0 10px; }
  #od-tweaks-toggle.active { background: var(--od-bg-subtle); border-color: var(--od-border-strong); }
  .od-tweak { display: flex; flex-direction: column; gap: 2px; }
  .od-tweak label { display: flex; gap: 6px; align-items: baseline; }
  .od-tweak-note { font-size: 10px; color: var(--od-text-faint); }
  .od-tweak-row { display: flex; align-items: center; gap: 6px; }
  .od-tweak-color { width: 36px; flex: none; }
  .od-tweak-text { flex: 1; min-width: 0; }
  .od-tweak-range { flex: 1; min-width: 0; accent-color: var(--od-text-strong); }
  .od-tweak-num { width: 64px; flex: none; }
  .od-tweak-unit { font-size: 11px; color: var(--od-text-muted); min-width: 18px; }
  .od-tweak-wide { width: 100%; }
  .od-tweak-swatch { width: 18px; height: 18px; border-radius: 4px; border: 1px solid var(--od-border-strong); cursor: pointer; padding: 0; flex: none; }
  .od-tweak-more { margin-top: 10px; }
  .od-tweak-more summary { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--od-text-faint); cursor: pointer; }
  .od-tweak-empty, .od-tweak-ds { border: 1px solid var(--od-border-soft); border-radius: 6px; padding: 8px 10px; margin: 6px 0; font-size: 12px; display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
  .od-tweak-empty p, .od-tweak-ds p { margin: 0; color: var(--od-text-muted); }
  .od-tweak-warn { margin: 0 0 6px; font-size: 12px; color: var(--od-red); }
`;
