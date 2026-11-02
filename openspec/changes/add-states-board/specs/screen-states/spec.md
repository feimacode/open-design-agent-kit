## ADDED Requirements

### Requirement: State Frames

A design SHALL be able to hold state versions as sibling frames marked `data-od-state` with one of `default`, `empty`, `loading`, `error`, `success`, `no-access` or `long-content`, with only one frame visible on the page; the instructions for app-screen and mobile entries SHALL ask for a populated and an empty or loading state for each list, table or fetched panel, and an error state for each form.

#### Scenario: Table screen
- **WHEN** a brief is prepared with `app-table`
- **THEN** the instructions ask for `default`, `empty` and `loading` frames

### Requirement: States Board

The check's review sheet and the preview SHALL show a design's state frames side by side with their state names, and the preview SHALL let the user switch the visible state; export and publish SHALL use the `default` frame unless the board is requested.

#### Scenario: Reviewing states
- **WHEN** the user opens the preview of a design with three state frames
- **THEN** a switcher lists default, empty and loading, and the board shows all three

### Requirement: Checks in Every State

The check SHALL render each state frame and report its findings with the state name, and SHALL report `state-missing` when a list, table, fetched panel or form in an app-screen or mobile design has no state frame beyond the default.

#### Scenario: Overflow only when empty
- **WHEN** the empty state's illustration overflows at 390 px and the default does not
- **THEN** the check reports the overflow on the `empty` state

#### Scenario: Missing empty state
- **WHEN** an app-screen design has a table and only a default frame
- **THEN** the check reports `state-missing` for the table

### Requirement: Content Stress Pass

For app-screen and mobile designs, the check SHALL render the default state with stressed content (text lengthened 2.5 times, an unbroken 60-character string, numbers at 0 and 9,999,999) without changing the file, and report `stress-overflow` where text escapes its box or overlaps other text and `stress-truncation` where text is cut with no title or control showing the full value; text inside `[data-od-stress="off"]` SHALL be left unchanged.

#### Scenario: Long customer name
- **WHEN** a table cell holding a name overflows into the next column under stress
- **THEN** the check reports `stress-overflow` for that cell and the file is unchanged

### Requirement: Dead Control Finding

The check SHALL click each visible, enabled control that declares `aria-pressed`, `aria-expanded`, `aria-checked`, `aria-selected` or `aria-sort` or has a `switch`, `tab`, `option`, `menuitemcheckbox` or `menuitemradio` role, and report `dead-control` when no attribute, DOM node, focus or URL hash changes.

#### Scenario: Sort header that sorts nothing
- **WHEN** a table header has `aria-sort="ascending"` and clicking it changes nothing
- **THEN** the check reports `dead-control` for that header

### Requirement: Critic Judges States

The critic's input SHALL include the state frames' screenshots, and its states score SHALL be based on them.

#### Scenario: Weak empty state
- **WHEN** the empty frame is a blank panel with no message or action
- **THEN** the critic's states score names the empty state and suggests a reason and a primary action
