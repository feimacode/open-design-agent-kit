// App screen checks (openspec add-states-board, "screen-states"): a page's
// state frames ([data-od-state] siblings, one visible at a time) are each
// rendered and checked, a data surface with only its populated state is
// reported (state-missing), a copy of the page is filled with long and
// extreme content to find what breaks (stress-overflow, stress-truncation),
// and controls that claim a state but change nothing when clicked are
// reported (dead-control). Ideas from ux-ui-agent-skills' component-states and
// edge-cases pages and its verify_interactive gate, and OpenPencil's
// data-surface states rule (both MIT); the code is the kit's own.
//
// The page functions below run in the browser through page.evaluate, so each
// is self-contained: no imports, no helpers from this module.
import type { Browser, Page } from 'puppeteer-core';
import type { Finding } from '../poster/preflight';

export const STATE_NAMES = ['default', 'empty', 'loading', 'error', 'success', 'no-access', 'long-content'] as const;
export type StateName = (typeof STATE_NAMES)[number];

/** Skill and template ids (the part after od:<mode>:) whose designs are app screens. */
export const APP_SCREEN_ENTRIES = new Set([
  'app-shell',
  'app-form',
  'app-table',
  'app-detail',
  'app-settings',
  'app-search',
  'flow-sign-in',
  'flow-onboarding',
  'flow-paywall',
  'flow-settings',
  'flow-ai-chat',
  'dashboard',
  'kanban-board',
  'login-flow',
  'mobile-app',
  'mobile-onboarding',
  'gamified-app',
]);

/** True when the design is an app screen: made from an app-screen entry, or using state frames. */
export function isAppScreen(sourceSkillId: string | undefined, entryContent: string): boolean {
  const dir = (sourceSkillId ?? '').split(':').pop() ?? '';
  return APP_SCREEN_ENTRIES.has(dir) || /\bdata-od-state\s*=/.test(entryContent);
}

/** At most this many controls are clicked by the dead-control pass. */
export const MAX_DEAD_CONTROL_CLICKS = 40;

/** Lengthen text this many times in the stress pass. */
export const STRESS_FACTOR = 2.5;

// ── Page functions ──────────────────────────────────────────────────────

/** The state frames on the page, in document order: their names and whether each is shown. */
export function listStateFrames(): Array<{ name: string; visible: boolean }> {
  const out: Array<{ name: string; visible: boolean }> = [];
  for (const el of Array.prototype.slice.call(document.querySelectorAll('[data-od-state]')) as any[]) {
    if (el.parentElement && el.parentElement.closest('[data-od-state]')) continue;
    out.push({ name: String(el.getAttribute('data-od-state') || '').trim() || 'default', visible: !el.hidden && getComputedStyle(el).display !== 'none' });
  }
  return out;
}

/** Shows the state frame named `name` and hides its siblings (all top-level frames when it is the only one with that name). */
export function showStateFrame(name: string): boolean {
  const frames = (Array.prototype.slice.call(document.querySelectorAll('[data-od-state]')) as any[]).filter((el) => !(el.parentElement && el.parentElement.closest('[data-od-state]')));
  let found = false;
  for (const el of frames) {
    const own = String(el.getAttribute('data-od-state') || '').trim() || 'default';
    if (own === name) {
      el.hidden = false;
      el.removeAttribute('hidden');
      found = true;
    } else {
      el.hidden = true;
    }
  }
  window.scrollTo(0, 0);
  return found;
}

/**
 * The data surfaces of the visible screen that need more than a populated state: tables (or grids),
 * lists of three or more repeated items, and forms. Each with a short name for the finding.
 */
