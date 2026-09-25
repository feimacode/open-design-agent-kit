// Design system preview — see designSystemPreviewProvider.ts. All HTML
// arrives from the extension host as strings: tab documents go into
// script-less `sandbox=""` srcdoc frames, and the DESIGN.md / tokens.css
// side panel markup is already fully escaped by core's renderSourceView().

export {}; // Force module scope — see gallery/main.ts for why.

type Tab = 'visualize' | 'showcase';
type SideView = 'markdown' | 'css';

interface PersistedState {
  tab?: Tab;
  sideOpen?: boolean;
  sideView?: SideView;
}

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): PersistedState | undefined;
  setState(state: PersistedState): void;
};

const vscode = acquireVsCodeApi();
const state: Required<PersistedState> = { tab: 'visualize', sideOpen: true, sideView: 'markdown', ...vscode.getState() };

const root = document.getElementById('root')!;
root.innerHTML = `
  <div class="ds-header">
    <div class="ds-heading">
      <div class="ds-title"><span id="ds-name">Loading…</span><span id="ds-active" class="od-badge od-badge-active" hidden>Active</span><span id="ds-custom" class="od-badge" hidden>Custom</span></div>
      <div id="ds-subtitle" class="ds-subtitle"></div>
    </div>
    <div class="ds-tabs" role="tablist">
      <button class="od-tab" data-tab="visualize" role="tab">Visualize</button>
      <button class="od-tab" data-tab="showcase" role="tab">Showcase</button>
    </div>
    <div class="ds-actions">
      <button id="ds-set-active" class="od-btn od-btn-primary">Set as active</button>
      <button id="ds-chat" class="od-btn">Use in chat</button>
    </div>
  </div>
  <div id="ds-notice" class="ds-notice" hidden>
    <span>This design system has no tokens.css, so this preview is approximated from its DESIGN.md.</span>
    <button id="ds-generate" class="od-btn">Generate tokens.css</button>
  </div>
  <div class="ds-body">
    <div id="ds-stage" class="ds-stage"></div>
    <button id="ds-toggle" class="ds-toggle" title="Toggle source panel"></button>
    <aside id="ds-side" class="ds-side">
      <div class="ds-side-switch">
        <button class="od-tab" data-side="markdown">DESIGN.md</button>
        <button class="od-tab" data-side="css">tokens.css</button>
      </div>
      <div id="ds-source" class="ds-source"></div>
    </aside>
  </div>
`;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const nameEl = el('ds-name');
const subtitleEl = el('ds-subtitle');
const activeBadge = el('ds-active');
const customBadge = el('ds-custom');
const setActiveBtn = el<HTMLButtonElement>('ds-set-active');
const noticeEl = el('ds-notice');
const stageEl = el('ds-stage');
const sideEl = el('ds-side');
const toggleBtn = el<HTMLButtonElement>('ds-toggle');
const sourceEl = el('ds-source');
const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-tab]'));
const sideButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-side]'));

let version = -1;
let sources: Record<SideView, string | null> = { markdown: null, css: null };

function persist(): void {
  vscode.setState(state);
}

function showMessage(text: string): void {
  stageEl.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'ds-empty';
  empty.textContent = text;
  stageEl.appendChild(empty);
}

function selectTab(tab: Tab): void {
  state.tab = tab;
  persist();
  for (const b of tabButtons) b.classList.toggle('active', b.dataset.tab === tab);
  showMessage('Rendering…');
  vscode.postMessage({ type: 'tab', tab, version });
}

function renderSide(): void {
  sideEl.hidden = !state.sideOpen;
  toggleBtn.textContent = state.sideOpen ? '›' : '‹';
  const hasCss = sources.css !== null;
  if (state.sideView === 'css' && !hasCss) state.sideView = 'markdown';
  for (const b of sideButtons) {
    b.hidden = b.dataset.side === 'css' && !hasCss;
    b.classList.toggle('active', b.dataset.side === state.sideView);
  }
  sourceEl.innerHTML = sources[state.sideView] ?? '';
}

for (const b of tabButtons) b.addEventListener('click', () => selectTab(b.dataset.tab as Tab));
for (const b of sideButtons)
  b.addEventListener('click', () => {
    state.sideView = b.dataset.side as SideView;
    persist();
    renderSide();
  });
toggleBtn.addEventListener('click', () => {
  state.sideOpen = !state.sideOpen;
  persist();
  renderSide();
});
setActiveBtn.addEventListener('click', () => vscode.postMessage({ type: 'setActive' }));
el('ds-chat').addEventListener('click', () => vscode.postMessage({ type: 'useInChat' }));
el('ds-generate').addEventListener('click', () => vscode.postMessage({ type: 'generateTokens' }));

function setActive(active: boolean): void {
  activeBadge.hidden = !active;
  setActiveBtn.hidden = active;
}

window.addEventListener('message', (event) => {
  const message = event.data;
  switch (message?.type) {
    case 'load': {
      version = message.version as number;
      nameEl.textContent = message.name as string;
      subtitleEl.textContent = (message.subtitle as string) ?? '';
      customBadge.hidden = !message.custom;
      noticeEl.hidden = !message.approximated;
      setActive(!!message.active);
      sources = { markdown: message.designMdHtml as string, css: (message.tokensCssHtml as string | null) ?? null };
      renderSide();
      selectTab(state.tab);
      break;
    }
    case 'missing':
      version = message.version as number;
      nameEl.textContent = message.id as string;
      showMessage('This design system no longer exists.');
      break;
    case 'tabHtml': {
      if (message.version !== version || message.tab !== state.tab) return;
      const html = message.html as string;
      if (!html) {
        showMessage('This view could not be rendered.');
        return;
      }
      stageEl.innerHTML = '';
      const iframe = document.createElement('iframe');
      // No scripts, no same-origin: every tab document is static HTML/CSS
      // (the Visualize kit's Light/Dark toggle is CSS-only).
      iframe.setAttribute('sandbox', '');
      iframe.title = `${state.tab} preview`;
      iframe.srcdoc = html;
      stageEl.appendChild(iframe);
      break;
    }
    case 'active':
      setActive(!!message.active);
      break;
  }
});

renderSide();
vscode.postMessage({ type: 'ready' });
