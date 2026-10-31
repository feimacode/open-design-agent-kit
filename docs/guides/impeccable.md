# Works with Impeccable

[Impeccable](https://github.com/pbakaus/impeccable) gives coding agents a design vocabulary (`/impeccable polish`, `audit`, `critique`, …) and a detector that checks UI code against your project's design rules. Open Design makes finished design artifacts from design systems. They fit together: design the page with Open Design, port it into your app, then polish the app code with Impeccable.

## What each tool reads and writes

| File | Impeccable | Open Design |
|---|---|---|
| `PRODUCT.md` (root, `.agents/context/` or `docs/`) | Writes it (`/impeccable init`), reads it before design work | Reads it: [`prepare_open_design_brief`](../reference/tools.md#prepare_open_design_brief) adds a short "Product context" section (about 1,500 characters at most, headings kept). Never changes it. |
| `DESIGN.md` (same places) | Writes it (`/impeccable document`); its detector checks fonts, colours, radii and sizes against it | Reads it: with no design system active, the brief says the project has one, and the agent offers to turn it into an Open Design design system. Writes it **only when there is none** and you agree ([`set_active_design_system`](../reference/tools.md#set_active_design_system) with `writeProjectDesignMd`). |

The `DESIGN.md` Open Design writes starts with YAML front matter (`name`, `description`, `colors`, `typography`, `rounded`, `spacing`) taken from the design system's resolved tokens, followed by the design system's own text. Open Design never edits it afterwards, so you can let Impeccable's `document` refresh it.

Neither tool needs the other. Open Design doesn't install Impeccable, and doesn't look at Impeccable's own folders.

## A typical flow

1. Ask for a design ("a pricing page for our café's loyalty plan"). Open Design builds and checks it.
2. Ask to put it in the app. The agent uses [Promote to app code](promote-to-app-code.md).
3. If Impeccable is installed, the agent suggests `/impeccable polish` or `/impeccable audit` on the new component.
4. Optional: say yes when the agent offers to save the design system as the project's `DESIGN.md`, so Impeccable's detector checks future UI edits against it.

In the managed designs folder (Claude Desktop Chat without a project folder) none of this applies: there is no code project.
