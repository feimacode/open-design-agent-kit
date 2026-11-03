/// <reference lib="dom" />
// The browser preview shell (openspec add-browser-preview): View and Comment
// modes over the served design, live reload, Send to agent and the Checks
// panel. Talks to the design through the preview bridge (postMessage, as the
// VS Code preview does) and to the preview server over fetch and an
// EventSource. Bundled by the MCP server and the CLI as shell.js.
import type { ArtifactComment } from '../../workspace/artifactCommentTypes';
import type { CheckRun } from '../../export/checkHistory';
import { critiqueSummary, type CritiqueRecord } from '../../workspace/critiqueTypes';
import { createCommentController } from '../commentController';
import { icon } from '../dom/icons';
import { escapeHtml, highlightBox, hostRectOf, selectionGuides } from '../overlays';
import { mountDeviceShell } from '../deviceShell';
import { BRIDGE_TAG, isBridgeMessage, type BridgeRect, type ElementSnapshot, type FromBridge, type ToBridge, type Untagged } from '../protocol';

type Mode = 'view' | 'comment';
type CropSupport = 'window' | 'rerender' | 'none';

const root = document.getElementById('root')!;
const config = JSON.parse(root.dataset.odConfig ?? '{}') as { entryPath: string | null; designOrigin: string };

// Dark tokens follow the system (theme.ts reads `od-dark`).
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const applyScheme = (): void => {
  document.body.classList.toggle('od-dark', darkQuery.matches);
};
applyScheme();
darkQuery.addEventListener('change', applyScheme);

