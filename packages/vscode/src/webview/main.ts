import { PREVIEW_ONLY_ATTR, type ManualEditPatch, type CuratedStyles } from '@feimacode/open-design-agent-kit-core/src/preview/dom/sourcePatches';
import type { ArtifactComment } from '@feimacode/open-design-agent-kit-core/src/workspace/artifactCommentTypes';
import { createCommentController } from '@feimacode/open-design-agent-kit-core/src/preview/commentController';
import { escapeHtml, highlightBox, hostRectOf, selectionGuides } from '@feimacode/open-design-agent-kit-core/src/preview/overlays';
import { mountDeviceShell } from '@feimacode/open-design-agent-kit-core/src/preview/deviceShell';
import { BRIDGE_TAG, isBridgeMessage, type BridgeRect, type ElementSnapshot, type FromBridge, type StyleSnapshot, type ToBridge, type Untagged } from '@feimacode/open-design-agent-kit-core/src/preview/protocol';
import { icon } from '@feimacode/open-design-agent-kit-core/src/preview/dom/icons';
import { attachMenu } from '@feimacode/open-design-agent-kit-core/src/preview/dom/menuButton';
import { createTweaksPanel } from './tweaksPanel';

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

type Mode = 'view' | 'comment' | 'edit';

const vscode = acquireVsCodeApi();

const root = document.getElementById('root')!;
root.innerHTML = `
  <div class="od-toolbar" role="toolbar" aria-label="Artifact">
    <div class="od-segmented" role="radiogroup" aria-label="Mode">
      <button data-mode="view" class="od-seg-btn active" role="radio" aria-checked="true" title="View">${icon('eye')}<span class="od-label">View</span></button>
      <button data-mode="comment" class="od-seg-btn" role="radio" aria-checked="false" tabindex="-1" title="Comment on elements">${icon('comment')}<span class="od-label">Comment</span></button>
      <button data-mode="edit" class="od-seg-btn" role="radio" aria-checked="false" tabindex="-1" title="Edit elements">${icon('pencil')}<span class="od-label">Edit</span></button>
    </div>
    <div id="od-collection-nav" class="od-pager" hidden>
      <button id="od-collection-prev" class="od-icon-btn" aria-label="Previous">${icon('chevronLeft')}</button>
      <span class="od-pager-pos"><span id="od-collection-kind" class="od-pager-kind"></span> <span id="od-collection-index"></span></span>
      <button id="od-collection-next" class="od-icon-btn" aria-label="Next">${icon('chevronRight')}</button>
    </div>
    <span id="od-collection-title" class="od-pager-title" hidden></span>
    <div id="od-shape" class="od-shape" hidden>
      <select id="od-shape-select" class="od-select od-shape-select" aria-label="Shape" title="Preview this fluid design at another shape (nothing is saved)"></select>
      <select id="od-zoom-select" class="od-select od-zoom-select" aria-label="Zoom" title="Preview zoom: Fit shows the whole poster; 100% is its size in CSS pixels">
        <option value="fit">Fit</option><option value="0.25">25%</option><option value="0.5">50%</option><option value="0.75">75%</option><option value="1">100%</option>
      </select>
      <button id="od-shape-check" class="od-btn" title="Run the export's preflight checks at this shape">${icon('check')}<span class="od-label">Check</span></button>
      <button id="od-shape-result" class="od-btn od-shape-result" hidden></button>
      <button id="od-shape-default" class="od-btn" title="Make this the shape exports use when none is given" hidden><span class="od-label">Use as default</span></button>
    </div>
    <span id="od-shape-fixed" class="od-pager-title" title="This design has a fixed size. Ask the agent to adapt it (adapt_open_design_artifact) for other shapes." hidden>Fixed size</span>
    <button id="od-tweaks-toggle" class="od-btn" title="Tweaks: adjust this design's colors, type and spacing variables" aria-pressed="false">${icon('sliders')}<span class="od-label">Tweaks</span></button>
    <span class="od-toolbar-spacer"></span>
    <button id="od-send-comments" class="od-btn od-btn-primary" title="Send open comments to chat" hidden>${icon('send')}<span class="od-label">Send</span><span id="od-send-count" class="od-count"></span></button>
    <div class="od-toolbar-actions">
      <button id="od-promote-to-app" class="od-btn" title="Promote to App Code: port this artifact into the app's real code">${icon('code')}<span class="od-label">Promote to code</span></button>
      <button id="od-export" class="od-btn" title="Export to a design tool">${icon('export')}<span class="od-label">Export</span>${icon('chevronDown', 14)}</button>
      <div class="od-split">
        <button id="od-share" class="od-btn od-split-main" title="Share: download a standalone HTML file, or publish a link">${icon('share')}<span class="od-label">Share</span></button>
        <button id="od-share-more" class="od-btn od-split-toggle" title="More ways to share" aria-label="More ways to share">${icon('chevronDown', 14)}</button>
      </div>
    </div>
  </div>
  <div class="od-stage">
    <div id="od-errors" class="od-errors" role="status" hidden>
      <div class="od-errors-text"><strong>This design has errors</strong><span id="od-errors-list"></span></div>
      <button id="od-errors-fix" class="od-btn od-btn-primary">Ask the agent to fix</button>
      <button id="od-errors-close" class="od-panel-close" aria-label="Dismiss">×</button>
    </div>
    <iframe id="od-preview" class="od-preview" sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-pointer-lock allow-modals"></iframe>
    <div id="od-pins" class="od-pins"></div>
  </div>
  <div id="od-panel" class="od-panel" hidden></div>
  <div id="od-tweaks" class="od-panel od-tweaks" hidden></div>
`;

