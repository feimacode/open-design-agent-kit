// Documentation URLs printed by the CLI. Kept in one place so a test can check
// that each still points at a real file in the repository's docs/.
export const DOCS_BASE_URL = 'https://github.com/feimacode/open-design-agent-kit/blob/main/docs/';
export const CLI_REFERENCE_URL = `${DOCS_BASE_URL}reference/cli.md`;
export const TROUBLESHOOTING_URL = `${DOCS_BASE_URL}troubleshooting.md`;

/** Appended to every `--help` output. */
export function cliHelpEpilogue(): string {
  return `\nDocumentation: ${CLI_REFERENCE_URL}\nTroubleshooting: ${TROUBLESHOOTING_URL}`;
}
