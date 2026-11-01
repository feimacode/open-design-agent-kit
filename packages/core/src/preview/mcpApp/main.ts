/// <reference lib="dom" />
// The preview MCP App page (openspec add-mcp-app-preview, add-mcp-app-pickers):
// shown inline in hosts that render MCP Apps (Claude Desktop Chat) for
// show_open_design_artifact, the picker tools and show_open_design_questions
// (add-mcp-app-ask-view). The structured result's `view` picks the renderer:
// an artifact, an exploration, the example gallery, the design-system tiles,
// a campaign sheet or questions. Every pick is a chat message naming the tool
// the agent should call, or the answers in a fixed form.
// The design renders in a nested, sandboxed frame from its standalone export
// with the preview bridge injected; Comment mode reuses the browser preview's
// comment controller over the MCP Apps transport. Exports and "Ask Claude to
// apply" post chat messages: the host refuses downloads. Bundled by the MCP
// server's build as mcp-app.js and inlined into the `ui://` resource.
import { App } from '@modelcontextprotocol/ext-apps';
import { createCommentController } from '../commentController';
import { icon } from '../dom/icons';
import { escapeHtml, highlightBox, hostRectOf, selectionGuides } from '../overlays';
import { BRIDGE_TAG, isBridgeMessage, type BridgeRect, type ElementSnapshot, type FromBridge, type ToBridge, type Untagged } from '../protocol';
import {
  applyCommentsMessage,
  ASK_MAX_TEXT_CHARS,
  ASK_YOU_PICK,
  askAnswersMessage,
  exportRequestMessage,
  FEEDBACK_CHIPS,
  feedbackChipMessage,
  parseAskSchema,
  fixCampaignPieceMessage,
  pickDirectionMessage,
  remixExampleMessage,
  saveTileMessage,
  SHOW_ARTIFACT_TOOL,
  useDesignSystemMessage,
  type AskAnswers,
  type AskSchema,
  type FeedbackChipId,
  type PreviewAppArtifactState,
  type PreviewAppCampaignState,
  type PreviewAppDesignSystemsState,
  type PreviewAppExample,
  type PreviewAppExamplesState,
  type PreviewAppExplorationState,
  type ShowTarget,
} from './protocol';
import { createMcpAppTransport } from './transport';

type Mode = 'view' | 'comment';

const EXPORT_LABELS: Record<string, string> = { png: 'PNG', pdf: 'PDF', standalone: 'HTML file', pptx: 'PowerPoint' };

const root = document.getElementById('root')!;
const app = new App({ name: 'Open Design preview', version: '1.0.0' });
const transport = createMcpAppTransport(app);

const toastEl = document.createElement('div');
toastEl.className = 'od-toast';
toastEl.hidden = true;
toastEl.setAttribute('role', 'status');
document.body.appendChild(toastEl);
let toastTimer = 0;
function toast(text: string): void {
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastEl.hidden = true;
  }, 4000);
}

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

function showMessage(text: string): void {
  root.innerHTML = `<div class="od-message">${escapeHtml(text)}</div>`;
}

// ── Host context: theme and display mode ──────────────────────────────────
function applyHostContext(): void {
  const ctx = app.getHostContext();
  const dark = ctx?.theme ? ctx.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.body.classList.toggle('od-dark', dark);
  const mode = currentDisplayMode();
  document.body.classList.toggle('od-fullscreen', mode === 'fullscreen');
  const fullscreen = document.getElementById('od-fullscreen');
  if (fullscreen) {
    fullscreen.hidden = !canGoFullscreen();
    fullscreen.setAttribute('aria-pressed', String(mode === 'fullscreen'));
  }
}

// Display mode (openspec chatgpt-mcp-apps-compat): the MCP Apps spec's
// request-display-mode first; ChatGPT's window.openai.requestDisplayMode only
// when the host lists no display modes. Feature-detected, never by host name.
interface OpenAiDisplayExtras {
  displayMode?: string;
  requestDisplayMode?: (args: { mode: string }) => Promise<unknown>;
}
function openAiExtras(): OpenAiDisplayExtras | undefined {
  const openai = (window as unknown as { openai?: OpenAiDisplayExtras }).openai;
  return openai && typeof openai.requestDisplayMode === 'function' ? openai : undefined;
}
function specListsFullscreen(): boolean {
  return (app.getHostContext()?.availableDisplayModes ?? []).includes('fullscreen');
}
function canGoFullscreen(): boolean {
  return specListsFullscreen() || openAiExtras() !== undefined;
}
let requestedMode: string | undefined;
function currentDisplayMode(): string | undefined {
  return app.getHostContext()?.displayMode ?? openAiExtras()?.displayMode ?? requestedMode;
}
function requestDisplayMode(mode: 'inline' | 'fullscreen'): Promise<unknown> {
  if (specListsFullscreen()) return app.requestDisplayMode({ mode });
  const extras = openAiExtras();
  if (!extras?.requestDisplayMode) return Promise.reject(new Error('This app can\'t change the view.'));
  return extras.requestDisplayMode({ mode }).then((result) => {
    requestedMode = mode;
    applyHostContext();
    return result;
  });
}

function fullscreenButton(): string {
  return `<button id="od-fullscreen" class="od-btn" title="Fullscreen" aria-pressed="false" hidden>${icon('expand')}<span class="od-label">Fullscreen</span></button>`;
}

