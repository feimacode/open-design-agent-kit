// Signed, expiring download links for a project's exports (openspec
// add-mcp-gateway). A link names the project by an opaque files ref, never by
// its handle, so passing a download link on doesn't open the project.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const FILES_REF = /^odf_[0-9a-f]{32}$/;

export function signDownload(secret: string, ref: string, rel: string, expires: number): string {
  return createHmac('sha256', secret).update(`${ref}\n${rel}\n${expires}`).digest('base64url');
}

/** `<base>/files/<ref>/<path>?exp=<unix s>&sig=<hmac>` */
export function downloadUrl(baseUrl: string, secret: string, ref: string, rel: string, expires: number): string {
  const encodedPath = rel.split('/').map(encodeURIComponent).join('/');
  return `${baseUrl.replace(/\/+$/, '')}/files/${ref}/${encodedPath}?exp=${expires}&sig=${signDownload(secret, ref, rel, expires)}`;
}

export type DownloadCheck = { ok: true; ref: string; rel: string } | { ok: false; status: number; message: string };

/** Checks a /files/ request's path, signature and expiry. */
export function verifyDownload(secret: string, pathname: string, search: URLSearchParams, nowSeconds = Math.floor(Date.now() / 1000)): DownloadCheck {
  const match = /^\/files\/([^/]+)\/(.+)$/.exec(pathname);
  if (!match) return { ok: false, status: 404, message: 'Not found' };
  let rel: string;
  try {
    rel = match[2].split('/').map(decodeURIComponent).join('/');
  } catch {
    return { ok: false, status: 400, message: 'Bad path' };
  }
  const ref = match[1];
  if (!FILES_REF.test(ref) || rel.split('/').some((part) => part === '..' || part === '' || part.startsWith('.') || part.includes('\\'))) return { ok: false, status: 400, message: 'Bad path' };
  const expires = Number(search.get('exp'));
  if (!Number.isFinite(expires)) return { ok: false, status: 403, message: 'Missing expiry' };
  const expected = Buffer.from(signDownload(secret, ref, rel, expires));
  const given = Buffer.from(search.get('sig') ?? '');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, status: 403, message: 'Bad signature' };
  if (expires < nowSeconds) return { ok: false, status: 410, message: 'This download link has expired. Ask for the export again.' };
  return { ok: true, ref, rel };
}
