<!-- Kit craft doc (openspec add-motion-vocabulary). Adapted from upstream open-design's `skills/motion-design/SKILL.md` (nexu-io/open-design @ 0701042f3d2957fe485bb8508652e40ec6dae832, Apache-2.0), with the parts about upstream's own app, player and export route replaced by this kit's tools. Attached to video and motion skills through craft-requires.json. -->
# Motion film craft

A short film (a launch reel, an explainer, a showreel, an animated post) is
judged by whether viewers understand and remember one idea while wanting to
watch it move. These rules cover films. For motion inside a UI (hover, state
changes, page transitions) follow `animation-discipline` instead.

## Resolve the brief without stalling

Use the user's assets, script, references and earlier decisions first.
Settle: message and audience, where it will play (and so the aspect),
duration, exact copy, must-show assets, visual direction, sound, and output.
Ask only when a missing answer would change the story or make the film
misleading; otherwise pick a coherent direction and state the assumption in
one line.

For an unconstrained short film, start from 12 to 18 seconds, 16:9 at
1920×1080, 30 fps, no invented voiceover. A portrait social brief is 9:16.
The brand, platform, timing and copy the user gives override these. Never
invent product claims, metrics, testimonials or assets.

## Write a beat map first

Before any code, write one line per beat:

`time → viewer takeaway → focal object → transformation → copy/sound → exit`

The time budget includes entrances, reading holds and exits. Choose one
recurring object, shape, line or typographic motif that connects the beats.
Each movement should change the meaning; four unrelated title cards lose the
mechanism.

## Art direction before movement

Make one strong representative still before animating every scene. Decide
the hierarchy, crop, type, palette, texture and focal object. A weak still is
not rescued by particles, camera shake or effects.

- Use a specific visual premise tied to the subject. "Premium", "cinematic"
  and "modern" are not art directions.
- Type is a graphic object: scale, alignment, line breaks, negative space.
  Wait for fonts to load before the first frame matters.
- Keep a small palette with intentional contrast, from the active design
  system. No default neon gradient, glass cards or glowing orb.
- Choose one material logic (editorial ink, precise instrument, paper,
  collage, vector geometry, painterly field) and keep its lighting and edges
  through the film.
- Supplied screens and logos keep their proportions and content. Crop
  deliberately; never stretch. Keep chart axes, units and values correct for
  the whole animation.

## Choreograph attention

Choose the lead action and let supporting motion answer it. Three possible
layers, not three required effects: the primary action carries the idea, a
secondary action shows weight or cause, and ambient motion only when a scene
needs life. Reading holds may be completely still.

Starting ranges for films (not UI limits):

| Job | Range | Shape |
| --- | --- | --- |
| Small accent | 120–220 ms | decisive snap, then settle |
| Main element arriving | 350–650 ms | quick travel, controlled landing |
| Shape transformation | 600–1200 ms | readable setup and resolution |
| Large reveal or camera move | 900–1800 ms | sustained, clear destination |

Take the actual values from the Motion section of the brief when it has one
(`--motion-slow` for arrivals, `--motion-scene` for transformations,
`--ease-enter` for arrivals, `--ease-exit` for exits). Ease out on arrival,
ease in on a motivated exit, accelerate and decelerate smoothly for a camera.
Constant speed is for conveyors, clocks, scans and deliberate mechanics.
Playful material may overshoot; precise instruments shouldn't bounce.

- Give fast actions a tiny anticipation and recovery, so nothing teleports.
- Move on arcs for physical motion, straight lines for precision.
- Transition for a reason: a match cut on a shared shape, tracking an object
  into the next scene, a meaningful mask, or a clean cut.
- Keep velocity and direction across hand-offs.
- Alternate action and rest. Save the strongest transformation for the
  central idea.
- End on purpose: resolve the motif and hold the final message. A loop needs
  the same start and end state and speed, with no doubled pause.

## Make it exportable

`export_open_design_artifact` renders films on a virtual clock, one frame at
a time, so a film must survive seeking:

- No scene state from `Date.now()`, no unseeded randomness, no simulation
  that only works when played from zero.
- Drive everything from one master timeline (CSS animations, the Web
  Animations API, or one GSAP timeline). Don't run a second clock.
- Never make visible content depend on timeline callbacks; define positions
  and reveals as functions of time.
- For a storyboard, put `data-duration` (ms) on each frame so the export
  finds the length.
- Keep any player controls outside the exported frame.
- With reduced motion, show a useful still poster and let the viewer start
  playback.

## Sound

Decide voice, music and effects separately, in the beat map. Use only sound
files the user supplies or confirms they may use; never invent an asset URL.
Declare the decision with `<meta name="od-motion-audio" content="required">`
or `content="none"`, and place each track as
`<audio src="assets/music.wav" data-start="0" data-duration="15" data-volume="0.3"></audio>`
with local files inside the design's folder. Keep music under speech and put
accents on beats from the beat map, not guessed times. A silent film is fine
when that is the choice; say so.

Spoken words and on-screen speech need captions: pass an SRT or WebVTT file
as `captions` to the export, or mark cues in the page with
`data-od-caption data-start data-duration` (seconds). Keep each cue at or
under 20 characters a second; the export draws them inside the safe area
and writes a `.vtt` beside the video.

## Check the key moments

A file that plays is not proof the film works. Check the opening, the key
transformation, a transition, a text hold and the ending at the real size
with `check_open_design_artifact` and `at` (or `filmstrip: true`). Fix the
biggest visible problem, then re-check only the moments it touched. Say what
you looked at; don't claim measurements you didn't make.
