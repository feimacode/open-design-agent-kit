// Upstream skill text is vendored verbatim and never edited (see
// packages/content/local/README.md), but some of it assumes Open Design's
// daemon (`$OD_BIN media …`), which this project deliberately doesn't ship.
// Rather than patching vendored files, prepare_open_design_brief appends a
// host-override section after the skill text: a daemon-free equivalent for
// skills we've adapted, or an explicit "not available here" notice for any
// other skill that still references the daemon — so the model neither
// hunts for a missing binary nor silently improvises a substitute.

// Matches the daemon-invocation forms upstream skills actually use.
const DAEMON_REFERENCE = /\$\{?OD_(?:NODE_)?BIN\b|\$\{?OD_HYPERFRAMES_BIN\b|\bOD daemon\b|\bod media\b/i;

const HYPERFRAMES_OVERRIDE = `This host has **no Open Design daemon**. Ignore every instruction above that uses \`$OD_BIN\`, \`$OD_NODE_BIN\`, \`$OD_HYPERFRAMES_BIN\`, \`$OD_PROJECT_DIR\`, \`od media scaffold\` / \`generate\` / \`wait\`, or a \`.hyperframes-cache\` directory. Everything else in the skill (composition rules, timing attributes, GSAP timeline, visual guidance) still applies. Use the HyperFrames CLI directly instead:

1. **Composition directory = the artifact directory** from the Output section below (e.g. \`.open-design/<slug>/\`). The composition's \`index.html\` is the artifact's entry file.
2. **Scaffold** (fast path): \`npx hyperframes init <artifact-dir> --non-interactive --example blank\` (add \`--resolution portrait\` for 1080×1920 Shorts/Reels). Then edit only \`<artifact-dir>/index.html\`, as the skill's fast path describes. Write from scratch only when the skill says to.
3. **Size and timing**: default to **1920×1080 at 30 fps** (YouTube landscape) unless the user asks for vertical (1080×1920) or square.
4. **Validate**: \`npx hyperframes check <artifact-dir>\` (it runs lint first). Fix any persistent findings before rendering.
5. **Register** the artifact now: call register_open_design_artifact with \`<artifact-dir>/index.html\` as the entry path and kind \`html\`.
6. **Check FFmpeg**: run \`ffmpeg -version\`. If it fails, **stop** and tell the user to install FFmpeg. Do not try another render path.
7. **Render** from your own terminal: \`npx hyperframes render <artifact-dir> --quality high --output <artifact-dir>/exports/<descriptive-name>.mp4\`. It can take minutes: run it as a long-running or background command and let it finish. If your shell runs inside a sandbox and the render hangs partway through frame capture (headless Chrome is known to stall under some agent sandboxes), re-run the same command outside the sandbox, or ask the user to run it.
8. If a flag is rejected, run \`npx hyperframes render --help\` and adapt. Don't switch to a different renderer.
9. Report the MP4's workspace-relative path to the user.`;

/** Skill dirId → daemon-free replacement for the skill's daemon-backed steps. */
export const HOST_OVERRIDES: Readonly<Record<string, string>> = {
  hyperframes: HYPERFRAMES_OVERRIDE,
};

const DAEMON_UNAVAILABLE_NOTICE = `Some steps in the skill text above call Open Design's daemon (\`$OD_BIN\`, \`od media …\`, or "the OD daemon"), for example to generate images, video, or audio with a model provider, or to serve a live data connector. **That daemon doesn't exist in this host.** Do not look for it, install it, or substitute a different tool on your own. Build everything the skill describes that doesn't need the daemon (layout, HTML, CSS, copy). For any step that does need it, tell the user plainly that it isn't available here, and leave a clearly labelled placeholder in the artifact where its output would go.`;

export function referencesDaemon(skillBody: string): boolean {
  return DAEMON_REFERENCE.test(skillBody);
}

/**
 * The host-override markdown to append after a skill's text, or undefined
 * when none is needed. `skillDirId` is the bare catalog id (SkillDetail.id),
 * not the `od:<mode>:` public form.
 */
export function hostOverrideFor(skillDirId: string, skillBody: string): string | undefined {
  const override = HOST_OVERRIDES[skillDirId];
  if (override) return override;
  if (referencesDaemon(skillBody)) return DAEMON_UNAVAILABLE_NOTICE;
  return undefined;
}
