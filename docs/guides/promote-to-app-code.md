# Promote to app code

When a prototype is right, turn it into real code in your app: idiomatic components that follow your codebase's own conventions, not a paste of the prototype's HTML.

This guide ports one page into one component. For a reusable set of components and a theme on MUI (Material 3) or shadcn/ui, see [Build a component set](component-library.md).

## Before you start

- A registered artifact you're happy with.
- An app in the same workspace (React, Vue, Next.js, Svelte and so on).

## Steps

1. Ask:

   > Turn the pricing page into a real component in our app, like our FeatureGrid.

2. The agent calls [`port_open_design_artifact_to_app`](../reference/tools.md#port_open_design_artifact_to_app) with:
   - `referenceComponentPath`: an existing component to follow for styling approach, file layout and conventions. If you don't name one, the agent finds a similar component itself.
   - `targetComponentPath`: where the new code goes. A path is suggested if you don't give one.
3. The agent writes the new component with its own tools. It rebuilds the design in your app's styling system rather than copying the prototype's CSS.

When the design was built on a design system [taken from your app](design-from-your-app.md), its parts are marked with your components (`data-od-component="Button"`): the agent imports those from where the scan found them and writes new components only for parts marked `new:` and unmarked ones.

When the design binds to [sample data](app-screens.md#sample-data), the agent keeps it: each list becomes `mocks/<list>.ts` with its records and a TypeScript type inferred from them, and one data module (such as `src/lib/data.ts`) returns them, with `// TODO(data): replace with your API` where real data plugs in. Components read records through that module, so the promoted screens run on the same data the design showed. Component sets do the same.

> **In VS Code:** the **Promote to code** button in the [preview](preview-comments-edit.md) toolbar asks **One component** or **A component set** and prefills the matching request.

## What you get

A new component file in your app. What it deliberately doesn't do:

- **Routing and navigation aren't wired up.** Adding the page to routes or menus touches the rest of the app, so that's left for you to do and review.
- **It runs once.** If you keep iterating on the prototype, promote it again.

## Related

[Build a component set](component-library.md) · [Generate a design](generate-a-design.md#grounded-in-your-app) · [Preview, comment and edit](preview-comments-edit.md)
