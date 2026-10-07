## 1. Rendering

- [ ] 1.1 WebGL detection plus opt-in SwiftShader launch args in `openArtifactPage`; `odScene.ready` wait and `rotate = false` for stills in `loadPage`
- [ ] 1.2 `webgl` page check (context failure, uniform-pixel sampling) in export and the check; browser tests with a working scene and a broken one
- [ ] 1.3 `transparent` image option (`omitBackground`, forced PNG, opaque warning) in core, tool schemas and CLI `--transparent`; tests

## 2. Skill

- [ ] 2.1 `local/skills/3d-object/SKILL.md` (procedural, extruded-logo and GLB paths, PBR from the design system, studio environment, ready contract, polygon budgets, turntable guidance)
- [ ] 2.2 Three examples (procedural object, extruded logo, GLB product with a small bundled model) that pass the visual check headlessly
- [ ] 2.3 3D object surface → `ready`; instructions; regenerate host content

## 3. Docs and verification

- [ ] 3.1 Guide "3D objects and product shots"; troubleshooting for `webgl`; reference; docs check
- [ ] 3.2 Manual: a product shot from a user GLB → transparent PNG, and a turntable MP4 (after add-motion-export), on a machine without a GPU