export function collectDataSurfaces(): Array<{ kind: 'table' | 'list' | 'form'; name: string }> {
  const describe = (el: any): string => {
    let s = String(el.tagName || '').toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (el.classList && el.classList.length > 0) s += '.' + el.classList[0];
    const label = String(el.getAttribute('aria-label') || '').trim();
    if (label) s += ' "' + (label.length > 40 ? label.slice(0, 39) + '…' : label) + '"';
    return s;
  };
  const visible = (el: any): boolean => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  };
  const out: Array<{ kind: 'table' | 'list' | 'form'; name: string }> = [];
  const seen: any[] = [];
  const add = (kind: 'table' | 'list' | 'form', el: any): void => {
    if (seen.some((s) => s.contains(el))) return;
    seen.push(el);
    out.push({ kind, name: describe(el) });
  };
  for (const el of Array.prototype.slice.call(document.querySelectorAll('table, [role="table"], [role="grid"]')) as any[]) if (visible(el)) add('table', el);
  for (const el of Array.prototype.slice.call(document.querySelectorAll('ul, ol, [role="list"], [role="listbox"]')) as any[]) {
    if (!visible(el) || el.closest('nav, header, footer, [role="navigation"], [role="tablist"], [role="menu"], [data-od-slot="nav"]')) continue;
    const items = Array.prototype.filter.call(el.children, (c: any) => visible(c));
    if (items.length >= 3) add('list', el);
  }
  for (const el of Array.prototype.slice.call(document.querySelectorAll('form')) as any[]) {
    if (!visible(el)) continue;
    const fields = el.querySelectorAll('input:not([type="hidden"]):not([type="search"]), select, textarea');
    if (fields.length >= 2) add('form', el);
  }
  return out;
}

/**
 * Fills the visible page with stressed content, in place (the file is never touched): every 4th text in a
 * table cell or list item becomes one unbroken 60-character string, numbers alternate between 0 and 9,999,999,
 * and other texts are lengthened `factor` times. Skips scripts, styles, form values and [data-od-stress="off"].
 * Returns how many texts were changed.
 */
export function applyStress(factor: number): number {
  const SKIP = 'script, style, noscript, template, svg, [data-od-stress="off"], [aria-hidden="true"]';
  const UNBROKEN = 'Wolfeschlegelsteinhausenbergerdorff-International-Holdings-Ltd';
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes: any[] = [];
  let n: any = walker.nextNode();
  while (n) {
    const parent = n.parentElement;
    const text = String(n.nodeValue || '');
    if (parent && text.trim().length >= 2 && !parent.closest(SKIP)) {
      const cs = getComputedStyle(parent);
      if (cs.display !== 'none' && cs.visibility !== 'hidden') nodes.push(n);
    }
    n = walker.nextNode();
  }
  let changed = 0;
  let inCells = 0;
  let numbers = 0;
  for (const node of nodes) {
    const text = String(node.nodeValue);
    const trimmed = text.trim();
    const lead = text.slice(0, text.indexOf(trimmed));
    const tail = text.slice(text.indexOf(trimmed) + trimmed.length);
    let next: string;
    if (/^[\s$€£¥%+\-−.,:/()\d]+$/.test(trimmed) && /\d/.test(trimmed)) {
      next = trimmed.replace(/\d[\d,.\s]*/, numbers++ % 2 === 0 ? '9,999,999' : '0');
    } else if (node.parentElement.closest('td, th, li, [role="cell"], [role="gridcell"], [role="listitem"]') && inCells++ % 4 === 0) {
      next = UNBROKEN;
    } else {
      const words = trimmed.split(/\s+/);
      const target = Math.ceil(trimmed.length * factor);
      let out = trimmed;
      let i = 0;
      while (out.length < target && i < 200) out += ' ' + words[i++ % words.length];
      next = out;
    }
    if (next !== trimmed) {
      node.nodeValue = lead + next + tail;
      changed++;
    }
  }
  return changed;
}

