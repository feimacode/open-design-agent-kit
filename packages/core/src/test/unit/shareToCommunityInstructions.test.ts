import * as assert from 'node:assert';
import { composeShareToCommunityInstructions } from '../../generation/shareToCommunityInstructions';

describe('composeShareToCommunityInstructions', () => {
  const base = { artifactEntryPath: '.open-design/now-page/now-page.html', artifactContent: '<h1>Now</h1>' };

  it('embeds the artifact content and entry path', () => {
    const result = composeShareToCommunityInstructions(base);
    assert.match(result, /\.open-design\/now-page\/now-page\.html/);
    assert.match(result, /<h1>Now<\/h1>/);
  });

  it('mentions the registered manifest title when given', () => {
    const result = composeShareToCommunityInstructions({ ...base, manifestTitle: 'Now Page' });
    assert.match(result, /its registered title is "Now Page"/);
  });

  it('tells the model to derive metadata itself rather than asking the user to retype it', () => {
    const result = composeShareToCommunityInstructions(base);
    assert.match(result, /Do not ask the user for anything you can already tell from the artifact/);
    assert.match(result, /never fabricate a fact the artifact doesn't support/);
  });

  it('describes the local scaffold shape (SKILL.md, example.html, open-design.json)', () => {
    const result = composeShareToCommunityInstructions(base);
    assert.match(result, /`SKILL\.md`/);
    assert.match(result, /`example\.html`/);
    assert.match(result, /`open-design\.json`/);
  });

  it('requires an explicit user check-in before any publishing step', () => {
    const result = composeShareToCommunityInstructions(base);
    assert.match(result, /Stop here and show the user the scaffolded files/);
    assert.match(result, /Do NOT proceed to Stage 4 without an explicit yes/);
  });

  it('requires a gh auth check and forbids inventing a placeholder owner', () => {
    const result = composeShareToCommunityInstructions(base);
    assert.match(result, /`gh auth status`/);
    assert.match(result, /Never invent a placeholder GitHub owner\/org/);
  });

  it('targets the awesome-open-design repo for the fork and PR', () => {
    const result = composeShareToCommunityInstructions(base);
    assert.match(result, /gh repo fork feimacode\/awesome-open-design/);
    assert.match(result, /gh pr create --repo feimacode\/awesome-open-design/);
  });

  it('forbids merging, force-pushing, or guessing at a different command on failure', () => {
    const result = composeShareToCommunityInstructions(base);
    assert.match(result, /Never merge the PR, never force-push/);
  });
});
