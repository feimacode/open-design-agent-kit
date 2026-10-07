## ADDED Requirements

### Requirement: 3D Object Skill
The catalog SHALL include a local `3d-object` skill producing a self-contained three.js scene (pinned `three@0.160.0` from jsDelivr) with either a procedural object or a user-supplied `.glb`/`.gltf` from the workspace, physically based materials using the design system's palette, studio lighting from a generated environment, a ground shadow, orbit controls, an optional transparent background and an auto-rotating turntable driven by `requestAnimationFrame`. The scene's canvas SHALL carry `data-od-webgl` and the page SHALL expose `window.odScene` with a `ready` promise that resolves after assets load and the first frame renders, and a writable `rotate` flag.

#### Scenario: Product shot from the user's model
- **WHEN** the user asks for a hero shot of `models/headphones.glb`
- **THEN** the brief SHALL direct the agent to load that file with GLTFLoader from the artifact's assets and to expose `odScene.ready`

### Requirement: WebGL-Aware Rendering
Export, the visual check and motion export SHALL launch the browser with software WebGL enabled when the artifact has a `[data-od-webgl]` element or imports `three`, and only then. When `window.odScene.ready` exists, loading SHALL wait for it within the readiness timeout; for still captures, `odScene.rotate` SHALL be set to `false` before capture when present.

#### Scenario: Export on a machine without a GPU
- **WHEN** a 3D object artifact is exported to PNG in a headless environment with no GPU
- **THEN** the scene SHALL render and the PNG SHALL NOT be blank

### Requirement: WebGL Check
Export and the visual check SHALL report `webgl` as an error for a `[data-od-webgl]` canvas whose WebGL context couldn't be created, and as a warning when the canvas's sampled pixels are uniform after readiness.

#### Scenario: Model failed to load
- **WHEN** the GLB path is wrong and the canvas stays a flat color
- **THEN** the check SHALL report a `webgl` warning naming the canvas, alongside the `broken-asset` finding for the model

### Requirement: Transparent Image Export
Image export SHALL accept `transparent: true`, which captures a PNG without the page background, and SHALL warn when every pixel of the result is opaque.

#### Scenario: Product cut-out
- **WHEN** a 3D object with a transparent scene background is exported with `transparent: true`
- **THEN** the PNG SHALL have transparent pixels around the object

### Requirement: Turntable Guidance
The skill SHALL document turntable exports as `format` `mp4` or `gif` with `duration` equal to one full rotation at the scene's rotation speed, so the loop is seamless.

#### Scenario: Turntable GIF
- **WHEN** the user asks for a turntable GIF of the scene
- **THEN** the agent SHALL export with `format: "gif"` and a `duration` of exactly one rotation
