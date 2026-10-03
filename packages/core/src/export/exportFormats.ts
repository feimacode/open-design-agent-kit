// What each artifact kind can actually be exported to by this project —
// recorded in the manifest's `exports` at registration/remix, and checked by
// exportArtifact(). Replaces the per-host KIND_TO_EXPORTS copies, which
// advertised upstream's list (`pdf`, `zip`) regardless of what existed here.
// `html`/`md`/`jsx`/`svg`/`txt` mean "the source file itself"; `standalone`
// (one self-contained .html) and `site` (a deploy-ready folder) are packaged.
export const EXPORTS_BY_KIND: Readonly<Record<string, readonly string[]>> = {
  html: ['html', 'standalone', 'site', 'png', 'jpeg', 'pdf'],
  'mini-app': ['html', 'standalone', 'site', 'png', 'jpeg', 'pdf'],
  deck: ['html', 'standalone', 'site', 'png', 'jpeg', 'pdf', 'pptx'],
  svg: ['svg', 'png', 'jpeg'],
  diagram: ['svg', 'png', 'jpeg'],
  'markdown-document': ['md'],
  'react-component': ['jsx'],
  'code-snippet': ['txt'],
  'design-system': ['md'],
};

/** A fresh copy of the kind's export list, or undefined for an unknown kind. */
export function exportsForKind(kind: string): string[] | undefined {
  const list = EXPORTS_BY_KIND[kind];
  return list ? [...list] : undefined;
}

/** Kinds whose artifacts can be packaged as `standalone`/`site`, whatever an older manifest's stored `exports` says. */
export const PACKAGEABLE_KINDS: ReadonlySet<string> = new Set(['html', 'mini-app', 'deck']);
