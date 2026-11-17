## ADDED Requirements

### Requirement: Motion Steering Verbs

The steering verbs SHALL include `calmer` (fewer moving elements, shorter travel, less overshoot), `snappier` (shorter durations, stronger ease-out, no overshoot) and `smoother` (one easing family, no abrupt starts or stops), each with a written definition in the content overlay bound to the design system's motion vocabulary. Their measured direction inside the scope SHALL come from the animation inventory: element count, total travel distance, mean duration, overshoot and the number of distinct easings. The edit guard SHALL also compare the animation inventory outside the scope, and SHALL report `edit-out-of-scope` when motion outside it changed.

#### Scenario: Calmer hero
- **WHEN** a `calmer` edit on the hero reduces moving elements from 9 to 3 and nothing outside the hero changes
- **THEN** the check with that `editId` SHALL report no `edit-no-effect` and no `edit-out-of-scope`

#### Scenario: Shared transition leaks out
- **WHEN** a `snappier` edit on the pricing cards shortens a shared `.btn` transition used in the footer
- **THEN** the check SHALL report `edit-out-of-scope` naming the footer button's changed transition