/** Shown when another view opened this one (a campaign tile opening its piece). */
function backButton(): string {
  return backStack.length ? `<button id="od-back" class="od-icon-btn" title="Back" aria-label="Back">${icon('arrowLeft')}</button>` : '';
}

function wireFullscreen(): void {
  document.getElementById('od-back')?.addEventListener('click', () => goBack());
  document.getElementById('od-fullscreen')?.addEventListener('click', () => {
    const next = currentDisplayMode() === 'fullscreen' ? 'inline' : 'fullscreen';
    requestDisplayMode(next).catch((err) => toast(`Couldn't change the view: ${errorText(err)}`));
  });
  applyHostContext();
}

/** The footer link to the public gallery (openspec link-public-gallery): only while it is live and where the host opens links. */
function galleryLink(url: string | undefined): string {
  return url && transport.canOpenLinks() ? `<div class="od-more"><a id="od-gallery" class="od-btn" href="${escapeHtml(url)}">See them all in the gallery</a></div>` : '';
}

function wireGalleryLink(url: string | undefined): void {
  document.getElementById('od-gallery')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (url) transport.openLink(url).catch((err) => toast(`Couldn't open the gallery: ${errorText(err)}`));
  });
}

async function send(text: string, done: string): Promise<boolean> {
  try {
    await transport.sendToChat(text);
    toast(done);
    return true;
  } catch (err) {
    toast(`Couldn't send it to the chat: ${errorText(err)}`);
    return false;
  }
}

