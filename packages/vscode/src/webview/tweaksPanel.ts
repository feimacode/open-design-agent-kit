// The preview's Tweaks panel (openspec add-preview-tweaks): typed controls for
// a design's `:root` custom properties. Changes only set the property on the
// previewed document's root (live, nothing saved); Apply / Save as variant /
// Send to chat / Apply to design system hand the values to the host, which
// rewrites the source in place (core generation/tweaks.ts).

// Mirrors core's TweakKnob / TweakDiscovery (the webview bundle doesn't import core).
export interface TweakKnob {
  name: string;
  label: string;
  group: string;
  type: 'color' | 'length' | 'number' | 'font' | 'text';
  source: 'contract' | 'declared' | 'inferred';
  contract: boolean;
  value: string;
  resolved: string;
  editAt: string;
  description?: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: string[];
  overridden?: boolean;
}

export interface TweaksInfo {
  knobs: TweakKnob[];
  fewVariables: boolean;
  declarationError?: string;
  designSystem?: { id: string; name: string };
}

interface TweaksPanelOptions {
  container: HTMLElement;
  iframe: HTMLIFrameElement;
  post: (message: unknown) => void;
  escapeHtml: (value: string) => string;
}

export interface TweaksPanel {
  /** New knobs from the host (on open and whenever the source changes). */
  update(info: TweaksInfo | undefined): void;
  /** Re-applies unsaved values after the preview document reloads. */
  reapply(): void;
  toggle(open?: boolean): void;
  isOpen(): boolean;
}

