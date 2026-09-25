import * as path from 'node:path';
import * as vscode from 'vscode';
import { registerArtifact, getWorkspaceRoot } from '../workspace/artifactWriter';
import { exportsForKind } from '@feimacode/open-design-agent-kit-core';

interface RegisterArtifactInput {
  entryPath: string;
  kind: string;
  title: string;
  supportingFiles?: string[];
  sourceSkillId?: string;
  designSystemId?: string;
  collectionId?: string;
  collectionName?: string;
  screenIndex?: number;
  screenRole?: string;
}

const KIND_TO_RENDERER: Record<string, string> = {
  html: 'html',
  deck: 'deck-html',
  'react-component': 'react-component',
  'markdown-document': 'markdown',
  svg: 'svg',
  diagram: 'diagram',
  'code-snippet': 'code',
  'mini-app': 'mini-app',
  'design-system': 'design-system',
};

export class RegisterArtifactTool implements vscode.LanguageModelTool<RegisterArtifactInput> {
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<RegisterArtifactInput>,
  ): Promise<vscode.PreparedToolInvocation> {
    return {
      invocationMessage: `Registering Open Design artifact at ${options.input.entryPath}`,
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<RegisterArtifactInput>,
  ): Promise<vscode.LanguageModelToolResult> {
    const { entryPath, kind, title, supportingFiles, sourceSkillId, designSystemId, collectionId, collectionName, screenIndex, screenRole } = options.input;

    const renderer = KIND_TO_RENDERER[kind];
    const exportsList = exportsForKind(kind);
    if (!renderer || !exportsList) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`Unsupported kind "${kind}". Allowed: ${Object.keys(KIND_TO_RENDERER).join(', ')}`),
      ]);
    }

    try {
      const manifest = await registerArtifact({
        entryPath,
        artifactManifest: {
          kind,
          renderer,
          exports: exportsList,
          title,
          supportingFiles,
          sourceSkillId,
          designSystemId,
          collectionId,
          collectionName,
          screenIndex,
          screenRole,
        },
      });

      const isHtml = entryPath.toLowerCase().endsWith('.html');
      if (isHtml) {
        const uri = vscode.Uri.file(path.join(getWorkspaceRoot(), entryPath));
        vscode.commands.executeCommand('openDesign.openArtifactPreview', uri).then(undefined, () => {
          // Non-fatal: registration already succeeded even if the preview couldn't be opened.
        });
      }

      // The model otherwise has a natural, unwanted next instinct: "show the
      // result" by opening the raw file itself (e.g. VS Code's Simple
      // Browser on a `file://` URL) — which VS Code blocks as an untrusted
      // local file and surfaces a confusing "Forbidden" page to the user.
      // Stating the preview already opened, right at this response, heads
      // that off at the one moment it would otherwise be decided.
      const openNote = isHtml
        ? '\n\nIts preview has already been opened automatically in the Open Design Artifact Preview editor. Do not also open the file yourself (e.g. in Simple Browser or any other browser view, or via a file:// URL) — that is not how previews are shown in this extension and will be blocked.'
        : '';

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `Artifact registered at ${entryPath}.artifact.json\n\n${JSON.stringify(manifest, null, 2)}${openNote}`,
        ),
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(`Failed to register artifact: ${message}`)]);
    }
  }
}
