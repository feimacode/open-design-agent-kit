## ADDED Requirements

### Requirement: Tweak Knob Discovery
The VS Code artifact preview SHALL show a Tweaks panel listing knobs for the artifact's base `:root` custom properties: design-token contract variables labelled and typed from the token schema, variables described in an optional `<script type="application/od-tweaks+json">` block (with its labels, groups, ranges and options), and other variables whose values parse as a color, length or number under a collapsed "More" group. A variable defined with `var(...)` SHALL be edited at the variable it references.

#### Scenario: Design-system landing page
- **WHEN** a landing page declaring `--accent`, `--fg`, `--bg` and `--radius` on `:root` is open in the preview
- **THEN** the Tweaks panel SHALL show labelled color knobs for the three colors and a length knob for the radius

### Requirement: Live Tweak Preview
Changing a knob SHALL update the preview immediately by setting the property on the previewed document's root, without reloading and without changing the file.

#### Scenario: Drag the radius slider
- **WHEN** the user drags the radius knob from 8px to 16px
- **THEN** the preview SHALL show the new radius at once and the file on disk SHALL be unchanged

### Requirement: Apply, Reset and Variant
"Apply" SHALL rewrite only the changed variables' values inside the source's base `:root` rules, preserving the rest of the file byte-for-byte, as one undoable workspace edit. "Reset" SHALL restore the file's values in the preview. "Save as variant" SHALL write a copy with the tweaked values next to the original, register it in the original's collection with `screenRole: "variant"`, and open it, leaving the original unchanged.

#### Scenario: Apply keeps formatting
- **WHEN** the user applies a new `--accent` value
- **THEN** the saved file SHALL differ from the original only in that declaration's value, and undo SHALL restore it

#### Scenario: Variant
- **WHEN** the user saves a variant labelled "warm"
- **THEN** `<name>-warm.html` SHALL be written and registered in the same collection, and the original file SHALL be unchanged

### Requirement: Send Tweaks to Chat
"Send to chat" SHALL open chat with a prefilled change request listing each tweaked variable and its new value for this artifact, without changing the file.

#### Scenario: Tokens aren't enough
- **WHEN** the user tweaks two values and clicks "Send to chat"
- **THEN** chat SHALL open with a request naming the artifact, both variables and their new values

### Requirement: Apply to Custom Design System
For a token-contract variable in an artifact that uses an active custom design system, the panel SHALL offer "Apply to design system", which after a confirmation rewrites the matching declaration in that system's `tokens.css` in place. The option SHALL NOT be offered for bundled design systems.

#### Scenario: Bundled system
- **WHEN** the active design system is a bundled one
- **THEN** "Apply to design system" SHALL NOT be shown
