# Preview, comment and edit (VS Code)

VS Code opens every generated or remixed HTML artifact in the **Open Design Artifact Preview**, a live view with three modes and a Tweaks panel. Open any HTML file this way with right-click → **Open Artifact Preview**, or **Open Design: Open Artifact Preview**.

## View

The rendered page, updating as the file changes.

## Comment

Hover to highlight an element, then click it to pin a note. To have the agent act on your notes, select them and click **Send** in the toolbar (its badge shows how many open notes will go). Copilot Chat opens with a prefilled, unsent message describing each note and the element it's on, and the agent edits the file with its normal tools.

Comments are saved next to the artifact as `<entry>.comments.json`, a plain file you can commit. The agent also sees unresolved comments through [`get_open_design_artifact`](../reference/tools.md#get_open_design_artifact) (`openComments`), and is told to address them before saying it's done.

## Edit

Click an element to open the edit panel:

- **Content:** fields that fit what you clicked (text, a link's `href`, an image's `src` and `alt`, or raw HTML for containers).
- **Style:** color, background, opacity, typography, border, and per-side padding and margin.

Changes are written straight to the file as a normal VS Code edit, so **Undo** and **Redo** work as usual.

## Tweaks

Click **Tweaks** in the toolbar to adjust a design's colors, type and spacing without asking the agent. The panel lists the custom properties the design declares on `:root`, each with a control that fits it:

- **Colors:** a picker and the value as text.
- **Lengths** (radii, sizes, spacing): a slider and a number, ranging from half to double the current value.
- **Font families:** a list of the design's own font stacks.
- **Plain numbers** (line heights, scales): a slider.

Design-token variables (`--bg`, `--accent`, `--font-display`, `--radius-md`, and the rest of the [token contract](design-systems.md)) are labelled and grouped. Other variables whose type can be told from their value are under **More**. A variable defined as `var(--other)` edits `--other`.

Changes show in the preview at once and don't touch the file until you choose:

- **Apply:** writes the new values into the design's `:root`, changing only those values in the file. It's a normal VS Code edit, so **Undo** works.
- **Reset:** goes back to the file's values.
- **Save variant:** asks for a label, writes a copy (`landing-warm.html`) with the new values next to the original, adds both to one [collection](generate-a-design.md#collections) so **Previous / Next** steps between them, and opens the copy. The original is unchanged.
- **Send to chat:** prefills a chat request with the values, for when the change should reach places the design hard-codes instead of using the variables.
- **Apply to design system:** shown when the design uses a [custom design system](design-systems.md). After asking, it writes the tweaked token values into that system's `tokens.css`, so every design that uses it changes. Bundled design systems are read-only, so it isn't offered for them.

Only the base `:root` rule is changed. A variable that's also set in a media query or theme rule (dark mode, for example) is marked **+ override**, and that override stays as it was.

If a design hard-codes most of its values, the panel says so and offers **Ask the agent to tokenize it**, which prefills a chat request to move them into variables.

A design can describe its own knobs with a JSON block, to label them, group them, or set ranges and choices:

```html
<script type="application/od-tweaks+json">
{ "knobs": [
  { "var": "--hero-scale", "label": "Hero size", "group": "Hero", "min": 1, "max": 2, "step": 0.05 },
  { "var": "--accent", "options": ["#2f6fed", "#e4572e", "#1f8a5b"] }
] }
</script>
```

Each knob takes `var` (required), and optionally `label`, `group`, `type` (`color`, `length`, `number`, `font` or `text`), `min`, `max`, `step` and `options`. Variables named there are offered even when their type can't be told from their value. The block never runs or shows on the page.

## Toolbar actions

- **Promote to App Code:** prefills a chat request to [turn the prototype into real app code](promote-to-app-code.md).
- **Push to Figma:** exports the artifact as editable Figma layers. See [Figma](figma.md#artifact-to-figma-layers).
- **Previous / Next:** step between the screens of a [collection](generate-a-design.md#collections).

## Errors in the page

If the design fails to load a file (a script from a CDN address that doesn't exist, a missing image) or one of its scripts throws, a banner at the top of the preview lists what went wrong. A page whose script stopped early often shows nothing at all, so the banner explains why. **Ask the agent to fix** prefills a chat request to check the design and fix what it reports. Dismiss the banner with **×**; it comes back the next time the file changes and the error is still there.

## Links and frames

Relative paths (`<img src="assets/x.png">`, stylesheets, scripts) load from the design's own folder. A frame showing a neighbouring design (like the thumbnails on an [exploration comparison page](explore-directions.md)) shows that design. A link to a neighbouring file, such as **Open full size**, opens it in its own tab, and `#section` links scroll the page.

## Related

[Generate a design](generate-a-design.md) · [Figma](figma.md) · [Promote to app code](promote-to-app-code.md)
