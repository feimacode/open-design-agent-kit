import * as path from 'node:path';

/** `<outputDir>/<collectionId>/<screenSlug>.html` — the on-disk layout for a design collection's screens. Pure, no I/O. */
export function suggestCollectionScreenEntryPath(outputDir: string, collectionId: string, screenSlug: string): string {
  return path.posix.join(outputDir, collectionId, `${screenSlug}.html`);
}
