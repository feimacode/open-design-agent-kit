// Pure, text-in/regex-out helpers shared by brandExtraction.ts (HTML pages)
// and designSystemImport.ts (raw CSS/JSON/JS token files from a file pick,
// paste, or GitHub fetch) — no network, no HTML-specific concepts, so both
// callers can feed it whatever raw text they already have.

export function extractHexColors(text: string, tally: Map<string, number>): void {
  const matches = text.matchAll(/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?\b/g);
  for (const m of matches) {
    const hex = m[0].toLowerCase();
    tally.set(hex, (tally.get(hex) ?? 0) + 1);
  }
}

export function extractFontFamilies(text: string, seen: Set<string>): void {
  // Deliberately allows quote characters into the capture (unlike a naive
  // `[^;}"']+`) — a quoted family name like `"Space Grotesk"` needs the
  // quotes IN the match so they can be stripped afterward; excluding them
  // from the character class truncates the capture to nothing, since the
  // opening quote appears immediately after the colon.
  const matches = text.matchAll(/font-family\s*:\s*([^;}]+)/gi);
  for (const m of matches) {
    const first = m[1].split(',')[0]?.trim().replace(/^['"]|['"]$/g, '');
    if (first && !/^(inherit|initial|unset|var\()/i.test(first)) seen.add(first);
  }
}

/** Ranks a color tally by frequency (most-referenced first), capped. */
export function rankColors(tally: Map<string, number>, max: number): string[] {
  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([hex]) => hex);
}
