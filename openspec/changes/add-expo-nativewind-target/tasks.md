## 1. Target and theme

- [x] 1.1 `nativewind` in `COMPONENT_LIBRARIES`; detection from `expo`, `react-native`, `nativewind` and `react-native-reusables` (`@rn-primitives/*`); NativeWind version read
- [x] 1.2 Theme mapping: Tailwind theme extension and light and dark CSS variables in `global.css`; derived dark tokens marked; unmapped tokens listed; unit tests

## 2. Instructions

- [x] 2.1 Native rules section (touch targets, Pressable states, safe area, shadows and elevation, no web-only CSS, accessibility props)
- [x] 2.2 Wrap react-native-reusables when installed, core components otherwise; install command only with the user's go-ahead
- [x] 2.3 Gallery screen or React Native Storybook

## 3. Promote

- [x] 3.1 Mobile designs and flows into an Expo app: screens under `app/`, links as `router.push`, shared tabs as a `(tabs)` layout

## 4. Docs and evals

- [x] 4.1 Component set and promote guides, `reference/tools.md`
- [x] 4.2 Eval fixture: a small Expo + NativeWind app (`evals/fixtures/habit-expo`) and brief `habits-expo`; one live run: the agent designed iPhone and Android screens from the app's tokens and promoted them into NativeWind components (Pressable states, 48 pt targets, mocks), 0 check errors
