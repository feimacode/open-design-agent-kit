import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { auditSite, formatAuditSiteResult } from '@feimacode/open-design-agent-kit-core';
import { getOutputDirectory, getWorkspaceRoot } from '../workspace/artifactWriter';

interface AuditSiteInput {
  url: string;
  extraUrls?: string[];
}

// Audits a live site with the kit's own checks (core siteAudit.ts); writes
// only the audit folder under <output>/.audits/<site>/.
export class AuditSiteTool implements vscode.LanguageModelTool<AuditSiteInput> {
  async prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<AuditSiteInput>): Promise<vscode.PreparedToolInvocation> {
    return {
      invocationMessage: `Auditing ${options.input.url}`,
      confirmationMessages: {
        title: 'Open a website',
        message: new vscode.MarkdownString(`Open **${options.input.url}**${options.input.extraUrls?.length ? ` and ${options.input.extraUrls.length} more page(s)` : ''} in a headless browser to check it for design and accessibility problems?`),
      },
    };
  }

  async invoke(options: vscode.LanguageModelToolInvocationOptions<AuditSiteInput>, token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult> {
    const browserPath = vscode.workspace.getConfiguration('openDesign').get<string>('export.browserPath', '') || undefined;
    const workspaceRoot = getWorkspaceRoot();
    const result = await auditSite({ ...options.input, workspaceRoot, outputDir: getOutputDirectory(), browserPath });
    if (token.isCancellationRequested) return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart('Audit cancelled.')]);
    if (result.status === 'invalid-args' || result.status === 'no-browser') return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(result.error)]);
    const shot = result.groups.find((g) => g.crop)?.crop ?? result.screenshots.find((s) => s.endsWith('desktop.png')) ?? result.blocked.find((b) => b.screenshot)?.screenshot;
    const image = shot ? await fs.readFile(path.join(workspaceRoot, shot)).catch(() => undefined) : undefined;
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(formatAuditSiteResult(result)), ...(image ? [vscode.LanguageModelDataPart.image(image, 'image/png')] : [])]);
  }
}
