## Why

App screens are judged by one question: can someone finish the task? The kit doesn't ask it. The check measures how the screen looks and behaves (overflow, contrast, states, dead controls), the flow check finds broken links and dead ends, and the critic scores purpose, type, colour, layout, copy, states and fit. Nobody asks "can a user change their plan in three steps?", and nobody notices a first screen where a hero image pushes the content and the only action below the fold.

This is the second "Next" item of the UI design use case study (2026-11-02), gap R7. It takes XIAS's `verify_screen_economy` (the first screen shows real content and a way to act) and its fidelity ladder (each level names what to validate, such as "can users complete the primary task?").

## What Changes

- **Tasks in the brief and the flow plan.** `prepare_open_design_brief` takes an optional `tasks` list for an app screen or flow: each task has a name ("Change plan to Team"), a start screen, an end screen or end condition, and an optional step budget. The app-screens questions ask for the main task when the request doesn't name one, and the agent can propose it as an assumption. Tasks are stored on the flow plan (`metadata.flow.plan.tasks`), or on a single screen's manifest.
- **Task path in the collection check.** For each task, the check finds the shortest path through the flow's real links from the start screen to the end screen and reports `task-unreachable` when there is none, and `task-too-long` when it takes more steps than the budget. The flow map draws each task's path in its own colour.
- **Screen economy.** The check reports `screen-economy` (warning) when the first viewport of an app screen shows no primary action, or when a single image or empty box takes more than half of it.
- **Walkthrough in the critic.** The critic gets the tasks and, for each, walks the screens in order on the screenshots: which control is the next step, whether it's the most prominent action on that screen, whether its label says where it leads, and whether there is a way back. A new rubric area `task` holds these findings, and a task the critic can't walk makes the verdict at least `polish`.

## Capabilities

### New Capabilities
- `task-walkthrough`: tasks in the brief and plan, `task-unreachable`, `task-too-long`, `screen-economy`, the critic's `task` area and the walkthrough.

### Modified Capabilities
- `screen-flows`: the flow plan carries tasks, and the flow map draws their paths.

## Impact

- `generation/flowPlan.ts` (tasks in the plan and validation), `prepare_open_design_brief` and `register_open_design_artifact` schemas in `mcp-server/src/session.ts` and the VS Code tool.
- `export/flowCheck.ts` (shortest path), `export/flowMap.ts` (task paths), `checkArtifact.ts` or `screenChecks.ts` (`screen-economy`).
- Critic: `packages/content/local/prompts/critique.md` rubric (and the plugin agent copy through `critiqueRubric.mjs`), critic input in `workspace/critique.ts`.
- App-screens question set and templates; docs `app-screens.md`, `reference/tools.md`.
