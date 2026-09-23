import { ensureDataOdId, cssSelectorFor, htmlHintFor } from './dom/elementTargeting';
import { applyPatch, serializeDocument, type ManualEditPatch, type CuratedStyles } from './dom/sourcePatches';
import { computePinPosition, type ArtifactComment } from './dom/commentOverlay';
import { captureFigmaIr } from './dom/figmaCapture';

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

type Mode = 'view' | 'comment' | 'edit';

const vscode = acquireVsCodeApi();

const root = document.getElementById('root')!;
root.innerHTML = `
  <div class="od-toolbar">
    <button data-mode="view" class="od-tab active">View</button>
    <button data-mode="comment" class="od-tab">Comment</button>
    <button data-mode="edit" class="od-tab">Edit</button>
    <span id="od-collection-nav" class="od-collection-nav" hidden>
      <button id="od-collection-prev" class="od-btn" title="Previous screen in this collection">◀</button>
      <span id="od-collection-label" class="od-collection-label"></span>
      <button id="od-collection-next" class="od-btn" title="Next screen in this collection">▶</button>
    </span>
    <span class="od-toolbar-spacer"></span>
    <button id="od-promote-to-app" class="od-btn" title="Port this artifact into the app's real code">Promote to App Code</button>
    <button id="od-push-to-figma" class="od-btn" title="Export this artifact as an editable Figma layer capture">Push to Figma</button>
    <button id="od-share-to-community" class="od-btn" title="Package this artifact as a new community design and open a PR to awesome-open-design">Share to Community</button>
    <button id="od-send-comments" class="od-btn od-btn-primary" hidden>Send comments to chat</button>
  </div>
  <div class="od-stage">
    <iframe id="od-preview" class="od-preview" sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-pointer-lock allow-modals"></iframe>
    <div id="od-pins" class="od-pins"></div>
  </div>
  <div id="od-panel" class="od-panel" hidden></div>
`;

const iframe = document.getElementById('od-preview') as HTMLIFrameElement;
const pinsLayer = document.getElementById('od-pins')!;
const panel = document.getElementById('od-panel')!;
const sendCommentsBtn = document.getElementById('od-send-comments') as HTMLButtonElement;
const promoteToAppBtn = document.getElementById('od-promote-to-app') as HTMLButtonElement;
const pushToFigmaBtn = document.getElementById('od-push-to-figma') as HTMLButtonElement;
const shareToCommunityBtn = document.getElementById('od-share-to-community') as HTMLButtonElement;
const collectionNav = document.getElementById('od-collection-nav') as HTMLSpanElement;
const collectionLabel = document.getElementById('od-collection-label') as HTMLSpanElement;
const collectionPrevBtn = document.getElementById('od-collection-prev') as HTMLButtonElement;
const collectionNextBtn = document.getElementById('od-collection-next') as HTMLButtonElement;

let mode: Mode = 'view';
let comments: ArtifactComment[] = [];
// Hover/selection state, ported (simplified) from open-design's own
// comment-mode overlay approach (apps/web/src/runtime/srcdoc.ts's
// injectSelectionBridge): one positioned box per state, hover thin,
// selection thick, same box shape — chosen over their edit-mode bridge
// (which draws Figma-style alignment/measurement guides between hover and
// selection) as the simpler model that's still a real, visible affordance
// for "what am I about to click" / "what's currently selected". Our iframe
// is same-origin srcdoc (`allow-same-origin`), so this reads
// `getBoundingClientRect()` directly rather than needing their
// cross-origin postMessage bridge.
let hoverElement: Element | null = null;
let selectedElement: Element | null = null;

function setMode(next: Mode): void {
  mode = next;
  document.querySelectorAll('.od-tab').forEach((btn) => btn.classList.toggle('active', (btn as HTMLElement).dataset.mode === next));
  sendCommentsBtn.hidden = next !== 'comment';
  panel.hidden = true;
  selectedElement = null;
  hoverElement = null;
  updatePickMode();
  renderOverlays();
}

