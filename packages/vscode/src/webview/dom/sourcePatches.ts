// Adapted (simplified — see openspec design notes) from open-design's
// apps/web/src/edit-mode/source-patches.ts. Curated patch set — extended
// closer to upstream's real ManualEditPatch union (set-link, set-image,
// set-outer-html alongside set-text/set-style/remove-element) after a
// direct read of apps/web/src/components/ManualEditPanel.tsx; still
// without upstream's set-token/set-attributes/set-full-source or its
// history-entry/undo-redo machinery — VS Code's own document undo already
// covers every applied patch here, since each one is written back through
// a real WorkspaceEdit.

export interface CuratedStyles {
  color?: string;
  backgroundColor?: string;
  opacity?: string;
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  lineHeight?: string;
  letterSpacing?: string;
  textAlign?: string;
  borderRadius?: string;
  borderColor?: string;
  borderWidth?: string;
  borderStyle?: string;
  paddingTop?: string;
  paddingRight?: string;
  paddingBottom?: string;
  paddingLeft?: string;
  marginTop?: string;
  marginRight?: string;
  marginBottom?: string;
  marginLeft?: string;
}

export type ManualEditPatch =
  | { kind: 'set-text'; elementId: string; value: string }
  | { kind: 'set-link'; elementId: string; text: string; href: string }
  | { kind: 'set-image'; elementId: string; src: string; alt: string }
  | { kind: 'set-outer-html'; elementId: string; html: string }
  | { kind: 'set-style'; elementId: string; styles: CuratedStyles }
  | { kind: 'remove-element'; elementId: string };

export function applyPatch(doc: Document, patch: ManualEditPatch): boolean {
  const el = doc.querySelector(`[data-od-id="${patch.elementId}"]`) as HTMLElement | null;
  if (!el) return false;

  switch (patch.kind) {
    case 'set-text':
      el.textContent = patch.value;
      return true;
    case 'set-link':
      el.textContent = patch.text;
      el.setAttribute('href', patch.href);
      return true;
    case 'set-image':
      el.setAttribute('src', patch.src);
      el.setAttribute('alt', patch.alt);
      return true;
    case 'set-outer-html':
      // Replaces the node outright — relies on `patch.html` still carrying
      // the element's own `data-od-id` (the edit panel pre-fills the raw
      // HTML from the element's own current outerHTML, which already has
      // it), so a later patch can still find it via the same selector.
      el.outerHTML = patch.html;
      return true;
    case 'set-style':
      for (const [prop, value] of Object.entries(patch.styles)) {
        if (value !== undefined) (el.style as any)[prop] = value;
      }
      return true;
    case 'remove-element':
      el.remove();
      return true;
    default:
      return false;
  }
}

export function serializeDocument(doc: Document): string {
  const doctype = doc.doctype ? `<!DOCTYPE ${doc.doctype.name}>\n` : '<!doctype html>\n';
  return doctype + doc.documentElement.outerHTML;
}