// ── An artifact ───────────────────────────────────────────────────────────
function renderArtifact(state: PreviewAppArtifactState, reload: () => void): void {
  const { entryPath } = state;
  const exportButtons = state.exports
    .map((f) => `<button class="od-btn" data-export="${escapeHtml(f)}" title="Ask Claude to export it as ${escapeHtml(EXPORT_LABELS[f] ?? f)}">${icon('export')}<span class="od-label">${escapeHtml(EXPORT_LABELS[f] ?? f)}</span></button>`)
    .join('');
  root.innerHTML = `
  <div class="od-toolbar" role="toolbar" aria-label="Preview">
    ${backButton()}
    <div class="od-segmented" role="radiogroup" aria-label="Mode"${state.html ? '' : ' hidden'}>
      <button data-mode="view" class="od-seg-btn active" role="radio" aria-checked="true" title="View">${icon('eye')}<span class="od-label">View</span></button>
      <button data-mode="comment" class="od-seg-btn" role="radio" aria-checked="false" tabindex="-1" title="Comment on elements">${icon('comment')}<span class="od-label">Comment</span></button>
    </div>
    <span class="od-title" title="${escapeHtml(entryPath)}">${escapeHtml(state.title)}</span>
    <span class="od-toolbar-spacer"></span>
    <button id="od-apply" class="od-btn od-btn-primary" title="Send the open comments to Claude" hidden>${icon('send')}<span class="od-label">Ask Claude to apply</span><span id="od-apply-count" class="od-count"></span></button>
    ${exportButtons ? `<div class="od-export-group">${exportButtons}</div>` : ''}
    <button id="od-refresh" class="od-icon-btn" title="Reload the design" aria-label="Reload the design">${icon('refresh')}</button>
    ${fullscreenButton()}
  </div>
  <div class="od-stage">
    <div id="od-errors" class="od-errors" role="status" hidden>
      <div class="od-errors-text"><strong>This design has errors</strong><span id="od-errors-list"></span></div>
      <button id="od-errors-close" class="od-panel-close" aria-label="Dismiss">×</button>
    </div>
    ${
      state.html
        ? '<iframe id="od-preview" class="od-preview" title="Design" sandbox="allow-scripts allow-popups allow-forms"></iframe>'
        : `<div class="od-fallback"><p>${escapeHtml(state.fallback ?? '')}</p>${
            state.checkImages.length
              ? state.checkImages.map((img) => `<figure><img src="${img.src}" alt="${escapeHtml(img.label)}"><figcaption>${escapeHtml(img.label)}</figcaption></figure>`).join('')
              : '<p>No check screenshot yet. Ask Claude to run check_open_design_artifact.</p>'
          }</div>`
    }
    <div id="od-pins" class="od-pins"></div>
  </div>
  <div class="od-feedback" role="group" aria-label="Quick replies">${FEEDBACK_CHIPS.map((c) => `<button class="od-chip" data-feedback="${c.id}">${escapeHtml(c.label)}</button>`).join('')}</div>
  <div id="od-panel" class="od-panel" hidden></div>`;

  wireFullscreen();
  document.getElementById('od-refresh')!.addEventListener('click', reload);
  root.querySelectorAll<HTMLButtonElement>('[data-feedback]').forEach((btn) =>
    btn.addEventListener('click', () => void send(feedbackChipMessage(entryPath, btn.dataset.feedback as FeedbackChipId), 'Sent to Claude.')),
  );
  root.querySelectorAll<HTMLButtonElement>('[data-export]').forEach((btn) =>
    btn.addEventListener('click', () => void send(exportRequestMessage(entryPath, btn.dataset.export!), 'Asked Claude to export it.')),
  );

  const applyBtn = document.getElementById('od-apply') as HTMLButtonElement;
  const applyCount = document.getElementById('od-apply-count')!;
  const iframe = document.getElementById('od-preview') as HTMLIFrameElement | null;
  const panel = document.getElementById('od-panel')!;
  const pinsLayer = document.getElementById('od-pins')!;
  let mode: Mode = 'view';

  const comments = createCommentController({
    panel,
    // Pins are only drawn when there is a frame to anchor them to.
    iframe: iframe ?? document.createElement('iframe'),
    host: 'mcp-app',
    pinDetails: true,
    persist: (changed, deletedIds) => {
      transport.persist(entryPath, changed, deletedIds).catch((err) => toast(`Couldn't save the comment: ${errorText(err)}`));
    },
    closePanel: () => closePanel(),
    onListChanged: () => {
      updateApply();
      toBridge({ type: 'set-comments', comments: comments.forBridge() });
      renderOverlays();
    },
  });

  function updateApply(): void {
    const open = comments.open().length;
    applyBtn.hidden = mode !== 'comment' && open === 0;
    applyBtn.disabled = open === 0;
    applyCount.textContent = open ? String(open) : '';
  }

  applyBtn.addEventListener('click', async () => {
    const open = comments.open();
    if (open.length === 0) return;
    if (await send(applyCommentsMessage(entryPath, open), 'Sent to Claude.')) comments.markOpenSent();
  });

  comments.setComments(state.comments);
  if (!iframe) return;

  let hoverRect: BridgeRect | null = null;
  let selection: ElementSnapshot | null = null;
  let selectionRect: BridgeRect | null = null;
  let pinRects: { commentId: string; rect: BridgeRect | null }[] = [];
  let bridgeReady = false;

  // The frame is sandboxed without same-origin, so its origin is opaque ("null"): address it by window, not origin.
  function toBridge(message: Untagged<ToBridge>): void {
    iframe?.contentWindow?.postMessage({ od: BRIDGE_TAG, ...message }, '*');
  }

  function closePanel(): void {
    panel.hidden = true;
    selection = null;
    selectionRect = null;
    toBridge({ type: 'clear-selection' });
    renderOverlays();
  }

  function renderOverlays(): void {
    pinsLayer.innerHTML = '';
    if (mode === 'view' || !iframe) return;
    if (hoverRect) pinsLayer.appendChild(highlightBox(hostRectOf(iframe, hoverRect), 'od-hover-box'));
    if (selection && selectionRect) {
      const rect = hostRectOf(iframe, selectionRect);
      selectionGuides(iframe, rect).forEach((line) => pinsLayer.appendChild(line));
      pinsLayer.appendChild(highlightBox(rect, 'od-select-box'));
    }
    comments.pins(pinRects).forEach((pin) => pinsLayer.appendChild(pin));
  }

  const modeButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('.od-seg-btn[data-mode]'));
  function setMode(next: Mode): void {
    if (next !== 'view' && !bridgeReady) {
      toast("Comment isn't available: the design's page didn't start the preview helper, usually because one of its scripts failed.");
      return;
    }
    mode = next;
    modeButtons.forEach((btn) => {
      const active = btn.dataset.mode === next;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-checked', String(active));
      btn.tabIndex = active ? 0 : -1;
    });
    panel.hidden = true;
    selection = null;
    selectionRect = null;
    hoverRect = null;
    pinRects = [];
    updateApply();
    toBridge({ type: 'set-mode', mode: next });
    toBridge({ type: 'set-comments', comments: comments.forBridge() });
    renderOverlays();
  }
  modeButtons.forEach((btn) => btn.addEventListener('click', () => setMode(btn.dataset.mode as Mode)));

  const errorsBanner = document.getElementById('od-errors')!;
  const errorsList = document.getElementById('od-errors-list')!;
  const previewErrors: string[] = [];
  document.getElementById('od-errors-close')!.addEventListener('click', () => {
    errorsBanner.hidden = true;
  });

  // Messages from the design are untrusted: only this frame's window, and only the bridge's shapes.
  window.addEventListener('message', (event) => {
    if (event.source !== iframe.contentWindow) return;
    if (typeof event.data?.odPreviewError === 'string') {
      const text = event.data.odPreviewError as string;
      if (!previewErrors.includes(text) && previewErrors.length < 20) {
        previewErrors.push(text);
        errorsBanner.hidden = false;
        errorsList.innerHTML = previewErrors
          .slice(0, 3)
          .map((e) => `<code>${escapeHtml(e)}</code>`)
          .join('');
      }
      return;
    }
    if (!isBridgeMessage(event.data)) return;
    const message = event.data as FromBridge;
    switch (message.type) {
      case 'ready':
        bridgeReady = true;
        toBridge({ type: 'set-mode', mode });
        toBridge({ type: 'set-comments', comments: comments.forBridge() });
        break;
      case 'select':
        if (mode === 'view') break;
        selection = message.element;
        selectionRect = message.element.rect;
        hoverRect = null;
        renderOverlays();
        comments.openInput(selection);
        break;
      case 'rects':
        hoverRect = message.hover;
        selectionRect = selection ? message.selection : null;
        pinRects = Array.isArray(message.pins) ? message.pins : [];
        renderOverlays();
        break;
      case 'open-local-link':
        toast('Links to other files open in the browser preview (open_open_design_preview).');
        break;
    }
  });
  iframe.addEventListener('load', () => {
    toBridge({ type: 'hello' });
    renderOverlays();
  });
  window.addEventListener('resize', renderOverlays);
  iframe.srcdoc = state.html!;
}