document.querySelectorAll<HTMLButtonElement>('.od-tab').forEach((btn) => {
  btn.addEventListener('click', () => setMode(btn.dataset.mode as Mode));
});

function setIframeContent(html: string): void {
  iframe.srcdoc = html;
}

iframe.addEventListener('load', () => {
  const doc = iframe.contentDocument;
  if (!doc) return;
  doc.addEventListener('click', onIframeClick, true);
  doc.addEventListener('mouseover', onIframeMouseOver, true);
  doc.addEventListener('mouseout', onIframeMouseOut, true);
  updatePickMode();
  renderOverlays();
});

const INSPECT_OVERRIDE_STYLE_ID = 'od-inspect-override';

// Comment/Edit mode need EVERY element selectable for annotation/editing —
// but many generated artifacts set `pointer-events: none` on most of the
// page as part of a loading/entrance-animation state (common with
// GSAP/IntersectionObserver-driven reveal effects), only lifted once a
// "ready" script runs — a script that may never fire correctly inside this
// sandboxed srcdoc iframe (same general class of issue as the earlier
// "navigation not working" sandbox fix). Only genuinely-interactive
// elements like <button> escape it via their own default stacking, which
// is exactly the "only buttons are selectable" symptom this fixes: force
// every element hit-testable while picking, regardless of what the
// artifact's own live interactivity styling says, and drop the override in
// View mode so the artifact still behaves exactly as a real visitor sees it.
function updateInspectOverride(): void {
  const doc = iframe.contentDocument;
  if (!doc?.head) return;
  const existing = doc.getElementById(INSPECT_OVERRIDE_STYLE_ID) as HTMLStyleElement | null;
  if (mode === 'view') {
    existing?.remove();
    return;
  }
  const styleEl = existing ?? doc.createElement('style');
  styleEl.id = INSPECT_OVERRIDE_STYLE_ID;
  styleEl.textContent = '* { pointer-events: auto !important; }';
  if (!existing) doc.head.appendChild(styleEl);
}

// Ambient "you're in pick mode" signal, matching upstream forcing
// cursor:pointer/crosshair on the whole preview body while comment/edit
// mode is active — visible even before hovering a specific element.
function updatePickMode(): void {
  const doc = iframe.contentDocument;
  if (doc?.body) doc.body.style.cursor = mode === 'view' ? '' : 'pointer';
  updateInspectOverride();
}

function isHighlightable(el: Element | null): el is HTMLElement {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'html' || tag === 'body') return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function onIframeMouseOver(event: MouseEvent): void {
  if (mode === 'view') return;
  const target = event.target as Element | null;
  hoverElement = isHighlightable(target) && target !== selectedElement ? target : null;
  renderOverlays();
}

function onIframeMouseOut(): void {
  hoverElement = null;
  renderOverlays();
}

function onIframeClick(event: MouseEvent): void {
  if (mode === 'view') return;
  event.preventDefault();
  event.stopPropagation();
  const target = event.target as Element | null;
  if (!target) return;

  const id = ensureDataOdId(target);
  selectedElement = target;
  hoverElement = null;
  renderOverlays();

  if (mode === 'comment') {
    openCommentInput(target, id);
  } else if (mode === 'edit') {
    // `target` comes from the iframe's own document — a separate JS realm
    // from this script's — so `target instanceof HTMLElement` (checked
    // against THIS frame's HTMLElement constructor) always fails silently
    // even for a genuine element, no matter what's clicked. A real click
    // event's target is always an element (never a bare text node), so the
    // check added nothing but the cross-realm bug; a plain type assertion
    // is correct here.
    openEditPanel(target as HTMLElement, id);
  }
}

// Shared by openCommentInput/openEditPanel: hides the panel and clears the
// selection highlight together, so "closing the panel" always also means
// "nothing is selected anymore" — matching upstream, where deselection is
// click-driven (another element, empty canvas, or leaving the mode) with
// no separate "panel closed but still selected" state.
function closePanel(): void {
  panel.hidden = true;
  selectedElement = null;
  renderOverlays();
}

