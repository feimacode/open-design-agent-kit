## 1. Motion audit

- [ ] 1.1 `export/motionAudit.ts`: play load, hover and focus (up to 10 controls) and scroll windows on the virtual clock; inventory from `getAnimations()` plus sampled computed styles for script-driven motion
- [ ] 1.2 Rules: `motion-slow-ui`, `motion-linear-ui`, `motion-layout-property`, `motion-crowded`, `motion-off-vocabulary`; extend the reduced-motion pass to `motion-no-reduced-path`; limits table in the overlay; unit tests
- [ ] 1.3 Film detection (video mode, `data-duration` storyboards) applies only the film rules

## 2. Filmstrip

- [ ] 2.1 Beat boundaries from `data-duration` frames or animation start and end times; up to 12 labelled frames on one sheet; `filmstrip` argument on MCP, VS Code and CLI
- [ ] 2.2 Critic input includes the filmstrip and motion findings

## 3. Motion verbs

- [ ] 3.1 `calmer`, `snappier`, `smoother` definitions in `steering-verbs.md`
- [ ] 3.2 Measurements inside the scope and animation-inventory comparison outside it in `editGuard.ts`; `edit-no-effect` for motion verbs
- [ ] 3.3 Verb buttons in the preview comment panels; `open-design-edit` routing ("too much", "too slow", "janky")

## 4. Tests and docs

- [ ] 4.1 Fixtures: slow hover, linear button, width animation, ten cards entering at once, GSAP entrance without reduced motion, a film with long arrivals (no UI findings)
- [ ] 4.2 Eval brief: a landing page, then "the hero animation is too much" → `calmer`
- [ ] 4.3 Checks reference, steering guide, CHANGELOG
