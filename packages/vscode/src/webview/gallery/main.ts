// Grid view for browsing/remixing OpenDesign examples — modeled on
// feima-copilot-ai-flow's gallery (webview-src/gallery/App.tsx +
// FlowCard.tsx): search bar + filter chips above a CSS-grid of cards.
// Plain DOM/TS instead of React, consistent with this extension's other
// webview (src/webview/main.ts).
//
// Thumbnails are fetched lazily, one card at a time, only once a card
// actually scrolls into view (IntersectionObserver) — not all ~167 upfront.
// Each fetch is answered with the example's HTML as a plain string over
// postMessage (read from this extension's own bundled assets on the host
// side), rendered directly via `iframe.srcdoc` — no `asWebviewUri`/resource
// fetch involved, so nothing is ever "downloaded" by the webview's browser
// engine; it's in-memory data handed straight to the DOM.

export {}; // Force module scope — otherwise this file's top-level `const`s (no local import/export of its own) would collide with the other webview entry points' same-named top-level `const`s under a single `tsc -p src/webview` project compile.

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
};

interface GalleryExample {
  id: string;
  name: string;
  description: string;
  category?: string;
  mode: string;
}

const THUMB_DESIGN_WIDTH = 1200; // matches .og-thumb's 16:9 aspect-ratio (1200x675)

const vscode = acquireVsCodeApi();

const root = document.getElementById('root')!;
root.innerHTML = `
  <div class="og-toolbar">
    <input id="og-search" class="og-search od-input" type="text" placeholder="Search examples…" autocomplete="off" spellcheck="false" />
  </div>
  <div id="og-chips" class="og-chips"></div>
  <div id="og-grid" class="og-grid"></div>
`;

const searchInput = document.getElementById('og-search') as HTMLInputElement;
const chipsEl = document.getElementById('og-chips')!;
const gridEl = document.getElementById('og-grid')!;

let examples: GalleryExample[] = [];
let query = '';
let activeCategory: string | undefined;

const previewCache = new Map<string, string>();
const requestedIds = new Set<string>();
let observer: IntersectionObserver | undefined;

function requestPreview(id: string): void {
  if (requestedIds.has(id)) return;
  requestedIds.add(id);
  vscode.postMessage({ type: 'get-preview', id });
}

function renderThumbnail(thumbEl: HTMLElement, html: string): void {
  thumbEl.innerHTML = '';
  if (!html) {
    const placeholder = document.createElement('div');
    placeholder.className = 'og-thumb-placeholder';
    placeholder.textContent = 'No preview';
    thumbEl.appendChild(placeholder);
    return;
  }
  const iframe = document.createElement('iframe');
  // Thumbnails stay non-interactive via `pointer-events: none` on the
  // iframe (CSS below), not via a restrictive sandbox — an under-permissed
  // sandbox instead risks the example's own init script throwing early
  // (e.g. a same-origin check) and rendering nothing at all. Matches the
  // sandbox used for the full-size preview panel.
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-pointer-lock allow-modals');
  iframe.srcdoc = html;
  thumbEl.appendChild(iframe);
  const scale = thumbEl.clientWidth / THUMB_DESIGN_WIDTH;
  iframe.style.transform = `scale(${scale})`;
}

function render(): void {
  const categories = [...new Set(examples.map((e) => e.category ?? 'Uncategorized'))].sort((a, b) => a.localeCompare(b));

  chipsEl.innerHTML = '';
  for (const category of categories) {
    const chip = document.createElement('button');
    chip.className = `og-chip od-badge ${activeCategory === category ? 'od-badge-active' : ''}`;
    chip.textContent = category;
    chip.addEventListener('click', () => {
      activeCategory = activeCategory === category ? undefined : category;
      render();
    });
    chipsEl.appendChild(chip);
  }

  const q = query.toLowerCase().trim();
  const filtered = examples.filter((e) => {
    if (activeCategory && (e.category ?? 'Uncategorized') !== activeCategory) return false;
    if (!q) return true;
    return (
      e.name.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      (e.category ?? '').toLowerCase().includes(q) ||
      e.mode.toLowerCase().includes(q)
    );
  });

  gridEl.innerHTML = '';
  observer?.disconnect();
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const id = (entry.target as HTMLElement).dataset.id;
        if (id) requestPreview(id);
        observer!.unobserve(entry.target);
      }
    },
    { root: gridEl, rootMargin: '200px' },
  );

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'og-empty';
    empty.textContent = q ? `No examples match "${query}".` : 'No examples found.';
    gridEl.appendChild(empty);
    return;
  }

  for (const example of filtered) {
    const card = document.createElement('div');
    card.className = 'og-card';
    card.innerHTML = `
      <div class="og-thumb" data-id="${example.id}"><div class="og-thumb-placeholder">Loading…</div></div>
      <div class="og-card-title">${escapeHtml(example.name)}</div>
      <div class="og-card-desc">${escapeHtml(example.description || '')}</div>
      <div class="og-card-meta">
        ${example.category ? `<span class="od-badge">${escapeHtml(example.category)}</span>` : ''}
        <span class="od-badge">${escapeHtml(example.mode)}</span>
      </div>
      <div class="og-actions">
        <button class="og-remix-btn od-btn od-btn-primary">Remix</button>
        <button class="og-preview-link">Preview</button>
      </div>
    `;
    card.querySelector('.og-remix-btn')!.addEventListener('click', (event) => {
      event.stopPropagation();
      vscode.postMessage({ type: 'remix', id: example.id });
    });
    card.querySelector('.og-preview-link')!.addEventListener('click', (event) => {
      event.stopPropagation();
      vscode.postMessage({ type: 'open-preview', id: example.id });
    });
    // Mirrors open-design's own Gallery: clicking a card populates the chat
    // composer with its prompt — nothing is written until the user sends
    // it. Preview and Remix (above) are separate, explicit actions.
    card.addEventListener('click', () => {
      vscode.postMessage({ type: 'open-chat', id: example.id });
    });
    gridEl.appendChild(card);

    const thumbEl = card.querySelector('.og-thumb') as HTMLElement;
    const cached = previewCache.get(example.id);
    if (cached !== undefined) {
      renderThumbnail(thumbEl, cached);
    } else {
      observer.observe(thumbEl);
    }
  }
}

searchInput.addEventListener('input', () => {
  query = searchInput.value;
  render();
});

window.addEventListener('message', (event) => {
  const message = event.data;
  if (message?.type === 'update') {
    examples = message.examples ?? [];
    render();
  } else if (message?.type === 'preview') {
    const html = (message.html as string) ?? '';
    previewCache.set(message.id, html);
    const thumbEl = gridEl.querySelector<HTMLElement>(`.og-thumb[data-id="${message.id}"]`);
    if (thumbEl) renderThumbnail(thumbEl, html);
  }
});

vscode.postMessage({ type: 'ready' });

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