const iframe = document.getElementById('od-preview') as HTMLIFrameElement;
const pinsLayer = document.getElementById('od-pins')!;
const panel = document.getElementById('od-panel')!;
const sendCommentsBtn = document.getElementById('od-send-comments') as HTMLButtonElement;
const sendCommentsCount = document.getElementById('od-send-count')!;
const promoteToAppBtn = document.getElementById('od-promote-to-app') as HTMLButtonElement;
const exportBtn = document.getElementById('od-export') as HTMLButtonElement;
const shareBtn = document.getElementById('od-share') as HTMLButtonElement;
const shareMoreBtn = document.getElementById('od-share-more') as HTMLButtonElement;
const collectionNav = document.getElementById('od-collection-nav') as HTMLDivElement;
const collectionKind = document.getElementById('od-collection-kind')!;
const collectionIndex = document.getElementById('od-collection-index')!;
const collectionTitle = document.getElementById('od-collection-title')!;
const collectionPrevBtn = document.getElementById('od-collection-prev') as HTMLButtonElement;
const collectionNextBtn = document.getElementById('od-collection-next') as HTMLButtonElement;

const tweaksToggle = document.getElementById('od-tweaks-toggle') as HTMLButtonElement;
const tweaksContainer = document.getElementById('od-tweaks')!;
const tweaks = createTweaksPanel({ container: tweaksContainer, iframe, post: (m) => vscode.postMessage(m), escapeHtml });
// Tweaks are a View-mode tool: opening the panel leaves Comment/Edit, and
// entering either closes it (both use the same corner of the stage).
new MutationObserver(() => {
  tweaksToggle.classList.toggle('active', tweaks.isOpen());
  tweaksToggle.setAttribute('aria-pressed', String(tweaks.isOpen()));
  syncIframeSource();
}).observe(tweaksContainer, { attributes: true, attributeFilter: ['hidden'] });
tweaksToggle.addEventListener('click', () => {
  if (!tweaks.isOpen() && mode !== 'view') setMode('view');
  tweaks.toggle();
});

let mode: Mode = 'view';
// Comment mode's list, input and pins (shared with the browser preview; openspec add-browser-preview).
const comments = createCommentController({
  panel,
  iframe,
  host: 'vscode',
  persist: (changed: ArtifactComment[], deletedIds: string[]) => vscode.postMessage({ type: 'comments-changed', changed, deletedIds }),
  closePanel: () => closePanel(),
  onListChanged: () => {
    updateSendComments();
    sendCommentsToBridge();
    renderOverlays();
  },
});
// Hover/selection state, ported (simplified) from open-design's own
// comment-mode overlay approach (apps/web/src/runtime/srcdoc.ts's
// injectSelectionBridge): one positioned box per state, hover thin,
// selection thick. The preview bridge inside the page (openspec
// add-preview-bridge) reports them as rects in the page's viewport; the
// preview keeps no references to the page's elements, since a served page
// has its own origin.
let hoverRect: BridgeRect | null = null;
let selection: ElementSnapshot | null = null;
let selectionRect: BridgeRect | null = null;
let pinRects: { commentId: string; rect: BridgeRect | null }[] = [];
// The bridge says `ready` once per loaded page; Comment and Edit need it.
let bridgeReady = false;
let iframeLoaded = false;

function setMode(next: Mode): void {
  if (next !== 'view' && iframeLoaded && !bridgeReady) {
    showBridgeUnavailable();
    return;
  }
  mode = next;
  modeButtons.forEach((btn) => {
    const active = btn.dataset.mode === next;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-checked', String(active));
    btn.tabIndex = active ? 0 : -1;
  });
  updateSendComments();
  panel.hidden = true;
  if (next !== 'view') tweaks.toggle(false);
  syncIframeSource();
  selection = null;
  selectionRect = null;
  hoverRect = null;
  pinRects = [];
  toBridge({ type: 'set-mode', mode: next });
  sendCommentsToBridge();
  renderOverlays();
}

const modeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.od-seg-btn[data-mode]'));
modeButtons.forEach((btn, i) => {
  btn.addEventListener('click', () => setMode(btn.dataset.mode as Mode));
  // Radio-group keyboard model: arrows move (and select) within the group.
  btn.addEventListener('keydown', (event) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const nextBtn = modeButtons[(i + step + modeButtons.length) % modeButtons.length];
    setMode(nextBtn.dataset.mode as Mode);
    nextBtn.focus();
  });
});

// Shown only in comment mode, and only enabled while there is something to
// send; the count makes the pending batch visible without opening pins.
function updateSendComments(): void {
  const open = comments.open().length;
  sendCommentsBtn.hidden = mode !== 'comment';
  sendCommentsBtn.disabled = open === 0;
  sendCommentsCount.textContent = open ? String(open) : '';
}

// Failed loads and uncaught errors the previewed page reports (see core's
// PREVIEW_ERROR_REPORTER): shown in a banner, since a page whose script died
// (a dead CDN URL, say) otherwise just renders blank.
const errorsBanner = document.getElementById('od-errors')!;
const errorsList = document.getElementById('od-errors-list')!;
let previewErrors: string[] = [];
function renderPreviewErrors(): void {
  errorsBanner.hidden = previewErrors.length === 0;
  const shown = previewErrors.slice(0, 3).map((e) => `<code>${escapeHtml(e)}</code>`).join('');
  errorsList.innerHTML = shown + (previewErrors.length > 3 ? `<span>and ${previewErrors.length - 3} more</span>` : '');
}
window.addEventListener('message', (event) => {
  if (event.source !== iframe.contentWindow || typeof event.data?.odPreviewError !== 'string') return;
  const text = event.data.odPreviewError;
  if (previewErrors.includes(text) || previewErrors.length >= 20) return;
  previewErrors.push(text);
  renderPreviewErrors();
});
window.addEventListener('message', (event) => {
  if (event.source !== iframe.contentWindow || !isBridgeMessage(event.data)) return;
  onBridgeMessage(event.data as FromBridge);
});
document.getElementById('od-errors-fix')!.addEventListener('click', () => vscode.postMessage({ type: 'preview-errors-to-chat', errors: previewErrors }));
document.getElementById('od-errors-close')!.addEventListener('click', () => {
  errorsBanner.hidden = true;
});

// Served preview (openDesign.experimental.servedPreview): when the extension
// sends a servedUrl, the design loads from it, a real URL with its own
// origin, so it behaves exactly as in a browser. Comment and Edit work on it
// through the preview bridge. Tweaks and the fluid-poster shape override
// still read the page's DOM directly, which a cross-origin frame doesn't
// allow, so they use the srcdoc copy (openspec add-preview-bridge).
let currentHtml = '';
let currentServedUrl: string | undefined;
function setIframeContent(html: string, servedUrl?: string): void {
  currentHtml = html;
  currentServedUrl = servedUrl;
  syncIframeSource(true);
}
function syncIframeSource(contentChanged = false): void {
  const useServed = Boolean(currentServedUrl) && !tweaks.isOpen() && !shapeInfo?.fluid;
  const showingServed = !iframe.hasAttribute('srcdoc') && iframe.getAttribute('src') === currentServedUrl;
  if (!contentChanged && useServed === showingServed) return;
  previewErrors = [];
  renderPreviewErrors();
  bridgeReady = false;
  iframeLoaded = false;
  if (useServed) {
    iframe.removeAttribute('srcdoc');
    iframe.src = currentServedUrl!;
  } else {
    iframe.removeAttribute('src');
    iframe.srcdoc = currentHtml;
  }
}

iframe.addEventListener('load', () => {
  iframeLoaded = true;
  // The bridge also announces itself as it starts; asking again covers a
  // `ready` sent before this listener's state was reset for the new page.
  toBridge({ type: 'hello' });
  applyShapeOverride();
  tweaks.reapply();
  renderOverlays();
});

// ── Preview bridge client (openspec add-preview-bridge) ─────────────────
// Messages from the page are untrusted (it runs generated code): only this
// iframe's window is listened to (see the listener above), and a patch or
// capture result is acted on only when it answers a request sent from here.
function toBridge(message: Untagged<ToBridge>): void {
  iframe.contentWindow?.postMessage({ od: BRIDGE_TAG, ...message }, '*');
}

