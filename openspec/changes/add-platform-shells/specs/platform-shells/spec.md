## ADDED Requirements

### Requirement: Device Attribute

A screen SHALL declare its device with `data-od-device` on `<body>`, one of `iphone`, `android`, `tablet` or `desktop-app`, with `data-od-orientation` (`landscape` or `portrait`, default `landscape`) for a tablet, `data-od-window` (`mac` or `windows`, default `mac`) for a desktop app, and `data-od-theme` (`light` or `dark`) for the status bar.

#### Scenario: Android screen
- **WHEN** a screen's body has `data-od-device="android"`
- **THEN** the kit treats it as a 412 by 915 px Android phone screen

### Requirement: Kit-Drawn Shells

Wherever the kit serves a design (preview, check, export, MCP App, one-file prototype), it SHALL draw the device shell around a screen that declares a device: status bar, camera cutout, home indicator or gesture bar and rounded corners for phones and tablets, and a title bar with the app's name and Mac or Windows window controls for a desktop app. The shell SHALL be generic (no logos or model names), marked preview-only so saving from the preview keeps the source without it, and SHALL contain fixed-position elements of the design.

#### Scenario: Same frame on every screen
- **WHEN** four screens of a flow declare `data-od-device="iphone"`
- **THEN** all four show the same kit-drawn frame, and none of the screen files contains frame markup

#### Scenario: Tab bar stays inside the frame
- **WHEN** a screen with a `position: fixed` bottom tab bar declares a device
- **THEN** the tab bar is drawn at the bottom of the device screen, inside the shell

### Requirement: Device Instructions

The brief for an app-screens or mobile entry with a platform answer SHALL tell the agent to set the device attribute and not draw a device frame, status bar or window title bar itself, and SHALL give the device's width, touch targets and navigation pattern; a design that sets the attribute and also draws a frame SHALL get a `device-double-frame` warning.

#### Scenario: Android answer
- **WHEN** the user answers "Android" to the platform question
- **THEN** the brief says to set `data-od-device="android"`, use 48 px touch targets and Material navigation, and not to draw a frame

### Requirement: Shell in Exports

PNG and PDF exports of a device screen SHALL include the shell unless `shell: false` is passed; the site export and promote to code SHALL never include it.

#### Scenario: Store screenshot without the frame
- **WHEN** the user exports an Android screen as PNG with `shell: false`
- **THEN** the image is the 412 px wide screen alone
