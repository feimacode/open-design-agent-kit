// Read-only example preview — content arrives once as a plain string over
// postMessage (see examplePreviewProvider.ts) and is rendered via
// `iframe.srcdoc`. No file is ever written; "Remix" is a separate, explicit
// action that only fires when the button is clicked.

export {}; // Force module scope — see gallery/main.ts for why.

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
};

const vscode = acquireVsCodeApi();

const root = document.getElementById('root')!;
root.innerHTML = `
  <div class="op-toolbar">
    <span id="op-title" class="op-title">Loading…</span>
    <button id="op-remix-btn" class="op-remix-btn od-btn od-btn-primary">Remix into workspace</button>
  </div>
  <div id="op-stage" class="op-stage"></div>
`;

const titleEl = document.getElementById('op-title')!;
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
  // attaches its own click/keyboard handlers. These are curated,
  // extension-bundled examples (not arbitrary model-generated content), so
  // matching the main artifact editor's broader sandbox is the same
  // already-accepted tradeoff, not a new one.
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-pointer-lock allow-modals');
  iframe.srcdoc = html;
  stageEl.appendChild(iframe);
});

vscode.postMessage({ type: 'ready' });