// ── An exploration ────────────────────────────────────────────────────────
function renderExploration(state: PreviewAppExplorationState, reload: () => void): void {
  root.innerHTML = `
  <div class="od-toolbar" role="toolbar" aria-label="Exploration">
    ${backButton()}
    <span class="od-title">${escapeHtml(state.title)}</span>
    <span class="od-toolbar-spacer"></span>
    <button id="od-refresh" class="od-icon-btn" title="Reload" aria-label="Reload">${icon('refresh')}</button>
    ${fullscreenButton()}
  </div>
  <div class="od-stage"><div class="od-directions">${state.directions
    .map(
      (d) => `<article class="od-direction${d.id === state.chosenDirectionId ? ' chosen' : ''}">
      <div class="od-direction-frame" data-direction="${escapeHtml(d.id)}">${
        d.html ? '' : d.image ? `<img src="${d.image}" alt="${escapeHtml(d.label)}">` : `<div class="od-message">${d.entryPath ? 'No preview yet.' : 'Not built yet.'}</div>`
      }</div>
      <div class="od-direction-body">
        <h2>${escapeHtml(d.label)}</h2>
        <p>${escapeHtml(d.summary)}</p>
        ${
          d.id === state.chosenDirectionId
            ? '<p>Chosen</p>'
            : `<div class="od-card-actions"><button class="od-btn od-btn-primary" data-pick="${escapeHtml(d.id)}">${icon('check')}<span class="od-label">Take this one</span></button>${
                state.styleTiles ? `<button class="od-btn" data-save-tile="${escapeHtml(d.id)}">${icon('palette')}<span class="od-label">Use as design system</span></button>` : ''
              }</div>`
        }
      </div>
    </article>`,
    )
    .join('')}</div></div>`;

  wireFullscreen();
  document.getElementById('od-refresh')!.addEventListener('click', reload);
  // View-only frames, scaled to the card's width: no bridge and no scripts' access to this page.
  for (const d of state.directions) {
    if (d.html) scaledFrame(root.querySelector<HTMLElement>(`[data-direction="${CSS.escape(d.id)}"]`)!, d.html, d.label);
  }
  root.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const direction = state.directions.find((d) => d.id === btn.dataset.pick);
      if (direction) void send(pickDirectionMessage(state.explorationId, direction), `Sent "${direction.label}" to Claude.`);
    }),
  );
  root.querySelectorAll<HTMLButtonElement>('[data-save-tile]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const direction = state.directions.find((d) => d.id === btn.dataset.saveTile);
      if (direction) void send(saveTileMessage(state.explorationId, direction), `Asked Claude to save "${direction.label}" as a design system.`);
    }),
  );
}

/** A view-only frame holding `html` at a 1280px layout width, scaled to its holder. `sandbox` "" runs no scripts at all. */
function scaledFrame(holder: HTMLElement, html: string, title: string, sandbox = 'allow-scripts'): void {
  const frame = document.createElement('iframe');
  frame.title = title;
  frame.setAttribute('sandbox', sandbox);
  frame.srcdoc = html;
  holder.replaceChildren(frame);
  const fit = (): void => {
    frame.style.transform = `scale(${holder.clientWidth / 1280})`;
  };
  fit();
  new ResizeObserver(fit).observe(holder);
}

/** Runs at most `limit` loads at once: one app-only call per visible card. */
function loadQueue(limit: number): (job: () => Promise<void>) => void {
  let running = 0;
  const waiting: Array<() => Promise<void>> = [];
  const next = (): void => {
    while (running < limit && waiting.length) {
      const job = waiting.shift()!;
      running++;
      void job().finally(() => {
        running--;
        next();
      });
    }
  };
  return (job) => {
    waiting.push(job);
    next();
  };
}

