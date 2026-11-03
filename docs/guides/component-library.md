# Build a component set

When a design is right, turn it into reusable components for your React app instead of one page: a themed button, card, nav bar, form field and so on, on **Material UI themed to Material 3** or on **shadcn/ui**, or, for an Expo or React Native app, as **React Native components styled with NativeWind**, with a gallery that shows every state.

## Before you start

- One or more registered designs you're happy with, or a [collection](generate-a-design.md#collections) of screens.
- A React app in the workspace, or an Expo / React Native app. MUI, shadcn/ui or NativeWind doesn't need to be installed yet; the agent asks before installing it.

## Steps

1. Ask:

   > Make Material 3 components for my React app from the pricing page.

   or, for every screen of a collection:

   > Build a shadcn component set from the checkout screens.

2. The agent calls [`prepare_open_design_component_library`](../reference/tools.md#prepare_open_design_component_library). "Material 3" and "MUI" mean `mui`; with no library named, it picks from your `package.json` and asks once if it can't tell.
3. **You approve the list.** The agent writes a `components.md` next to the design, listing each component with the design parts it comes from, its variants, props and states, and asks before writing any code. Edit the file or reply with changes.
4. The agent writes:
   - **A theme** generated from the design system's tokens (colours, type scale, corner radius, spacing): `theme.ts` with `createTheme` for MUI, or the `:root` variables for shadcn/ui. Every component reads from it, so changing the brand later is one file.
   - **The components**, each built on the library's own component (MUI's `Button`, shadcn's generated `button`), with variants as props and no hard-coded colours or sizes.
   - **A gallery**: Storybook stories if the app has Storybook, otherwise a `ComponentGallery` component showing every component in every state (default, hover, focus, disabled, loading, error, empty).
5. The agent runs your app's type check or build, fixes what it reports, and records the set on the design.

> **In VS Code:** the **Promote to code** button in the [preview](preview-comments-edit.md) toolbar asks **One component** or **A component set**; the second prefills this request.

## What you get

A folder of components (by default `src/components/<DesignName>/`), a theme file and a gallery. What it deliberately doesn't do:

- **Routing isn't wired up.** The gallery isn't added to your routes or menus; the agent tells you how to view it.
- **Nothing is deleted on a re-run.** Ask again after changing the design and the agent updates the same set. Components whose source is gone from the design are listed for you to decide about.

## Expo and React Native

In an app that depends on `expo` or `react-native`, the set is always NativeWind (`library: "nativewind"`, or `auto`); MUI and shadcn/ui are web libraries and are refused there.

- **Theme:** `global.css` with the design system's colours as CSS variables for light and dark (`:root` and `.dark:root`), and a `tailwind.config.js` extension that reads them (`bg-primary`, `text-muted-foreground`, `rounded-lg`, `font-sans`). When the design system has no dark tokens, the dark scheme is derived (neutrals mirrored, brand colours kept) and marked as a starting point.
- **Components:** built on [react-native-reusables](https://github.com/founded-labs/react-native-reusables) when the app has it, otherwise on React Native core (`Pressable`, `Text`, `TextInput`, `View`). States are default, pressed and disabled, not hover.
- **Native rules:** 44 (iOS) or 48 (Android) point touch targets, safe-area insets, `shadow-*` on iOS and `elevation` on Android, no web-only CSS, and accessibility roles and labels on every control.
- **Gallery:** a `ComponentGallery` screen (or React Native Storybook stories) in both colour schemes. It isn't added to `app/`, since every file there is an Expo Router route.

The kit can't render React Native, so the app's type check and the gallery on a device are how the set is verified. The setup steps follow NativeWind 4; with another version, the agent reads the app's existing setup first.

## Material 3 and MUI

MUI is themed with Material 3's colour roles (primary, on-primary, surface, on-surface, outline, error), type scale and shape. A few Material 3 components, such as the navigation rail and the segmented button, have no MUI counterpart, so the agent approximates them with MUI parts.

## Troubleshooting

- **"There is no theme source."** The design has no design system and its styles don't use the kit's token names. Pick a design system first (see [design systems](design-systems.md)), or extract one from your site.
- **"Component sets are built for React apps."** Vue, Angular, Svelte and Flutter aren't supported yet. [Promote to app code](promote-to-app-code.md) still ports a page into any framework.
- **The wrong app is used in a monorepo.** Name the folder: "put the components in `apps/web/src/components/ui-kit`".

## Related

[Promote to app code](promote-to-app-code.md) · [Design systems](design-systems.md) · [Generate a design](generate-a-design.md#collections)
