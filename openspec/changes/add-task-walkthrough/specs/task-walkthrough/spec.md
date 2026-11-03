## ADDED Requirements

### Requirement: Tasks in the Brief

`prepare_open_design_brief` SHALL accept up to five tasks for an app screen or flow, each with a name, a start screen, an end screen or end condition and an optional step budget; the instructions SHALL list them, and registration SHALL store them with the flow plan (`flow.tasks`), and a single screen's task as the brief's `task` answer. When an app-screens request names no task, the questions SHALL ask for the main one.

#### Scenario: Task recorded on the plan
- **WHEN** the agent prepares a billing flow with the task "Change plan to Team" from `billing` to `plan-changed` in at most 3 steps
- **THEN** each screen's instructions list the task, and the registered flow plan holds it

### Requirement: Task Path Findings

The collection check SHALL find, for each task, the shortest path over the links present in the screens (shared navigation included) and SHALL report `task-unreachable` when no path exists and `task-too-long` when the path has more steps than the budget, naming the path it found.

#### Scenario: Missing link breaks the task
- **WHEN** the plan links "Change plan" to the plans screen but the billing screen has no such link
- **THEN** the check reports `task-unreachable` for "Change plan to Team"

#### Scenario: Too many steps
- **WHEN** the shortest path from billing to plan-changed is four screens with a budget of three
- **THEN** the check reports `task-too-long` with the four-step path

### Requirement: Screen Economy

For app screens, the check SHALL report `screen-economy` when the first viewport has no visible enabled action, or when one image, video, canvas or background-image element covers more than half of it; screens marked `data-od-screen="splash"` SHALL be exempt.

#### Scenario: Hero pushes the action down
- **WHEN** an app screen's first viewport is 70% image and its only button is below the fold
- **THEN** the check reports `screen-economy`

### Requirement: Critic Walkthrough

The critic SHALL receive the tasks and their paths and SHALL walk each one on the screenshots, judging whether the next step's control is visible, the most prominent action on its screen, labelled with where it leads, and whether a way back exists; findings SHALL use the area `task`, and a task the critic cannot walk SHALL make the verdict at least `polish`.

#### Scenario: Secondary-looking next step
- **WHEN** the step to the plans screen is a small grey text link under a large "Download invoice" button
- **THEN** the critic reports a `task` finding on that screen with a fix that makes the step the primary action
