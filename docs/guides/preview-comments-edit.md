# Preview, comment and edit (VS Code)

VS Code opens every generated or remixed HTML artifact in the **Open Design Artifact Preview**, a live view with three modes. Open any HTML file this way with right-click → **Open Artifact Preview**, or **Open Design: Open Artifact Preview**.

## View

The rendered page, updating as the file changes.

## Comment

Hover to highlight an element, then click it to pin a note. To have the agent act on your notes, select them and click **Send comments to chat**. Copilot Chat opens with a prefilled, unsent message describing each note and the element it's on, and the agent edits the file with its normal tools.

Comments are saved next to the artifact as `<entry>.comments.json`, a plain file you can commit. The agent also sees unresolved comments through [`get_open_design_artifact`](../reference/tools.md#get_open_design_artifact) (`openComments`), and is told to address them before saying it's done.

## Edit

Click an element to open the edit panel:

- **Content:** fields that fit what you clicked (text, a link's `href`, an image's `src` and `alt`, or raw HTML for containers).
- **Style:** color, background, opacity, typography, border, and per-side padding and margin.

Changes are written straight to the file as a normal VS Code edit, so **Undo** and **Redo** work as usual.

## Toolbar actions

- **Promote to App Code:** prefills a chat request to [turn the prototype into real app code](promote-to-app-code.md).
- **Push to Figma:** exports the artifact as editable Figma layers. See [Figma](figma.md#artifact-to-figma-layers).
- **Previous / Next:** step between the screens of a [collection](generate-a-design.md#collections).

## Limits

Relative asset paths (`<img src="assets/x.png">`) may not load inside the sandboxed preview. The file on disk is fine, and exports load everything normally.

## Related

[Generate a design](generate-a-design.md) · [Figma](figma.md) · [Promote to app code](promote-to-app-code.md)