const pendingPatches = new Set<string>();
const pendingCaptures = new Set<string>();
function newRequestId(): string {
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sendCommentsToBridge(): void {
  toBridge({ type: 'set-comments', comments: comments.forBridge() });
}

function onBridgeMessage(message: FromBridge): void {
  switch (message.type) {
    case 'ready':
      bridgeReady = true;
      // The device the page declares gets the kit's frame around it (openspec add-platform-shells).
      mountDeviceShell(document, iframe, message.device, message.title);
      toBridge({ type: 'set-mode', mode });
      sendCommentsToBridge();
      break;
    case 'select':
      if (mode === 'view') break;
      selection = message.element;
      selectionRect = message.element.rect;
      hoverRect = null;
      renderOverlays();
      if (mode === 'comment') comments.openInput(selection);
      else openEditPanel(selection);
      break;
    case 'rects':
      hoverRect = message.hover;
      selectionRect = selection ? message.selection : null;
      pinRects = Array.isArray(message.pins) ? message.pins : [];
      renderOverlays();
      break;
    case 'patched':
      if (!pendingPatches.delete(message.requestId)) break;
      if (message.ok && typeof message.newSource === 'string') vscode.postMessage({ type: 'apply-patch', newSource: message.newSource });
      break;
    case 'figma-capture':
      if (!pendingCaptures.delete(message.requestId)) break;
      vscode.postMessage({ type: 'figma-capture', capture: message.capture, truncated: Boolean(message.truncated) });
      break;
    case 'open-local-link':
      vscode.postMessage({ type: 'open-local-link', href: String(message.href ?? '') });
      break;
  }
}

function showBridgeUnavailable(): void {
  panel.hidden = false;
  panel.innerHTML = `
    <div class="od-panel-header">
      <span class="od-panel-header-title">Comment and Edit unavailable</span>
      <button id="od-bridge-close" class="od-panel-close" aria-label="Close">×</button>
    </div>
    <div class="od-panel-body"><p>This design's page didn't start the preview helper that Comment and Edit rely on, usually because one of its own scripts failed first. Check the error banner, or ask the agent to fix the page.</p></div>`;
  document.getElementById('od-bridge-close')!.addEventListener('click', () => {
    panel.hidden = true;
  });
}

// Shared by openCommentInput/openEditPanel: hides the panel and clears the
// selection highlight together, so "closing the panel" always also means
// "nothing is selected anymore" — matching upstream, where deselection is
// click-driven (another element, empty canvas, or leaving the mode) with
// no separate "panel closed but still selected" state.
function closePanel(): void {
  panel.hidden = true;
  selection = null;
  selectionRect = null;
  toBridge({ type: 'clear-selection' });
  renderOverlays();
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

function classifyEditKind(el: ElementSnapshot): EditKind {
  if (el.tag === 'IMG') return 'image';
  if (el.tag === 'A') return 'link';
  return el.childCount > 0 ? 'container' : 'text';
}

function describeElement(el: ElementSnapshot): string {
  const tag = el.tag.toLowerCase();
  const text = el.text.trim().slice(0, 28);
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

function contentSectionHtml(target: ElementSnapshot, kind: EditKind): string {
  if (kind === 'image') {
    return `
      <div class="od-panel-section-title">Content</div>
      <label>Image URL</label>
      <input id="od-edit-src" class="od-input" type="text" value="${escapeHtml(target.attrs.src ?? '')}" />
      <label>Alt text</label>
      <input id="od-edit-alt" class="od-input" type="text" value="${escapeHtml(target.attrs.alt ?? '')}" />
    `;
  }
  if (kind === 'link') {
    return `
      <div class="od-panel-section-title">Content</div>
      <label>Text</label>
      <textarea id="od-edit-text" class="od-textarea" rows="2">${escapeHtml(target.text)}</textarea>
      <label>Link URL (href)</label>
      <input id="od-edit-href" class="od-input" type="text" value="${escapeHtml(target.attrs.href ?? '')}" />
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
    <textarea id="od-edit-text" class="od-textarea" rows="3">${escapeHtml(target.text)}</textarea>
  `;
}

function styleSectionHtml(cs: StyleSnapshot): string {
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

// The Style section's input for each CuratedStyles field.
const STYLE_FIELD_IDS: Record<keyof CuratedStyles, string> = {
  color: 'od-edit-color',
  backgroundColor: 'od-edit-bg',
  fontSize: 'od-edit-font-size',
  fontWeight: 'od-edit-font-weight',
  lineHeight: 'od-edit-line-height',
  letterSpacing: 'od-edit-letter-spacing',
  fontFamily: 'od-edit-font-family',
  textAlign: 'od-edit-text-align',
  borderRadius: 'od-edit-radius',
  opacity: 'od-edit-opacity',
  borderColor: 'od-edit-border-color',
  borderWidth: 'od-edit-border-width',
  borderStyle: 'od-edit-border-style',
  paddingTop: 'od-edit-pad-t',
  paddingRight: 'od-edit-pad-r',
  paddingBottom: 'od-edit-pad-b',
  paddingLeft: 'od-edit-pad-l',
  marginTop: 'od-edit-mar-t',
  marginRight: 'od-edit-mar-r',
  marginBottom: 'od-edit-mar-b',
  marginLeft: 'od-edit-mar-l',
};

function openEditPanel(target: ElementSnapshot): void {
  const kind = classifyEditKind(target);
  const cs = target.styles;
  const elementId = target.elementId;

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

  // Every Style field is prefilled from the computed style (a transparent
  // background reads as #000000 in a color input), so only fields the user
  // actually changed are written; otherwise one text edit would pin a dozen
  // inline styles, including a black background.
  const initialValues = new Map(
    Array.from(panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input[id^="od-edit-"], select[id^="od-edit-"]')).map((el) => [el.id, el.value]),
  );
  const changed = (id: string): boolean => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement).value !== initialValues.get(id);

  document.getElementById('od-edit-close')!.addEventListener('click', closePanel);
  document.getElementById('od-edit-cancel')!.addEventListener('click', closePanel);
  document.getElementById('od-edit-remove')!.addEventListener('click', () => {
    commitPatches([{ kind: 'remove-element', elementId }]);
    closePanel();
  });
  document.getElementById('od-edit-apply')!.addEventListener('click', () => {
    const patches: ManualEditPatch[] = [];
    if (kind === 'image') {
      patches.push({
        kind: 'set-image',
        elementId,
        src: (document.getElementById('od-edit-src') as HTMLInputElement).value,
        alt: (document.getElementById('od-edit-alt') as HTMLInputElement).value,
      });
    } else if (kind === 'link') {
      patches.push({
        kind: 'set-link',
        elementId,
        text: (document.getElementById('od-edit-text') as HTMLTextAreaElement).value,
        href: (document.getElementById('od-edit-href') as HTMLInputElement).value,
      });
    } else if (kind === 'container') {
      patches.push({ kind: 'set-outer-html', elementId, html: (document.getElementById('od-edit-html') as HTMLTextAreaElement).value });
    } else {
      patches.push({ kind: 'set-text', elementId, value: (document.getElementById('od-edit-text') as HTMLTextAreaElement).value });
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
    for (const [key, id] of Object.entries(STYLE_FIELD_IDS) as [keyof CuratedStyles, string][]) {
      if (!changed(id)) delete styles[key];
    }
    if (Object.values(styles).some((v) => v !== undefined)) patches.push({ kind: 'set-style', elementId, styles });
    commitPatches(patches);
    closePanel();
  });
}

// The bridge applies the patches to the page and returns the serialized
// source; the 'patched' reply is written back only if it answers this request.
function commitPatches(patches: ManualEditPatch[]): void {
  if (!bridgeReady || patches.length === 0) return;
  const requestId = newRequestId();
  pendingPatches.add(requestId);
  toBridge({ type: 'apply-patches', requestId, patches });
}

function renderOverlays(): void {
  pinsLayer.innerHTML = '';

  if (mode === 'view') return;
  if (hoverRect) {
    pinsLayer.appendChild(highlightBox(hostRectOf(iframe, hoverRect), 'od-hover-box'));
  }
  if (selection && selectionRect) {
    const rect = hostRectOf(iframe, selectionRect);
    selectionGuides(iframe, rect).forEach((line) => pinsLayer.appendChild(line));
    pinsLayer.appendChild(highlightBox(rect, 'od-select-box'));
  }

  if (mode !== 'comment') return;
  comments.pins(pinRects).forEach((pin) => pinsLayer.appendChild(pin));
}

sendCommentsBtn.addEventListener('click', () => {
  const open = comments.open();
  if (open.length === 0) return;
  vscode.postMessage({ type: 'send-comments-to-chat', comments: open });
  comments.markOpenSent();
});

promoteToAppBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'promote-to-app-code' });
});

// The capture is taken inside the page by the bridge, served or embedded.
function pushToFigma(): void {
  if (!bridgeReady) {
    showBridgeUnavailable();
    return;
  }
  const requestId = newRequestId();
  pendingCaptures.add(requestId);
  toBridge({ type: 'capture-figma', requestId });
}

// New export targets go in this menu rather than as more toolbar buttons.
attachMenu(exportBtn, [
  {
    heading: 'Export to',
    items: [
      { id: 'figma', label: 'Figma', description: 'Editable layer capture', icon: 'layers', onSelect: pushToFigma },
      { id: 'canva', label: 'Canva', description: 'Export and prepare for import', icon: 'image', onSelect: () => vscode.postMessage({ type: 'publish-to-canva' }) },
    ],
  },
  {
    heading: 'Copy for',
    items: [
      { id: 'copy-email', label: 'Email', description: 'Inbox-safe HTML email', icon: 'mail', onSelect: () => vscode.postMessage({ type: 'copy-for', target: 'email' }) },
      { id: 'copy-wechat', label: 'WeChat', description: 'Official Account editor', icon: 'clipboard', onSelect: () => vscode.postMessage({ type: 'copy-for', target: 'wechat' }) },
      { id: 'copy-notion', label: 'Notion', description: 'Paste as Notion blocks', icon: 'clipboard', onSelect: () => vscode.postMessage({ type: 'copy-for', target: 'notion' }) },
      { id: 'copy-newsletter', label: 'Newsletter', description: 'Substack, Mailchimp and similar editors', icon: 'clipboard', onSelect: () => vscode.postMessage({ type: 'copy-for', target: 'newsletter' }) },
    ],
  },
]);

// "Copy for…" (openspec add-email-and-paste-export): the host exports, then hands the HTML back here to
// put on the clipboard as rich HTML (vscode.env.clipboard is text-only). The host falls back to opening
// the exported file in a browser when this write is refused.
async function copyRich(html: string, text: string): Promise<void> {
  const ClipboardItemCtor = (window as unknown as { ClipboardItem?: new (items: Record<string, Blob>) => unknown }).ClipboardItem;
  if (!ClipboardItemCtor || !navigator.clipboard || typeof navigator.clipboard.write !== 'function') throw new Error('Rich clipboard is not available here.');
  const item = new ClipboardItemCtor({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) });
  await navigator.clipboard.write([item as ClipboardItem]);
}

shareBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'share' });
});

