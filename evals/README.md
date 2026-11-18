# Evals

A fixed set of briefs, run the same way before and after a change that claims to make designs better (checks, skills, craft docs), and scored with the kit's own tools. See the [contributing guide](../docs/contributing/README.md#evals) for when a PR needs one.

For the website extraction's own benchmark (real sites, no agent), see [extraction/README.md](extraction/README.md).

## Briefs

`briefs/*.yaml`, one file per brief, the file name matching its `id`. Sixteen cover the main surfaces (poster, landing page, deck, shop pack, card set, dashboard, an app settings screen, an orders table, an Android screen, an iPad screen, a sign-in flow, a billing screen designed from a small Next.js + shadcn app in `fixtures/acme-billing`, and a habit screen turned into NativeWind components for a small Expo app in `fixtures/habit-expo`, a redesign of the small restaurant site in `fixtures/trattoria-site`, and two that steer one part of a finished design with a follow-up message: the pricing section of a landing page made bolder, an orders table made roomier) and two are deliberately vague, to see whether the agent asks the right few questions. Three build portfolios from a work library: `portfolio-site` and `portfolio-interview` (a 45-minute deck) from `fixtures/portfolio-library`, a product designer's three projects with measured, estimated and qualitative outcomes and an unlisted project with an internal screen; and `portfolio-site-brand` from `fixtures/portfolio-library-brand`, a brand designer's two projects. Two tailor a version: `portfolio-job-target` (a PDF for a pasted job ad) and `portfolio-school-target` (a school's 6 pieces, 5 MB images and a 10 MB PDF). Compare the two sites' contact sheets for sameness: two designers' portfolios should differ in structure and picture rhythm, not only colour.

```yaml
id: gig-poster
request: "Make a poster for our jazz night at The Blue Room on 4 May"   # what a person would type, not a tuned prompt
vague: false                       # optional; true for the briefs that should get questions
expect:
  surface: poster                  # the surface the request should land on ("any" for vague briefs)
  skills: [poster-hero, magazine-poster, image-poster]   # skills that count as the right route; others get a ⚠
  questions: { max: 1 }            # how many questions are reasonable; outside the range gets a ⚠
designSystem: null                 # a design system id to name, or null to exercise the recommender
fixture: acme-billing              # optional; a folder in evals/fixtures/ copied into the workspace first (an app to design from)
site: trattoria-site               # optional; a folder in evals/fixtures/ served on 127.0.0.1 for the run, its address put where the request says {{site}} (a website to audit or redesign)
answers:                           # what the "user" says when asked; anything else is "you pick"
  where: "Both: A3 print for the venue and a version for Instagram"
followUps:                         # optional; later messages in the same conversation, sent once a design exists (e.g. a steering edit)
  - "Make the headline bolder"
must:                              # two or three things a reviewer ticks on the contact sheet
  - "Date, time and venue readable from 3 m"
```

When a surface is added, add or update a brief for it.

## Running

```bash
npm run evals                                    # every brief, twice (32 agent runs)
npm run evals -- --only gig-poster --repeat 1    # one quick look
npm run evals -- --label "before add-taste-checks"
npm run evals -- --score-only ~/designs          # score designs made in Desktop or Codex
npm run evals -- --dry-run                       # list the runs, run nothing
```

With the default `--agent claude`, agent runs need Claude Code (`claude`) on `PATH`, signed in. Every run needs a Chrome, Edge or Chromium for the checks. Each run:

1. compiles `packages/mcp-server` and loads this checkout's plugin with that server (`--plugin <dir>` loads another plugin as it is);
2. starts `claude -p` with the brief's request in a fresh temporary workspace, with a fixed model (`--model`, default `claude-sonnet-5-5`), a turn cap (`--max-turns`, default 80) and permissions bypassed. The only added instruction is that there is no interactive user, so questions are asked as text (the question picker is turned off);
3. if the agent stops without building anything, counts the questions in its last message and replies with the brief's `answers` plus "for anything else, you pick", up to three rounds. A page it built but didn't register ends the run and is reported as "no design";
4. copies the workspace to `evals/runs/<date-time>/<brief>-<n>/` with the transcript, and scores it.

A run costs model tokens: a full run is thirty-two agent sessions. Use `--only` and `--repeat 1` while iterating, and the full run only for the before and after of a PR.

`--score-only <dir>` takes one workspace (a folder with `.open-design/`) or a folder of workspaces. A subfolder named after a brief, such as `gig-poster` or `gig-poster-2`, is scored as that brief (repeat 2). The transcript columns are `n/a`.

As root on Linux (a container), Chromium needs `--no-sandbox`, which the kit never passes; the runner writes a small wrapper into the run folder and points `OPEN_DESIGN_BROWSER_PATH` at it for the checks and the agent.

## Without an agent CLI: the api loop and the "without the kit" arm

`--agent api` runs each brief through the runner's own agent loop ([scripts/evals/apiAgent.mjs](../scripts/evals/apiAgent.mjs)) instead of Claude Code. It calls any OpenAI-compatible `/chat/completions` endpoint with function tools, so no agent CLI or Claude subscription is needed: a ClinePass key, OpenRouter or a local model server all work.

The endpoint, model and key are set only by environment variables, with no defaults, so a local shell and the workflow are configured the same way:

| Variable | What | Example |
|---|---|---|
| `EVALS_BASE_URL` | the OpenAI-compatible base URL (`/chat/completions` is added) | `https://api.cline.bot/api/v1` (ClinePass) |
| `EVALS_MODEL` | the model id at that endpoint | `cline-pass/glm-5.3` |
| `EVALS_API_KEY` | the endpoint's key | |

```bash
export EVALS_BASE_URL=https://api.cline.bot/api/v1
export EVALS_MODEL=cline-pass/glm-5.3
export EVALS_API_KEY=…
npm run evals -- --agent api --arm both --only gig-poster,saas-landing --repeat 2
```

`--arm` picks what the model gets. Both arms use the same loop, model and file tools (`list_files`, `read_file`, `write_file` in the run's folder), so the difference between them is what the kit adds:

| Arm | Tools | System prompt |
|---|---|---|
| `kit` (default) | file tools + this checkout's MCP server, connected over stdio (minus the tools that pick another folder or open windows) | the no-interactive-user line + the plugin's `open-design` skill |
| `bare` | file tools only | the no-interactive-user line + "save each design as a self-contained HTML page" |
| `both` | each brief in both arms | |

The bare arm skips briefs with an app (`fixture`), a site or follow-ups, since those exercise kit tools. Its pages get a minimal manifest so the same `check` scores them; the skill and critic columns stay empty. When a run has both arms, RESULTS.md gets a comparison table: runs, passed, runs with no design, errors and warnings per design, distinct looks and tokens per arm.

This measures the kit behind a minimal agent, not inside Claude Code, Codex or Desktop. Keep an occasional `--agent claude` run for the real host.

### Briefs as test cases

Every run is also a test case, shown as PASS or FAIL as it finishes and in the table's Pass column. A run passes when it made a design, every design's check ran with no errors, its questions stayed in the brief's `expect.questions` range and, with the kit, every design came from one of `expect.skills`. Model output varies, so read the pass rate across repeats, not one case.

### In GitHub Actions

[.github/workflows/evals.yml](../.github/workflows/evals.yml) runs the api loop by hand (Actions → Evals → Run workflow). It reads the repository variables `EVALS_BASE_URL` and `EVALS_MODEL` and the repository secret `EVALS_API_KEY` (Settings → Secrets and variables → Actions), and stops with a message naming any that are missing. Its inputs are the briefs (by default eight that both arms can run), the arm, the repeats and a label. The comparison and score tables appear on the run's summary page, and RESULTS.md, the contact sheet, scores, transcripts and pages are uploaded as an artifact. It never runs on a pull request.

## Scores

Per design, all from the kit's own tools:

| Column | From |
|---|---|
| Errors, error codes, warnings | `open-design-agent-kit check --json` (the same checks `check_open_design_artifact` runs), counted by finding code |
| Critic | `metadata.critique` on the manifest: verdict and finding count, `n/a` until the design critic records one |
| Questions | Lines with a `?` in the messages where the agent stopped without building anything (at least one per such stop); ⚠ when outside the brief's `expect.questions` |
| Assumptions | `metadata.brief.assumptions` on the manifest, else lines in the agent's messages that start "Assumed…", "I picked…" |
| Tool calls, time | The transcript and the wall clock, all rounds together |
| Skill | The manifest's `sourceSkillId`; ⚠ when not one of `expect.skills` |
| Signature | Accent, display font, body font and theme, from `.open-design/history.json` once variety memory records it, else read from the HTML |

Across the run: check errors per repeat, distinct signatures, and the agent's cost. No pixel diffing and no model-graded beauty score; the "must" notes are ticked by a person looking at the contact sheet.

Model output varies, so each brief runs twice. A change counts as an improvement when the error total drops on both repeats and no brief gets worse by more than one error.

## Results

Each run appends a dated section to [RESULTS.md](RESULTS.md): kit version and commit, model, mode, the summary, the score table and the "must" notes to tick. The run folder stays out of git except its `contact-sheet.png` (every design side by side, under 1 MB), which RESULTS.md links to. Commit both with the PR.