function openCommentInput(target: Element, elementId: string): void {
  panel.hidden = false;
  panel.innerHTML = `
    <div class="od-panel-header">
      <span class="od-panel-header-title">Add comment</span>
      <button id="od-comment-close" class="od-panel-close" aria-label="Close">×</button>
    </div>
    <div class="od-panel-body">
      <textarea id="od-comment-text" class="od-textarea" rows="3" placeholder="What should change here?"></textarea>
    </div>
    <div class="od-panel-footer">
      <span class="od-spacer"></span>
      <button id="od-comment-cancel" class="od-btn">Cancel</button>
      <button id="od-comment-save" class="od-btn od-btn-primary">Add</button>
    </div>
  `;
  document.getElementById('od-comment-close')!.addEventListener('click', closePanel);
  document.getElementById('od-comment-cancel')!.addEventListener('click', closePanel);
  document.getElementById('od-comment-save')!.addEventListener('click', () => {
    const text = (document.getElementById('od-comment-text') as HTMLTextAreaElement).value.trim();
    if (!text) return;
    const now = new Date().toISOString();
    comments.push({
      id: `c-${Math.random().toString(36).slice(2, 10)}`,
      elementId,
      selector: cssSelectorFor(target),
      htmlHint: htmlHintFor(target),
      note: text,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    });
    persistComments();
    closePanel();
  });
}

// Element-kind-aware Content section + a much larger curated Style section,
// modeled on open-design's own ManualEditPanel.tsx (read directly — see
// openspec design notes) rather than the earlier one-size-fits-all
// text/color/font-size/padding form: image/link/container elements each
// get their own relevant fields, and Style now covers typography, box
// model (per-side padding/margin), border, and opacity — still a curated
// subset (no flex-layout controls, no design-token reference strip, no
// drag-to-reposition, no in-panel undo/redo — VS Code's own document undo
// already covers every applied patch), not full parity.
type EditKind = 'image' | 'link' | 'text' | 'container';

function classifyEditKind(el: HTMLElement): EditKind {
  if (el.tagName === 'IMG') return 'image';
  if (el.tagName === 'A') return 'link';
  return el.children.length > 0 ? 'container' : 'text';
}

function describeElement(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  const text = (el.textContent ?? '').trim().slice(0, 28);
  return text ? `&lt;${tag}&gt; — ${escapeHtml(text)}` : `&lt;${tag}&gt;`;
}

function pxOf(value: string): string {
  const n = parseFloat(value);
  return Number.isFinite(n) ? String(Math.round(n)) : '0';
}

function pxPatchValue(raw: string): string | undefined {
  const n = parseFloat(raw);
  return Number.isFinite(n) ? `${n}px` : undefined;
}

function rawPatchValue(raw: string): string | undefined {
  const trimmed = raw.trim();
  return trimmed ? trimmed : undefined;
}

const FONT_FAMILIES = ['inherit', 'Space Grotesk', 'Inter', 'Georgia', 'Arial', 'Helvetica', 'Times New Roman', 'Roboto', 'monospace'];
const FONT_WEIGHTS = ['400', '500', '600', '700', '800', '900'];
const TEXT_ALIGNS = ['left', 'center', 'right', 'justify'];
const BORDER_STYLES = ['none', 'solid', 'dashed', 'dotted', 'double'];

function optionsFor(values: string[], selected: string): string {
  return values.map((v) => `<option value="${v}" ${v === selected ? 'selected' : ''}>${v}</option>`).join('');
}

