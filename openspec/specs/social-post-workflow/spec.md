# social-post-workflow Specification

## Purpose
Let users (and our own pipelines) design social media posts for a named platform (X, Instagram, LinkedIn, Xiaohongshu, Stories/Reels, YouTube thumbnail or video) with the right canvas size and skill, and end with exported, upload-ready files. Also covers the extension-owned content overlay that ships our own skills and prompts alongside the vendored catalog.
## Requirements
### Requirement: Platform-Aware Social Post Entry Point
The system SHALL ship a hand-written "social post" prompt in every host: a VS Code `chatPromptFiles` entry `open-design-social-post`, an MCP prompt, and a Claude plugin command. All of these SHALL be rendered from a single source file. The prompt SHALL ask for the target platform and format when the brief doesn't state them, and SHALL map each supported format to a canvas size and a skill id as follows:

| Format | Size | Skill |
|---|---|---|
| X single image | 1600×900 | `card-twitter` |
| X post mock | element | `social-x-post-card` |
| Square carousel (Instagram/LinkedIn) | 1080×1080 per card | `social-carousel` |
| Instagram portrait | 1080×1350 | `poster-hero` |
| Story / Reels / TikTok cover | 1080×1920 | `poster-hero` |
| Xiaohongshu cards | 1080×1440 per card | `card-xiaohongshu` |
| YouTube thumbnail | 1280×720 | `social-youtube-thumbnail` |
| YouTube video | 1920×1080 MP4 | `hyperframes` |

#### Scenario: Agent reaches the workflow without a slash command (Claude Code, Codex)
- **WHEN** a user in Claude Code or Codex asks for "an Instagram carousel about our launch" without invoking any command
- **THEN** the `open-design-social-post` skill SHALL be eligible for the model to load on its own: it SHALL carry no `disable-model-invocation` flag (Claude Code) and no explicit-only `agents/openai.yaml` policy (Codex), and its description SHALL name social-post requests as its trigger

#### Scenario: VS Code agent without the slash command
- **WHEN** a VS Code user asks for a social post with no platform stated and doesn't run `/open-design-social-post`
- **THEN** the chat instructions SHALL direct the agent to ask which platform it's for and to mention the `/open-design-social-post` command, since prompt files can't be started by the model

#### Scenario: Platform stated in the brief
- **WHEN** the user invokes the social post prompt with "an X post announcing our v2 launch"
- **THEN** the model SHALL be directed to use the X single-image row (`card-twitter`, 1600×900) without asking which platform

#### Scenario: Platform not stated
- **WHEN** the brief names no platform or format
- **THEN** the model SHALL be directed to ask the user to choose from the supported formats before calling `prepare_open_design_brief`

### Requirement: Generate-Then-Export Flow
The social post prompt SHALL direct the model to: prepare the brief with the mapped skill id → author the files → register the artifact → export it (via `export_open_design_artifact` for image formats, passing the mapped size and, for multi-card formats, `selector: "[data-od-card]"`; via the HyperFrames CLI override for video) → report the exported file paths to the user. For multi-card formats, the prompt SHALL tell the model to mark each card element with a `data-od-card` attribute.

#### Scenario: Xiaohongshu carousel end to end
- **WHEN** the user asks for a 5-card Xiaohongshu post
- **THEN** the flow SHALL end with five 1080×1440 PNGs under the artifact's `exports/` directory and their paths reported to the user

#### Scenario: YouTube video end to end
- **WHEN** the user asks for a YouTube video
- **THEN** the flow SHALL end with an MP4 under the artifact's `exports/` directory, rendered via the HyperFrames CLI, with no daemon involved

### Requirement: Extension-Owned YouTube Thumbnail Skill
The system SHALL ship a `social-youtube-thumbnail` skill authored by this extension. It SHALL use the same SKILL.md frontmatter shape as vendored skills (`aspect_hint: "1280×720 (16:9)"`, `od.mode: prototype`, an `example_prompt`, and a curation flag), and its body SHALL cover legibility at small sizes, keeping the bottom-right timestamp area clear, and YouTube's 2 MB thumbnail limit.

#### Scenario: Discoverable like any vendored skill
- **WHEN** `list_open_design_skills` is called with query "youtube thumbnail"
- **THEN** `od:prototype:social-youtube-thumbnail` SHALL be returned with its description and example prompt

#### Scenario: Gets a curated shortcut
- **WHEN** content sync runs
- **THEN** a curated slash command for `social-youtube-thumbnail` SHALL be generated like any other curated entry

### Requirement: Local Content Overlay Survives Re-Sync
The system SHALL keep extension-owned catalog entries in a local overlay directory that content sync copies into the assets tree after the upstream copy. If an overlay entry's id collides with an upstream entry's id, the sync SHALL fail with an error naming the id. The sync-parity check SHALL verify upstream entries against upstream and overlay entries against the overlay.

#### Scenario: Re-sync keeps overlay entries
- **WHEN** `npm run sync-content` is run against a new upstream ref
- **THEN** `social-youtube-thumbnail` SHALL still be present in the synced assets

#### Scenario: Id collision
- **WHEN** upstream adds an entry whose id equals an overlay entry's id
- **THEN** the sync SHALL fail and name the colliding id, rather than silently letting one entry shadow the other

