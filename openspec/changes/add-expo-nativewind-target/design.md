## Context

`componentLibrary.ts` detects MUI or shadcn in the app, maps the design system's tokens to the library's theme in `libraryThemes.ts`, and composes staged instructions (inventory with an approval stop, theme, components, gallery, verify and record). It writes no app code itself. `appScan.ts` already recognises Expo, React Native and NativeWind, and Expo Router file routes.

## Goals / Non-Goals

**Goals:** a mobile design or flow becomes a themed React Native component set and Expo Router screens that build and run in the user's Expo app.

**Non-Goals:** Flutter, SwiftUI or Jetpack Compose targets (later, one per change); running the app on a simulator in the check; haptic and motion presets (the starter kit's six haptic presets are a design-system addition for a later change).

## Decisions

### NativeWind, not StyleSheet

NativeWind keeps the theme as Tailwind tokens and CSS variables, which is how the kit's design systems already express tokens and how the shadcn target already works, so the mapping code is shared. A `StyleSheet` target would need a second theme format.

### Wrap react-native-reusables when it is there

It is the shadcn/ui counterpart for React Native, with the same component names and variant shapes, so an app that has it gets components that match its existing ones. Without it, the instructions use core components and never install a UI library without asking.

### Dark theme is derived only when missing

Mobile apps are expected to follow the system theme. When the design system has dark tokens in `tokens.css` (a `prefers-color-scheme: dark` media block, a `.dark` block or a `data-mode="dark"` block) they are used as is, falling back to the light value for any token the dark block doesn't set. When it has none, the theme mirrors the lightness of the neutral slots (background, foreground, card, muted, border and so on) and keeps brand colours as they are; `global.css` carries a DERIVED comment and the instructions tell the agent to say so to the user, so a designer can replace them.

### Promote writes routes from the flow

A flow plan already has screens, links and shared navigation. Screens map to `app/<screen-id>.tsx`, shared tab navigation to `app/(tabs)/_layout.tsx`, and each link to `router.push('/<screen-id>')`, so the promoted app is clickable like the prototype.

## Risks / Trade-offs

- **NativeWind versions.** v4 and v5 configure differently. Detection reads the installed version and the instructions name the matching setup; an unknown version gets the v4 setup and a note.
- **No visual verification.** The check can't render React Native. Verification is the app's type check and, when the user runs it, the gallery screen; the instructions say so.