attachMenu(shareMoreBtn, [
  {
    items: [
      { id: 'share', label: 'Link or file…', description: 'Publish a link or download standalone HTML', icon: 'link', onSelect: () => vscode.postMessage({ type: 'share' }) },
      { id: 'community', label: 'Share to Community…', description: 'Open a PR to awesome-open-design', icon: 'users', onSelect: () => vscode.postMessage({ type: 'share-to-community' }) },
    ],
  },
]);

interface CollectionNavInfo {
  kind: string;
  index: number;
  total: number;
  title: string;
  prevEntryPath?: string;
  nextEntryPath?: string;
}

function applyCollectionInfo(collection: CollectionNavInfo | undefined): void {
  collectionNav.hidden = collectionTitle.hidden = !collection;
  if (!collection) return;
  collectionKind.textContent = collection.kind;
  collectionIndex.textContent = `${collection.index} / ${collection.total}`;
  collectionTitle.textContent = collection.title;
  collectionNav.title = collectionTitle.title = `${collection.kind} ${collection.index} of ${collection.total} — ${collection.title}`;
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
    case 'copy-payload':
      copyRich(String(message.html ?? ''), String(message.text ?? ''))
        .then(() => vscode.postMessage({ type: 'copy-result', ok: true, target: message.target, file: message.file }))
        .catch((err: unknown) => vscode.postMessage({ type: 'copy-result', ok: false, target: message.target, file: message.file, error: err instanceof Error ? err.message : String(err) }));
      break;
    case 'init':
      comments.setComments(message.comments ?? []);
      applyCollectionInfo(message.collection);
      applyShapeInfo(message.shape);
      tweaks.update(message.tweaks);
      setIframeContent(message.html, message.servedUrl);
      break;
    case 'source-updated':
      // External change (e.g. the model regenerated the file) wins over any
      // in-progress local edit — no version/diff UI in v1, see plan. The old
      // hover/selection belong to a now-replaced page (the new page's bridge
      // reports afresh once it's ready), so drop them now too.
      hoverRect = null;
      selection = null;
      selectionRect = null;
      pinRects = [];
      panel.hidden = true;
      applyCollectionInfo(message.collection);
      applyShapeInfo(message.shape);
      tweaks.update(message.tweaks);
      setIframeContent(message.html, message.servedUrl);
      break;
    case 'shape-checked':
      showShapeCheck(message);
      break;
    case 'shape-default-updated':
      if (shapeInfo) shapeInfo.defaultFormat = message.defaultFormat;
      renderShapeControls();
      break;
    case 'comments-updated':
      // Another writer (the agent resolving comments, a browser preview) changed the sidecar.
      comments.setComments(message.comments ?? []);
      break;
    case 'nav-updated':
      // A sibling screen/direction was registered or removed: only the
      // navigation changes, so the design itself is not re-rendered.
      applyCollectionInfo(message.collection);
      break;
  }
});

