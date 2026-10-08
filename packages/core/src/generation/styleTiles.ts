// Style tiles (openspec add-style-tiles): compact color + type pairing
// artifacts whose `:root` declares the design-token contract, explored side by
// side and saved losslessly as a design system. Pure helpers, no I/O.
import { load } from 'cheerio';
import postcss from 'postcss';
import { TOKEN_SCHEMA } from '../vendored/designTokenSchema';

export const STYLE_TILE_SKILL_ID = 'style-tile';
/** Tiles are compact, so an exploration of them can show more side by side. */
export const TILE_MAX_DIRECTIONS = 6;
export const TILE_DEFAULT_DIRECTIONS = 4;

/** True for the style-tile skill, by bare id or public id (od:<mode>:style-tile). */
export function isStyleTileSkill(id: string | undefined): boolean {
  if (!id) return false;
  const bare = id.replace(/^od:[^:]+:/, '').replace(/:(skill|design-template|example|community)$/, '');
  return bare === STYLE_TILE_SKILL_ID;
}

/** The tokens a tile must declare: the contract's required identity and structure layers. */
export const REQUIRED_TILE_TOKENS: readonly string[] = TOKEN_SCHEMA.filter((t) => t.layer === 'A1-identity' || t.layer === 'A1-structure').map((t) => t.name);

/** `--name: value` declarations from base (non-media) `:root` rules in the page's `<style>` blocks, last one wins. */
export function extractRootTokens(html: string): Map<string, string> {
  const $ = load(html);
  const tokens = new Map<string, string>();
  $('style').each((_, el) => {
    let root;
    try {
      root = postcss.parse($(el).text());
    } catch {
      return;
    }
    root.walkRules((rule) => {
      if (rule.parent && rule.parent.type === 'atrule') return;
      if (!rule.selectors.some((s) => s.trim() === ':root')) return;
      rule.walkDecls((decl) => {
        if (decl.prop.startsWith('--')) tokens.set(decl.prop, decl.value.trim());
      });
    });
  });
  return tokens;
}

export function missingTileTokens(tokens: Map<string, string>): string[] {
  return REQUIRED_TILE_TOKENS.filter((name) => !tokens.has(name));
}

/** A tokens.css body: the tile's custom properties, contract tokens first in schema order, then any others. */
export function tokensCssFromTile(tokens: Map<string, string>): string {
  const order = TOKEN_SCHEMA.map((t) => t.name);
  const known = order.filter((n) => tokens.has(n));
  const extra = [...tokens.keys()].filter((n) => !order.includes(n)).sort();
  return `:root {\n${[...known, ...extra].map((n) => `  ${n}: ${tokens.get(n)};`).join('\n')}\n}\n`;
}

/** The shared "tile mode" section appended to a style-tile exploration's instructions. */
export function composeTileModeSection(input: { count: number; activeTokensCss?: string; activeName?: string; axis: string }): string {
  const evolve =
    input.axis === 'custom' && input.activeTokensCss
      ? `\n\n### Evolving "${input.activeName ?? 'the active design system'}"\n\nEvery tile starts from the active design system's tokens below and changes **only** what its own direction asks for. Mark each swatch, type sample or component whose token differs from these with \`data-od-changed\`, so the user sees what moved.\n\n\`\`\`css\n${input.activeTokensCss.trim()}\n\`\`\``
      : '';
  return `## Style tile mode

You are making ${input.count} **style tiles**, not pages: each direction is one compact tile showing a color and type pairing (see the style-tile skill above).

- **Declare the token contract.** Each tile's \`:root\` declares every one of these tokens, and the tile is styled only through them, so the chosen tile can be saved as a design system with no loss: ${REQUIRED_TILE_TOKENS.map((t) => `\`${t}\``).join(', ')}.
- **Make them genuinely different.** Each tile must differ from every other tile in at least **two** of: accent hue family (e.g. blue vs. orange, not two blues), neutral temperature (warm vs. cool greys), display face classification (serif, sans, mono, display/script), radius scale (sharp vs. soft vs. pill). Before writing, list each tile's choice for those four, and change any two tiles that match on three or more.
- Put \`data-od-style-tile\` on the tile's root element.${evolve}`;
}
