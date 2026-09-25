# Design systems

A **design system** is a brand's visual language written down: color palette, typography, spacing and grid, layout, components, motion, voice, and what to avoid. When one is active, every design the agent generates follows it, so a landing page, a deck and a dashboard made on different days still look like they belong to the same brand.

Open Design bundles 152 design systems, most inspired by real products (Apple, Stripe, Linear, Notion, Vercel, Airbnb, Claude…), plus neutral starters. You can also invent your own or import one your organization already has.

## The key idea: one active design system per workspace

- **Each workspace has at most one active design system.** New designs use it automatically; you don't repeat it on every request.
- **Naming a design system makes it active.** Say "use Stripe" once, and it stays until you switch or clear it.
- **Without one, designs use the recipe's own look** plus the universal craft rules.

Here's exactly how the design system for a new design is chosen, on every host:

| Situation | Design system used | Does the active one change? |
|---|---|---|
| The request names a design system (the agent passes `designSystemId`) | that one | **yes**, it becomes the active one |
| The request names one that doesn't exist | none; the agent gets an error listing valid ids | no |
| No design system named, one is active | the active one | no |
| No design system named, none active | none | no |
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
- **`manifest.json`**: the id, display name, category and summary, plus `craft.suggested`, the universal craft rules that pair with this system (e.g. `color`, `accessibility-baseline`).

When a design system is active, [`prepare_open_design_brief`](../reference/tools.md#prepare_open_design_brief) puts its `DESIGN.md` into the instructions under **Active design system**, marked as **authoritative** for color, typography, spacing and component rules, with the instruction not to invent tokens outside its palette. It also narrows the craft rules to the system's suggested ones; without a design system, every craft rule applies.

## Find a design system

Ask:

> What design systems do you have for fintech?

> Show me the minimal, modern design systems.

The agent calls [`list_open_design_design_systems`](../reference/tools.md#list_open_design_design_systems), which filters by free text or by exact category. Each result's `active` flag shows the current one.

The 152 bundled systems fall into these categories:

| Category | Count | | Category | Count |
|---|---|---|---|---|
| AI & LLM | 15 | | Fintech & Crypto | 7 |
| Media & Consumer | 12 | | Morphism & Effects | 6 |
| Productivity & SaaS | 12 | | E-Commerce & Retail | 5 |
| Creative & Artistic | 11 | | Retro & Nostalgic | 4 |
| Professional & Corporate | 10 | | Layout & Structure | 4 |
| Developer Tools | 10 | | Starter | 3 |
| Modern & Minimal | 10 | | Editorial (three small categories) | 3 |
| Backend & Data | 9 | | Social & Messaging | 1 |
| Themed & Unique | 8 | | | |
| Bold & Expressive | 8 | | | |
| Design & Creative | 7 | | | |
| Automotive | 7 | | | |

Some ids you might reach for: `apple`, `stripe`, `linear-app`, `notion`, `vercel`, `airbnb`, `starbucks`, `claude`, `xiaohongshu`, `wechat`, and `default` ("Neutral Modern", a safe starter).

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

Custom design systems live in the workspace at `<outputDirectory>/design-systems/<slug>/DESIGN.md` (by default `.open-design/design-systems/…`). Their ids are `user:<slug>`. They're picked up immediately, with no restart or registration, and appear in the picker marked **custom**.

### Invent one from a brief

> Create a design system for Acme Corp: deep navy and signal orange, confident, engineering-focused. Base it on acme.com.

The agent calls [`create_open_design_design_system`](../reference/tools.md#create_open_design_design_system). If you give a website, it first makes a quick best-effort pass over the page and up to three of its stylesheets for candidate colors, fonts and a logo. That's a starting point, not ground truth. The agent then writes the `DESIGN.md` and makes it active (`user:acme-corp`).

> **In VS Code:** `/open-design-custom-design-system` starts this explicitly.

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

## Troubleshooting

- **"Unknown designSystemId"**: the id doesn't exist. The message lists some valid ones; ask the agent to list design systems. Custom ids need the `user:` prefix.
- **The status bar says "No design system" but you set one**: the stored id no longer exists (a renamed folder, or content changed after an update). Pick one again. Generation meanwhile runs without a design system rather than failing.
- **A design ignores parts of the brand**: make the `DESIGN.md` more specific, especially the Color, Typography and Anti-patterns sections, and ask for a regeneration. For an existing artifact, ask the agent to restyle it with the design system.
- **VS Code and Claude Code disagree about the active system**: they store it separately (see above).

## Related

[Generate a design](generate-a-design.md) · [Remix and the gallery](remix-and-gallery.md) · [Tools](../reference/tools.md#set_active_design_system) · [Settings](../reference/settings-and-env.md#opendesignactivedesignsystemid)
