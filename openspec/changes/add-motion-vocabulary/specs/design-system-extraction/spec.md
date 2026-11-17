## ADDED Requirements

### Requirement: Measured Motion Fills the Vocabulary

When an extracted brand has `brandKit.motion` with an observed entrance, the extraction SHALL set `--motion-distance`, `--motion-slow` and `--motion-stagger` from that entrance's distance, duration and sibling delay, with each source marked `observed`. When the site showed no motion, the brand's overlay SHALL set `bounce: 0` and the result SHALL say that the site is still.

#### Scenario: Staggered card reveal
- **WHEN** the extraction observed cards rising 24 px over 600 ms with 80 ms between siblings
- **THEN** the brand SHALL have `--motion-distance: 24px`, `--motion-slow: 600ms` and `--motion-stagger: 80ms`, each with an `observed` source

#### Scenario: Still site
- **WHEN** no animations were observed on load, hover or scroll
- **THEN** the brand overlay SHALL set `bounce: 0` and the result SHALL note that the site has no motion
