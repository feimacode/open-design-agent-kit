## Context

A design is one HTML file with a manifest. Edits are made by the agent with its own file tools (or `write_open_design_file` on the hosted gateway). The check renders the page in a browser at desktop and phone widths and reports findings; `beforeAfter.ts` already re-runs the same passes on two versions of a page and pairs their findings. Preview comments carry an element anchor (`data-od-id` when the source has one, otherwise a selector) and are sent to chat as a scoped instruction. Design systems give the token scale (type, spacing, colour) that the taste and token checks read.

## Goals / Non-Goals

**Goals:** a person can steer one part of a design with a short word and get a predictable change; the kit can show that only that part changed, that it changed in the asked direction, and that nothing got worse; the change can be undone.

**Non-Goals:** a visual editor or sliders (tweaks already cover token values); edits across several files at once; automatic edits without the agent (the kit still never writes design content itself); making every verb measurable to the pixel. Measurements decide `edit-no-effect`, a warning, not whether the design is good: the critic still judges that.

## Decisions

### Seven verbs, each with a definition and a direction

| Verb | What it changes | Expected direction (measured inside the scope) | Must keep |
|---|---|---|---|
| `bolder` | Size contrast, weight, one dominant element, stronger colour on the main action | largest text size or weight up, or main action contrast up | copy, layout order |
| `quieter` | Fewer accents, softer colour, smaller display type, less decoration | distinct accent colours down, or largest text size down, or decorative elements down | copy, the main action's visibility |
| `denser` | Tighter gaps and padding on the token scale, more items per view | mean gap and padding down; tap targets stay ≥ 24 px | copy, every item |
| `roomier` | More space, fewer items per row, longer line height | mean gap and padding up | copy, every item |
| `distill` | Removes what doesn't serve the purpose: duplicate copy, extra badges, ornaments | visible elements down, words not up | the main action and the facts |
| `polish` | Alignment, spacing on the scale, consistent radii and type, states | findings inside the scope down; off-scale values down | content and structure |
| `harden` | Long and missing content, empty, loading and error states, focus and hover | stress and state findings inside the scope down | the happy path's look |

Impeccable's set is larger (colorize, animate, delight, clarify, adapt, onboard, normalize, optimize and more). We start with seven that a person would actually type, that map to measurable properties, and that work on any kind of design. `roomier` is added as the opposite of `denser`, because "give it room" is as common a request as "tighten it". Others can be added later as craft text plus a measurement.

The definitions are a craft doc (`steering-verbs.md`) in the content overlay, loaded into the instructions for the chosen verb only. The measurements are code.

### Scope is one element, stamped

A scope resolves to exactly one element. Accepted forms, in order of precedence: `data-od-id`, a preview comment id (its anchor), a CSS selector that matches one element, a named region (`header`, `hero`, `main`, `footer`: landmark elements first, then the first section of `main` for `hero`), or `{ heading: "Pricing" }` for the section whose heading has that text. If it matches none or several, the tool fails and lists candidates.

The tool writes `data-od-id="<slug>"` onto the scope element when it has none, by inserting the attribute into the element's start tag at its source offset, so no other byte of the file changes. That is the only write to the design. A part inside the shared navigation (`data-od-include`) is refused, since it belongs to every screen of a flow. A stable id is what lets the guard find the scope after the agent rewrites it, even if its tag or class changes.

`page` is accepted only for `polish` and `harden`. A bolder page is a new direction, and the instructions say to use `explore` for that.

### Snapshot, then compare markup and pixels

On prepare, the tool copies the entry to `<outputDir>/.edits/<design>/<editId>/before.html` (beside the check runs, outside the design's folder, so a published site never carries it) with an `edit.json` (verb, scope, notes, time and the snapshot's hash). The check computes the snapshot's findings and measurements on first use, from a temporary copy beside the design so its relative files resolve, and caches the findings in `before-findings.json`.

The guard checks the outside of the scope in two ways, because each misses things the other catches:

1. **Markup.** Both versions are parsed, the scope element is replaced by a placeholder in each, and the rest is compared after whitespace normalisation. Changed `<style>` rules are allowed only if every selector they touch is inside the scope (it contains the scope's id, or a class used only inside the scope). Any other difference is listed by element.
2. **Pixels.** Both versions are rendered at desktop and phone widths. The scope's box in both versions (their union) is masked, and the area above the scope is compared directly; the area below is compared after shifting by the scope's height change, since a taller section legitimately moves everything after it. Changed areas larger than a small threshold become `edit-out-of-scope` with a marked crop.

### The guard runs only with an editId

`check_open_design_artifact` stays the same unless it gets `editId`. The instructions from prepare tell the agent to pass it. A check without it on a design with a prepared, unchecked edit adds a one-line note naming the edit, so the guard isn't silently skipped.

### Regression is relative to the snapshot

`edit-regression` keys findings by check, viewport, state frame and element (the selector, or the message with numbers masked), and reports every warning or error key in the edited version that the snapshot doesn't have. Findings don't carry reliable positions, so they aren't filtered to the scope: a new finding outside it comes with an `edit-out-of-scope` finding anyway, and reporting it twice is better than missing it.

### Undo restores the snapshot

`undo: <editId>` copies `before.html` back over the entry when no later edit stands (later edits that were undone don't count). Otherwise it refuses and names the latest edit in the way, so edits are undone newest first. Undo is recorded in the log. Snapshots are kept for the last 20 edits per entry.

### Preview verb buttons send through the comment path

The comment panel gets a row of seven small buttons. Clicking one creates a comment with `verb` set and the note pre-filled ("Make this bolder"), and sends it immediately, through the same send-to-chat path as other comments. The gathered instruction tells the agent to call `prepare_open_design_edit` with the comment as scope. No new channel between the preview and the agent.

### Evals with follow-up turns

The eval runner already resumes a session to answer questions. A brief can now list `followUps`: messages sent with `--resume` after the first design is registered. The scorer reads the last edit's guard result from the manifest log.

## Risks / Trade-offs

- **Shared CSS is where scoped edits leak.** Most designs keep styles in one `<style>` block with shared classes. The instructions require new rules scoped to the stamped id, and the pixel guard catches leaks the markup rule misses. Expect the first eval runs to show `edit-out-of-scope` often; that is the guard doing its job, and the instructions get tuned from it.
- **Measurements can disagree with taste.** A "bolder" edit that moves the eye by colour only might not raise size or weight. Any one of the listed signals counts, and `edit-no-effect` is a warning, so it prompts a second look rather than a failure.
- **Pixel comparison is noisy** with web fonts and images that load late. The guard waits for fonts and images like the check does, and uses a per-pixel tolerance plus a minimum changed area.
- **Seven verbs may be too few or too many.** They are content, not code, for the definition side; usage in evals and from users decides what to add.
