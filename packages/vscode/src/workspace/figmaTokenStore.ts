import * as vscode from 'vscode';

// This extension's first use of vscode.SecretStorage. A Figma personal
// access token is a real credential (unlike openDesign.activeDesignSystemId,
// which is just an id string persisted as a plain editor setting) so it
// belongs in the encrypted secret store, not workspace configuration.
const FIGMA_TOKEN_KEY = 'openDesign.figmaToken';

export async function getFigmaToken(context: vscode.ExtensionContext): Promise<string | undefined> {
  return context.secrets.get(FIGMA_TOKEN_KEY);
}

export async function setFigmaToken(context: vscode.ExtensionContext, token: string): Promise<void> {
  await context.secrets.store(FIGMA_TOKEN_KEY, token);
}

export async function clearFigmaToken(context: vscode.ExtensionContext): Promise<void> {
  await context.secrets.delete(FIGMA_TOKEN_KEY);
}
