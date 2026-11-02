## ADDED Requirements

### Requirement: NativeWind Target

`prepare_open_design_component_library` SHALL accept `library: "nativewind"`, and `auto` SHALL pick it when the app's `package.json` has `expo` or `react-native` together with `nativewind`; components SHALL wrap `react-native-reusables` primitives when that package is installed and React Native core components otherwise.

#### Scenario: Expo app picked automatically
- **WHEN** the workspace app depends on `expo`, `react-native` and `nativewind` and the agent calls the tool with `library: "auto"`
- **THEN** the instructions target NativeWind

### Requirement: NativeWind Theme

Core SHALL map the design system's tokens to a Tailwind theme extension and light and dark CSS variables for NativeWind, list tokens with no slot, and derive a dark set when the design system has none, marking it as derived in the instructions and the record.

#### Scenario: Light-only design system
- **WHEN** the design system defines only light colours
- **THEN** the theme has light and dark variables, and the instructions say the dark ones were derived

### Requirement: Native Component Rules

Instructions for the NativeWind target SHALL require touch targets of at least 44 points on iOS and 48 on Android, pressed and disabled states through `Pressable`, safe-area handling, platform shadows (shadow on iOS, elevation on Android), no web-only CSS, and an accessibility role and label on every control.

#### Scenario: Button states
- **WHEN** the inventory lists a primary button with default, pressed and disabled states
- **THEN** the instructions ask for a `Pressable`-based component whose pressed and disabled styles come from the theme

### Requirement: Expo Router Screens on Promote

Promoting a mobile design or flow into an Expo Router app SHALL write each screen under `app/`, each flow link as navigation to the target screen's route, and shared tab navigation as a `(tabs)` layout.

#### Scenario: Three-tab flow
- **WHEN** the user promotes a flow whose shared navigation has Home, Library and Profile tabs
- **THEN** the app gets `app/(tabs)/_layout.tsx` with those three tabs and a screen file for each
