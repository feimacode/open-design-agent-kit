import * as path from 'node:path';
import * as vscode from 'vscode';
import { readArtifact, writeArtifactManifest, type ReadArtifactResult, type JsonRecord } from '@feimacode/open-design-agent-kit-core';

export function getWorkspaceRoot(): string {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    throw new Error('No workspace folder is open. Open a folder in VS Code before generating an OpenDesign artifact.');
  }
  return folders[0].uri.fsPath;
}

export function getOutputDirectory(): string {
  const config = vscode.workspace.getConfiguration('openDesign');
  return config.get<string>('outputDirectory', '.open-design');
}

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'artifact';
}

export function suggestEntryPath(brief: string, skillName: string): string {
  const slugSource = brief.trim().length > 0 ? brief : skillName;
  const slug = slugify(slugSource);
  const outputDir = getOutputDirectory();
  return path.posix.join(outputDir, slug, `${slug}.html`);
}

export async function registerArtifact(options: {
  entryPath: string;
  artifactManifest: unknown;
}): Promise<JsonRecord> {
  return writeArtifactManifest({
    workspaceRoot: getWorkspaceRoot(),
    entryPath: options.entryPath,
    artifactManifest: options.artifactManifest,
  });
}

export async function getArtifact(entryPath: string): Promise<ReadArtifactResult | null> {
  return readArtifact({ workspaceRoot: getWorkspaceRoot(), entryPath });
}
