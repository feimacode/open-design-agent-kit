// The shape sheet (openspec fluid-poster-shapes, "shape-switching"): one image
// showing a fluid design at every requested shape, each labelled and marked
// when preflight found errors there. Composed in the export's own browser.
import type { Browser } from 'puppeteer-core';

export interface ShapeThumbnail {
  label: string;
  /** The image bytes (PNG unless `mime` says otherwise). */
  png: Buffer;
  errors: number;
  mime?: string;
}

const ROW_HEIGHT = 360;

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderShapeSheetHtml(thumbnails: ShapeThumbnail[], title?: string, heading?: string): string {
  const figures = thumbnails
    .map(
      (t) => `<figure><img src="data:${t.mime ?? 'image/png'};base64,${t.png.toString('base64')}" alt=""><figcaption><span class="dot ${t.errors > 0 ? 'bad' : 'ok'}"></span>${escapeHtml(t.label)}${t.errors > 0 ? ` <b>${t.errors} error${t.errors === 1 ? '' : 's'}</b>` : ''}</figcaption></figure>`,
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;padding:24px;background:#ececec;font:14px/1.3 system-ui,sans-serif;color:#222;width:max-content;max-width:2400px}
h1{font-size:16px;margin:0 0 16px}
.grid{display:flex;flex-wrap:wrap;gap:20px;align-items:flex-end}
figure{margin:0}
img{display:block;width:auto;height:auto;max-height:${ROW_HEIGHT}px;max-width:${ROW_HEIGHT * 1.6}px;box-shadow:0 2px 10px rgba(0,0,0,.2)}
figcaption{margin-top:8px;display:flex;align-items:center;gap:6px}
.dot{width:10px;height:10px;border-radius:50%;display:inline-block}.ok{background:#2e9d5b}.bad{background:#d23b3b}
b{color:#d23b3b;font-weight:600}
</style></head><body>${heading ? `<h1>${escapeHtml(heading)}</h1>` : title ? `<h1>${escapeHtml(title)} — every shape</h1>` : ''}<div class="grid">${figures}</div></body></html>`;
}

export async function composeShapeSheet(browser: Browser, thumbnails: ShapeThumbnail[], title?: string, heading?: string): Promise<Buffer> {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 2448, height: 800 });
    await page.setContent(renderShapeSheetHtml(thumbnails, title, heading), { waitUntil: 'load' });
    return Buffer.from(await page.screenshot({ type: 'png', fullPage: true }));
  } finally {
    await page.close();
  }
}
