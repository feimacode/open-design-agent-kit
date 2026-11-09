## ADDED Requirements

### Requirement: Edit Guard

`check_open_design_artifact` SHALL accept an optional `editId`. With it, the check SHALL compare the design with that edit's snapshot and report:
- `edit-out-of-scope` (error) for any difference outside the scope, found either in the markup (with the scope replaced by a placeholder in both versions, and style rules allowed to change only where all their selectors match inside the scope) or on screen at desktop and phone widths (with the scope's box masked, and content below the scope compared after shifting it by the scope's change in height);
- `edit-no-effect` (warning) when none of the verb's measured signals moved in its expected direction inside the scope;
- `edit-regression` (error) for each finding inside the scope that the snapshot didn't have, matched by check, viewport and element.

It SHALL also write an image of the scope before and after, side by side at desktop and phone widths, under the edit's folder, return it with the check images, and record the result in the edit log. Without `editId`, a design with a prepared but unchecked edit SHALL get a one-line note naming that edit.

#### Scenario: Shared style leaks out
- **WHEN** a `bolder` edit on the hero changes the shared `h2` rule, and the pricing heading below grows
- **THEN** the check SHALL report `edit-out-of-scope` naming the pricing heading, with a marked crop

#### Scenario: Taller scope moves the rest
- **WHEN** a `roomier` edit makes the features section 120 px taller and changes nothing else
- **THEN** the check SHALL report no `edit-out-of-scope` finding for the sections below it

#### Scenario: Edit did nothing measurable
- **WHEN** a `denser` edit leaves every gap and padding in the scope unchanged
- **THEN** the check SHALL report `edit-no-effect`

#### Scenario: Denser breaks tap targets
- **WHEN** a `denser` edit shrinks the table's row buttons below 24 px
- **THEN** the check SHALL report `edit-regression` for the tap-target finding the snapshot didn't have

#### Scenario: Guard not asked for
- **WHEN** an edit was prepared and the check runs without `editId`
- **THEN** the result SHALL note that the edit wasn't checked and name its `editId`