function contentSectionHtml(target: HTMLElement, kind: EditKind): string {
  if (kind === 'image') {
    return `
      <div class="od-panel-section-title">Content</div>
      <label>Image URL</label>
      <input id="od-edit-src" class="od-input" type="text" value="${escapeHtml(target.getAttribute('src') ?? '')}" />
      <label>Alt text</label>
      <input id="od-edit-alt" class="od-input" type="text" value="${escapeHtml(target.getAttribute('alt') ?? '')}" />
    `;
  }
  if (kind === 'link') {
    return `
      <div class="od-panel-section-title">Content</div>
      <label>Text</label>
      <textarea id="od-edit-text" class="od-textarea" rows="2">${escapeHtml(target.textContent ?? '')}</textarea>
      <label>Link URL (href)</label>
      <input id="od-edit-href" class="od-input" type="text" value="${escapeHtml(target.getAttribute('href') ?? '')}" />
    `;
  }
  if (kind === 'container') {
    return `
      <div class="od-panel-section-title">Content (raw HTML)</div>
      <textarea id="od-edit-html" class="od-textarea" rows="5">${escapeHtml(target.outerHTML)}</textarea>
    `;
  }
  return `
    <div class="od-panel-section-title">Content</div>
    <label>Text</label>
    <textarea id="od-edit-text" class="od-textarea" rows="3">${escapeHtml(target.textContent ?? '')}</textarea>
  `;
}

function styleSectionHtml(cs: CSSStyleDeclaration): string {
  return `
    <div class="od-panel-section-title">Style</div>
    <div class="od-row-pair">
      <div><label>Text color</label><input id="od-edit-color" class="od-input od-color-input" type="color" value="${rgbToHex(cs.color)}" /></div>
      <div><label>Background</label><input id="od-edit-bg" class="od-input od-color-input" type="color" value="${rgbToHex(cs.backgroundColor)}" /></div>
    </div>
    <div class="od-row-pair">
      <div><label>Font size (px)</label><input id="od-edit-font-size" class="od-input" type="number" min="1" value="${pxOf(cs.fontSize) || '16'}" /></div>
      <div><label>Font weight</label><select id="od-edit-font-weight" class="od-select">${optionsFor(FONT_WEIGHTS, String(parseInt(cs.fontWeight, 10) || 400))}</select></div>
    </div>
    <div class="od-row-pair">
      <div><label>Line height</label><input id="od-edit-line-height" class="od-input" type="text" value="${cs.lineHeight === 'normal' ? '' : pxOf(cs.lineHeight)}" placeholder="normal" /></div>
      <div><label>Letter spacing (px)</label><input id="od-edit-letter-spacing" class="od-input" type="text" value="${cs.letterSpacing === 'normal' ? '' : pxOf(cs.letterSpacing)}" placeholder="normal" /></div>
    </div>
    <div class="od-row-pair">
      <div><label>Font family</label><select id="od-edit-font-family" class="od-select">${optionsFor(FONT_FAMILIES, 'inherit')}</select></div>
      <div><label>Text align</label><select id="od-edit-text-align" class="od-select">${optionsFor(TEXT_ALIGNS, cs.textAlign)}</select></div>
    </div>
    <div class="od-row-pair">
      <div><label>Border radius (px)</label><input id="od-edit-radius" class="od-input" type="number" min="0" value="${pxOf(cs.borderTopLeftRadius)}" /></div>
      <div><label>Opacity</label><input id="od-edit-opacity" class="od-input" type="number" min="0" max="1" step="0.1" value="${parseFloat(cs.opacity || '1').toFixed(1)}" /></div>
    </div>
    <div class="od-row-pair">
      <div><label>Border color</label><input id="od-edit-border-color" class="od-input od-color-input" type="color" value="${rgbToHex(cs.borderColor)}" /></div>
      <div><label>Border width (px)</label><input id="od-edit-border-width" class="od-input" type="number" min="0" value="${pxOf(cs.borderTopWidth)}" /></div>
    </div>
    <label>Border style</label>
    <select id="od-edit-border-style" class="od-select">${optionsFor(BORDER_STYLES, BORDER_STYLES.includes(cs.borderTopStyle) ? cs.borderTopStyle : 'none')}</select>

    <div class="od-panel-section-title">Padding (px)</div>
    <div class="od-row-quad">
      <div><label>T</label><input id="od-edit-pad-t" class="od-input" type="number" min="0" value="${pxOf(cs.paddingTop)}" /></div>
      <div><label>R</label><input id="od-edit-pad-r" class="od-input" type="number" min="0" value="${pxOf(cs.paddingRight)}" /></div>
      <div><label>B</label><input id="od-edit-pad-b" class="od-input" type="number" min="0" value="${pxOf(cs.paddingBottom)}" /></div>
      <div><label>L</label><input id="od-edit-pad-l" class="od-input" type="number" min="0" value="${pxOf(cs.paddingLeft)}" /></div>
    </div>

    <div class="od-panel-section-title">Margin (px)</div>
    <div class="od-row-quad">
      <div><label>T</label><input id="od-edit-mar-t" class="od-input" type="number" value="${pxOf(cs.marginTop)}" /></div>
      <div><label>R</label><input id="od-edit-mar-r" class="od-input" type="number" value="${pxOf(cs.marginRight)}" /></div>
      <div><label>B</label><input id="od-edit-mar-b" class="od-input" type="number" value="${pxOf(cs.marginBottom)}" /></div>
      <div><label>L</label><input id="od-edit-mar-l" class="od-input" type="number" value="${pxOf(cs.marginLeft)}" /></div>
    </div>
  `;
}

