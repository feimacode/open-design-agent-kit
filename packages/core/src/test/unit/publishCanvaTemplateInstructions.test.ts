import * as assert from 'node:assert';
import { composePublishCanvaTemplateInstructions } from '../../generation/publishCanvaTemplateInstructions';

describe('composePublishCanvaTemplateInstructions', () => {
  const base = { artifactEntryPath: '.open-design/now-page/now-page.html', artifactContent: '<h1>Now</h1>' };

  it('embeds the artifact content and entry path', () => {
    const result = composePublishCanvaTemplateInstructions(base);
    assert.match(result, /\.open-design\/now-page\/now-page\.html/);
    assert.match(result, /<h1>Now<\/h1>/);
  });

  it('mentions the registered manifest title when given', () => {
    const result = composePublishCanvaTemplateInstructions({ ...base, manifestTitle: 'Now Page' });
    assert.match(result, /its registered title is "Now Page"/);
  });

  it('exports as PDF for a non-deck artifact and notes real vector text', () => {
    const result = composePublishCanvaTemplateInstructions(base);
    assert.match(result, /format: "pdf"/);
    assert.match(result, /actual vector, selectable text/);
  });

  it('exports as PPTX for a registered deck and warns text is not editable', () => {
    const result = composePublishCanvaTemplateInstructions({ ...base, manifestKind: 'deck' });
    assert.match(result, /format: "pptx"/);
    assert.match(result, /NOT editable text or shapes/);
  });

  it('describes Canva\'s own manual import steps', () => {
    const result = composePublishCanvaTemplateInstructions(base);
    assert.match(result, /canva\.com/);
    assert.match(result, /Import a file/);
  });

  it('never claims the model can drive Canva itself', () => {
    const result = composePublishCanvaTemplateInstructions(base);
    assert.match(result, /no automated publish path into Canva/);
    assert.match(result, /Do not attempt to perform these steps yourself/);
  });

  it('distinguishes personal reuse, Brand Templates, and the Creator marketplace', () => {
    const result = composePublishCanvaTemplateInstructions(base);
    assert.match(result, /Personal reuse/);
    assert.match(result, /Brand Template/);
    assert.match(result, /Canva Creator/);
  });
});