async function api<T>(route: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(route, {
    method: init?.method ?? 'GET',
    headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

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

// ── No entry: the artifact picker ─────────────────────────────────────────
async function renderPicker(note?: string): Promise<void> {
  root.innerHTML = `<div class="od-picker"><div class="od-picker-inner">
    <h1>Open Design preview</h1>
    <p>${note ? escapeHtml(note) : 'Pick a design to preview and comment on.'}</p>
    <ul class="od-picker-list" id="od-picker-list"><li><p>Loading…</p></li></ul>
  </div></div>`;
  const list = document.getElementById('od-picker-list')!;
  try {
    const { artifacts } = await api<{ artifacts: { entryPath: string; title: string; kind?: string }[] }>('api/artifacts');
    list.innerHTML = artifacts.length
      ? artifacts.map((a) => `<li><a href="?entry=${encodeURIComponent(a.entryPath)}">${escapeHtml(a.title)}<small>${escapeHtml(a.entryPath)}</small></a></li>`).join('')
      : '<li><p>No designs are registered in this workspace yet. Ask your agent to make one.</p></li>';
  } catch (err) {
    list.innerHTML = `<li><p>${escapeHtml(err instanceof Error ? err.message : String(err))}</p></li>`;
  }
}

// ── The preview ───────────────────────────────────────────────────────────
async function startPreview(entryPath: string): Promise<void> {
  let state: { title: string; designUrl: string; comments: ArtifactComment[]; cropSupport: CropSupport };
  try {
    state = await api(`api/state?entry=${encodeURIComponent(entryPath)}`);
  } catch (err) {
    await renderPicker(err instanceof Error ? err.message : String(err));
    return;
  }
  document.title = `${state.title} · Open Design`;
  const query = `entry=${encodeURIComponent(entryPath)}`;

  root.innerHTML = `
  <div class="od-shell" style="display:flex;flex-direction:column;height:100%">
  <div class="od-toolbar" role="toolbar" aria-label="Preview">
    <div class="od-segmented" role="radiogroup" aria-label="Mode">
      <button data-mode="view" class="od-seg-btn active" role="radio" aria-checked="true" title="View">${icon('eye')}<span class="od-label">View</span></button>
      <button data-mode="comment" class="od-seg-btn" role="radio" aria-checked="false" tabindex="-1" title="Comment on elements">${icon('comment')}<span class="od-label">Comment</span></button>
    </div>
    <a class="od-icon-btn" href="./" title="All designs" aria-label="All designs">${icon('chevronLeft')}</a>
    <span class="od-title">${escapeHtml(state.title)}</span>
    <span class="od-path">${escapeHtml(entryPath)}</span>
    <span class="od-toolbar-spacer"></span>
    <span id="od-live" class="od-live off" title="Reloads when the design changes"><span>Live</span></span>
    <button id="od-checks-toggle" class="od-btn" title="Check screenshots: before and after" aria-pressed="false">${icon('check')}<span class="od-label">Checks</span><span id="od-checks-dot" class="od-dot" hidden></span></button>
    <button id="od-send-comments" class="od-btn od-btn-primary" title="Copy an instruction for your agent to apply the open comments" hidden>${icon('send')}<span class="od-label">Send to agent</span><span id="od-send-count" class="od-count"></span></button>
  </div>
  <div class="od-stage">
    <div id="od-errors" class="od-errors" role="status" hidden>
      <div class="od-errors-text"><strong>This design has errors</strong><span id="od-errors-list"></span></div>
      <button id="od-errors-close" class="od-panel-close" aria-label="Dismiss">×</button>
    </div>
    <iframe id="od-preview" class="od-preview" title="Design"></iframe>
    <div id="od-pins" class="od-pins"></div>
  </div>
  <div id="od-panel" class="od-panel" hidden></div>
  <div id="od-checks" class="od-panel od-checks" hidden></div>
  </div>`;

  const iframe = document.getElementById('od-preview') as HTMLIFrameElement;
  const pinsLayer = document.getElementById('od-pins')!;
  const panel = document.getElementById('od-panel')!;
  const checksPanel = document.getElementById('od-checks')!;
  const checksToggle = document.getElementById('od-checks-toggle') as HTMLButtonElement;
  const checksDot = document.getElementById('od-checks-dot')!;
  const sendBtn = document.getElementById('od-send-comments') as HTMLButtonElement;
  const sendCount = document.getElementById('od-send-count')!;
  const live = document.getElementById('od-live')!;

  let mode: Mode = 'view';
  let hoverRect: BridgeRect | null = null;
  let selection: ElementSnapshot | null = null;
  let selectionRect: BridgeRect | null = null;
  let pinRects: { commentId: string; rect: BridgeRect | null }[] = [];
  let bridgeReady = false;
  let iframeLoaded = false;
  // Hidden while a crop is taken, so the screenshot shows the design only.
  let capturing = false;
  // The page's scroll position, restored after a live reload.
  let pageScroll = { x: 0, y: 0 };
  let restoreScroll: { x: number; y: number } | undefined;

  const toBridge = (message: Untagged<ToBridge>): void => {
    iframe.contentWindow?.postMessage({ od: BRIDGE_TAG, ...message }, config.designOrigin);
  };

  const closePanel = (): void => {
    panel.hidden = true;
    selection = null;
    selectionRect = null;
    toBridge({ type: 'clear-selection' });
    renderOverlays();
  };

  const updateSend = (): void => {
    const open = comments.open().length;
    sendBtn.hidden = mode !== 'comment' && open === 0;
    sendBtn.disabled = open === 0;
    sendCount.textContent = open ? String(open) : '';
  };

  const comments = createCommentController({
    panel,
    iframe,
    host: 'browser',
    pinDetails: true,
    persist: (changed, deletedIds) => {
      api<{ comments: ArtifactComment[] }>(`api/comments?${query}`, { method: 'POST', body: { changed, deletedIds } }).catch((err) => toast(`Couldn't save the comment: ${err instanceof Error ? err.message : String(err)}`));
    },
    closePanel,
    onListChanged: () => {
      updateSend();
      toBridge({ type: 'set-comments', comments: comments.forBridge() });
      renderOverlays();
    },
    onAdded: (comment, target) => void captureCrop(comment, target),
  });

  function renderOverlays(): void {
    pinsLayer.innerHTML = '';
    if (mode === 'view' || capturing) return;
    if (hoverRect) pinsLayer.appendChild(highlightBox(hostRectOf(iframe, hoverRect), 'od-hover-box'));
    if (selection && selectionRect) {
      const rect = hostRectOf(iframe, selectionRect);
      selectionGuides(iframe, rect).forEach((line) => pinsLayer.appendChild(line));
      pinsLayer.appendChild(highlightBox(rect, 'od-select-box'));
    }
    comments.pins(pinRects).forEach((pin) => pinsLayer.appendChild(pin));
  }

  const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

  async function captureCrop(comment: ArtifactComment, target: ElementSnapshot): Promise<void> {
    if (state.cropSupport === 'none') return;
    capturing = true;
    renderOverlays();
    await nextFrame();
    await nextFrame();
    const stage = iframe.getBoundingClientRect();
    const element = hostRectOf(iframe, target.rect);
    try {
      const result = await api<{ comment?: ArtifactComment; reason?: string }>(`api/crop?${query}`, {
        method: 'POST',
        body: {
          commentId: comment.id,
          element: { x: element.left, y: element.top, width: element.width, height: element.height },
          stage: { x: stage.left, y: stage.top, width: stage.width, height: stage.height },
          docRect: { x: target.docRect.left, y: target.docRect.top, width: target.docRect.width, height: target.docRect.height },
          viewport: target.viewport,
        },
      });
      if (result.comment) comments.upsertLocal(result.comment);
      else if (result.reason) toast(result.reason);
    } catch (err) {
      toast(`The comment was saved without a screenshot: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      capturing = false;
      renderOverlays();
    }
  }

  function showBridgeUnavailable(): void {
    panel.hidden = false;
    panel.innerHTML = `
    <div class="od-panel-header">
      <span class="od-panel-header-title">Comment unavailable</span>
      <button id="od-bridge-close" class="od-panel-close" aria-label="Close">×</button>
    </div>
    <div class="od-panel-body"><p>This design's page didn't start the preview helper that Comment relies on, usually because one of its own scripts failed first. Check the error banner, or ask your agent to fix the page.</p></div>`;
    document.getElementById('od-bridge-close')!.addEventListener('click', () => {
      panel.hidden = true;
    });
  }

  const modeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.od-seg-btn[data-mode]'));
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
    panel.hidden = true;
    selection = null;
    selectionRect = null;
    hoverRect = null;
    pinRects = [];
    updateSend();
    toBridge({ type: 'set-mode', mode: next });
    toBridge({ type: 'set-comments', comments: comments.forBridge() });
    renderOverlays();
  }
  modeButtons.forEach((btn, i) => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode as Mode));
    btn.addEventListener('keydown', (event) => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      const nextBtn = modeButtons[(i + step + modeButtons.length) % modeButtons.length];
      setMode(nextBtn.dataset.mode as Mode);
      nextBtn.focus();
    });
  });

  // Errors the page reports (core's PREVIEW_ERROR_REPORTER).
  const errorsBanner = document.getElementById('od-errors')!;
  const errorsList = document.getElementById('od-errors-list')!;
  let previewErrors: string[] = [];
  const renderErrors = (): void => {
    errorsBanner.hidden = previewErrors.length === 0;
    errorsList.innerHTML =
      previewErrors
        .slice(0, 3)
        .map((e) => `<code>${escapeHtml(e)}</code>`)
        .join('') + (previewErrors.length > 3 ? `<span>and ${previewErrors.length - 3} more</span>` : '');
  };
  document.getElementById('od-errors-close')!.addEventListener('click', () => {
    errorsBanner.hidden = true;
  });

  // Messages from the page are untrusted: only this iframe's window, from the design origin.
  window.addEventListener('message', (event) => {
    if (event.source !== iframe.contentWindow || event.origin !== config.designOrigin) return;
    if (typeof event.data?.odPreviewError === 'string') {
      const text = event.data.odPreviewError as string;
      if (!previewErrors.includes(text) && previewErrors.length < 20) {
        previewErrors.push(text);
        renderErrors();
      }
      return;
    }
    if (!isBridgeMessage(event.data)) return;
    const message = event.data as FromBridge;
    switch (message.type) {
      case 'ready':
        bridgeReady = true;
        // The device the page declares gets the kit's frame around it (openspec add-platform-shells).
        mountDeviceShell(document, iframe, message.device, message.title);
        toBridge({ type: 'set-mode', mode });
        toBridge({ type: 'set-comments', comments: comments.forBridge() });
        if (restoreScroll) {
          toBridge({ type: 'scroll-to', ...restoreScroll });
          restoreScroll = undefined;
        }
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
      case 'scroll':
        if (Number.isFinite(message.x) && Number.isFinite(message.y)) pageScroll = { x: message.x, y: message.y };
        break;
      case 'open-local-link':
        void openLocalLink(String(message.href ?? ''));
        break;
    }
  });

  // A relative link in View mode: another registered design opens in the
  // preview; any other workspace file loads in the frame.
  async function openLocalLink(href: string): Promise<void> {
    const target = new URL(href, state.designUrl);
    // Design URLs are /<token>/<workspace path>.
    const prefix = `/${new URL(state.designUrl).pathname.split('/')[1]}/`;
    const rel = decodeURIComponent(target.pathname.slice(prefix.length));
    try {
      await api(`api/state?entry=${encodeURIComponent(rel)}`);
      location.search = `?entry=${encodeURIComponent(rel)}`;
    } catch {
      iframe.src = target.href;
    }
  }

  let version = 0;
  function loadDesign(keepScroll: boolean): void {
    bridgeReady = false;
    iframeLoaded = false;
    previewErrors = [];
    renderErrors();
    hoverRect = null;
    selection = null;
    selectionRect = null;
    pinRects = [];
    if (!panel.hidden && panel.querySelector('#od-comment-text')) {
      // Keep an unsaved comment's text visible; its element may be gone after the reload.
    } else panel.hidden = true;
    restoreScroll = keepScroll ? pageScroll : undefined;
    version++;
    iframe.src = `${state.designUrl}?v=${version}`;
    renderOverlays();
  }
  iframe.addEventListener('load', () => {
    iframeLoaded = true;
    toBridge({ type: 'hello' });
    renderOverlays();
  });
  window.addEventListener('resize', renderOverlays);

  // ── Send to agent ──
  sendBtn.addEventListener('click', async () => {
    const open = comments.open();
    if (open.length === 0) return;
    const instruction = `Apply my ${open.length === 1 ? 'comment' : `${open.length} comments`} on the Open Design artifact "${entryPath}": call get_open_design_artifact for it, address each open comment, then pass their ids as resolvedCommentIds when you re-register it.`;
    comments.markOpenSent();
    try {
      await navigator.clipboard.writeText(instruction);
      toast('Copied. Paste it into your agent.');
    } catch {
      panel.hidden = false;
      panel.innerHTML = `
      <div class="od-panel-header"><span class="od-panel-header-title">Paste this into your agent</span><button id="od-copy-close" class="od-panel-close" aria-label="Close">×</button></div>
      <div class="od-panel-body"><textarea class="od-textarea od-copy-text" readonly>${escapeHtml(instruction)}</textarea></div>`;
      const area = panel.querySelector('textarea')!;
      area.select();
      document.getElementById('od-copy-close')!.addEventListener('click', () => {
        panel.hidden = true;
      });
    }
  });

  // ── Checks panel ──
  let runs: CheckRun[] = [];
  let critique: CritiqueRecord | undefined;
  let selectedRun: string | undefined;
  async function loadRuns(): Promise<void> {
    try {
      ({ runs, critique } = await api<{ runs: CheckRun[]; critique?: CritiqueRecord }>(`api/checks?${query}`));
    } catch {
      runs = [];
      critique = undefined;
    }
    if (!checksPanel.hidden) renderChecks();
  }
  const imageUrl = (run: CheckRun, file: string): string => `api/check-image?${query}&run=${encodeURIComponent(run.id)}&file=${encodeURIComponent(file)}`;
  const runLabel = (run: CheckRun): string => `${new Date(run.createdAt).toLocaleString()} · ${run.errors} error${run.errors === 1 ? '' : 's'}, ${run.warnings} warning${run.warnings === 1 ? '' : 's'}`;
  function renderChecks(): void {
    const current = runs.find((r) => r.id === selectedRun) ?? runs[0];
    const previous = current ? runs[runs.indexOf(current) + 1] : undefined;
    const body = !current
      ? '<p class="od-check-empty">No checks yet. Your agent runs one after making or changing a design.</p>'
      : `<div class="od-check-runs">${runs
          .map((r) => `<button class="od-btn od-check-run${r === current ? ' active' : ''}" data-run="${escapeHtml(r.id)}">${escapeHtml(new Date(r.createdAt).toLocaleTimeString())}</button>`)
          .join('')}</div>
        <p class="od-check-summary">After: ${escapeHtml(runLabel(current))}${previous ? `<br>Before: ${escapeHtml(runLabel(previous))}` : '<br>No earlier check to compare with.'}</p>
        ${current.images
          .map((img) => {
            const before = previous?.images.find((p) => p.label === img.label);
            return `<div class="od-check-label">${escapeHtml(img.label)}</div><div class="od-check-pair">
              <figure>${before ? `<img src="${imageUrl(previous!, before.file)}" alt="Before: ${escapeHtml(img.label)}" loading="lazy">` : '<div class="od-check-empty">No earlier image</div>'}<figcaption>Before</figcaption></figure>
              <figure><img src="${imageUrl(current, img.file)}" alt="After: ${escapeHtml(img.label)}" loading="lazy"><figcaption>After</figcaption></figure></div>`;
          })
          .join('')}
        ${
          current.findings.length
            ? `<div class="od-panel-section-title">Findings</div><ul class="od-shape-findings">${current.findings
                .map((f) => `<li class="od-shape-finding od-sev-${escapeHtml(f.severity)}"><b>${escapeHtml(f.severity)}</b> [${escapeHtml(f.check)}] ${escapeHtml(f.message)}</li>`)
                .join('')}</ul>`
            : ''
        }`;
    // The design critic's last opinion (openspec add-design-critic), shown whichever run is selected.
    const critiqueHtml = critique
      ? `<div class="od-panel-section-title">${escapeHtml(critiqueSummary(critique))}</div>${
          critique.findings.length
            ? `<ul class="od-shape-findings">${critique.findings
                .map((f) => `<li class="od-shape-finding">${f.where ? `<b>${escapeHtml(f.where)}</b> ` : ''}${f.problem ? `${escapeHtml(f.problem)}. ` : ''}${escapeHtml(f.fix)}</li>`)
                .join('')}</ul>`
            : ''
        }`
      : '';
    checksPanel.innerHTML = `
      <div class="od-panel-header"><span class="od-panel-header-title">Checks</span><button id="od-checks-close" class="od-panel-close" aria-label="Close">×</button></div>
      <div class="od-panel-body">${critiqueHtml}${body}</div>`;
    document.getElementById('od-checks-close')!.addEventListener('click', () => toggleChecks(false));
    checksPanel.querySelectorAll<HTMLButtonElement>('[data-run]').forEach((b) =>
      b.addEventListener('click', () => {
        selectedRun = b.dataset.run;
        renderChecks();
      }),
    );
  }
  function toggleChecks(open = checksPanel.hidden): void {
    checksPanel.hidden = !open;
    checksToggle.classList.toggle('active', open);
    checksToggle.setAttribute('aria-pressed', String(open));
    if (open) {
      checksDot.hidden = true;
      panel.hidden = true;
      renderChecks();
    }
  }
  checksToggle.addEventListener('click', () => toggleChecks());

  // ── Live updates ──
  const events = new EventSource(`events?${query}`);
  events.addEventListener('open', () => live.classList.remove('off'));
  events.addEventListener('error', () => live.classList.add('off'));
  events.addEventListener('source-updated', () => loadDesign(true));
  // Re-registering rewrites the manifest, which may carry a new critique.
  events.addEventListener('manifest-updated', () => void loadRuns());
  events.addEventListener('comments-updated', (e) => {
    const data = JSON.parse((e as MessageEvent).data) as { comments?: ArtifactComment[] };
    comments.setComments(data.comments ?? []);
  });
  events.addEventListener('checks-updated', (e) => {
    const data = JSON.parse((e as MessageEvent).data) as { runId?: string };
    selectedRun = data.runId;
    if (checksPanel.hidden) checksDot.hidden = false;
    void loadRuns();
  });

  comments.setComments(state.comments);
  loadDesign(false);
  void loadRuns();
}

if (config.entryPath) void startPreview(config.entryPath);
else void renderPicker();