function openEditPanel(target: HTMLElement, elementId: string): void {
  const kind = classifyEditKind(target);
  const cs = getComputedStyle(target);

  panel.hidden = false;
  panel.innerHTML = `
    <div class="od-panel-header">
      <span class="od-panel-header-title">${describeElement(target)}</span>
      <button id="od-edit-close" class="od-panel-close" aria-label="Close">×</button>
    </div>
    <div class="od-panel-body">
      ${contentSectionHtml(target, kind)}
      ${styleSectionHtml(cs)}
    </div>
    <div class="od-panel-footer">
      <button id="od-edit-remove" class="od-btn od-btn-danger">Remove</button>
      <span class="od-spacer"></span>
      <button id="od-edit-cancel" class="od-btn">Cancel</button>
      <button id="od-edit-apply" class="od-btn od-btn-primary">Save</button>
    </div>
  `;

  document.getElementById('od-edit-close')!.addEventListener('click', closePanel);
  document.getElementById('od-edit-cancel')!.addEventListener('click', closePanel);
  document.getElementById('od-edit-remove')!.addEventListener('click', () => {
    commitPatch({ kind: 'remove-element', elementId });
    closePanel();
  });
  document.getElementById('od-edit-apply')!.addEventListener('click', () => {
    if (kind === 'image') {
      commitPatch({
        kind: 'set-image',
        elementId,
        src: (document.getElementById('od-edit-src') as HTMLInputElement).value,
        alt: (document.getElementById('od-edit-alt') as HTMLInputElement).value,
      });
    } else if (kind === 'link') {
      commitPatch({
        kind: 'set-link',
        elementId,
        text: (document.getElementById('od-edit-text') as HTMLTextAreaElement).value,
        href: (document.getElementById('od-edit-href') as HTMLInputElement).value,
      });
    } else if (kind === 'container') {
      commitPatch({ kind: 'set-outer-html', elementId, html: (document.getElementById('od-edit-html') as HTMLTextAreaElement).value });
    } else {
      commitPatch({ kind: 'set-text', elementId, value: (document.getElementById('od-edit-text') as HTMLTextAreaElement).value });
    }

    const styles: CuratedStyles = {
      color: (document.getElementById('od-edit-color') as HTMLInputElement).value,
      backgroundColor: (document.getElementById('od-edit-bg') as HTMLInputElement).value,
      fontSize: pxPatchValue((document.getElementById('od-edit-font-size') as HTMLInputElement).value),
      fontWeight: (document.getElementById('od-edit-font-weight') as HTMLSelectElement).value,
      lineHeight: rawPatchValue((document.getElementById('od-edit-line-height') as HTMLInputElement).value),
      letterSpacing: pxPatchValue((document.getElementById('od-edit-letter-spacing') as HTMLInputElement).value),
      fontFamily: (document.getElementById('od-edit-font-family') as HTMLSelectElement).value,
      textAlign: (document.getElementById('od-edit-text-align') as HTMLSelectElement).value,
      borderRadius: pxPatchValue((document.getElementById('od-edit-radius') as HTMLInputElement).value),
      opacity: rawPatchValue((document.getElementById('od-edit-opacity') as HTMLInputElement).value),
      borderColor: (document.getElementById('od-edit-border-color') as HTMLInputElement).value,
      borderWidth: pxPatchValue((document.getElementById('od-edit-border-width') as HTMLInputElement).value),
      borderStyle: (document.getElementById('od-edit-border-style') as HTMLSelectElement).value,
      paddingTop: pxPatchValue((document.getElementById('od-edit-pad-t') as HTMLInputElement).value),
      paddingRight: pxPatchValue((document.getElementById('od-edit-pad-r') as HTMLInputElement).value),
      paddingBottom: pxPatchValue((document.getElementById('od-edit-pad-b') as HTMLInputElement).value),
      paddingLeft: pxPatchValue((document.getElementById('od-edit-pad-l') as HTMLInputElement).value),
      marginTop: pxPatchValue((document.getElementById('od-edit-mar-t') as HTMLInputElement).value),
      marginRight: pxPatchValue((document.getElementById('od-edit-mar-r') as HTMLInputElement).value),
      marginBottom: pxPatchValue((document.getElementById('od-edit-mar-b') as HTMLInputElement).value),
      marginLeft: pxPatchValue((document.getElementById('od-edit-mar-l') as HTMLInputElement).value),
    };
    commitPatch({ kind: 'set-style', elementId, styles });
    closePanel();
  });
}