// ---- Shape switcher (fluid designs only; openspec fluid-poster-shapes D7) ----
// Choosing a shape only restyles the preview: a preview-only <style> sets the
// card's --od-w/--od-h and fits it to the panel with `zoom`. It is stripped
// from anything Edit mode saves (serializeDocument), so nothing is written.

interface ShapeFormat {
  id: string;
  label: string;
  medium: string;
  width: number;
  height: number;
  unit: string;
}
interface ShapeInfo {
  fluid: boolean;
  defaultFormat?: string;
  formats: ShapeFormat[];
}
interface ShapeCheck {
  formatId: string;
  ok: boolean;
  error?: string;
  findings?: Array<{ severity: string; check: string; message: string }>;
}

const SHAPE_STYLE_ID = 'od-shape-override';
const shapeBox = document.getElementById('od-shape') as HTMLDivElement;
const shapeSelect = document.getElementById('od-shape-select') as HTMLSelectElement;
const shapeCheckBtn = document.getElementById('od-shape-check') as HTMLButtonElement;
const shapeResultBtn = document.getElementById('od-shape-result') as HTMLButtonElement;
const shapeDefaultBtn = document.getElementById('od-shape-default') as HTMLButtonElement;
const shapeFixedNote = document.getElementById('od-shape-fixed') as HTMLSpanElement;
const zoomSelect = document.getElementById('od-zoom-select') as HTMLSelectElement;
/** 'fit' scales the poster down to the panel; a number is a fixed zoom (1 = CSS pixels). */
let zoomMode: 'fit' | number = 'fit';
let shapeInfo: ShapeInfo | undefined;
/** The shape being previewed; undefined means the design's own (authored or default) shape. */
let currentShape: string | undefined;
let lastCheck: ShapeCheck | undefined;