/** Text cut off with no way to read all of it: ellipsis, line clamp or hidden overflow, with no title on it or an ancestor. */
export function collectTruncation(): Array<{ check: string; severity: 'warning'; message: string; selector: string }> {
  const describe = (el: any): string => {
    let s = String(el.tagName || '').toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (el.classList && el.classList.length > 0) s += '.' + el.classList[0];
    const text = String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) s += ' "' + (text.length > 40 ? text.slice(0, 39) + '…' : text) + '"';
    return s;
  };
  const out: Array<{ check: string; severity: 'warning'; message: string; selector: string }> = [];
  const seen = new Set<string>();
  for (const el of Array.prototype.slice.call(document.body.querySelectorAll('*')) as any[]) {
    if (out.length >= 12) break;
    if (!el.firstChild || el.closest('[data-od-stress="off"], script, style, svg')) continue;
    const hasText = Array.prototype.some.call(el.childNodes, (c: any) => c.nodeType === 3 && String(c.nodeValue).trim().length > 0);
    if (!hasText) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const clipsX = cs.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1;
    const clipsY = cs.overflowY !== 'visible' && el.scrollHeight > el.clientHeight + 1;
    const clamped = cs.webkitLineClamp && cs.webkitLineClamp !== 'none' && el.scrollHeight > el.clientHeight + 1;
    if (!clipsX && !clipsY && !clamped) continue;
    if (cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflowY === 'auto' || cs.overflowY === 'scroll') continue;
    const titled = el.closest('[title]') || el.querySelector('[title]') || el.closest('details') || el.querySelector('a[href], button');
    if (titled) continue;
    const name = describe(el);
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({
      check: 'stress-truncation',
      severity: 'warning',
      message: name + ' cuts long text off with no way to read the rest. Put the full value in a title attribute, or link to where it can be read in full.',
      selector: name,
    });
  }
  return out;
}

/**
 * Marks the visible, enabled controls that claim a state (aria-pressed, aria-expanded, aria-checked,
 * aria-selected, aria-sort, or a state-bearing role) with data-od-dead-probe="<n>", and returns their names.
 */
export function markStateControls(max: number): string[] {
  const describe = (el: any): string => {
    let s = String(el.tagName || '').toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (el.classList && el.classList.length > 0) s += '.' + el.classList[0];
    const text = String(el.innerText || el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
    if (text) s += ' "' + (text.length > 40 ? text.slice(0, 39) + '…' : text) + '"';
    return s;
  };
  const sel =
    '[aria-pressed], [aria-expanded], [aria-checked], [aria-selected], [aria-sort], [role="switch"], [role="tab"], [role="option"], [role="menuitemcheckbox"], [role="menuitemradio"]';
  const names: string[] = [];
  for (const el of Array.prototype.slice.call(document.querySelectorAll(sel)) as any[]) {
    if (names.length >= max) break;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
    if (el.tagName === 'A' && el.getAttribute('href') && !String(el.getAttribute('href')).startsWith('#')) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none' || r.width < 1 || r.height < 1) continue;
    // aria-sort lives on the header cell; the click goes to the button inside it when there is one.
    el.setAttribute('data-od-dead-probe', String(names.length));
    names.push(describe(el));
  }
  return names;
}

/** Clicks marked control `index` and reports whether anything changed: an attribute, the DOM, focus or the URL hash. */
export async function clickAndObserve(index: number): Promise<boolean> {
  const el: any = document.querySelector('[data-od-dead-probe="' + index + '"]');
  if (!el) return true;
  const target: any = el.getAttribute('aria-sort') !== null ? el.querySelector('button, [role="button"], a') || el : el;
  let changed = false;
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'attributes' && (r.attributeName === 'data-od-dead-probe' || r.attributeName === 'data-od-state-target')) continue;
      changed = true;
    }
  });
  observer.observe(document.documentElement, { attributes: true, childList: true, subtree: true, characterData: true });
  const focusBefore = document.activeElement;
  const hashBefore = location.hash;
  const stopNav = (e: Event): void => {
    const a: any = (e.target as any)?.closest?.('a[href]');
    if (a && !String(a.getAttribute('href')).startsWith('#')) e.preventDefault();
  };
  document.addEventListener('click', stopNav, true);
  try {
    target.click();
    await new Promise((r) => setTimeout(r, 60));
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  } finally {
    document.removeEventListener('click', stopNav, true);
    observer.disconnect();
  }
  const focusMoved = document.activeElement !== focusBefore && document.activeElement !== target && document.activeElement !== el;
  return changed || focusMoved || location.hash !== hashBefore;
}

