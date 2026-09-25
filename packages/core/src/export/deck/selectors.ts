// Deck selector families, values identical to upstream Open Design's
// apps/desktop/src/main/deck-capture.ts (commit 1b47e60bd466, Apache-2.0) —
// see ../../vendored/SOURCE.md. Decks ship under several conventions (`.slide`,
// `<section data-screen-label>`, `.deck-slide`, `.ppt-slide`), nested in
// different ways; presenter-mode clones are excluded rather than matched with a
// rigid direct-child selector.
export const SLIDE_SELECTOR = '.slide, [data-screen-label], .deck-slide, .ppt-slide';
export const PRESENTER_CLONE_SELECTOR = '.mini-slide, .overview, .notes-overlay, .thumb';
// Presenter chrome that must not bleed into a captured slide. Avoids bare
// `.notes`/`.overview`/`.hint`: generic enough to be authored content.
// Divergence: + `.nav-hint`, the keyboard-hint bar several vendored
// html-ppt-zhangzara decks place outside their slides.
export const HIDE_CHROME_SELECTOR = '.progress-bar, .notes-overlay, aside.notes, .speaker-notes, .deck-nav, .deck-hint, .deck-counter, .nav-hint';
export const DECK_STAGE_SELECTOR = 'deck-stage, #deck-stage, .deck-stage';

/** Default stage when the authored slide box can't be measured. */
export const DEFAULT_SLIDE_W = 1920;
export const DEFAULT_SLIDE_H = 1080;
export const SLIDE_MIN_PX = 320;
export const SLIDE_MAX_PX = 8192;
