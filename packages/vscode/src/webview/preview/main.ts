// Read-only example preview — content arrives once as a plain string over
// postMessage (see examplePreviewProvider.ts) and is rendered via
// `iframe.srcdoc`. No file is ever written; "Remix" is a separate, explicit
// action that only fires when the button is clicked.

export {}; // Force module scope — see gallery/main.ts for why.

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
};

const vscode = acquireVsCodeApi();

// Unreviewed, runtime-fetched, third-party content — unlike every other
// source, which is curated and bundled with the extension. Drops
// `allow-same-origin` (kept for every other source below) so a community
// example's own script can't reach back into the embedder's origin model.
const RESTRICTED_SANDBOX = 'allow-scripts allow-forms allow-downloads allow-popups allow-pointer-lock allow-modals';
const DEFAULT_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-pointer-lock allow-modals';

function resolveSandbox(source: string | undefined): string {
  return source === 'community' ? RESTRICTED_SANDBOX : DEFAULT_SANDBOX;
}

const root = document.getElementById('root')!;
root.innerHTML = `
  <div class="op-toolbar">
    <span id="op-title" class="op-title">Loading…</span>
    <span id="op-badge" class="od-badge" hidden>Community</span>
    <button id="op-remix-btn" class="op-remix-btn od-btn od-btn-primary">Remix into workspace</button>
  </div>
  <div id="op-stage" class="op-stage"></div>
`;

const titleEl = document.getElementById('op-title')!;
const badgeEl = document.getElementById('op-badge') as HTMLElement;
const remixBtn = document.getElementById('op-remix-btn') as HTMLButtonElement;
const stageEl = document.getElementById('op-stage')!;

let currentId: string | undefined;

remixBtn.addEventListener('click', () => {
  if (!currentId) return;
  vscode.postMessage({ type: 'remix', id: currentId });
});

window.addEventListener('message', (event) => {
  const message = event.data;
  if (message?.type !== 'load') return;

  currentId = message.id as string;
  titleEl.textContent = (message.name as string) ?? currentId;
  const source = message.source as string | undefined;
  badgeEl.hidden = source !== 'community';
  const html = (message.html as string) ?? '';

  stageEl.innerHTML = '';
  if (!html) {
    const empty = document.createElement('div');
    empty.className = 'op-empty';
    empty.textContent = 'No preview available for this example.';
    stageEl.appendChild(empty);
    return;
  }

  const iframe = document.createElement('iframe');
  // `allow-scripts` alone leaves many examples' own scripts (deck nav,
  // WebGL/animation init) throwing on startup — e.g. touching localStorage
  // or a same-origin check — which silently kills the script before it
  // attaches its own click/keyboard handlers. Curated, extension-bundled
  // examples get the broader sandbox (matching the main artifact editor) as
  // an already-accepted tradeoff; community-sourced content gets the
  // narrower one instead — see resolveSandbox().
  iframe.setAttribute('sandbox', resolveSandbox(source));
  iframe.srcdoc = html;
  stageEl.appendChild(iframe);
});

vscode.postMessage({ type: 'ready' });
