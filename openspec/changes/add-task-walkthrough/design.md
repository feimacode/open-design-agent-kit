## Context

A collection's flow plan has screens, links (from, trigger label, to) and shared navigation. `analyzeFlow` reads the real links in each screen (`href` and `data-od-goto`). The critic is a read-only agent that sees the check screenshots, the brief and the design system, and returns at most five findings in fixed areas.

## Goals / Non-Goals

**Goals:** the main task is named, the flow is checked against it mechanically, and the critic judges whether each step is obvious.

**Non-Goals:** running the prototype in a browser with simulated clicks (the shortest path over real links is enough to catch missing steps, and the critic judges clarity); usability testing with people; tasks for marketing pages.

## Decisions

### Path over real links, not the plan

The plan says what should be linked; the screens say what is. The task path uses the links found in the screens, so a planned link that wasn't built makes a task unreachable, which is the bug the user would hit. Navigation items from the shared nav count as links from every screen that includes it.

### Steps are screen changes

A step is one link followed. A form filled on one screen is one step, however many fields it has; the critic judges the form's effort, the check doesn't count fields.

### Single-screen tasks

A task on one screen (no flow) is the app-screens `task` answer, kept in the brief's answers; it has no path to check. It still goes to the critic, which judges whether the action that completes it is visible and primary on that screen.

### Screen economy measured, not guessed

The first viewport is measured in the browser: the bounding boxes of `button`, `a`, `[role=button]` and inputs that are visible and enabled, and the largest single `img`, `video`, `canvas` or element with a background image. No visible action, or one media element over 50% of the viewport area, gives the finding. Sign-in and splash screens marked `data-od-screen="splash"` are exempt.

## Risks / Trade-offs

- **Critic cost.** The walkthrough adds text to the critic's input, not images; it reuses the screenshots it already has. The five-finding cap stays, so a task finding replaces a weaker one.
- **Wrong task names.** If the agent invents the task, the walkthrough checks the wrong thing. The question set asks the user, and an assumed task is listed in the reply so the user can correct it.