function commitPatch(patch: ManualEditPatch): void {
  const doc = iframe.contentDocument;
  if (!doc) return;
  const applied = applyPatch(doc, patch);
  if (!applied) return;
  const newSource = serializeDocument(doc);
  vscode.postMessage({ type: 'apply-patch', newSource });
  renderOverlays();
}

function persistComments(): void {
  vscode.postMessage({ type: 'comments-changed', comments });
}

// Rect of `el` in the HOST document's coordinate space — the iframe's own
// rect plus the element's rect within it, same technique
// commentOverlay.ts's computePinPosition already uses for pins.
function hostRectOf(el: Element): { left: number; top: number; width: number; height: number } {
  const iframeRect = iframe.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  return { left: iframeRect.left + elRect.left, top: iframeRect.top + elRect.top, width: elRect.width, height: elRect.height };
}

function highlightBox(rect: { left: number; top: number; width: number; height: number }, className: string): HTMLDivElement {
  const box = document.createElement('div');
  box.className = className;
  box.style.left = `${rect.left}px`;
  box.style.top = `${rect.top}px`;
  box.style.width = `${rect.width}px`;
  box.style.height = `${rect.height}px`;
  return box;
}

// Figma-style alignment guides: dashed lines extending from the selected
// element's four edges across the full canvas, so you can see how it lines
// up against the rest of the layout at a glance — a simplified version of
// upstream's edit-mode guide layer (which also draws live gap/measurement
// labels between hover and selection; not ported, this is the "grid"
// reference part only).
function selectionGuides(rect: { left: number; top: number; width: number; height: number }): HTMLDivElement[] {
  const stage = iframe.getBoundingClientRect();
  const h = (top: number): HTMLDivElement => {
    const line = document.createElement('div');
    line.className = 'od-guide-line od-guide-h';
    line.style.left = `${stage.left}px`;
    line.style.top = `${top}px`;
    line.style.width = `${stage.width}px`;
    return line;
  };
  const v = (left: number): HTMLDivElement => {
    const line = document.createElement('div');
    line.className = 'od-guide-line od-guide-v';
    line.style.top = `${stage.top}px`;
    line.style.left = `${left}px`;
    line.style.height = `${stage.height}px`;
    return line;
  };
  return [h(rect.top), h(rect.top + rect.height), v(rect.left), v(rect.left + rect.width)];
}

