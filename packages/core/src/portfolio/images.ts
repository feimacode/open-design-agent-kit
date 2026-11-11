// Image handling for the work library (openspec add-work-library): metadata
// stripping in plain JS (EXIF, XMP, IPTC and PNG text chunks, which carry
// camera and location data), size reading without a decoder, and the browser
// step that makes the WebP widths (800, 1400, 2800) and bakes redaction boxes
// into every copy an output can use. Redaction shrinks the box to a few
// pixels and blurs it back up, so text under a box can't be read back.
import type { Browser } from 'puppeteer-core';
import type { Redaction } from './library';

export const VARIANT_WIDTHS = [800, 1400, 2800] as const;
export const DRIBBBLE_MIN_WIDTH = 1600;

export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

export function sniffImage(data: Buffer): ImageMime | undefined {
  if (data.length >= 8 && data.readUInt32BE(0) === 0x89504e47 && data.readUInt32BE(4) === 0x0d0a1a0a) return 'image/png';
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (data.length >= 6 && (data.toString('ascii', 0, 6) === 'GIF87a' || data.toString('ascii', 0, 6) === 'GIF89a')) return 'image/gif';
  return undefined;
}

export function isMp4(data: Buffer): boolean {
  return data.length >= 12 && data.toString('ascii', 4, 8) === 'ftyp';
}

export function extensionFor(mime: string): string {
  return { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'video/mp4': '.mp4' }[mime] ?? '.bin';
}

/** Width and height from the file header, or undefined when it can't be read. */
export function imageSize(data: Buffer): { width: number; height: number } | undefined {
  const mime = sniffImage(data);
  try {
    if (mime === 'image/png') return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
    if (mime === 'image/gif') return { width: data.readUInt16LE(6), height: data.readUInt16LE(8) };
    if (mime === 'image/jpeg') {
      let i = 2;
      while (i + 9 < data.length) {
        if (data[i] !== 0xff) return undefined;
        const marker = data[i + 1];
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          i += 2;
          continue;
        }
        const len = data.readUInt16BE(i + 2);
        // SOF0-SOF15 except DHT (C4), JPG (C8) and DAC (CC).
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: data.readUInt16BE(i + 5), width: data.readUInt16BE(i + 7) };
        }
        i += 2 + len;
      }
      return undefined;
    }
    if (mime === 'image/webp') {
      const chunk = data.toString('ascii', 12, 16);
      if (chunk === 'VP8X') return { width: 1 + data.readUIntLE(24, 3), height: 1 + data.readUIntLE(27, 3) };
      if (chunk === 'VP8L') {
        const b = data.readUInt32LE(21);
        return { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) };
      }
      if (chunk === 'VP8 ') return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

const JPEG_DROP = new Set([0xe1, 0xed, 0xfe]); // APP1 (EXIF, XMP), APP13 (IPTC), COM
const PNG_DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);
const WEBP_DROP = new Set(['EXIF', 'XMP ']);

/**
 * The same image without camera, location or editing metadata. JPEG keeps its
 * colour profile (APP2) and Adobe marker (APP14); PNG keeps everything but
 * text, time and EXIF chunks; WebP drops its EXIF and XMP chunks and clears
 * their flags. GIF has no such metadata and is returned as is.
 */
export function stripImageMetadata(data: Buffer): { data: Buffer; removed: number } {
  const mime = sniffImage(data);
  if (mime === 'image/jpeg') {
    const parts: Buffer[] = [data.subarray(0, 2)];
    let removed = 0;
    let i = 2;
    while (i + 4 <= data.length) {
      if (data[i] !== 0xff) break;
      const marker = data[i + 1];
      if (marker === 0xda) {
        parts.push(data.subarray(i));
        i = data.length;
        break;
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        parts.push(data.subarray(i, i + 2));
        i += 2;
        continue;
      }
      const len = data.readUInt16BE(i + 2);
      const segment = data.subarray(i, i + 2 + len);
      if (JPEG_DROP.has(marker)) removed++;
      else parts.push(segment);
      i += 2 + len;
    }
    if (i < data.length) parts.push(data.subarray(i));
    return { data: Buffer.concat(parts), removed };
  }
  if (mime === 'image/png') {
    const parts: Buffer[] = [data.subarray(0, 8)];
    let removed = 0;
    let i = 8;
    while (i + 12 <= data.length) {
      const len = data.readUInt32BE(i);
      const type = data.toString('ascii', i + 4, i + 8);
      const chunk = data.subarray(i, i + 12 + len);
      if (PNG_DROP.has(type)) removed++;
      else parts.push(chunk);
      i += 12 + len;
      if (type === 'IEND') break;
    }
    return { data: Buffer.concat(parts), removed };
  }
  if (mime === 'image/webp') {
    const kept: Buffer[] = [];
    let removed = 0;
    let i = 12;
    while (i + 8 <= data.length) {
      const type = data.toString('ascii', i, i + 4);
      const len = data.readUInt32LE(i + 4);
      const total = 8 + len + (len % 2);
      const chunk = Buffer.from(data.subarray(i, i + total));
      if (WEBP_DROP.has(type)) removed++;
      else {
        // VP8X flags: bit 3 EXIF, bit 2 XMP.
        if (type === 'VP8X' && chunk.length > 8) chunk[8] = chunk[8] & ~0x0c;
        kept.push(chunk);
      }
      i += total;
    }
    const body = Buffer.concat(kept);
    const header = Buffer.alloc(12);
    header.write('RIFF', 0, 'ascii');
    header.writeUInt32LE(body.length + 4, 4);
    header.write('WEBP', 8, 'ascii');
    return { data: Buffer.concat([header, body]), removed };
  }
  return { data, removed: 0 };
}