// ── Node side ───────────────────────────────────────────────────────────

export interface StateShot {
  label: string;
  png: Buffer;
}

export interface ScreenCheckViewport {
  name: string;
  width: number;
  height: number;
}

export interface ScreenChecksResult {
  findings: Finding[];
  /** The first screen of every state frame at the first viewport, default first, for the states board. */
  shots: StateShot[];
  /** The state frame names found, in document order. */
  states: string[];
}

export interface ScreenCheckDeps {
  /** Runs the page's preflight at the current viewport (overflow, overlap, contrast…). */
  preflight(page: Page, viewport: string): Promise<Finding[]>;
  /** Sideways scroll at the current viewport. */
  horizontalScroll(page: Page): Promise<Finding[]>;
  settle(page: Page, ms?: number): Promise<void>;
}

/**
 * Per-state checks, state-missing, the stress pass and dead controls, on the already loaded page.
 * Leaves the page showing the default state (as loaded) when it returns, except after the stress pass,
 * which is run last on a page the caller no longer uses for anything else.
 */
export async function runScreenChecks(
  _browser: Browser,
  page: Page,
  viewports: ScreenCheckViewport[],
  deps: ScreenCheckDeps,
  opts: { appScreen: boolean; stress: boolean; baseline: Finding[] },
): Promise<ScreenChecksResult> {
  const findings: Finding[] = [];
  const shots: StateShot[] = [];
  const frames = (await page.evaluate(listStateFrames)) as Array<{ name: string; visible: boolean }>;
  const states = frames.map((f) => f.name);
  const first = viewports[0];
  const setViewport = async (v: ScreenCheckViewport): Promise<void> => {
    await page.setViewport({ width: v.width, height: v.height, deviceScaleFactor: 1 });
    await deps.settle(page);
  };
  const initiallyVisible = frames.find((f) => f.visible)?.name ?? 'default';

  // State-missing: data surfaces in the default state, against the frames that exist.
  if (opts.appScreen) {
    await setViewport(first);
    const surfaces = (await page.evaluate(collectDataSurfaces)) as Array<{ kind: 'table' | 'list' | 'form'; name: string }>;
    const have = new Set(states);
    const missingFor = (kind: 'table' | 'list' | 'form'): string[] | undefined => {
      if (kind === 'form') return have.has('error') ? undefined : ['error'];
      return have.has('empty') || have.has('loading') || have.has('error') ? undefined : ['empty', 'loading'];
    };
    for (const s of surfaces) {
      const missing = missingFor(s.kind);
      if (!missing) continue;
      findings.push({
        check: 'state-missing',
        severity: 'warning',
        message:
          s.kind === 'form'
            ? `${s.name} is a form with no error state. Add a sibling <section data-od-state="error" hidden> showing the failed submit: a summary, each field's fix, the typed values kept.`
            : `${s.name} shows only its populated ${s.kind}. Add a sibling <section data-od-state="empty" hidden> (what will be here, why it's empty, the first action) or data-od-state="loading" (a skeleton shaped like the rows).`,
        selector: s.name,
      });
    }
  }

  // Screen economy: the first screen shows a way to act, and no one picture or empty box fills it (openspec add-task-walkthrough).
  if (opts.appScreen) {
    await setViewport(first);
    const economy = (await page.evaluate(SCREEN_ECONOMY_SCRIPT)) as { exempt: boolean; actions: number; media?: { name: string; share: number } };
    if (!economy.exempt) {
      if (economy.actions === 0) {
        findings.push({ check: 'screen-economy', severity: 'warning', viewport: first.name, message: `The first screen (${first.width}×${first.height}) has no button, link or field to act with; the user has to scroll to do anything. Move the main action up.` });
      }
      if (economy.media && economy.media.share > 0.5) {
        findings.push({
          check: 'screen-economy',
          severity: 'warning',
          viewport: first.name,
          selector: economy.media.name,
          message: `${economy.media.name} covers ${Math.round(economy.media.share * 100)}% of the first screen, pushing the content down. App screens lead with the content and the main action; shrink it or move it below.`,
        });
      }
    }
  }

  // Every non-default state: shown alone, checked at each viewport, its first screen kept for the board.
  if (frames.length > 1) {
    const baselineKeys = new Set(opts.baseline.map((f) => `${f.check}|${f.selector ?? f.message}`));
    for (const frame of frames) {
      await page.evaluate(showStateFrame, frame.name);
      for (const v of viewports) {
        await setViewport(v);
        if (frame.name === initiallyVisible) continue;
        const found = [...(await deps.preflight(page, v.name)), ...(await deps.horizontalScroll(page))];
        for (const f of found) {
          if (baselineKeys.has(`${f.check}|${f.selector ?? f.message}`)) continue;
          findings.push({ ...f, viewport: v.name, state: frame.name });
        }
      }
      await setViewport(first);
      shots.push({ label: frame.name, png: Buffer.from(await page.screenshot({ type: 'png' })) });
    }
    await page.evaluate(showStateFrame, initiallyVisible);
    await setViewport(first);
  }

  // Large text: the default state with a 20 px root font size, as a reader who set a larger font sees it (openspec add-platform-shells).
  if (opts.appScreen) findings.push(...(await largeTextPass(page, first, deps, setViewport)));

  // Dead controls, on the default state; clicks may change the page, so only the stress pass comes after.
  findings.push(...(await deadControlPass(page, deps)));

  // Stress: the default state filled with long and extreme content; only what it newly breaks is reported.
  if (opts.appScreen && opts.stress) {
    const before = new Map<string, Set<string>>();
    for (const v of viewports) {
      await setViewport(v);
      before.set(v.name, new Set((await deps.preflight(page, v.name)).filter((f) => f.check === 'overflow' || f.check === 'overlap').map((f) => f.selector ?? f.message)));
    }
    const changed = Number(await page.evaluate(applyStress, STRESS_FACTOR));
    if (changed > 0) {
      for (const v of viewports) {
        await setViewport(v);
        const seen = before.get(v.name) ?? new Set<string>();
        for (const f of await deps.preflight(page, v.name)) {
          if ((f.check !== 'overflow' && f.check !== 'overlap') || seen.has(f.selector ?? f.message)) continue;
          findings.push({
            check: 'stress-overflow',
            severity: 'warning',
            message: `With long content (names 2.5 times longer, a 60-character word, 9,999,999): ${f.message} Let it wrap (overflow-wrap: anywhere), truncate it with the full value in a title, or give it more room.`,
            selector: f.selector,
            viewport: v.name,
          });
        }
        for (const f of (await deps.horizontalScroll(page)) as Finding[]) {
          findings.push({ ...f, check: 'stress-overflow', severity: 'warning', message: `With long content: ${f.message}`, viewport: v.name });
        }
        for (const f of (await page.evaluate(collectTruncation)) as Finding[]) findings.push({ ...f, viewport: v.name });
      }
    }
  }
  return { findings, shots, states };
}

