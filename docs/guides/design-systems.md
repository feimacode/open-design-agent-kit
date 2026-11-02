# Design systems

A **design system** is a brand's visual language written down: color palette, typography, spacing and grid, layout, components, motion, voice, and what to avoid. When one is active, every design the agent generates follows it, so a landing page, a deck and a dashboard made on different days still look like they belong to the same brand.

Open Design bundles 198 design systems, most inspired by real products (Apple, Stripe, Linear, Notion, Vercel, Airbnb, Claude…), plus neutral starters. You can also invent your own or import one your organization already has.

## The key idea: one active design system per workspace

- **Each workspace has at most one active design system.** New designs use it automatically; you don't repeat it on every request.
- **Naming a design system makes it active.** Say "use Stripe" once, and it stays until you switch or clear it.
- **Without one, designs use the recipe's own look** plus the recipe's craft rules.

Here's exactly how the design system for a new design is chosen, on every host:

| Situation | Design system used | Does the active one change? |
|---|---|---|
| The request names a design system (the agent passes `designSystemId`) | that one | **yes**, it becomes the active one |
| The request names one that doesn't exist | none; the agent gets an error listing valid ids | no |
| No design system named, one is active | the active one | no |
| No design system named, none active | none, unless the agent [recommends one](#not-sure-which-one) first (new designs only) | only if you go with a recommendation |
| No design system named, the active one no longer exists (a stale setting) | none, silently | no. Fix it by picking another |

There's no "just this once" option: naming a design system always switches the workspace to it. To use a different look for one design only, switch, generate, then switch back.

## What a design system contains

Each bundled design system is a folder with:

- **`DESIGN.md`**: the actual guidance, and what the agent reads. Bundled ones follow the same outline:
  1. Visual Theme & Atmosphere
  2. Color
  3. Typography
  4. Spacing & Grid
  5. Layout & Composition
  6. Components
  7. Motion & Interaction
  8. Voice & Brand
  9. Anti-patterns
- **`manifest.json`**: the id, display name, category and summary, plus a `craft` block: `applies` (craft docs added to every brief made with this system), `exemptions` (docs removed) and `suggested` (informational only).
- **`tokens.css`**: the system's tokens (`--bg`, `--fg`, `--accent`, `--font-display`, spacing, radius…) as one `:root { … }` block, following upstream Open Design's token contract. It's what the [preview](#preview-a-design-system) renders from. The agent still generates from `DESIGN.md`.

When a design system is active, [`prepare_open_design_brief`](../reference/tools.md#prepare_open_design_brief) puts its `DESIGN.md` into the instructions under **Active design system**, marked as **authoritative** for color, typography, spacing and component rules, with the instruction not to invent tokens outside its palette. The craft rules come from the recipe's own `od.craft.requires`, plus the system's `craft.applies`, minus its `craft.exemptions`, as in upstream Open Design.

## Find a design system

Ask:

> What design systems do you have for fintech?

> Show me the minimal, modern design systems.

The agent calls [`list_open_design_design_systems`](../reference/tools.md#list_open_design_design_systems), which filters by free text or by exact category. Each result's `active` flag shows the current one.

The 198 bundled systems fall into these categories:

| Category | Count | | Category | Count |
|---|---|---|---|---|
| Mobile Apps | 30 | | Backend & Data | 9 |
| AI & LLM | 15 | | Themed & Unique | 8 |
| Productivity & SaaS | 13 | | Fintech & Crypto | 7 |
| Modern & Minimal | 13 | | Design & Creative | 7 |
| Bold & Expressive | 13 | | Automotive | 7 |
| Media & Consumer | 12 | | Morphism & Effects | 6 |
| Professional & Corporate | 11 | | Retro & Nostalgic | 5 |
| Developer Tools | 11 | | Editorial & Print | 5 |
| Creative & Artistic | 11 | | E-Commerce & Retail | 5 |
| Layout & Structure | 4 | | Starter | 3 |
| Social & Messaging | 1 | | Editorial (two small categories) | 2 |

Some ids you might reach for: `apple`, `stripe`, `linear-app`, `notion`, `vercel`, `airbnb`, `starbucks`, `claude`, `xiaohongshu`, `wechat`, and `default` ("Neutral Modern", a safe starter).

To look through them yourself, open the [online gallery](https://feimacode.github.io/open-design-agent-kit/design-systems/): every system with a preview, its tokens and a prompt to copy. In Claude Desktop Chat you can also ask Claude to show the design systems; a picker appears in the conversation ([Inline preview](inline-preview.md#pick-a-design-system)).

## Not sure which one?

You don't have to know the names. When you ask for a new design, haven't named a look, and nothing is active yet, the agent recommends one:

> Make a landing page for my yoga studio.

The agent fills in a short profile from what you said (here: wellness, calm and warm) and calls [`recommend_open_design_design_systems`](../reference/tools.md#recommend_open_design_design_systems). It gets back 3 to 5 systems with a reason each, uses the first, and tells you which one it used and how to switch. In Claude Desktop Chat it shows the shortlist as tiles; elsewhere as a short list.

If your request doesn't say enough ("make me a landing page"), the agent asks up to three quick questions in one message: what it's for, how it should feel, light or dark, plus an optional "any product it should feel like?". Answer any of them, or say "you pick" and it starts from `default`.

How it picks:

- **Looks come from the tokens.** Light or dark, accent color, serif or sans headings and corner shape are read from each system's `tokens.css`, not its description.
- **Moods and industries are curated.** Every bundled system has a reviewed row in `packages/content/local/design-system-descriptors.json`.
- **Product looks only when you ask.** Systems named after a product (Stripe, Linear, Duolingo…) are recommended only when you name the product ("like Notion"), so your design doesn't quietly copy someone's brand.
- **Same answer everywhere.** The ranking is deterministic, so VS Code, Claude Code, Codex and Claude Desktop recommend the same systems for the same request.

Once you pick, it becomes the active design system, so this happens about once per workspace.

## Specify and switch

### By asking (every host)

| You say | What happens |
|---|---|
| "Use the Stripe design system from now on." | The agent calls [`set_active_design_system`](../reference/tools.md#set_active_design_system); nothing is generated yet. |
| "Build a pricing page in the Linear style." | The agent passes `designSystemId: "linear-app"` while generating, which also makes Linear active. |
| "Switch to Apple." | The active system becomes Apple for the next designs. |
| "Stop using a design system." | The agent clears it (`set_active_design_system` with no id). |
| "Which design system are we using?" | The agent checks the `active` flag in `list_open_design_design_systems`. |

### In VS Code

- **Status bar:** the bottom-right item shows the active system (e.g. `Stripe`, or `No design system`). Click it to change it.
- **Open Design: Browse Design Systems:** a searchable list grouped by category, with the active one ticked. Picking one makes it active and prefills Copilot Chat with `Using the Open Design design system "<id>" (<name>) — ` so your next request names it explicitly. The list also has **Clear active design system** and **Import a design system…**.
- **Design Systems view:** in the Open Design activity bar, every design system grouped by category, your custom ones first under **Custom**, the active one ticked. Clicking one opens its [preview](#preview-a-design-system); it doesn't make it active. Hover for **Use in chat**, **Set as active** and **Preview**; custom ones also have **Generate tokens.css** on the right-click menu. The title bar has **Import** and **Refresh**.

### Mobile app design systems

For phone screens there's a separate `Mobile Apps` category: 30 systems adapted from real iOS apps, with ids ending in `-ios`:

| Kind | Systems |
|---|---|
| Finance | `monzo-ios`, `cash-app-ios`, `nubank-ios` |
| Fitness and health | `strava-ios`, `oura-ios`, `headspace-ios`, `nike-run-club-ios` |
| Food | `uber-eats-ios`, `doordash-ios`, `resy-ios` |
| Messaging | `telegram-ios`, `whatsapp-ios`, `signal-ios` |
| Music and video | `spotify-ios`, `apple-music-ios`, `pocket-casts-ios`, `netflix-ios`, `twitch-ios` |
| Productivity | `linear-ios`, `things-3-ios`, `todoist-ios` |
| Social and dating | `bluesky-ios`, `reddit-ios`, `snapchat-ios`, `bumble-ios`, `feeld-ios` |
| Travel and reading | `booking-ios`, `lyft-ios`, `flighty-ios`, `goodreads-ios` |

Their `DESIGN.md` describes the app rather than a website: tab bars, navigation bars, sheets, list rows, 44pt hit targets, safe areas and haptics, with sizes in iOS points (1pt is treated as 1 CSS px). `tokens.css` carries the app's main colour mode, and the other mode is described in the `DESIGN.md`.

Ask for an app the way you'd describe it:

> A budgeting app home screen that feels like Monzo.

For phone screens, the agent picks `monzo-ios`. Some brands have both kinds: for a Spotify-style now-playing screen it uses `spotify-ios`, and for a Spotify-style landing page it uses the web system `spotify`. The Mobile app surface also asks which app's look to follow.

These systems are adapted from [awesome-ios-design-md](https://github.com/Meliwat/awesome-ios-design-md) (MIT), whose specs were reverse-engineered from the apps. They are inspired by those apps, not official, and their values were reviewed against the source rather than measured from the apps themselves.

### Preview a design system

See what a design system looks like before you commit to it. Open it from the Design Systems view, or run **Open Design: Preview Design System**. The preview is read-only: it writes nothing and doesn't change the active system.

- **Visualize:** identity, typography specimens, palette (each token with its value and role, plus any other colours the `DESIGN.md` names), voice, imagery and layout (radius, spacing, elevation), and the **component kit**, with a Light/Dark switch.
- **Showcase:** a full product page (navigation, hero, features, pricing, FAQ…) styled with the system. For a `Mobile Apps` system this is still a web page, so judge those by **Visualize**.
- **Side panel:** the system's `DESIGN.md` or `tokens.css` source. Collapse it with the thin bar on its left edge.
- **Set as active** and **Use in chat** buttons in the header.

Built-in and custom design systems go through the same rendering, so a custom system with a `tokens.css` previews just like a bundled one. A custom system without one shows a note that the preview is **approximated from DESIGN.md**, with a **Generate tokens.css** button (see [below](#tokenscss-for-custom-design-systems)). An open preview of a custom system updates as soon as its files change.

> Clicking in the Design Systems view previews, while clicking in the Gallery view opens chat. Previewing a design system is harmless, but making it active on a single click would silently change your workspace.

### In Claude Code / Codex

There's no picker; ask as above. Everything that generates, including [social posts](social-posts.md) and every screen of a [collection](generate-a-design.md#collections), uses the active design system automatically.

### What switching changes, and what it doesn't

- **It changes designs generated from now on.**
- **Existing artifacts aren't restyled.** Each artifact's manifest records the `designSystemId` it was made with. To restyle one, ask: "Restyle the pricing page with the Apple design system."
- **Remixing doesn't apply it.** A [remixed example](remix-and-gallery.md) keeps the example's own look. Ask for a restyle as part of the remix if you want your brand ("Start from the dashboard example, in our Acme design system").
- **Collections stay consistent.** Name the design system on the first screen; the later screens use it because it's now active.
- **[Figma frame to code](figma.md)** can take a design system to align the translated code with.

## Where the active design system is stored

| Host | Stored in | Scope |
|---|---|---|
| VS Code | the [`openDesign.activeDesignSystemId`](../reference/settings-and-env.md#opendesignactivedesignsystemid) setting, in the workspace's `.vscode/settings.json` (user settings when no folder is open) | this workspace |
| Claude Code, Codex, other MCP hosts | `.open-design/config.json` → `activeDesignSystemId` | this project ([workspace root](../reference/settings-and-env.md#open_design_workspace_root)) |

To give your whole team the same design system, commit that file. Note that VS Code and the MCP server keep separate records: switching in one doesn't switch the other.

## Your own design system

Custom design systems live in the workspace at `<outputDirectory>/design-systems/<slug>/DESIGN.md` (by default `.open-design/design-systems/…`), with an optional `tokens.css` next to it. Their ids are `user:<slug>`. They're picked up immediately, with no restart or registration, and appear in the picker marked **custom**.

### Invent one from a brief

> Create a design system for Acme Corp: deep navy and signal orange, confident, engineering-focused. Base it on acme.com.

The agent calls [`create_open_design_design_system`](../reference/tools.md#create_open_design_design_system). If you give a website, it first makes a quick best-effort pass over the page and up to three of its stylesheets for candidate colors, fonts and a logo. That's a starting point, not ground truth. The agent then writes the `DESIGN.md` and a matching `tokens.css`, and makes it active (`user:acme-corp`).

> **In VS Code:** `/open-design-custom-design-system` starts this explicitly.

### Take one from a website

> Make a design system from https://example.com. It's our brand, light and dark.

The agent uses `/open-design-design-system-from-url` (in VS Code, also **Open Design: Design System from Website**, on the Design Systems view's title bar). It asks only what you left out: the address, light, dark or both, and whether the site is your brand or a reference. Then it:

1. **Measures the rendered site** with [`extract_open_design_design_system`](../reference/tools.md#extract_open_design_design_system) in your installed Chrome, Edge or Chromium: the colours of the elements that carry them (background, cards, text, borders, the main button and its hover and pressed states), the fonts the page actually loaded, text sizes, radii, spacing and motion. The screenshots, one crop per colour and the logo go to `.open-design/.extract/<site>/`.
2. **Writes `DESIGN.md` and `tokens.css` from the same measurements**, so the two agree. Anything nothing measured is left to the token contract's defaults rather than guessed.
3. **Shows you a review**: the site's screenshot beside a sample page (hero, buttons, a card, a form) in the new tokens, checked with `check_open_design_artifact`. Say what's off ("the buttons are rounder on the site"); it fixes and re-checks, up to two rounds.
4. **Saves it** as `user:<name>` and offers to make it active.

For a reference site, the design system is named "<Name>-inspired" and no logos or images are copied. Dark values are only measured when the site has a dark theme. A page behind a bot check or login comes back as blocked, with its screenshot; give the agent the CSS or a screenshot instead. Without a browser, the agent gets candidate colours and fonts from the page source only, and asks you to confirm them.

### Take one from your app

> Scan our app so designs match it.

The agent reads your app's tokens (Tailwind theme, CSS variables, MUI theme, each with its file and line), its themes and its components with their variants, shows you what it found, and on your OK saves them as `user:<name>` with a `components.json` vocabulary. Briefs on it then build from your components, and the check flags values pasted in instead of your tokens. Scanning again reports what changed in the app since. See [Design from your app](design-from-your-app.md).

### Pick one from style tiles

Not sure what the brand should look like? Ask for options:

> Show me four color and type pairings for a calm, trustworthy fintech brand.

The agent runs a [design exploration](explore-directions.md) with the **style-tile** skill. Each direction is one compact tile instead of a page:
- palette swatches with their roles, hex values and real contrast ratios;
- a type specimen with the full scale;
- a few components (buttons, an input, a card, a tag);
- radius and elevation samples.

The tiles are made to differ in at least two of: accent hue, neutral temperature, display typeface and roundness, so you're comparing real alternatives. They sit side by side on the comparison page.

Every tile declares the design-token contract on `:root` (`check_open_design_artifact` reports any missing token as `token-missing`). So when you pick one ("use the second one as our design system"), its values are copied **exactly** into the new system's `tokens.css`; nothing is re-interpreted. The new system becomes active, and later designs use it.

To **evolve** the active design system instead ("the same, but warmer"), ask for variations of it. The agent uses custom directions that start from your current tokens, and each tile marks what changed.

> **In VS Code:** pick **Color + type** in the Gallery's **New design** tiles.

### Import one you already have (VS Code)

**Open Design: Import Design System** (also in the Browse list) asks for a name, a source and an optional category. The source can be:

| Source | What's read |
|---|---|
| **File** | Any tokens or style file: CSS, JSON, a Tailwind config, a `DESIGN.md`… |
| **Paste** | Content pasted into a scratch editor. |
| **GitHub repository** | A file URL, or a repo URL. For a repo, well-known token files are looked for: `tailwind.config.js`/`.ts`/`.cjs`, `tokens.json`, `design-tokens.json`, `tokens.css`, `variables.css`, `theme.json`… |

Import never uses a model:

- **Content that already is a `DESIGN.md`** (it starts with a `#` heading) is used exactly as-is.
- **Anything else** becomes a `DESIGN.md` with the colors and font families found in it, and the full original kept in a **Source Reference** section, so nothing is reinterpreted or lost.
- **A `tokens.css` is written only from what the source already declares.** CSS that uses token-contract names (`--bg`, `--accent`, `--font-body`…) has exactly those declarations copied, unchanged. A GitHub repo whose root has a `DESIGN.md` also has its root `tokens.css` imported as-is. Found colors are never assigned to roles by guessing; without such declarations, no `tokens.css` is written.

The new file opens in the editor, and **Set as Active** makes it active.

### Write or edit one by hand

A custom design system is just Markdown, so you can write it or refine a generated one yourself:

```markdown
# Acme Design System

> Confident, engineering-focused. Deep navy and signal orange.

## Color
- Primary: #0B1F3A (navy) …
- Accent: #FF6A13 (signal orange), used sparingly for primary actions …

## Typography
…

## Anti-patterns
- No gradients on buttons …
```

- The **first `#` heading** becomes its display name.
- The **`>` quote** right under it becomes its one-line summary.
- The **folder name** becomes its id (`user:<folder>`).
- Everything else is read by the agent as-is, so the more specific you are (hex values, sizes, do's and don'ts), the more consistent the output.
- Changes apply from the next generation on.

### Use one in Claude Design

Claude Design keeps design systems as "Design System" artifacts in Claude (Settings > Design systems). Every built-in system is prebuilt in that format in [`claude-design-systems/`](../../claude-design-systems/README.md), one folder per system, with this kit's local fixes applied. Each folder holds a `project/` tree: `design-system.json`, `tokens.json`, `README.md` and a cover. Pick one of four routes:

- **From the online gallery.** Open the system in the [gallery](https://feimacode.github.io/open-design-agent-kit/design-systems/) and switch to its **Claude Design** view to see what you'll get: the cover, the tokens by family and the README. Under **Add it to Claude Design**, **Open in Claude** starts a new chat with a prompt that asks Claude to build the Design System artifact from the folder's files (or copy the prompt into a chat yourself).
- **From a GitHub repo.** In Claude, go to **Settings → Design systems → New design system**, choose **Using Claude**, then **Sync from my GitHub repository**. Give `feimacode/open-design-agent-kit` and pick one system's folder, for example `claude-design-systems/kami`. Claude needs access to your GitHub account for this. The importer copies a `tokens.json` that is already in Claude's format as is. One import makes one design system.
- **Upload from files.** Choose the upload starting point and drop the files of the folder's `project/`.
- **Several at once, from Claude Code.** In a checkout of this repository, ask:

  > Publish these Open Design design systems to Claude Design: kami, lingo, stripe.

  The agent creates a Design System artifact for each, under your account, and publishes that system's folder to it.

The **connector** starting point is for design tools (Figma, Canva and the like). It reads a design file through that tool's connector, so it doesn't apply to Open Design systems.

For a custom system (yours, or one made from a website), export it first: `npx tsx scripts/claude-design-system.ts export <design-system-folder> <out-dir>` writes `<out-dir>/project/` in the same format, and fails if the result wouldn't pass Claude's format rules. Then upload it or ask the agent to publish it.

To bring one back from Claude, ask the agent to read `project/design-system.json`, `project/tokens.json` and `project/README.md` from the system into a folder, then run `npx tsx scripts/claude-design-system.ts import <that-folder> .open-design/design-systems` (your Open Design output folder). The result shows up as `user:<name>`.

Both directions are lossy, and each README's last section lists what was left out:

- Claude has no motion tokens.
- `color-mix()` shades (hover, active, tints) become literal colours, so they don't follow later edits to the colour they were mixed from.
- Fonts are named by family, with no font files.

Where a brand's own text colour reads below 4.5:1 on its background, the token's usage note says so; the value stays as the brand has it. Importing maps Claude's token names (such as `ink` or `surface`) onto Open Design's token contract by name. Nothing keeps the two copies in step afterwards.

### tokens.css for custom design systems

A `tokens.css` next to your `DESIGN.md` makes the preview exact rather than approximated. It's a single `:root { … }` block. Required are the identity tokens (`--bg`, `--surface`, `--fg`, `--muted`, `--border`, `--accent`, `--font-display`, `--font-body`) and the type-scale, section-spacing and container tokens. Everything else (status colors, spacing steps, radius, elevation, motion, secondary text and surface tiers) is optional, with defaults. [`create_open_design_design_system`](../reference/tools.md#create_open_design_design_system) spells out the full list for the agent.

To add one to an existing custom system, use **Generate tokens.css** (in the preview or on the Design Systems view's right-click menu), or ask:

> Write the tokens.css for my Acme design system.

The agent calls `create_open_design_design_system` with `existingDesignSystemId: "user:acme"`, reads your `DESIGN.md`, and writes only the `tokens.css`. You can also write or edit it by hand.

## Troubleshooting

- **"Unknown designSystemId"**: the id doesn't exist. The message lists some valid ones; ask the agent to list design systems. Custom ids need the `user:` prefix.
- **The status bar says "No design system" but you set one**: the stored id no longer exists (a renamed folder, or content changed after an update). Pick one again. Generation meanwhile runs without a design system rather than failing.
- **A design ignores parts of the brand**: make the `DESIGN.md` more specific, especially the Color, Typography and Anti-patterns sections, and ask for a regeneration. For an existing artifact, ask the agent to restyle it with the design system.
- **VS Code and Claude Code disagree about the active system**: they store it separately (see above).
- **A preview's colors look wrong for a custom system**: if it says *approximated*, add a `tokens.css`. If it has one, check the values in the preview's `tokens.css` panel. Only the top-level `:root` block counts, and values containing `url(…)`, `<`, `{` or `;` are ignored.

## Related

[Generate a design](generate-a-design.md) · [Remix and the gallery](remix-and-gallery.md) · [Tools](../reference/tools.md#set_active_design_system) · [Settings](../reference/settings-and-env.md#opendesignactivedesignsystemid)