// ── The example gallery ───────────────────────────────────────────────────
function renderExamples(state: PreviewAppExamplesState, reload: () => void): void {
  if (target?.view !== 'examples') return;
  const current = target;
  const chips = ['', ...state.modes]
    .map((m) => {
      const active = (state.filters.mode ?? '') === m;
      return `<button class="od-chip${active ? ' active' : ''}" data-mode-filter="${escapeHtml(m)}" aria-pressed="${active}">${escapeHtml(m || 'All')}</button>`;
    })
    .join('');
  root.innerHTML = `
  <div class="od-toolbar" role="toolbar" aria-label="Examples">
    ${backButton()}
    <span class="od-title">${escapeHtml(state.title)}</span>
    <span class="od-toolbar-note">${state.total} example${state.total === 1 ? '' : 's'}</span>
    <span class="od-toolbar-spacer"></span>
    <button id="od-refresh" class="od-icon-btn" title="Reload" aria-label="Reload">${icon('refresh')}</button>
    ${fullscreenButton()}
  </div>
  <div class="od-stage od-scroll">
    ${state.modes.length > 1 ? `<div class="od-chips" role="group" aria-label="Filter by mode">${chips}</div>` : ''}
    ${state.examples.length ? '<div id="od-cards" class="od-cards"></div>' : '<div class="od-message">No remixable examples match. Ask Claude for a broader search.</div>'}
    <div class="od-more"><button id="od-more" class="od-btn" hidden>Show more</button></div>
    ${galleryLink(state.galleryUrl)}
  </div>`;
  wireFullscreen();
  wireGalleryLink(state.galleryUrl);
  document.getElementById('od-refresh')!.addEventListener('click', reload);
  root.querySelectorAll<HTMLButtonElement>('[data-mode-filter]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const next = { ...current };
      if (btn.dataset.modeFilter) next.mode = btn.dataset.modeFilter;
      else delete next.mode;
      target = next;
      void render();
    }),
  );

  const cards = document.getElementById('od-cards');
  const more = document.getElementById('od-more') as HTMLButtonElement;
  const enqueue = loadQueue(4);
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const holder = entry.target as HTMLElement;
        observer.unobserve(holder);
        enqueue(async () => {
          try {
            const preview = await transport.loadExamplePreview(holder.dataset.example!);
            if (preview.html) scaledFrame(holder, preview.html, holder.dataset.name ?? '');
            else holder.innerHTML = `<div class="od-message">${escapeHtml(preview.fallback ?? 'No preview.')}</div>`;
          } catch (err) {
            holder.innerHTML = `<div class="od-message">No preview: ${escapeHtml(errorText(err))}</div>`;
          }
        });
      }
    },
    { rootMargin: '200px' },
  );

  const addCards = (examples: PreviewAppExample[]): void => {
    if (!cards) return;
    for (const ex of examples) {
      const card = document.createElement('article');
      card.className = 'od-card';
      card.innerHTML = `
        <div class="od-card-frame" data-example="${escapeHtml(ex.id)}" data-name="${escapeHtml(ex.name)}"><div class="od-message">Loading the preview…</div></div>
        <div class="od-card-body">
          <h2>${escapeHtml(ex.name)}</h2>
          <span class="od-card-meta">${escapeHtml(ex.mode)}</span>
          <p>${escapeHtml(ex.summary)}</p>
          <button class="od-btn od-btn-primary" data-remix="${escapeHtml(ex.id)}">${icon('layers')}<span class="od-label">Remix this</span></button>
        </div>`;
      cards.appendChild(card);
      observer.observe(card.querySelector('.od-card-frame')!);
      card.querySelector('[data-remix]')!.addEventListener('click', () => void send(remixExampleMessage(ex), `Sent "${ex.name}" to Claude.`));
    }
  };
  let cursor = state.nextCursor;
  more.hidden = !cursor;
  more.addEventListener('click', async () => {
    if (!cursor) return;
    more.disabled = true;
    try {
      const page = await transport.loadState(current, cursor);
      if (page.view !== 'examples') return;
      addCards(page.examples);
      cursor = page.nextCursor;
    } catch (err) {
      toast(`Couldn't load more: ${errorText(err)}`);
    } finally {
      more.disabled = false;
      more.hidden = !cursor;
    }
  });
  addCards(state.examples);
}

// ── Design systems ────────────────────────────────────────────────────────
function renderDesignSystems(state: PreviewAppDesignSystemsState, reload: () => void): void {
  const tiles = state.systems
    .map(
      (s) => `<button class="od-ds-tile${s.active ? ' active' : ''}" data-ds="${escapeHtml(s.id)}" title="Open ${escapeHtml(s.name)}">
      <span class="od-swatches">${s.swatches.map((c) => `<span style="background:${escapeHtml(c)}"></span>`).join('')}</span>
      <span class="od-ds-name">${escapeHtml(s.name)}${s.active ? ' <span class="od-badge">Active</span>' : ''}</span>
      ${s.category ? `<span class="od-card-meta">${escapeHtml(s.category)}</span>` : ''}
      ${s.displayFont || s.bodyFont ? `<span class="od-ds-fonts">${escapeHtml([s.displayFont, s.bodyFont].filter((f, i, a) => f && a.indexOf(f) === i).join(' / '))}</span>` : ''}
    </button>`,
    )
    .join('');
  root.innerHTML = `
  <div class="od-toolbar" role="toolbar" aria-label="Design systems">
    ${backButton()}
    <span class="od-title">${escapeHtml(state.title)}</span>
    <span class="od-toolbar-note">${state.systems.length}</span>
    <span class="od-toolbar-spacer"></span>
    <button id="od-refresh" class="od-icon-btn" title="Reload" aria-label="Reload">${icon('refresh')}</button>
    ${fullscreenButton()}
  </div>
  <div class="od-stage">
    <div class="od-scroll">
      ${state.unknownIds?.length ? `<div class="od-message">Not found: ${escapeHtml(state.unknownIds.join(', '))}</div>` : ''}
      ${state.systems.length ? `<div class="od-ds-tiles">${tiles}</div>` : '<div class="od-message">No design systems match.</div>'}
      ${galleryLink(state.galleryUrl)}
    </div>
    <div id="od-ds-detail" class="od-ds-detail" hidden></div>
  </div>`;
  wireFullscreen();
  wireGalleryLink(state.galleryUrl);
  document.getElementById('od-refresh')!.addEventListener('click', reload);
  const detail = document.getElementById('od-ds-detail')!;
  root.querySelectorAll<HTMLButtonElement>('[data-ds]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const system = state.systems.find((s) => s.id === btn.dataset.ds);
      if (!system) return;
      detail.hidden = false;
      detail.innerHTML = `
        <div class="od-ds-detail-bar">
          <button class="od-icon-btn" data-close title="All design systems" aria-label="All design systems">${icon('arrowLeft')}</button>
          <span class="od-title">${escapeHtml(system.name)}</span>
          <span class="od-toolbar-spacer"></span>
          ${system.active ? '<span class="od-badge">Active</span>' : `<button class="od-btn od-btn-primary" data-use>${icon('check')}<span class="od-label">Use this design system</span></button>`}
        </div>
        <div class="od-ds-frame"><div class="od-message">Loading ${escapeHtml(system.name)}…</div></div>`;
      detail.querySelector('[data-close]')!.addEventListener('click', () => {
        detail.hidden = true;
        detail.innerHTML = '';
      });
      detail.querySelector('[data-use]')?.addEventListener('click', () => void send(useDesignSystemMessage(system), `Asked Claude to use ${system.name}.`));
      const holder = detail.querySelector<HTMLElement>('.od-ds-frame')!;
      try {
        const preview = await transport.loadDesignSystemPreview(system.id);
        // The Visualize page is script-free: an empty sandbox runs nothing.
        if (holder.isConnected) scaledFrame(holder, preview.html, system.name, '');
      } catch (err) {
        holder.innerHTML = `<div class="od-message">Couldn't load it: ${escapeHtml(errorText(err))}</div>`;
      }
    }),
  );
}

