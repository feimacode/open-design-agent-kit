# Adding a skill or prompt

Upstream content is never edited in place. This project's own skills and prompts go in the local overlay, `packages/content/local/`. See [Content sync](content-sync.md#local-overlay).

## Add a skill

1. Create `packages/content/local/skills/<id>/SKILL.md`, using the same frontmatter as upstream skills. Use `social-youtube-thumbnail/SKILL.md` as a template:

   ```yaml
   ---
   name: <id>
   en_name: "Readable Name"
   description: "One sentence: what it makes and when to use it."
   aspect_hint: "1280×720 (16:9)"   # first W×H pair sets the default export size
   featured: 50                      # optional: gives it a curated command
   tags: ["…"]
   od:
     mode: prototype                 # becomes od:<mode>:<id>
     example_prompt: "A ready-made brief…"
   ---
   ```

   The body is the recipe the agent follows: canvas, composition rules, what to avoid, and the export call to make.
2. Pick an `<id>` that doesn't exist upstream. The overlay step fails on a collision.
3. Run `npm run sync-content` (or just `npm run apply-overlay --workspace=@feimacode/open-design-agent-kit-content` followed by the mirror and generator steps) and commit the regenerated files.
4. Check it's found: `list_open_design_skills` with a query for it, or core's `ContentIndex` test.

To give an **upstream** entry a curated command instead, add its id to `packages/content/local/curated.json`.

## Add a prompt

A prompt is a named workflow the user (and, on Claude Code and Codex, the model) can start. Examples: `/open-design-social-post`.

1. Create `packages/content/local/prompts/<file>.md`:

   ```markdown
   ---
   name: open-design-<name>
   description: What it does, in one line
   argument_hint: what the user should type after the command
   placeholder: Question shown when no brief is given
   ---

   Instructions for the agent… Brief: {{brief}}
   ```

   `{{brief}}` is required. Each host replaces it with its own way of passing the user's input.
2. Run `npm run sync-content`. The generators render it as:
   - a VS Code prompt file (`packages/vscode/prompts/local/`), added to `chatPromptFiles`;
   - a Claude Code skill and a Codex skill, both model-invocable;
   - an MCP prompt with an optional `brief` argument (served at runtime).
3. Document it in [Prompts and commands](../reference/prompts-and-commands.md). The docs check fails on undocumented VS Code commands, tools and CLI flags. It can't see new prompts, so add these by hand.

## Add a tool

Tools span every host:

1. Add the logic in `packages/core`.
2. Add a VS Code tool class, register it in `registerTools.ts`, and declare it in `packages/vscode/package.json` `languageModelTools`.
3. Mirror the schema in `packages/mcp-server/src/index.ts` and add a handler in `tools.ts`.
4. Update the expected tool count in `scripts/test-npm-publish.mjs`.
5. Add a `### <tool_name>` section to [`docs/reference/tools.md`](../reference/tools.md) that mentions every argument. `npm run lint` fails until you do.
