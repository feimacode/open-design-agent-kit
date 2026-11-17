<!-- Kit craft doc (openspec add-reference-video-replication). Adapted from upstream open-design's `skills/motion-design/references/replicate.md` (nexu-io/open-design @ 0701042f3d2957fe485bb8508652e40ec6dae832, Apache-2.0), with upstream's own commands (`od media reference`, `od media compare`) replaced by this kit's tools and its link downloads left out. Added to a brief when `prepare_open_design_brief` gets a `referenceId`. -->
# Building from a reference video

The user attached a video they like and asked for a film like it. These rules
apply on top of `motion-film`; where they disagree, these win.

## The one rule that matters

**Measure the timeline; never estimate it.** Eyeballing beat boundaries from
a contact sheet has been wrong by more than a second in a 15-second film.
`inspect_open_design_reference_video` gives the measured cuts; build every
timing from them.

## Precedence

When instructions conflict, decide in this order:

1. What was measured in the reference: timing, motion, layout, palette mood.
2. What the user said about the reference: what to keep, what to change.
3. Your own taste, last.

Say in the final reply what you changed from the reference and why.

## 1. Read the measurements

`facts.json` holds duration, size, fps, whether there is sound, and `cuts` in
seconds. `contact.jpg` shows the film at a glance; `frames/` holds a frame
early in every shot plus an even grid. View the contact sheet first, then the
frames. Hard cuts alone are not enough: motion graphics change type, layout
and colour inside a single shot, so the frames are the evidence and the cut
list is a hint. For a moment the frames miss, grab one yourself:
`ffmpeg -ss <t> -i <reference video> -frames:v 1 out.png`.

Write the beat map before any code: for each beat its start and length (from
the cuts), what fills the frame, the copy, palette, type, the motion
mechanism (what transforms into what) and how it exits. Make each beat a
`data-duration` frame (or a position on one timeline) with the measured
length.

## 2. Fidelity follows the request

- **"Like this, for my brand"** (the default for "like this"): keep the
  reference's form and feel (beat structure, rhythm, motion grammar,
  composition) and take colours, type and motion values from the active
  design system. An adapted film doesn't carry the reference's words,
  phrasing, logo, footage, people or places. A scene whose content only holds
  for the reference's brand is rewritten for the user's brand in the same
  form, or cut with its time given to a neighbour.
- **"Make the same film"**: rebuild it as it is (the same beats, timing,
  copy, composition, palette and motion) only when it is the user's own
  material or they say they have the right to. Otherwise, say so and offer the
  adapted version.

## 3. Pictures and type

Anything that performs (a wordmark arriving letter by letter, a shape that
morphs) is rebuilt in HTML, SVG or canvas. A still from the reference may be
cut into `assets/` only when the user says it is theirs; otherwise rebuild it
or use a neutral stand-in of the same shape. The reference video, and whole
reference frames used as a backdrop, never go into the film. Match the
reference's type with the design system's fonts; when there is no design
system, pick the closest freely licensed family and say which.

## 4. Check against the reference

Check the design with `check_open_design_artifact` and the `referenceId`. It
captures the design at each reference cut and pairs it with the reference's
frame, and reports `reference-timing-drift` for a beat more than 0.25 s off.
Judge the pairs by eye in this order: beat timing, composition, palette, type,
then the state of the motion. Fix the single largest real difference and
check once more. Don't "fix" a difference the user asked for.

## 5. Sound

The reference's soundtrack (`audio.wav`) is part of someone else's work. Use
it only when the user confirms they own it or may use it; then place it as
one `<audio>` track from 0 (copied into the design's folder). Otherwise follow
the sound rules in `motion-film`: the user supplies a track, or the film is
silent.