// ── A campaign sheet ──────────────────────────────────────────────────────
function renderCampaign(state: PreviewAppCampaignState, reload: () => void): void {
  const tiles = state.tiles
    .map(
      (t, i) => `<figure class="od-campaign-tile${t.errors.length ? ' bad' : ''}">
      <div class="od-campaign-image"${t.entryPath ? ` data-open="${i}" role="button" tabindex="0" title="Open ${escapeHtml(t.label)}"` : ''}>${
        t.image ? `<img src="${t.image}" alt="${escapeHtml(t.label)}">` : '<div class="od-message">No image</div>'
      }</div>
      <figcaption>
        <span class="od-tile-label"><span class="od-dot ${t.errors.length ? 'bad' : 'ok'}" aria-label="${t.errors.length ? `${t.errors.length} errors` : 'No errors'}"></span>${escapeHtml(t.label)}</span>
        <span class="od-card-meta">${escapeHtml(t.entryPath ?? t.shape ?? 'default size')}</span>
        ${t.errors.length ? `<ul class="od-tile-errors">${t.errors.map((e) => `<li><code>${escapeHtml(e.check)}</code> ${escapeHtml(e.message)}</li>`).join('')}</ul>` : ''}
        <div class="od-card-actions">
          ${t.entryPath ? `<button class="od-btn" data-open="${i}">${icon('eye')}<span class="od-label">Open</span></button>` : ''}
          <button class="od-btn${t.errors.length ? ' od-btn-primary' : ''}" data-fix="${i}">${icon('pencil')}<span class="od-label">Fix this piece</span></button>
        </div>
      </figcaption>
    </figure>`,
    )
    .join('');
  root.innerHTML = `
  <div class="od-toolbar" role="toolbar" aria-label="Campaign sheet">
    ${backButton()}
    <span class="od-title" title="${escapeHtml(state.entryPath)}">${escapeHtml(state.title)} — every piece</span>
    <span class="od-toolbar-spacer"></span>
    <button id="od-refresh" class="od-icon-btn" title="Reload" aria-label="Reload">${icon('refresh')}</button>
    ${fullscreenButton()}
  </div>
  <div class="od-stage od-scroll">
    ${state.message ? `<div class="od-message">${escapeHtml(state.message)}</div>` : ''}
    ${state.sheetImage ? `<img class="od-campaign-sheet" src="${state.sheetImage}" alt="Campaign sheet">` : ''}
    ${state.tiles.length ? `<div class="od-campaign-tiles">${tiles}</div>` : ''}
  </div>`;
  wireFullscreen();
  document.getElementById('od-refresh')!.addEventListener('click', reload);
  const open = (i: number): void => {
    const tile = state.tiles[i];
    if (tile?.entryPath) navigate({ view: 'artifact', entryPath: tile.entryPath, title: tile.label });
  };
  root.querySelectorAll<HTMLElement>('[data-open]').forEach((el) => {
    el.addEventListener('click', () => open(Number(el.dataset.open)));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') open(Number(el.dataset.open));
    });
  });
  root.querySelectorAll<HTMLButtonElement>('[data-fix]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const tile = state.tiles[Number(btn.dataset.fix)];
      if (tile) void send(fixCampaignPieceMessage(state.entryPath, tile), `Asked Claude to fix ${tile.label}.`);
    }),
  );
}

// ── Questions ─────────────────────────────────────────────────────────────
type AskTarget = Extract<ShowTarget, { view: 'ask' }>;

