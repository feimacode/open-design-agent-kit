// Image exports of a device screen with the kit's device frame around them
// (openspec add-platform-shells): the screen is captured at the device's
// content size as usual, then shown in a frame drawn by the same
// mountDeviceShell the previews use, and that frame is captured.
import type { Browser } from 'puppeteer-core';
import { mountDeviceShell, type DeviceSpec } from '../preview/deviceShell';

/** Wraps a captured screen (PNG) in its device frame and returns the framed image. */
export async function wrapInDeviceShell(
  browser: Browser,
  png: Buffer,
  spec: DeviceSpec,
  options: { title?: string; scale: number; format: 'png' | 'jpeg'; quality?: number; mime?: string; cover?: boolean },
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1600, height: 1200, deviceScaleFactor: options.scale });
    const src = `data:${options.mime ?? 'image/png'};base64,${png.toString('base64')}`;
    // cover: an imported screenshot of any size fills the screen, top-aligned (openspec add-portfolio-share-and-review).
    const fit = options.cover ? 'img{display:block;width:100%;height:100vh;object-fit:cover;object-position:top}' : 'img{display:block;width:100%;height:auto}';
    const inner = `<!doctype html><html><head><style>html,body{margin:0;background:transparent;overflow:hidden}${fit}</style></head><body><img src="${src}"></body></html>`;
    await page.setContent('<!doctype html><html><head><style>html,body{margin:0;background:transparent}</style></head><body><div id="stage"><iframe></iframe></div></body></html>');
    // String form: this package compiles without DOM lib types.
    await page.evaluate(
      `(function(){${mountDeviceShell.toString()}
var frame=document.querySelector('iframe');mountDeviceShell(document,frame,${JSON.stringify(spec)},${JSON.stringify(options.title ?? '')});
document.getElementById('stage').style.cssText='background:transparent;padding:0';
return new Promise(function(resolve){frame.onload=function(){var img=frame.contentDocument.querySelector('img');if(img.complete)resolve(true);else{img.onload=function(){resolve(true)};img.onerror=function(){resolve(false)}}};frame.srcdoc=${JSON.stringify(inner)};});})()`,
    );
    const handle = await page.$('.od-device');
    if (!handle) throw new Error('the device frame did not render');
    const box = await handle.boundingBox();
    // Rounded corners stay transparent in a PNG.
    const buffer = Buffer.from(await handle.screenshot({ type: options.format, quality: options.quality, omitBackground: options.format === 'png' }));
    return { buffer, width: Math.round((box?.width ?? 0) * options.scale), height: Math.round((box?.height ?? 0) * options.scale) };
  } finally {
    await page.close();
  }
}