export function createTweaksPanel({ container, iframe, post, escapeHtml }: TweaksPanelOptions): TweaksPanel {
  let info: TweaksInfo | undefined;
  /** Unsaved values, keyed by the variable they're written to (`editAt`). */
  const pending = new Map<string, string>();
  let moreOpen = false;

  const rootStyle = () => iframe.contentDocument?.documentElement.style;

  function setLive(editAt: string, value: string): void {
    pending.set(editAt, value);
    rootStyle()?.setProperty(editAt, value);
    syncSiblings(editAt, value);
    renderFooter();
  }

  function reset(): void {
    const style = rootStyle();
    for (const name of pending.keys()) style?.removeProperty(name);
    pending.clear();
    render();
  }

  // Aliases (`--fg-2: var(--fg)`) edit their source variable, so keep every
  // control bound to the same variable in step.
  function syncSiblings(editAt: string, value: string): void {
    container.querySelectorAll<HTMLInputElement | HTMLSelectElement>(`[data-edit-at="${CSS.escape(editAt)}"]`).forEach((el) => {
      if (document.activeElement === el) return;
      if (el instanceof HTMLInputElement && el.type === 'color') el.value = toHex(value) ?? el.value;
      else if (el instanceof HTMLInputElement && (el.type === 'range' || el.type === 'number')) {
        const n = Number.parseFloat(value);
        if (Number.isFinite(n)) el.value = String(n);
      } else el.value = value;
    });
  }

  function current(knob: TweakKnob): string {
    return pending.get(knob.editAt) ?? knob.resolved;
  }

  /** A color as #rrggbb for `<input type=color>`, read back through a canvas so any CSS color works. */
  function toHex(value: string): string | undefined {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return undefined;
    ctx.fillStyle = '#000';
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  }

  function fontOptions(knob: TweakKnob): string[] {
    const options = new Set([current(knob), ...(knob.options ?? [])]);
    const fonts = iframe.contentDocument?.fonts;
    if (fonts) fonts.forEach((face) => options.add(`"${face.family.replace(/^["']|["']$/g, '')}", ${knob.name.includes('mono') ? 'monospace' : 'sans-serif'}`));
    return [...options].filter(Boolean);
  }

  function control(knob: TweakKnob, i: number): string {
    const id = `od-tweak-${i}`;
    const attrs = `id="${id}" data-edit-at="${escapeHtml(knob.editAt)}"`;
    const value = current(knob);
    if (knob.options?.length && knob.type !== 'font' && knob.type !== 'color') {
      const opts = [...new Set([value, ...knob.options])].map((o) => `<option${o === value ? ' selected' : ''}>${escapeHtml(o)}</option>`).join('');
      return `<select ${attrs} class="od-select od-tweak-wide">${opts}</select>`;
    }
    switch (knob.type) {
      case 'color': {
        const swatches = (knob.options ?? [])
          .map((o) => `<button class="od-tweak-swatch" data-edit-at="${escapeHtml(knob.editAt)}" data-set="${escapeHtml(o)}" style="background:${escapeHtml(o)}" title="${escapeHtml(o)}"></button>`)
          .join('');
        return `<div class="od-tweak-row"><input ${attrs} type="color" class="od-color-input od-tweak-color" value="${toHex(value) ?? '#000000'}"><input data-edit-at="${escapeHtml(knob.editAt)}" class="od-input od-tweak-text" value="${escapeHtml(value)}" aria-label="${escapeHtml(knob.label)} value">${swatches}</div>`;
      }
      case 'length':
      case 'number': {
        const n = Number.parseFloat(value);
        const range = `min="${knob.min ?? 0}" max="${knob.max ?? 100}" step="${knob.step ?? 1}"`;
        const unit = knob.unit ?? '';
        return `<div class="od-tweak-row"><input ${attrs} type="range" class="od-tweak-range" ${range} value="${Number.isFinite(n) ? n : 0}" data-unit="${unit}"><input data-edit-at="${escapeHtml(knob.editAt)}" type="number" class="od-input od-tweak-num" ${range} value="${Number.isFinite(n) ? n : ''}" data-unit="${unit}" aria-label="${escapeHtml(knob.label)} value"><span class="od-tweak-unit">${escapeHtml(unit)}</span></div>`;
      }
      case 'font': {
        const opts = fontOptions(knob).map((o) => `<option${o === value ? ' selected' : ''} value="${escapeHtml(o)}">${escapeHtml(o.split(',')[0].replace(/["']/g, ''))}</option>`).join('');
        return `<select ${attrs} class="od-select od-tweak-wide">${opts}</select>`;
      }
      default:
        return `<input ${attrs} class="od-input od-tweak-wide" value="${escapeHtml(value)}">`;
    }
  }

  function knobRow(knob: TweakKnob, i: number): string {
    const alias = knob.editAt !== knob.name ? ` <span class="od-tweak-note">edits ${escapeHtml(knob.editAt)}</span>` : '';
    const dark = knob.overridden ? ' <span class="od-tweak-note" title="This variable is also set in a media query or theme rule (e.g. dark mode). Apply changes only the base value.">+ override</span>' : '';
    const title = escapeHtml(`${knob.name}${knob.description ? ` — ${knob.description}` : ''}`);
    return `<div class="od-tweak"><label for="od-tweak-${i}" title="${title}">${escapeHtml(knob.label)}${alias}${dark}</label>${control(knob, i)}</div>`;
  }

  function render(): void {
    if (!info) {
      container.innerHTML = '';
      return;
    }
    const groups = new Map<string, { knob: TweakKnob; i: number }[]>();
    info.knobs.forEach((knob, i) => {
      if (!groups.has(knob.group)) groups.set(knob.group, []);
      groups.get(knob.group)!.push({ knob, i });
    });
    const more = groups.get('More');
    groups.delete('More');
    const sections = [...groups.entries()]
      .map(([group, items]) => `<div class="od-panel-section-title">${escapeHtml(group)}</div>${items.map(({ knob, i }) => knobRow(knob, i)).join('')}`)
      .join('');
    const moreSection = more
      ? `<details class="od-tweak-more"${moreOpen ? ' open' : ''}><summary>More (${more.length})</summary>${more.map(({ knob, i }) => knobRow(knob, i)).join('')}</details>`
      : '';
    const few = info.fewVariables
      ? `<div class="od-tweak-empty"><p>This design uses few variables, so there's little to tweak here. Ask the agent to tokenize it: move its colors, fonts and sizes into variables.</p><button id="od-tweaks-tokenize" class="od-btn">Ask the agent to tokenize it</button></div>`
      : '';
    const declErr = info.declarationError ? `<p class="od-tweak-warn">${escapeHtml(info.declarationError)}</p>` : '';
    const ds = info.designSystem
      ? `<div class="od-tweak-ds"><p>Uses the custom design system <strong>${escapeHtml(info.designSystem.name)}</strong>. Apply changes only this design.</p><button id="od-tweaks-apply-ds" class="od-btn" title="Write the tweaked token values into ${escapeHtml(info.designSystem.name)}'s tokens.css (asks first)">Apply to design system</button></div>`
      : '';
    container.innerHTML = `
      <div class="od-panel-header">
        <span class="od-panel-header-title">Tweaks</span>
        <button id="od-tweaks-close" class="od-panel-close" aria-label="Close">×</button>
      </div>
      <div class="od-panel-body">${declErr}${few}${sections}${moreSection}${ds}</div>
      <div class="od-panel-footer">
        <button id="od-tweaks-reset" class="od-btn" title="Back to the file's values">Reset</button>
        <button id="od-tweaks-chat" class="od-btn" title="Ask the agent to carry these values through the design">Send to chat</button>
        <span class="od-spacer"></span>
        <button id="od-tweaks-variant" class="od-btn" title="Save a copy with these values next to this design">Save variant</button>
        <button id="od-tweaks-apply" class="od-btn od-btn-primary" title="Write these values into this design's :root (undoable)">Apply</button>
      </div>`;
    bind();
    renderFooter();
  }

  function renderFooter(): void {
    const none = pending.size === 0;
    for (const id of ['od-tweaks-reset', 'od-tweaks-chat', 'od-tweaks-variant', 'od-tweaks-apply']) {
      const btn = container.querySelector<HTMLButtonElement>(`#${id}`);
      if (btn) btn.disabled = none;
    }
    const dsBtn = container.querySelector<HTMLButtonElement>('#od-tweaks-apply-ds');
    if (dsBtn) dsBtn.disabled = ![...pending.keys()].some((name) => info?.knobs.some((k) => k.name === name && k.contract));
  }

  const values = () => Object.fromEntries(pending);

  function bind(): void {
    container.querySelector('#od-tweaks-close')?.addEventListener('click', () => toggle(false));
    container.querySelector('#od-tweaks-reset')?.addEventListener('click', reset);
    container.querySelector('#od-tweaks-chat')?.addEventListener('click', () => post({ type: 'tweaks-to-chat', values: values() }));
    container.querySelector('#od-tweaks-tokenize')?.addEventListener('click', () => post({ type: 'tweaks-to-chat', values: {}, tokenize: true }));
    container.querySelector('#od-tweaks-variant')?.addEventListener('click', () => post({ type: 'tweaks-variant', values: values() }));
    container.querySelector('#od-tweaks-apply-ds')?.addEventListener('click', () => post({ type: 'tweaks-apply-ds', values: values() }));
    container.querySelector('#od-tweaks-apply')?.addEventListener('click', () => {
      // The host rewrites the file and the preview reloads with these values
      // as the file's own, so nothing stays pending.
      post({ type: 'tweaks-apply', values: values() });
      pending.clear();
      renderFooter();
    });
    container.querySelector('.od-tweak-more')?.addEventListener('toggle', (e) => (moreOpen = (e.target as HTMLDetailsElement).open));
    container.querySelectorAll<HTMLButtonElement>('.od-tweak-swatch').forEach((btn) => btn.addEventListener('click', () => setLive(btn.dataset.editAt!, btn.dataset.set!)));
    container.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input[data-edit-at], select[data-edit-at]').forEach((el) => {
      // Sliders, pickers and lists apply as they move; typed text on commit,
      // so a half-typed color doesn't flash the page.
      const typed = el instanceof HTMLInputElement && (el.type === 'text' || el.type === '');
      el.addEventListener(typed ? 'change' : 'input', () => {
        const editAt = el.dataset.editAt!;
        if (el instanceof HTMLInputElement && (el.type === 'range' || el.type === 'number')) {
          if (el.value === '') return;
          setLive(editAt, `${Number(el.value)}${el.dataset.unit ?? ''}`);
        } else if (el.value.trim()) setLive(editAt, el.value.trim());
      });
    });
  }

  function toggle(open = container.hidden): void {
    container.hidden = !open;
    if (open) render();
  }

  return {
    update(next) {
      info = next;
      // Drop pending values for variables the design no longer declares.
      const known = new Set(next?.knobs.map((k) => k.editAt) ?? []);
      for (const name of [...pending.keys()]) if (!known.has(name)) pending.delete(name);
      if (!container.hidden) render();
    },
    reapply() {
      const style = rootStyle();
      for (const [name, value] of pending) style?.setProperty(name, value);
    },
    toggle,
    isOpen: () => !container.hidden,
  };
}
