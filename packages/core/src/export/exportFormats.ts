// What each artifact kind can actually be exported to by this project —
// recorded in the manifest's `exports` at registration/remix, and checked by
// exportArtifact(). Replaces the per-host KIND_TO_EXPORTS copies, which
// advertised upstream's list (`pdf`, `zip`) regardless of what existed here.
// `html`/`md`/`jsx`/`svg`/`txt` mean "the source file itself".
export const EXPORTS_BY_KIND: Readonly<Record<string, readonly string[]>> = {
  html: ['html', 'png', 'jpeg', 'pdf'],
  'mini-app': ['html', 'png', 'jpeg', 'pdf'],
  deck: ['html', 'png', 'jpeg', 'pdf', 'pptx'],
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
