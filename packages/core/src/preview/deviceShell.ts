// Kit-drawn device shells (openspec add-platform-shells). A screen says which
// device it is for with data-od-device on <body> (iphone, android, tablet,
// desktop-app); every preview draws the same generic frame around the frame
// holding the design, and the check renders the design at the device's
// content size. The design itself is only the app: no frame, status bar or
// window title bar of its own.
//
// Browser-safe and dependency-free: the previews bundle it, the check reads
// the sizes, and mountDeviceShell is also inlined as source into the one-file
// prototype, so it must stay self-contained (no helpers outside its body).

export const DEVICES = ['iphone', 'android', 'tablet', 'desktop-app'] as const;
export type Device = (typeof DEVICES)[number];

export interface DeviceSpec {
  device: Device;
  /** Tablets only. */
  orientation?: 'landscape' | 'portrait';
  /** Desktop apps only. */
  window?: 'mac' | 'windows';
  /** Status bar text colour; derived from the page background when absent. */
  theme?: 'light' | 'dark';
  /** The page's background colour, so the bars blend with the app. */
  background?: string;
}

/** The design's own area (the frame holding the page) for each device, in CSS px: the screen without status and home bars. */
export const DEVICE_CONTENT_SIZES: Record<string, { width: number; height: number }> = {
  iphone: { width: 390, height: 763 },
  android: { width: 412, height: 867 },
  'tablet-landscape': { width: 1024, height: 724 },
  'tablet-portrait': { width: 768, height: 980 },
  'desktop-app': { width: 1280, height: 800 },
};

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}\\s*=\\s*(["'])([^"']*)\\1`, 'i').exec(tag);
  return m?.[2].trim().toLowerCase();
}

/** The device a page declares on its <body>, or undefined. */
export function parseDevice(html: string): DeviceSpec | undefined {
  const body = /<body\b[^>]*>/i.exec(html)?.[0];
  if (!body) return undefined;
  return deviceFromAttributes((name) => attr(body, name));
}

/** The device from attribute values (a parsed tag or a live element). */
export function deviceFromAttributes(get: (name: string) => string | null | undefined): DeviceSpec | undefined {
  const device = get('data-od-device')?.trim().toLowerCase();
  if (!device || !(DEVICES as readonly string[]).includes(device)) return undefined;
  const spec: DeviceSpec = { device: device as Device };
  if (device === 'tablet') spec.orientation = get('data-od-orientation')?.toLowerCase() === 'portrait' ? 'portrait' : 'landscape';
  if (device === 'desktop-app') spec.window = get('data-od-window')?.toLowerCase() === 'windows' ? 'windows' : 'mac';
  const theme = get('data-od-theme')?.toLowerCase();
  if (theme === 'light' || theme === 'dark') spec.theme = theme;
  return spec;
}

export interface DeviceViewport {
  name: string;
  width: number;
  height: number;
}

/** The viewports a device screen is checked at: its content size (a tablet in both orientations, the declared one first). */
export function deviceViewports(spec: DeviceSpec): DeviceViewport[] {
  if (spec.device === 'tablet') {
    const both: DeviceViewport[] = [
      { name: 'tablet-landscape', ...DEVICE_CONTENT_SIZES['tablet-landscape'] },
      { name: 'tablet-portrait', ...DEVICE_CONTENT_SIZES['tablet-portrait'] },
    ];
    return spec.orientation === 'portrait' ? both.reverse() : both;
  }
  return [{ name: spec.device, ...DEVICE_CONTENT_SIZES[spec.device] }];
}

/** Frame markup a design drew itself, which the kit's shell now draws. */
const DRAWN_FRAME = /\b(?:class|id)\s*=\s*["'][^"']*\b(?:dynamic[-_]?island|notch|status[-_]?bar|home[-_]?indicator|device[-_]?frame|phone[-_]?frame|iphone[-_]?frame|bezel|title[-_]?bar|traffic[-_]?lights?)\b/i;

/** True when a page that declares a device also draws a frame or status bar of its own. */
export function drawsOwnFrame(html: string): boolean {
  return parseDevice(html) !== undefined && DRAWN_FRAME.test(html);
}

/**
 * Wraps `iframe` in a device shell sized to `spec` (or removes the shell when
 * `spec` is undefined). The iframe keeps its document and is never scaled, so
 * overlay rects measured against it stay right; a stage smaller than the
 * device scrolls. Self-contained: inlined as source into the one-file prototype.
 */
export function mountDeviceShell(doc: Document, iframe: HTMLIFrameElement, spec: DeviceSpec | undefined, title?: string): void {
  const SIZES: Record<string, { w: number; h: number; top: number; bottom: number; radius: number; bezel: number }> = {
    iphone: { w: 390, h: 763, top: 47, bottom: 34, radius: 54, bezel: 12 },
    android: { w: 412, h: 867, top: 28, bottom: 20, radius: 36, bezel: 10 },
    'tablet-landscape': { w: 1024, h: 724, top: 24, bottom: 20, radius: 28, bezel: 16 },
    'tablet-portrait': { w: 768, h: 980, top: 24, bottom: 20, radius: 28, bezel: 16 },
    'desktop-app': { w: 1280, h: 800, top: 32, bottom: 0, radius: 10, bezel: 0 },
  };
  const existing = iframe.parentElement && iframe.parentElement.classList.contains('od-device') ? iframe.parentElement : null;
  const stage = (existing ? existing.parentElement : iframe.parentElement) as HTMLElement | null;
  if (!spec) {
    if (existing && stage) {
      stage.insertBefore(iframe, existing);
      existing.remove();
      stage.classList.remove('od-device-stage');
    }
    iframe.style.removeProperty('width');
    iframe.style.removeProperty('height');
    return;
  }
  if (!doc.getElementById('od-device-css')) {
    const style = doc.createElement('style');
    style.id = 'od-device-css';
    style.textContent = [
      '.od-device-stage{overflow:auto!important;display:flex!important;align-items:flex-start;justify-content:center;background:#e7e7ec;padding:24px;box-sizing:border-box}',
      '.od-device{position:relative;flex:none;display:flex;flex-direction:column;background:#111;box-sizing:content-box;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.25)}',
      '.od-device>iframe{display:block;flex:none;border:0;background:#fff}',
      '.od-device-bar{flex:none;position:relative;display:flex;align-items:center;justify-content:space-between;font:600 14px/1 -apple-system,system-ui,sans-serif;padding:0 26px;box-sizing:border-box;user-select:none}',
      '.od-device-bar svg{display:block}',
      '.od-device-icons{display:flex;gap:6px;align-items:center}',
      '.od-device-island{position:absolute;left:50%;top:11px;width:122px;height:35px;margin-left:-61px;border-radius:20px;background:#000}',
      '.od-device-punch{position:absolute;left:50%;top:8px;width:12px;height:12px;margin-left:-6px;border-radius:50%;background:#000}',
      '.od-device-home{flex:none;display:flex;align-items:center;justify-content:center}',
      '.od-device-home i{display:block;height:5px;border-radius:3px}',
      '.od-device-win{background:#f3f3f3!important;color:#333!important;border-bottom:1px solid rgba(0,0,0,.12);font-weight:500;font-size:13px;padding:0 12px}',
      '.od-device-lights{display:flex;gap:8px}.od-device-lights i{width:12px;height:12px;border-radius:50%;display:block}',
      '.od-device-caption{display:flex;height:100%}.od-device-caption span{width:46px;display:flex;align-items:center;justify-content:center;font-size:12px}',
    ].join('\n');
    doc.head.appendChild(style);
  }
  const key = spec.device === 'tablet' ? `tablet-${spec.orientation === 'portrait' ? 'portrait' : 'landscape'}` : spec.device;
  const s = SIZES[key];
  if (!s || !stage) return;
  // Bars take the page's background so they read as part of the app; text contrasts with it.
  const bg = spec.background && !/^(?:transparent|rgba\(0, 0, 0, 0\))$/i.test(spec.background) ? spec.background : spec.theme === 'dark' ? '#000' : '#fff';
  // Modern colour syntaxes (oklch, lab, color(display-p3 …)): let the browser convert through a 1×1 canvas.
  const canvasRgba = (c: string): number[] | undefined => {
    try {
      const cv = doc.createElement('canvas');
      cv.width = 1;
      cv.height = 1;
      const ctx = cv.getContext('2d');
      if (!ctx) return undefined;
      ctx.fillStyle = '#010203';
      ctx.fillStyle = c;
      if (String(ctx.fillStyle) === '#010203') return undefined;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    } catch {
      return undefined;
    }
  };
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(bg);
  const rgb = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : canvasRgba(bg);
  const lum = rgb ? (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255 : spec.theme === 'dark' ? 0 : 1;
  const ink = spec.theme === 'dark' ? '#fff' : spec.theme === 'light' ? '#111' : lum < 0.5 ? '#fff' : '#111';
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
  const icons = `<span class="od-device-icons"><svg width="17" height="11" viewBox="0 0 17 11" fill="${ink}"><rect x="0" y="7" width="3" height="4" rx="1"/><rect x="4.5" y="5" width="3" height="6" rx="1"/><rect x="9" y="2.5" width="3" height="8.5" rx="1"/><rect x="13.5" y="0" width="3" height="11" rx="1"/></svg><svg width="15" height="11" viewBox="0 0 15 11" fill="${ink}"><path d="M7.5 2.2c2 0 3.9.8 5.3 2.1l1.1-1.1A9 9 0 0 0 7.5.6 9 9 0 0 0 1.1 3.2l1.1 1.1a7.5 7.5 0 0 1 5.3-2.1Zm0 3.1c1.2 0 2.3.5 3.1 1.2l1.1-1.1a6 6 0 0 0-8.4 0l1.1 1.1c.8-.7 1.9-1.2 3.1-1.2Zm0 3.1c.4 0 .8.2 1 .4L7.5 10 6.5 8.8c.2-.2.6-.4 1-.4Z"/></svg><svg width="25" height="12" viewBox="0 0 25 12" fill="none" stroke="${ink}"><rect x=".5" y=".5" width="21" height="11" rx="3" opacity=".4"/><rect x="2" y="2" width="16" height="8" rx="1.5" fill="${ink}" stroke="none"/><path d="M23 4v4" opacity=".4"/></svg></span>`;
  let top: string;
  let bottom = '';
  if (spec.device === 'desktop-app') {
    const name = esc(title || 'App');
    top =
      spec.window === 'windows'
        ? `<div class="od-device-bar od-device-win" style="height:${s.top}px;padding-right:0"><span>${name}</span><span class="od-device-caption"><span>&#x2500;</span><span>&#x2610;</span><span>&#x2715;</span></span></div>`
        : `<div class="od-device-bar od-device-win" style="height:${s.top}px"><span class="od-device-lights"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></span><span style="position:absolute;left:0;right:0;text-align:center;pointer-events:none">${name}</span><span></span></div>`;
  } else {
    const cut = spec.device === 'iphone' ? '<span class="od-device-island"></span>' : spec.device === 'android' ? '<span class="od-device-punch"></span>' : '';
    const time = spec.device === 'android' ? '12:30' : '9:41';
    top = `<div class="od-device-bar" style="height:${s.top}px;background:${bg};color:${ink};${spec.device === 'android' ? 'padding:0 16px;font-size:13px;font-weight:500' : ''}"><span>${time}</span>${cut}${icons}</div>`;
    const handle = spec.device === 'android' ? 'width:108px;height:4px' : spec.device === 'iphone' ? 'width:134px' : 'width:200px';
    bottom = `<div class="od-device-home" style="height:${s.bottom}px;background:${bg}"><i style="${handle};background:${ink};opacity:.85"></i></div>`;
  }
  let shell = existing as HTMLElement | null;
  if (!shell) {
    shell = doc.createElement('div');
    shell.className = 'od-device';
    stage.insertBefore(shell, iframe);
    shell.appendChild(iframe);
  }
  shell.setAttribute('data-device', key);
  shell.style.borderRadius = `${s.radius}px`;
  shell.style.border = s.bezel ? `${s.bezel}px solid #111` : '1px solid rgba(0,0,0,.2)';
  Array.prototype.slice.call(shell.querySelectorAll('.od-device-bar,.od-device-home')).forEach((el: Element) => el.remove());
  iframe.insertAdjacentHTML('beforebegin', top);
  if (bottom) iframe.insertAdjacentHTML('afterend', bottom);
  iframe.style.width = `${s.w}px`;
  iframe.style.height = `${s.h}px`;
  stage.classList.add('od-device-stage');
}
