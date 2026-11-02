/// <reference lib="dom" />
// The states board in the preview (openspec add-states-board): when a design
// has two or more state frames ([data-od-state] siblings, one visible at a
// time), the preview bridge adds a small switcher to the page: one button per
// state, which shows that frame alone, and "All states", which shows every
// frame side by side with its name. Preview-only: the switcher and its style
// carry data-od-preview-only, so a save from the preview never writes them,
// and the frames' hidden attributes are put back before the page is saved.

const ROOT_ID = 'od-state-switcher';
const BOARD_ATTR = 'data-od-states-board';
const PREVIEW_ONLY_ATTR = 'data-od-preview-only';

/** The top-level state frames (a frame inside another frame belongs to it). */
export function stateFrames(doc: Document): HTMLElement[] {
  return Array.from(doc.querySelectorAll<HTMLElement>('[data-od-state]')).filter((el) => !el.parentElement?.closest('[data-od-state]'));
}

export function stateName(el: Element): string {
  return (el.getAttribute('data-od-state') ?? '').trim() || 'default';
}

/** Shows only the frame named `name` (or every frame, for 'all'), returning the frames' original hidden flags. */
export function showState(doc: Document, name: string): void {
  const frames = stateFrames(doc);
  doc.documentElement.toggleAttribute(BOARD_ATTR, name === 'all');
  for (const el of frames) el.hidden = name === 'all' ? false : stateName(el) !== name;
}

const CSS = `
#${ROOT_ID}{position:fixed;z-index:2147483646;right:12px;bottom:12px;display:flex;flex-wrap:wrap;gap:4px;max-width:calc(100vw - 24px);padding:4px;border-radius:10px;background:rgba(24,24,27,.92);font:600 12px/1 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25)}
#${ROOT_ID} button{all:unset;cursor:pointer;padding:7px 10px;border-radius:7px;color:#e4e4e7}
#${ROOT_ID} button[aria-pressed="true"]{background:#fafafa;color:#18181b}
#${ROOT_ID} button:focus-visible{outline:2px solid #60a5fa;outline-offset:1px}
html[${BOARD_ATTR}] :has(> [data-od-state]){display:grid !important;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:24px;align-items:start}
html[${BOARD_ATTR}] [data-od-state]{display:block !important;position:relative;outline:1px dashed rgba(127,127,127,.6);outline-offset:6px;padding-top:28px}
html[${BOARD_ATTR}] [data-od-state]::before{content:attr(data-od-state);position:absolute;top:0;left:0;padding:3px 8px;border-radius:5px;background:rgba(24,24,27,.85);color:#fafafa;font:600 12px/1.2 system-ui,sans-serif}
`;

/** Adds the switcher when the page has two or more state frames. Returns a function that restores the original frames, or undefined. */
export function installStateSwitcher(doc: Document): (() => void) | undefined {
  const frames = stateFrames(doc);
  if (frames.length < 2 || doc.getElementById(ROOT_ID)) return undefined;
  const original = frames.map((el) => el.hidden);
  const initial = stateName(frames.find((el) => !el.hidden) ?? frames[0]);

  const style = doc.createElement('style');
  style.setAttribute(PREVIEW_ONLY_ATTR, '');
  style.textContent = CSS;
  doc.head.appendChild(style);

  const root = doc.createElement('div');
  root.id = ROOT_ID;
  root.setAttribute(PREVIEW_ONLY_ATTR, '');
  root.setAttribute('role', 'toolbar');
  root.setAttribute('aria-label', 'Design states (preview only)');
  const names = [...frames.map(stateName), 'all'];
  const buttons = names.map((name) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.textContent = name === 'all' ? 'All states' : name;
    b.dataset.state = name;
    b.setAttribute('aria-pressed', String(name === initial));
    b.addEventListener('click', () => {
      showState(doc, name);
      for (const other of buttons) other.setAttribute('aria-pressed', String(other === b));
    });
    return b;
  });
  root.append(...buttons);
  doc.body.appendChild(root);

  return () => {
    doc.documentElement.removeAttribute(BOARD_ATTR);
    frames.forEach((el, i) => (el.hidden = original[i]));
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.state === initial));
  };
}
