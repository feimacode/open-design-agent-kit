## Why

Mobile is half of the app-screens surface, and none of it can go to code in the app's own stack. A mobile design can be promoted to a React web app, or turned into MUI or shadcn/ui components, but most of the builders who design phone screens with us ship them with Expo and React Native. `scan_open_design_app` already reads Expo Router routes and NativeWind styling (PR #88), so a builder can design from their Expo app and then can't promote back into it.

The getdesign.md Mobile Starter Kit shows the stack and the demand: Expo, React Native and NativeWind, 48 tokens, light and dark themes and eight type roles, sold at $249 to people who build with Claude Code, Codex or Cursor. Our kit is the step before that: designing the screens such a repo then builds.

This is the last "Next" item of the UI design use case study (2026-11-02), from the starter-kit section (gap R9).

## What Changes

- **A third component-set target, `nativewind`.** `prepare_open_design_component_library` with `library: "nativewind"` (and `auto` when `package.json` has `expo` or `react-native` with `nativewind`) builds the component set as React Native components styled with NativeWind classes. When `react-native-reusables` is installed, components wrap its primitives, as the `shadcn` target wraps shadcn/ui; otherwise they wrap React Native core (`Pressable`, `Text`, `TextInput`, `View`).
- **Theme from the design system.** Core maps the design system's tokens to a `tailwind.config.js` theme extension and a `global.css` with light and dark CSS variables, which NativeWind reads, deterministically, like the MUI and shadcn themes. Tokens with no slot are listed. A design system with only light tokens gets a derived dark set, marked as derived.
- **Native rules in the instructions.** Touch targets of 44 (iOS) or 48 (Android) points, `Pressable` states for pressed and disabled instead of hover, safe-area handling with `react-native-safe-area-context`, platform-specific shadows (`shadow-*` on iOS, `elevation` on Android), no web-only CSS (grid, `position: fixed`, `:hover`), and `accessibilityRole` and `accessibilityLabel` on every control.
- **Screens to Expo Router.** Promote of a mobile design or a flow into an Expo app writes screens under `app/` following its routes, with the flow's links as `router.push` and the shared tab bar as an Expo Router `(tabs)` layout.
- **Gallery.** A `ComponentGallery` screen (or Storybook for React Native when installed) shows every component in every state, as for the other targets.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `component-library-port`: a `nativewind` target with its detection, theme mapping, native rules, gallery, and Expo Router screens on promote.

## Impact

- `generation/libraryThemes.ts` (`COMPONENT_LIBRARIES` gains `nativewind`; theme mapping to Tailwind config and CSS variables), `generation/componentLibrary.ts` (detection, install command, instructions), `portToAppInstructions.ts` (Expo Router screens and links).
- `prepare_open_design_component_library` schema in `mcp-server/src/session.ts` and the VS Code tool.
- Docs `component-sets.md` (or the current component library guide), `promote-to-app-code.md`, `reference/tools.md`.
- Depends on `add-component-library-port` (active); its spec gains the new target's requirements.