export interface ProcessedImage {
  width: number;
  height: number;
  /** WebP copies at each VARIANT_WIDTHS entry not wider than the image, plus the image's own width when it is narrower than all. */
  variants: Array<{ width: number; data: Buffer }>;
  /** A PNG of the whole image with the redactions baked in, when there are any. */
  redacted?: Buffer;
}

/**
 * Makes the WebP widths and, when there are redaction boxes, a redacted PNG,
 * in a page of the given browser. Every copy is drawn from the redacted
 * canvas, so no output can show what a box covers.
 */
export async function processImage(browser: Browser, data: Buffer, mime: string, redactions: Redaction[] = [], quality = 0.86): Promise<ProcessedImage> {
  const page = await browser.newPage();
  try {
    const dataUrl = `data:${mime};base64,${data.toString('base64')}`;
    const result = (await page.evaluate(
      async (src: string, widths: number[], boxes: Redaction[], q: number) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const base = document.createElement('canvas');
        base.width = w;
        base.height = h;
        const ctx = base.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        for (const b of boxes) {
          const x = Math.floor(b.x * w);
          const y = Math.floor(b.y * h);
          const bw = Math.max(1, Math.ceil(b.width * w));
          const bh = Math.max(1, Math.ceil(b.height * h));
          // Shrink the box by halving (each step averages, so nothing aliases through) to a few
          // pixels per side, then draw it back up smoothed: the detail is gone, not hidden.
          const cell = Math.max(16, Math.round(Math.min(bw, bh) / 6));
          const tw = Math.max(1, Math.round(bw / cell));
          const th = Math.max(1, Math.round(bh / cell));
          let src: HTMLCanvasElement = document.createElement('canvas');
          src.width = bw;
          src.height = bh;
          src.getContext('2d')!.drawImage(base, x, y, bw, bh, 0, 0, bw, bh);
          while (src.width > tw || src.height > th) {
            const next = document.createElement('canvas');
            next.width = Math.max(tw, Math.floor(src.width / 2));
            next.height = Math.max(th, Math.floor(src.height / 2));
            const nctx = next.getContext('2d')!;
            nctx.imageSmoothingEnabled = true;
            nctx.imageSmoothingQuality = 'high';
            nctx.drawImage(src, 0, 0, next.width, next.height);
            src = next;
          }
          ctx.save();
          ctx.beginPath();
          ctx.rect(x, y, bw, bh);
          ctx.clip();
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.filter = `blur(${Math.max(4, Math.round(cell / 3))}px)`;
          ctx.drawImage(src, 0, 0, src.width, src.height, x - cell, y - cell, bw + 2 * cell, bh + 2 * cell);
          ctx.restore();
        }
        const out: Array<{ width: number; url: string }> = [];
        const targets = widths.filter((t) => t <= w);
        if (!targets.length) targets.push(w);
        for (const t of targets) {
          const c = document.createElement('canvas');
          c.width = t;
          c.height = Math.max(1, Math.round((h * t) / w));
          const cctx = c.getContext('2d')!;
          cctx.imageSmoothingQuality = 'high';
          cctx.drawImage(base, 0, 0, c.width, c.height);
          out.push({ width: t, url: c.toDataURL('image/webp', q) });
        }
        return { width: w, height: h, variants: out, redacted: boxes.length ? base.toDataURL('image/png') : undefined };
      },
      dataUrl,
      [...VARIANT_WIDTHS],
      redactions,
      quality,
    )) as { width: number; height: number; variants: Array<{ width: number; url: string }>; redacted?: string };
    const decode = (url: string) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
    return {
      width: result.width,
      height: result.height,
      variants: result.variants.map((v) => ({ width: v.width, data: decode(v.url) })),
      redacted: result.redacted ? decode(result.redacted) : undefined,
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}