/** Measures the first viewport: visible enabled actions, and the largest picture or empty box. String form: no DOM lib types here. */
export const SCREEN_ECONOMY_SCRIPT = `(function(){
  var body=document.body;if(!body)return {exempt:true,actions:0};
  if(body.getAttribute('data-od-screen')==='splash')return {exempt:true,actions:0};
  var W=innerWidth,H=innerHeight,area=W*H;
  function visible(el){var r=el.getBoundingClientRect();if(r.width<4||r.height<4||r.bottom<=0||r.top>=H||r.right<=0||r.left>=W)return null;var cs=getComputedStyle(el);if(cs.visibility==='hidden'||cs.display==='none'||Number(cs.opacity)===0)return null;if(el.closest('[hidden],[aria-hidden="true"]'))return null;return r}
  var actions=0;[].slice.call(document.querySelectorAll('button,a[href],[role=button],input:not([type=hidden]),select,textarea,[data-od-goto]')).forEach(function(el){if(el.disabled)return;if(visible(el))actions++});
  function name(el){var id=el.id?'#'+el.id:'';var cls=(typeof el.className==='string'&&el.className.trim())?'.'+el.className.trim().split(/\\s+/)[0]:'';return el.tagName.toLowerCase()+id+cls}
  var best=null;[].slice.call(document.querySelectorAll('img,video,canvas,picture,svg,div,section,figure,header')).forEach(function(el){
    var media=/^(IMG|VIDEO|CANVAS|PICTURE)$/.test(el.tagName)||(el.tagName!=='svg'&&getComputedStyle(el).backgroundImage.indexOf('url(')>=0);
    if(!media&&el.tagName==='svg')media=true;
    var empty=!media&&/^(DIV|SECTION|FIGURE)$/.test(el.tagName)&&el.children.length===0&&!(el.textContent||'').trim();
    if(!media&&!empty)return;var r=visible(el);if(!r)return;
    var w=Math.max(0,Math.min(r.right,W)-Math.max(r.left,0)),h=Math.max(0,Math.min(r.bottom,H)-Math.max(r.top,0));var share=(w*h)/area;
    if(!best||share>best.share)best={name:name(el),share:share}});
  return {exempt:false,actions:actions,media:best||undefined}})()`;