function renderAsk(state: AskTarget): void {
  const schema: AskSchema = { title: state.title, questions: state.questions };
  const answers: AskAnswers = {};
  for (const q of schema.questions) if (q.default !== undefined) answers[q.id] = Array.isArray(q.default) ? [...q.default] : q.default;

  const option = (qid: string, id: string, label: string, imageRef?: string): string =>
    `<button type="button" class="od-ask-option${imageRef ? ' has-image' : ''}${id === ASK_YOU_PICK ? ' you-pick' : ''}" data-q="${escapeHtml(qid)}" data-option="${escapeHtml(id)}" aria-pressed="false">${
      imageRef ? `<span class="od-ask-image" data-image-ref="${escapeHtml(imageRef)}" data-name="${escapeHtml(label)}"></span>` : ''
    }<span class="od-ask-label">${escapeHtml(label)}</span></button>`;
  const questions = schema.questions
    .map((q) => {
      const input =
        q.kind === 'text'
          ? `<input class="od-ask-text" data-text="${escapeHtml(q.id)}" maxlength="${ASK_MAX_TEXT_CHARS}" aria-label="${escapeHtml(q.text)}" value="${escapeHtml(typeof q.default === 'string' ? q.default : '')}">`
          : `<div class="od-ask-options" role="group">${(q.options ?? []).map((o) => option(q.id, o.id, o.label, o.imageRef)).join('')}${option(q.id, ASK_YOU_PICK, 'You pick')}</div>`;
      return `<fieldset class="od-ask-question"><legend>${escapeHtml(q.text)}${q.kind === 'multi' ? ' <span class="od-card-meta">Pick any</span>' : ''}</legend>${input}</fieldset>`;
    })
    .join('');
  root.innerHTML = `
  <div class="od-toolbar" role="toolbar" aria-label="Questions">
    <span class="od-title">${escapeHtml(state.title)}</span>
    <span class="od-toolbar-spacer"></span>
    ${fullscreenButton()}
  </div>
  <div class="od-stage od-scroll">
    <div class="od-ask">
      ${questions}
      <div class="od-ask-footer">
        <button type="button" id="od-ask-send" class="od-btn od-btn-primary">${icon('send')}<span class="od-label">Send</span></button>
        <span id="od-ask-status" class="od-toolbar-note" role="status"></span>
      </div>
      <div id="od-ask-copy" class="od-ask-copy" hidden>
        <p>The chat didn't take the message. Copy your answers and paste them in the chat:</p>
        <textarea readonly rows="3"></textarea>
        <button type="button" class="od-btn" data-copy>${icon('clipboard')}<span class="od-label">Copy answers</span></button>
      </div>
    </div>
  </div>`;
  wireFullscreen();

  // Not a <form>: hosts sandbox the page without allow-forms, which blocks submit.
  const form = root.querySelector<HTMLElement>('.od-ask')!;
  const sendBtn = document.getElementById('od-ask-send') as HTMLButtonElement;
  const status = document.getElementById('od-ask-status')!;
  const copyBox = document.getElementById('od-ask-copy')!;
  const copyText = copyBox.querySelector('textarea')!;

  const picked = (qid: string): string[] => {
    const a = answers[qid];
    return a === undefined ? [] : Array.isArray(a) ? a : [a];
  };
  function sync(): void {
    root.querySelectorAll<HTMLButtonElement>('[data-option]').forEach((btn) => {
      const on = picked(btn.dataset.q!).includes(btn.dataset.option!);
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
    });
    sendBtn.disabled = !schema.questions.some((q) => picked(q.id).some((v) => v.trim()));
  }
  root.querySelectorAll<HTMLButtonElement>('[data-option]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const q = schema.questions.find((x) => x.id === btn.dataset.q);
      const id = btn.dataset.option!;
      if (!q) return;
      const current = picked(q.id);
      if (q.kind === 'multi') {
        // "You pick" stands alone: it replaces the other picks, and a pick replaces it.
        const next = current.includes(id) ? current.filter((v) => v !== id) : id === ASK_YOU_PICK ? [id] : [...current.filter((v) => v !== ASK_YOU_PICK), id];
        if (next.length) answers[q.id] = next;
        else delete answers[q.id];
      } else if (current.includes(id)) delete answers[q.id];
      else answers[q.id] = id;
      sync();
    }),
  );
  root.querySelectorAll<HTMLInputElement>('[data-text]').forEach((input) => {
    const update = (): void => {
      if (input.value.trim()) answers[input.dataset.text!] = input.value;
      else delete answers[input.dataset.text!];
      sync();
    };
    input.addEventListener('input', update);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendBtn.click();
    });
    update();
  });
  copyBox.querySelector('[data-copy]')!.addEventListener('click', async () => {
    copyText.select();
    try {
      await navigator.clipboard.writeText(copyText.value);
      toast('Copied. Paste it in the chat.');
    } catch {
      // The host may block the clipboard: the text is selected for a manual copy.
      toast('Press Ctrl+C or ⌘C to copy the selected answers.');
    }
  });
  sendBtn.addEventListener('click', async () => {
    if (sendBtn.disabled) return;
    const message = askAnswersMessage(schema, answers);
    sendBtn.disabled = true;
    if (await send(message, 'Sent your answers to Claude.')) {
      form.classList.add('sent');
      form.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input').forEach((el) => (el.disabled = true));
      status.textContent = 'Sent.';
      copyBox.hidden = true;
    } else {
      sendBtn.disabled = false;
      copyText.value = message;
      copyBox.hidden = false;
    }
  });
  sync();

  // Option pictures come through the app-only state tool, a few at a time.
  const enqueue = loadQueue(3);
  root.querySelectorAll<HTMLElement>('[data-image-ref]').forEach((holder) =>
    enqueue(async () => {
      try {
        const picture = await transport.loadAskImage(holder.dataset.imageRef!);
        if (picture.swatches?.length) holder.innerHTML = `<span class="od-swatches">${picture.swatches.map((c) => `<span style="background:${escapeHtml(c)}"></span>`).join('')}</span>`;
        else if (picture.image) holder.innerHTML = `<img src="${picture.image}" alt="">`;
        else if (picture.html) scaledFrame(holder, picture.html, holder.dataset.name ?? '');
        else holder.classList.add('empty');
      } catch {
        holder.classList.add('empty');
      }
    }),
  );
}

// ── Start ─────────────────────────────────────────────────────────────────
let target: ShowTarget | undefined;
/** Views this one was opened from, newest last. */
const backStack: ShowTarget[] = [];

function navigate(next: ShowTarget): void {
  if (target) backStack.push(target);
  target = next;
  void render();
}

function goBack(): void {
  const previous = backStack.pop();
  if (!previous) return;
  target = previous;
  void render();
}