function applyShapeInfo(info: ShapeInfo | undefined): void {
  const wasFluid = shapeInfo?.fluid;
  shapeInfo = info;
  // A file that stops (or starts) being fluid starts over at its own shape.
  if (!info?.fluid || wasFluid === false) currentShape = undefined;
  if (info?.fluid && currentShape === undefined) currentShape = info.defaultFormat;
  lastCheck = undefined;
  renderShapeControls();
}

function renderShapeControls(): void {
  const fluid = !!shapeInfo?.fluid;
  shapeBox.hidden = !fluid;
  shapeFixedNote.hidden = !shapeInfo || fluid;
  if (!fluid || !shapeInfo) return;
  const def = shapeInfo.defaultFormat;
  const ordered = [...shapeInfo.formats].sort((a, b) => (a.id === def ? -1 : b.id === def ? 1 : 0));
  shapeSelect.innerHTML =
    (def ? '' : '<option value="">As authored</option>') +
    ordered
      .map((f) => {
        // Print labels already carry their size ("A3 (297×420 mm)"); give screen shapes theirs.
        const size = f.unit === 'px' ? ` — ${f.width}×${f.height}` : '';
        return `<option value="${escapeHtml(f.id)}">${escapeHtml(f.label)}${size}${f.id === def ? ' (default)' : ''}</option>`;
      })
      .join('');
  shapeSelect.value = currentShape ?? '';
  shapeDefaultBtn.hidden = !currentShape || currentShape === def;
  shapeResultBtn.hidden = !lastCheck || lastCheck.formatId !== currentShape;
  if (lastCheck && !shapeResultBtn.hidden) {
    const errors = lastCheck.findings?.filter((f) => f.severity === 'error').length ?? 0;
    const warnings = lastCheck.findings?.filter((f) => f.severity === 'warning').length ?? 0;
    shapeResultBtn.textContent = !lastCheck.ok ? 'Check failed' : errors + warnings === 0 ? 'No problems' : `${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}`;
    shapeResultBtn.classList.toggle('od-shape-bad', !lastCheck.ok || errors > 0);
  }
}

