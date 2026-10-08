## 1. Clock and capture

- [x] 1.1 `export/motion/virtualClock.ts`: init script (time sources, rAF queue, timers, animation control, worker warning); unit tests in the browser
- [x] 1.2 `export/motion/captureFrames.ts`: step loop, two-frame settle, JPEG/PNG frames, cancellation; determinism test (two runs, identical frame hashes)
- [x] 1.3 Duration resolution (explicit, `data-duration`, animations, infinite fallback, cap) with tests on `video-hyperframes`, `frame-logo-outro`, `motion-frames`

## 2. Encoding

- [x] 2.1 `export/motion/ffmpeg.ts`: discovery (setting, env, PATH, Playwright cache, Homebrew, winget), encoder probe, structured errors; unit tests with fake executables
- [x] 2.2 Encoders over stdin: MP4 (x264), WebM (VP9 → VP8), GIF (palettegen/paletteuse); budget loops
- [x] 2.3 `mp4`, `webm`, `gif` in export (not in `EXPORTS_BY_KIND`: the manifest validator is vendored and only knows upstream export values); SwiftShader launch flags for motion exports; result text

## 3. Check and hosts

- [x] 3.1 `at` in `checkArtifact` (clock-stepped captures, labels, `maxImages`)
- [x] 3.2 VS Code setting `openDesign.export.ffmpegPath`, tool schemas (VS Code, MCP), CLI flags `--fps --duration --loop`
- [x] 3.3 Animation surface entries; instructions (export motion as MP4/GIF; check with `at`)

## 4. Docs and verification

- [x] 4.1 Guide "Export animations"; troubleshooting entries for `no-ffmpeg` and `ffmpeg-missing-encoder`; reference; docs check
- [ ] 4.2 Manual: export three frame templates and one WebGL hero to MP4/GIF; play them; compare runs