// ── Following edits (openspec inline-preview-in-place) ────────────────────
// The design, exploration or campaign sheet on screen reloads when its
// revision changes: checked every 3 s while visible, every 10 s after 2
// minutes without a change, never while the user is commenting.
const POLL_FAST_MS = 3000;
const POLL_SLOW_MS = 10000;
const POLL_IDLE_MS = 120000;
let pollToken = 0;
let lastActivity = Date.now();
document.addEventListener('click', () => {
  lastActivity = Date.now();
});

/** Commenting: a comment panel is open or Comment mode is on. A reload then would throw the user's work away. */
function userIsCommenting(): boolean {
  const panel = document.getElementById('od-panel');
  return (!!panel && !panel.hidden) || !!document.querySelector('[data-mode="comment"].active');
}

function followEdits(shown: ShowTarget): void {
  const token = ++pollToken;
  if (shown.view !== 'artifact' && shown.view !== 'exploration' && shown.view !== 'campaign') return;
  let revision: string | undefined;
  const changedAt = Date.now();
  const tick = async (): Promise<void> => {
    if (token !== pollToken) return;
    const idle = Date.now() - Math.max(changedAt, lastActivity) > POLL_IDLE_MS;
    if (document.visibilityState === 'visible') {
      let next: string;
      try {
        next = await transport.loadRevision(shown);
      } catch {
        // The server may have gone (a restarted chat); the reload button still works.
        return;
      }
      if (token !== pollToken) return;
      if (revision === undefined) revision = next;
      else if (next !== revision && !userIsCommenting()) {
        // render() starts a fresh check against the new revision.
        await render();
        toast('Updated to the latest version.');
        return;
      }
    }
    window.setTimeout(() => void tick(), idle ? POLL_SLOW_MS : POLL_FAST_MS);
  };
  void tick();
}

async function render(): Promise<void> {
  if (!target) return;
  followEdits(target);
  // The questions arrive whole in the show tool's result: nothing to load.
  document.body.classList.toggle('od-ask-view', target.view === 'ask');
  if (target.view === 'ask') return renderAsk(target);
  const reload = (): void => void render();
  try {
    const state = await transport.loadState(target);
    switch (state.view) {
      case 'artifact':
        return renderArtifact(state, reload);
      case 'exploration':
        return renderExploration(state, reload);
      case 'examples':
        return renderExamples(state, reload);
      case 'design-systems':
        return renderDesignSystems(state, reload);
      case 'campaign':
        return renderCampaign(state, reload);
    }
  } catch (err) {
    showMessage(`Couldn't load it: ${errorText(err)}`);
  }
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

function targetFrom(value: unknown): ShowTarget | undefined {
  const v = (value ?? {}) as Record<string, unknown>;
  const title = str(v.title);
  switch (v.view) {
    case 'artifact':
      return str(v.entryPath) ? { view: 'artifact', entryPath: v.entryPath as string, title: title ?? (v.entryPath as string) } : undefined;
    case 'exploration':
      return str(v.explorationId) ? { view: 'exploration', explorationId: v.explorationId as string, title: title ?? (v.explorationId as string) } : undefined;
    case 'campaign':
      return str(v.entryPath) ? { view: 'campaign', entryPath: v.entryPath as string, title: title ?? (v.entryPath as string) } : undefined;
    case 'examples': {
      const t: ShowTarget = { view: 'examples', title: title ?? 'Examples' };
      for (const key of ['query', 'mode', 'surface'] as const) if (str(v[key])) t[key] = v[key] as string;
      return t;
    }
    case 'ask': {
      // Checked again here: the page draws only what the schema allows.
      const parsed = parseAskSchema({ questions: v.questions, ...(title ? { title } : {}) });
      return parsed.ok ? { view: 'ask', title: parsed.schema.title ?? 'A few quick questions', questions: parsed.schema.questions } : undefined;
    }
    case 'design-systems': {
      const t: ShowTarget = { view: 'design-systems', title: title ?? 'Design systems' };
      if (str(v.query)) t.query = v.query as string;
      if (str(v.category)) t.category = v.category as string;
      if (Array.isArray(v.ids)) t.ids = v.ids.filter((id): id is string => typeof id === 'string');
      return t;
    }
  }
  return undefined;
}

showMessage('Loading…');
app.ontoolinput = (params) => {
  // Shown before the result arrives; the result's target is the one the server checked.
  const args = params.arguments ?? {};
  if (typeof args.project === 'string') transport.setProject(args.project);
  if (!target && typeof args.entryPath === 'string') {
    target = args.campaign === true ? { view: 'campaign', entryPath: args.entryPath, title: args.entryPath } : { view: 'artifact', entryPath: args.entryPath, title: args.entryPath };
  } else if (!target && typeof args.explorationId === 'string') target = { view: 'exploration', explorationId: args.explorationId, title: args.explorationId };
};
app.ontoolresult = (result) => {
  const project = (result.structuredContent as { project?: unknown } | undefined)?.project;
  if (typeof project === 'string') transport.setProject(project);
  const next = targetFrom(result.structuredContent);
  if (!next) {
    const text = (result.content ?? []).find((c) => c.type === 'text');
    showMessage(text && 'text' in text ? String(text.text) : `${SHOW_ARTIFACT_TOOL} returned nothing to show.`);
    return;
  }
  backStack.length = 0;
  target = next;
  void render();
};
app.onhostcontextchanged = () => applyHostContext();
app.onteardown = async () => ({});
app.connect().then(applyHostContext, (err) => showMessage(`Couldn't connect to the host: ${errorText(err)}`));

