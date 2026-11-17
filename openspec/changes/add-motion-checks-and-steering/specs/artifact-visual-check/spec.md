## ADDED Requirements

### Requirement: Motion Findings

For pages and mini-apps, `check_open_design_artifact` SHALL play the design on the virtual clock through a load window, hover and focus on up to 10 interactive elements, and scroll steps, and SHALL inventory the animations that run (from `document.getAnimations()`, plus sampled computed styles for script-driven motion, marked as inferred). It SHALL report `motion-slow-ui` for UI transitions over 500 ms, `motion-linear-ui` for linear easing on UI transitions other than spinners, progress indicators and marquees, `motion-layout-property` for animating layout properties instead of `transform` or `opacity`, `motion-crowded` when more than 6 elements start moving within 100 ms outside a stagger, and `motion-off-vocabulary` for durations or easings more than 10% away from the design system's motion vocabulary, all as warnings. Entrance or looping motion still running with reduced motion on SHALL be the error `motion-no-reduced-path`. Films SHALL get only `motion-crowded`, `motion-off-vocabulary` and `motion-no-reduced-path`.

#### Scenario: Slow linear hover
- **WHEN** a button's hover transition is `background 800ms linear`
- **THEN** the check SHALL report `motion-slow-ui` and `motion-linear-ui` naming the button

#### Scenario: Film arrival
- **WHEN** a `video-hyperframes` film moves its title in over 1200 ms
- **THEN** the check SHALL NOT report `motion-slow-ui`

#### Scenario: GSAP entrance ignores reduced motion
- **WHEN** a page's sections slide in with GSAP and still slide with reduced motion emulated
- **THEN** the check SHALL report `motion-no-reduced-path` as an error

### Requirement: Filmstrip

`check_open_design_artifact` SHALL accept `filmstrip: true` for animated designs and return one image of up to 12 frames, each labelled with its time, taken at beat boundaries: the starts of `data-duration` frames, or the start and end times of the animations found. The filmstrip SHALL count as one image within `maxImages`, and SHALL be included in the critic's input.

#### Scenario: Storyboard film
- **WHEN** a film with eight `data-duration` frames is checked with `filmstrip: true`
- **THEN** one image SHALL be returned showing each frame's start, labelled with its time
