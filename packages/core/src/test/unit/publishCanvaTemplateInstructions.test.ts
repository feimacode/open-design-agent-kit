import * as assert from 'node:assert';
import { canvaDesignTypeFor, composePublishCanvaTemplateInstructions } from '../../generation/publishCanvaTemplateInstructions';

describe('composePublishCanvaTemplateInstructions', () => {
  const base = { artifactEntryPath: '.open-design/now-page/now-page.html', artifactContent: '<h1>Now</h1>' };

  it('embeds the artifact content and entry path, and the registered title', () => {
    const result = composePublishCanvaTemplateInstructions({ ...base, manifestTitle: 'Now Page' });
    assert.match(result, /\.open-design\/now-page\/now-page\.html/);
    assert.match(result, /<h1>Now<\/h1>/);
    assert.match(result, /its registered title is "Now Page"/);
  });

  it('exports as PDF for a page and PPTX for a deck', () => {
    assert.match(composePublishCanvaTemplateInstructions(base), /format: "pdf"/);
    const deck = composePublishCanvaTemplateInstructions({ ...base, manifestKind: 'deck' });
    assert.match(deck, /format: "pptx"/);
    assert.match(deck, /NOT editable text or shapes/);
  });

  it('looks up the Canva integration before choosing a route', () => {
    const result = composePublishCanvaTemplateInstructions(base);
    assert.match(result, /`list_open_design_integrations` with `integration: "canva"`/);
    assert.match(result, /deferred or on-demand tools/);
    assert.match(result, /only after the user says yes/);
  });

  it('asks the user to choose, recommending the editable route, before hosting or uploading', () => {
    const result = composePublishCanvaTemplateInstructions(base);
    assert.match(result, /recommend A, and wait for the user's choice/);
    assert.match(result, /Don't host or upload anything before they choose/);
    assert.ok(result.indexOf('## Step 4') < result.indexOf('### Route A'));
  });

  it('route A hosts the export through publish (never netlify-temporary) and imports by URL', () => {
    const result = composePublishCanvaTemplateInstructions(base);
    assert.match(result, /`publish_open_design_artifact`[\s\S]*`includeFiles: \["<the exported PDF path/);
    assert.match(result, /`cloudflare-temporary`/);
    assert.match(result, /Never use `netlify-temporary`/);
    assert.match(result, /`import-design-from-url`/);
    assert.match(result, /\/files\/<file name>/);
    assert.match(result, /`read-design`/);
  });

  it('publishes a Brand Template only after the user agrees, with the reconnect note', () => {
    const result = composePublishCanvaTemplateInstructions(base);
    assert.match(result, /Only if they say yes, call Canva's `publish-brand-template`/);
    assert.match(result, /Missing scopes/);
  });

  it('route B uploads raw bytes and never claims a design was created', () => {
    const result = composePublishCanvaTemplateInstructions(base);
    assert.match(result, /`create-upload-url`/);
    assert.match(result, /Content-Type: application\/octet-stream/);
    assert.match(result, /--data-binary @/);
    assert.match(result, /Don't claim a design was created/);
  });

  it('keeps the manual import as route C', () => {
    const result = composePublishCanvaTemplateInstructions(base);
    assert.match(result, /### Route C — manual import/);
    assert.match(result, /canva\.com/);
    assert.match(result, /Import a file/);
  });

  it('passes the mapped design type to the import, or leaves it out', () => {
    assert.match(composePublishCanvaTemplateInstructions({ ...base, manifestKind: 'deck' }), /intended_design_type: "presentation"/);
    assert.match(composePublishCanvaTemplateInstructions({ ...base, manifestFormat: 'ig-square' }), /intended_design_type: "instagram_post"/);
    assert.ok(!/intended_design_type/.test(composePublishCanvaTemplateInstructions(base)));
  });

  it('still explains the Creator marketplace as manual', () => {
    const result = composePublishCanvaTemplateInstructions(base);
    assert.match(result, /Personal reuse/);
    assert.match(result, /Canva Creator/);
  });
});

describe('canvaDesignTypeFor', () => {
  it('maps kinds and formats', () => {
    assert.strictEqual(canvaDesignTypeFor({ kind: 'deck', format: 'a3' }), 'presentation');
    assert.strictEqual(canvaDesignTypeFor({ format: 'ig-portrait' }), 'instagram_post');
    assert.strictEqual(canvaDesignTypeFor({ format: 'story' }), 'your_story');
    assert.strictEqual(canvaDesignTypeFor({ format: 'x-image' }), 'twitter_post');
    assert.strictEqual(canvaDesignTypeFor({ format: 'yt-thumbnail' }), 'youtube_thumbnail');
    assert.strictEqual(canvaDesignTypeFor({ format: 'a4' }), 'a4');
    assert.strictEqual(canvaDesignTypeFor({ format: 'letter' }), 'us_letter');
    assert.strictEqual(canvaDesignTypeFor({ format: 'a1' }), 'poster');
    assert.strictEqual(canvaDesignTypeFor({ format: 'poster-24x36' }), 'poster');
    assert.strictEqual(canvaDesignTypeFor({ content: '<table data-od-email>' }), 'email');
    assert.strictEqual(canvaDesignTypeFor({ kind: 'html' }), undefined);
    assert.strictEqual(canvaDesignTypeFor({ format: 'banner-mrec' }), undefined);
  });
});
