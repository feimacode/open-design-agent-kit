// Captions for video exports (openspec add-video-sound-and-captions). Cues
// come from an SRT or WebVTT file passed as `captions`, or from elements in
// the page marked `data-od-caption` with `data-start` and `data-duration`
// (seconds). They are drawn in the page as an overlay on the virtual clock,
// before each frame is captured, so they use the design system's web fonts and
// colours and the timestamped check can see them. A `.vtt` sidecar is always
// written beside the video.

export interface CaptionCue {
  startMs: number;
  endMs: number;
  text: string;
}

/** Above this many characters a second a cue is hard to read (`caption-too-fast`). */
export const MAX_CAPTION_CPS = 20;

function parseTimestamp(s: string): number | undefined {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/.exec(s.trim());
  if (!m) return undefined;
  return (Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000 + Number(m[4].padEnd(3, '0'));
}

/** Parses SRT or WebVTT text (sniffed from a `WEBVTT` header) into cues; tags such as `<i>` are dropped. */
export function parseCaptions(text: string): CaptionCue[] {
  const cues: CaptionCue[] = [];
  const blocks = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const at = lines.findIndex((l) => l.includes('-->'));
    if (at < 0) continue;
    const [a, b] = lines[at].split('-->');
    const start = parseTimestamp(a);
    const end = parseTimestamp(b.trim().split(/\s+/)[0]);
    if (start === undefined || end === undefined || end <= start) continue;
    const body = lines
      .slice(at + 1)
      .join('\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\{\\[^}]*\}/g, '')
      .trim();
    if (body) cues.push({ startMs: start, endMs: end, text: body });
  }
  return cues.sort((x, y) => x.startMs - y.startMs);
}

function vttTime(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const r = Math.round(ms % 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(r).padStart(3, '0')}`;
}

/** The cues as a WebVTT file, for the sidecar. */
export function toVtt(cues: CaptionCue[]): string {
  return ['WEBVTT', '', ...cues.map((c, i) => `${i + 1}\n${vttTime(c.startMs)} --> ${vttTime(c.endMs)}\n${c.text}\n`)].join('\n');
}

/** Cue elements as the page marks them (`data-od-caption`, seconds). */
export interface RawCaptionCue {
  start?: string | null;
  duration?: string | null;
  text: string;
}

export function cuesFromPage(raw: RawCaptionCue[]): CaptionCue[] {
  const out: CaptionCue[] = [];
  for (const r of raw) {
    const start = Number(r.start);
    const duration = Number(r.duration);
    const text = r.text.replace(/\s+/g, ' ').trim();
    if (!text || !Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0) continue;
    out.push({ startMs: Math.round(start * 1000), endMs: Math.round((start + duration) * 1000), text });
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

/** Reads `data-od-caption` cues from HTML source (for the check). */
export function captionCuesInHtml(html: string): CaptionCue[] {
  const raw: RawCaptionCue[] = [];
  for (const m of html.matchAll(/<(\w+)\b([^>]*\bdata-od-caption\b[^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const attr = (name: string): string | null => {
      const r = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(m[2]);
      return r ? (r[1] ?? r[2] ?? r[3] ?? '') : null;
    };
    const own = attr('data-od-caption');
    raw.push({ start: attr('data-start'), duration: attr('data-duration'), text: own && own.trim() ? own : m[3].replace(/<[^>]+>/g, ' ') });
  }
  return cuesFromPage(raw);
}

/** In the page: `data-od-caption` cues. String form: core compiles without DOM types. */
export const COLLECT_CAPTIONS_SCRIPT = `Array.prototype.map.call(document.querySelectorAll('[data-od-caption]'), (el) => {
  const own = el.getAttribute('data-od-caption');
  return { start: el.getAttribute('data-start'), duration: el.getAttribute('data-duration'), text: own && own.trim() ? own : (el.textContent || '') };
})`;

/** `caption-too-fast` and cues outside the film, as warning messages. */
export function captionTimingWarnings(cues: CaptionCue[], filmMs?: number): Array<{ check: 'caption-too-fast' | 'caption-after-end'; message: string }> {
  const out: Array<{ check: 'caption-too-fast' | 'caption-after-end'; message: string }> = [];
  for (const c of cues) {
    const seconds = (c.endMs - c.startMs) / 1000;
    const cps = c.text.replace(/\s+/g, ' ').length / seconds;
    if (cps > MAX_CAPTION_CPS) out.push({ check: 'caption-too-fast', message: `Caption at ${(c.startMs / 1000).toFixed(2)}s ("${c.text.slice(0, 40)}${c.text.length > 40 ? '…' : ''}") is ${cps.toFixed(0)} characters a second; keep it at or under ${MAX_CAPTION_CPS} by showing it longer or splitting it.` });
    if (filmMs !== undefined && c.startMs >= filmMs) out.push({ check: 'caption-after-end', message: `Caption at ${(c.startMs / 1000).toFixed(2)}s starts after the film ends (${(filmMs / 1000).toFixed(2)}s).` });
  }
  return out;
}

/** Where captions sit in a frame: the format's safe inset at the sides and top, and more at the bottom of a tall (9:16) frame, where platform buttons and text sit. */
export function captionSafeArea(width: number, height: number, safeInset?: number): { left: number; right: number; top: number; bottom: number } {
  const inset = safeInset ?? Math.round(Math.min(width, height) * 0.05);
  const bottom = height / width >= 1.7 ? Math.round(height * 0.2) : Math.max(inset, Math.round(height * 0.08));
  return { left: inset, right: inset, top: inset, bottom };
}

/**
 * Installs the caption layer over the capture region and returns nothing; then `window.__odCaptions.show(ms)`
 * shows the cue at that time and returns true when the visible caption box leaves the safe area.
 * Passed to page.evaluate as a function (it runs in the page).
 */
export function installCaptionOverlay(input: { cues: CaptionCue[]; clip: { x: number; y: number; width: number; height: number }; safe: { left: number; right: number; top: number; bottom: number }; hideSource: boolean }): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- core compiles without DOM lib types
  const w = globalThis as unknown as { document: any; __odCaptions?: unknown };
  const doc = w.document;
  if (input.hideSource) for (const el of doc.querySelectorAll('[data-od-caption]')) (el as { style: { display: string } }).style.display = 'none';
  const layer = doc.createElement('div');
  layer.setAttribute('data-od-caption-layer', '');
  const fontPx = Math.max(16, Math.round(Math.min(input.clip.width, input.clip.height) * 0.045));
  layer.style.cssText = `position:fixed;left:${input.clip.x}px;top:${input.clip.y}px;width:${input.clip.width}px;height:${input.clip.height}px;pointer-events:none;z-index:2147483647;display:flex;align-items:flex-end;justify-content:center;box-sizing:border-box;padding:${input.safe.top}px ${input.safe.right}px ${input.safe.bottom}px ${input.safe.left}px;`;
  const box = doc.createElement('div');
  box.style.cssText = `max-width:100%;box-sizing:border-box;text-align:center;white-space:pre-line;font-family:var(--font-body, var(--font-display, system-ui, sans-serif));font-size:${fontPx}px;line-height:1.25;font-weight:600;color:var(--bg, #fff);background:color-mix(in srgb, var(--fg, #000) 86%, transparent);padding:${Math.round(fontPx * 0.3)}px ${Math.round(fontPx * 0.55)}px;border-radius:${Math.round(fontPx * 0.25)}px;visibility:hidden;`;
  layer.appendChild(box);
  doc.body.appendChild(layer);
  const cues = input.cues;
  const safe = { left: input.clip.x + input.safe.left, right: input.clip.x + input.clip.width - input.safe.right, top: input.clip.y + input.safe.top, bottom: input.clip.y + input.clip.height - input.safe.bottom };
  w.__odCaptions = {
    show(ms: number): boolean {
      const cue = cues.find((c) => ms >= c.startMs && ms < c.endMs);
      box.textContent = cue ? cue.text : '';
      box.style.visibility = cue ? 'visible' : 'hidden';
      if (!cue) return false;
      const r = box.getBoundingClientRect();
      return r.top < safe.top - 0.5 || r.bottom > safe.bottom + 0.5 || r.left < safe.left - 0.5 || r.right > safe.right + 0.5;
    },
  };
}