function renderOverlays(): void {
  pinsLayer.innerHTML = '';

  if (hoverElement && isHighlightable(hoverElement)) {
    pinsLayer.appendChild(highlightBox(hostRectOf(hoverElement), 'od-hover-box'));
  }
  if (selectedElement && isHighlightable(selectedElement)) {
    const rect = hostRectOf(selectedElement);
    selectionGuides(rect).forEach((line) => pinsLayer.appendChild(line));
    pinsLayer.appendChild(highlightBox(rect, 'od-select-box'));
  }

  if (mode !== 'comment') return;
  const doc = iframe.contentDocument;
  if (!doc) return;
  for (const comment of comments) {
    if (comment.status === 'resolved') continue;
    const pos = computePinPosition(iframe, doc, comment);
    const pin = document.createElement('div');
    pin.className = `od-pin ${pos ? 'anchored' : 'lost'}`;
    pin.title = comment.note;
    if (pos) {
      pin.style.left = `${pos.x}px`;
      pin.style.top = `${pos.y}px`;
    } else {
      pin.style.left = '8px';
      pin.style.top = '8px';
    }
    pinsLayer.appendChild(pin);
  }
}

sendCommentsBtn.addEventListener('click', () => {
  const open = comments.filter((c) => c.status === 'open');
  if (open.length === 0) return;
  vscode.postMessage({ type: 'send-comments-to-chat', comments: open });
  const now = new Date().toISOString();
  for (const c of open) {
    c.status = 'sent';
    c.updatedAt = now;
  }
  persistComments();
  renderOverlays();
});

promoteToAppBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'promote-to-app-code' });
});

pushToFigmaBtn.addEventListener('click', () => {
  const iframeDoc = iframe.contentDocument;
  if (!iframeDoc) return;
  const { capture, truncated } = captureFigmaIr(iframeDoc, { title: iframeDoc.title || 'Artifact' });
  vscode.postMessage({ type: 'figma-capture', capture, truncated });
});

shareToCommunityBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'share-to-community' });
});

interface CollectionNavInfo {
  label: string;
  prevEntryPath?: string;
  nextEntryPath?: string;
}

function applyCollectionInfo(collection: CollectionNavInfo | undefined): void {
  if (!collection) {
    collectionNav.hidden = true;
    return;
  }
  collectionNav.hidden = false;
  collectionLabel.textContent = collection.label;
  collectionPrevBtn.disabled = !collection.prevEntryPath;
  collectionNextBtn.disabled = !collection.nextEntryPath;
}

collectionPrevBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'nav-collection', direction: 'prev' });
});

collectionNextBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'nav-collection', direction: 'next' });
});

window.addEventListener('message', (event) => {
  const message = event.data;
  switch (message?.type) {
    case 'init':
      comments = message.comments ?? [];
      applyCollectionInfo(message.collection);
      setIframeContent(message.html);
      break;
    case 'source-updated':
      // External change (e.g. the model regenerated the file) wins over any
      // in-progress local edit — no version/diff UI in v1, see plan. The old
      // hover/selection element references belong to a now-replaced
      // document and would be stale (and the iframe's own 'load' handler
      // re-renders once the new document is ready), so drop them now too.
      hoverElement = null;
      selectedElement = null;
      panel.hidden = true;
      applyCollectionInfo(message.collection);
      setIframeContent(message.html);
      break;
  }
});

vscode.postMessage({ type: 'ready' });

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function rgbToHex(rgb: string): string {
  const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb);
  if (!match) return '#000000';
  const [, r, g, b] = match;
  return `#${[r, g, b].map((v) => parseInt(v, 10).toString(16).padStart(2, '0')).join('')}`;
}
