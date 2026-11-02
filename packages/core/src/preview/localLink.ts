// Pure: shared by the MCP App preview (a browser bundle) and its tests.

/** The workspace path an HTML link on the design at `entryPath` points to, or undefined for anything else. */
export function localLinkTarget(entryPath: string, href: string): string | undefined {
  const clean = href.trim().replace(/[?#].*$/, '');
  if (!clean || /^[a-z][a-z0-9+.-]*:/i.test(clean) || clean.startsWith('/') || !/\.html?$/i.test(clean)) return undefined;
  const parts = entryPath.split('/').slice(0, -1);
  for (const seg of decodeURIComponent(clean).split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length === 0) return undefined;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join('/');
}
