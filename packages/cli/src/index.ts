#!/usr/bin/env node
import { Command } from 'commander';
import * as path from 'node:path';
import { checkbox } from '@inquirer/prompts';
import { ALL_TOOL_IDS, buildToolChoices, InvalidToolsArgError, parseToolsArg, type ToolId } from './toolSelection';
import { getClaudeSkillsAssetRoot, getCodexSkillsAssetRoot } from './env';
import { mergeClaudeMcpConfig, writeClaudeSkills } from './claudeSetup';
import { CODEX_CONFIG_SNIPPET, ensureCodexMcpConfig, writeCodexSkills } from './codexSetup';
import { runExport, runRenderVideo, type ExportCliOptions } from './exportCommand';

async function resolveTools(toolsFlag: string | undefined): Promise<ToolId[]> {
  if (toolsFlag !== undefined) return parseToolsArg(toolsFlag);

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      `Not running in an interactive terminal and no --tools flag was given. Pass --tools <${ALL_TOOL_IDS.join('|')}|all> to run non-interactively.`,
    );
  }

  const selected = await checkbox<ToolId>({
    message: 'Select which tools to set up',
    choices: buildToolChoices(),
  });
  if (selected.length === 0) throw new Error('At least one tool must be selected.');
  return selected;
}

async function runInit(targetPathArg: string, toolsFlag: string | undefined): Promise<void> {
  const targetPath = path.resolve(targetPathArg);
  const tools = await resolveTools(toolsFlag);

  if (tools.includes('claude')) {
    const { writtenCount } = await writeClaudeSkills(targetPath, getClaudeSkillsAssetRoot());
    const { created } = await mergeClaudeMcpConfig(targetPath);
    console.log(`Claude Code: wrote ${writtenCount} skills to .claude/skills/, ${created ? 'created' : 'updated'} .mcp.json`);
  }

  if (tools.includes('codex')) {
    const { writtenCount } = await writeCodexSkills(targetPath, getCodexSkillsAssetRoot());
    console.log(`Codex: wrote ${writtenCount} skills to .agents/skills/`);

    const result = await ensureCodexMcpConfig(targetPath);
    if (result.outcome === 'created') {
      console.log('Codex: created .codex/config.toml with the open-design MCP server registered');
    } else if (result.outcome === 'already-registered') {
      console.log(`Codex: ${result.configPath} already registers open-design — nothing to do`);
    } else {
      console.log(
        `Codex: ${result.configPath} already exists and was left untouched (existing TOML files are never rewritten). Add this yourself:\n\n${CODEX_CONFIG_SNIPPET}`,
      );
    }
  }

  console.log('\nDone.');
}

const program = new Command();
program.name('open-design-agent-kit').description("Set up Open Design's Claude Code and/or Codex integration in your project");

program
  .command('init [path]')
  .description('Write Open Design skill files and MCP registration into the given project (default: current directory)')
  .option('--tools <list>', `Comma-separated tool ids (${ALL_TOOL_IDS.join(', ')}) or "all"; omit to be prompted interactively`)
  .action(async (targetPath: string = '.', options: { tools?: string }) => {
    try {
      await runInit(targetPath, options.tools);
    } catch (err) {
      const message = err instanceof InvalidToolsArgError || err instanceof Error ? err.message : String(err);
      console.error(`Error: ${message}`);
      process.exitCode = 1;
    }
  });

program
  .command('export <entryPath>')
  .description('Export a registered Open Design artifact to PNG/JPEG image(s), a deck to PPTX/PDF, or a page to PDF, under its exports/ folder (needs an installed Chrome, Edge, or Chromium)')
  .option('--width <px>', 'Viewport width (give with --height); default: the source skill\'s size')
  .option('--height <px>', 'Viewport height (give with --width)')
  .option('--scale <n>', 'Device scale factor, 1-3 (default 2 for deck pdf/pptx, else 1)')
  .option('--format <png|jpeg|pdf|pptx>', 'Output format (default png); pptx is for decks, pdf works for decks and pages')
  .option('--quality <1-100>', 'JPEG quality (default 90)')
  .option('--selector <css>', 'Export each matching element as its own numbered image, e.g. "[data-od-card]"')
  .option('--max-bytes <n>', 'Per-file byte budget; over-budget images are re-encoded as JPEG until they fit')
  .option('--deck', 'Treat the artifact as a slide deck (auto-detected for decks registered as kind "deck")')
  .option('--slides <list>', 'Decks: comma-separated 1-based slide numbers to export, e.g. 1,3')
  .option('--browser <path>', 'Browser executable (default: OPEN_DESIGN_BROWSER_PATH, then auto-detect)')
  .option('--workspace <dir>', 'Workspace root (default: nearest ancestor containing .open-design/)')
  .action(async (entryPath: string, options: ExportCliOptions) => {
    try {
      process.exitCode = await runExport(entryPath, options);
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    }
  });

program
  .command('render-video <compositionDir>')
  .description('Render a HyperFrames composition to MP4 via `npx hyperframes render` (needs FFmpeg)')
  .requiredOption('--output <file.mp4>', 'Output MP4 path')
  .option('--quality <draft|standard|high>', 'HyperFrames render quality (default high)')
  .action(async (compositionDir: string, options: { output: string; quality?: string }) => {
    process.exitCode = await runRenderVideo(compositionDir, options);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
