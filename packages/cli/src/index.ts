#!/usr/bin/env node
import { Command } from 'commander';
import * as path from 'node:path';
import { checkbox } from '@inquirer/prompts';
import { ALL_TOOL_IDS, buildToolChoices, InvalidToolsArgError, parseToolsArg, type ToolId } from './toolSelection';
import { getClaudeSkillsAssetRoot, getCodexSkillsAssetRoot } from './env';
import { mergeClaudeMcpConfig, writeClaudeSkills } from './claudeSetup';
import { CODEX_CONFIG_SNIPPET, ensureCodexMcpConfig, writeCodexSkills } from './codexSetup';

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

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