function applyShapeOverride(): void {
  const doc = iframe.contentDocument;
  if (!doc?.head) return;
  doc.getElementById(SHAPE_STYLE_ID)?.remove();
  if (!shapeInfo?.fluid) return;
  const shape = shapeInfo.formats.find((f) => f.id === currentShape);
  const card = doc.querySelector('[data-od-card][data-od-fluid]') as HTMLElement | null;
  if (!card) return;
  const styleEl = doc.createElement('style');
  styleEl.id = SHAPE_STYLE_ID;
  styleEl.setAttribute(PREVIEW_ONLY_ATTR, '');
  // Set the size itself too, not just the variables: a card the author sized another way
  // (e.g. width: 100%) would otherwise ignore them and never change shape.
  const vars = shape
    ? `--od-w: ${shape.width}${shape.unit} !important; --od-h: ${shape.height}${shape.unit} !important; --od-bleed: 0mm !important;` +
      ` width: ${shape.width}${shape.unit} !important; height: ${shape.height}${shape.unit} !important;` +
      ' max-width: none !important; max-height: none !important; min-width: 0 !important; min-height: 0 !important;'
    : '';
  // Show the poster as a page on a neutral canvas, centred with a visible edge, so its
  // bounds are clear even when its background matches the page's (as in Canva).
  styleEl.textContent =
    `html, body { background: #3c3c3c !important; min-height: 100% !important; height: auto !important; }` +
    ` body { display: flex !important; justify-content: center !important; align-items: flex-start !important; padding: 16px !important; box-sizing: border-box !important; margin: 0 !important; }` +
    ` [data-od-card][data-od-fluid] { ${vars} flex-shrink: 0 !important; margin: 0 !important; box-shadow: 0 2px 14px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.18) !important; }`;
  doc.head.appendChild(styleEl);
  // Fit the card to the panel: measure it unzoomed, then scale down only.
  const rect = card.getBoundingClientRect();
  const view = doc.documentElement;
  const fit = Math.min(1, (view.clientWidth - 32) / rect.width, (view.clientHeight - 32) / rect.height);
  const zoom = zoomMode === 'fit' ? (fit > 0 ? fit : 1) : zoomMode;
  if (zoom !== 1) styleEl.textContent += ` [data-od-card][data-od-fluid] { zoom: ${zoom.toFixed(4)}; }`;
  zoomSelect.options[0].textContent = `Fit (${Math.round((fit > 0 ? fit : 1) * 100)}%)`;
  zoomSelect.value = zoomMode === 'fit' ? 'fit' : String(zoomMode);
  renderOverlays();
}

zoomSelect.addEventListener('change', () => {
  zoomMode = zoomSelect.value === 'fit' ? 'fit' : Number(zoomSelect.value);
  applyShapeOverride();
});

shapeSelect.addEventListener('change', () => {
  currentShape = shapeSelect.value || undefined;
  applyShapeOverride();
  renderShapeControls();
});

shapeCheckBtn.addEventListener('click', () => {
  const formatId = currentShape ?? shapeInfo?.defaultFormat;
  if (!formatId) {
    shapeResultBtn.hidden = false;
    shapeResultBtn.textContent = 'Pick a shape to check';
    return;
  }
  shapeCheckBtn.disabled = true;
  shapeResultBtn.hidden = false;
  shapeResultBtn.textContent = 'Checking…';
  vscode.postMessage({ type: 'check-shape', formatId });
});

shapeDefaultBtn.addEventListener('click', () => {
  if (currentShape) vscode.postMessage({ type: 'set-default-shape', formatId: currentShape });
});

shapeResultBtn.addEventListener('click', () => {
  if (!lastCheck) return;
  const label = shapeInfo?.formats.find((f) => f.id === lastCheck!.formatId)?.label ?? lastCheck.formatId;
  const items = lastCheck.ok
    ? (lastCheck.findings ?? []).map((f) => `<li class="od-shape-finding od-sev-${escapeHtml(f.severity)}"><b>${escapeHtml(f.severity)}</b> [${escapeHtml(f.check)}] ${escapeHtml(f.message)}</li>`).join('') ||
      '<li>No problems found.</li>'
    : `<li>${escapeHtml(lastCheck.error ?? 'The check failed.')}</li>`;
  panel.hidden = false;
  panel.innerHTML = `
    <div class="od-panel-header">
      <span class="od-panel-header-title">Preflight at ${escapeHtml(label)}</span>
      <button id="od-shape-close" class="od-panel-close" aria-label="Close">×</button>
    </div>
    <div class="od-panel-body"><ul class="od-shape-findings">${items}</ul></div>`;
  document.getElementById('od-shape-close')!.addEventListener('click', closePanel);
});

function showShapeCheck(message: ShapeCheck): void {
  shapeCheckBtn.disabled = false;
  lastCheck = message;
  renderShapeControls();
}

window.addEventListener('resize', () => applyShapeOverride());

vscode.postMessage({ type: 'ready' });

function rgbToHex(rgb: string): string {
  const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb);
  if (!match) return '#000000';
  const [, r, g, b] = match;
  return `#${[r, g, b].map((v) => parseInt(v, 10).toString(16).padStart(2, '0')).join('')}`;
}
