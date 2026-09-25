# Design systems

A design system is a brand look (palette, typography, spacing, component rules) that every generation follows. About 150 come bundled in some 22 categories, and you can add your own.

## Pick one

Say it in chat:

> Use the Starbucks design system from now on.

or name it in a request ("…in the Linear style"). The agent finds it with [`list_open_design_design_systems`](../reference/tools.md#list_open_design_design_systems) and passes it to [`prepare_open_design_brief`](../reference/tools.md#prepare_open_design_brief). A design system named explicitly becomes the workspace's **active** design system: later requests use it automatically until you change it. To change or clear it, ask ("stop using a design system"), or the agent calls [`set_active_design_system`](../reference/tools.md#set_active_design_system).

> **In VS Code:** **Open Design: Browse Design Systems** (or click the design-system item in the status bar) opens a searchable picker grouped by category. The choice is stored in [`openDesign.activeDesignSystemId`](../reference/settings-and-env.md#opendesignactivedesignsystemid).

> **In Claude Code / Codex:** the active design system is stored in `.open-design/config.json` in the project.

## Invent one from a brief

> Create a design system for Acme Corp: deep navy and signal orange, confident, engineering-focused. Base it on acme.com.

The agent calls [`create_open_design_design_system`](../reference/tools.md#create_open_design_design_system). If you give a website, it makes a quick best-effort pass over the page and up to three of its stylesheets for candidate colors, fonts and a logo. That's a starting point only. The agent then writes a `DESIGN.md` at `.open-design/design-systems/acme-corp/DESIGN.md` and makes it active (id `user:acme-corp`).

> **In VS Code:** `/open-design-custom-design-system` starts this explicitly.

## Import one you already have (VS Code)

**Open Design: Import Design System** imports from a file, pasted text or a GitHub repository. No model is involved:

- content already shaped like a `DESIGN.md` is used as-is;
- otherwise colors and fonts are extracted, and the original is kept in a "Source Reference" section.

The result is selectable immediately.

## What you get

A custom design system is one Markdown file, `<outputDirectory>/design-systems/<slug>/DESIGN.md`. Edit it by hand any time; the next generation uses the new version.

## Related

[Generate a design](generate-a-design.md) · [Settings](../reference/settings-and-env.md)