/** Root font size for the large-text pass. */
export const LARGE_TEXT_ROOT_PX = 20;

async function largeTextPass(page: Page, first: ScreenCheckViewport, deps: ScreenCheckDeps, setViewport: (v: ScreenCheckViewport) => Promise<void>): Promise<Finding[]> {
  await setViewport(first);
  const key = (f: Finding) => f.selector ?? f.message;
  const isLayout = (f: Finding) => f.check === 'overflow' || f.check === 'overlap';
  const before = new Set((await deps.preflight(page, first.name)).filter(isLayout).map(key));
  await page.evaluate(`document.documentElement.setAttribute('data-od-large-text', document.documentElement.style.fontSize || ''); document.documentElement.style.fontSize = '${LARGE_TEXT_ROOT_PX}px'`);
  const findings: Finding[] = [];
  try {
    await deps.settle(page);
    for (const f of await deps.preflight(page, first.name)) {
      if (!isLayout(f) || before.has(key(f))) continue;
      findings.push({
        check: 'large-text-overflow',
        severity: 'warning',
        message: `With the reader's text size at ${LARGE_TEXT_ROOT_PX} px: ${f.message} Let it wrap or grow with the text (min-height instead of height, no fixed widths on labels).`,
        selector: f.selector,
        viewport: first.name,
      });
    }
  } finally {
    await page.evaluate("const r = document.documentElement; r.style.fontSize = r.getAttribute('data-od-large-text') || ''; r.removeAttribute('data-od-large-text')");
    await deps.settle(page, 0);
  }
  return findings;
}

async function deadControlPass(page: Page, deps: ScreenCheckDeps): Promise<Finding[]> {
  const names = (await page.evaluate(markStateControls, MAX_DEAD_CONTROL_CLICKS)) as string[];
  const findings: Finding[] = [];
  try {
    for (const [i, name] of names.entries()) {
      const live = Boolean(await page.evaluate(clickAndObserve, i));
      if (!live) {
        findings.push({
          check: 'dead-control',
          severity: 'warning',
          message: `${name} says it has a state (pressed, expanded, selected, checked or sorted) but clicking it changes nothing. Wire it up (toggle the attribute and what it controls), or drop the ARIA state if it isn't interactive.`,
          selector: name,
        });
      }
    }
  } finally {
    await page.evaluate("document.querySelectorAll('[data-od-dead-probe]').forEach((el) => el.removeAttribute('data-od-dead-probe'))");
    await deps.settle(page, 0);
  }
  return findings;
}
