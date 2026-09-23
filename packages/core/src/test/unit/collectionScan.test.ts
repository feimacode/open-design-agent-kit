import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { writeArtifactManifest } from '../../vendored/artifactCreate';
import { findCollectionArtifacts, listCollections } from '../../workspace/collectionScan';
import { suggestCollectionScreenEntryPath } from '../../generation/collectionEntryPath';

async function makeTempWorkspace(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'od-ext-collection-'));
}

async function writeScreen(
  workspaceRoot: string,
  entryPath: string,
  opts: { title: string; collectionId?: string; collectionName?: string; screenIndex?: number; screenRole?: string },
): Promise<void> {
  await fs.mkdir(path.dirname(path.join(workspaceRoot, entryPath)), { recursive: true });
  await fs.writeFile(path.join(workspaceRoot, entryPath), `<!doctype html><h1>${opts.title}</h1>`);
  await writeArtifactManifest({
    workspaceRoot,
    entryPath,
    artifactManifest: {
      kind: 'html',
      renderer: 'html',
      exports: ['html'],
      title: opts.title,
      collectionId: opts.collectionId,
      collectionName: opts.collectionName,
      screenIndex: opts.screenIndex,
      screenRole: opts.screenRole,
    },
  });
}

describe('collectionScan', () => {
  describe('findCollectionArtifacts', () => {
    it('returns an empty array when the output dir does not exist', async () => {
      const workspaceRoot = await makeTempWorkspace();
      const screens = await findCollectionArtifacts(workspaceRoot, '.open-design', 'fintech-onboarding');
      assert.deepStrictEqual(screens, []);
    });

    it('finds and sorts screens sharing a collectionId, ignoring screens from other collections', async () => {
      const workspaceRoot = await makeTempWorkspace();
      await writeScreen(workspaceRoot, '.open-design/fintech-onboarding/value-prop.html', {
        title: 'Value Prop',
        collectionId: 'fintech-onboarding',
        collectionName: 'Fintech Onboarding Flow',
        screenIndex: 1,
        screenRole: 'value-prop',
      });
      await writeScreen(workspaceRoot, '.open-design/fintech-onboarding/splash.html', {
        title: 'Welcome',
        collectionId: 'fintech-onboarding',
        collectionName: 'Fintech Onboarding Flow',
        screenIndex: 0,
        screenRole: 'splash',
      });
      await writeScreen(workspaceRoot, '.open-design/other-flow/home.html', {
        title: 'Home',
        collectionId: 'other-flow',
        collectionName: 'Other Flow',
        screenIndex: 0,
        screenRole: 'home',
      });

      const screens = await findCollectionArtifacts(workspaceRoot, '.open-design', 'fintech-onboarding');
      assert.deepStrictEqual(
        screens.map((s) => s.screenRole),
        ['splash', 'value-prop'],
      );
      assert.strictEqual(screens[0].title, 'Welcome');
      assert.strictEqual(screens[0].entryPath, '.open-design/fintech-onboarding/splash.html');
    });

    it('skips a malformed sidecar rather than throwing', async () => {
      const workspaceRoot = await makeTempWorkspace();
      await writeScreen(workspaceRoot, '.open-design/flow/a.html', {
        title: 'A',
        collectionId: 'flow',
        collectionName: 'Flow',
        screenIndex: 0,
      });
      await fs.mkdir(path.join(workspaceRoot, '.open-design/flow'), { recursive: true });
      await fs.writeFile(path.join(workspaceRoot, '.open-design/flow/broken.html.artifact.json'), 'not json');

      const screens = await findCollectionArtifacts(workspaceRoot, '.open-design', 'flow');
      assert.strictEqual(screens.length, 1);
    });
  });

  describe('listCollections', () => {
    it('returns an empty array when the output dir does not exist', async () => {
      const workspaceRoot = await makeTempWorkspace();
      assert.deepStrictEqual(await listCollections(workspaceRoot, '.open-design'), []);
    });

    it('groups artifacts by collectionId and excludes artifacts with no collectionId', async () => {
      const workspaceRoot = await makeTempWorkspace();
      await writeScreen(workspaceRoot, '.open-design/flow-a/one.html', { title: 'One', collectionId: 'flow-a', collectionName: 'Flow A', screenIndex: 0 });
      await writeScreen(workspaceRoot, '.open-design/flow-a/two.html', { title: 'Two', collectionId: 'flow-a', collectionName: 'Flow A', screenIndex: 1 });
      await writeScreen(workspaceRoot, '.open-design/flow-b/one.html', { title: 'B1', collectionId: 'flow-b', collectionName: 'Flow B', screenIndex: 0 });
      await writeScreen(workspaceRoot, '.open-design/standalone/page.html', { title: 'Standalone' });

      const collections = await listCollections(workspaceRoot, '.open-design');
      assert.strictEqual(collections.length, 2);
      const flowA = collections.find((c) => c.collectionId === 'flow-a');
      assert.strictEqual(flowA?.screens.length, 2);
      assert.deepStrictEqual(
        flowA?.screens.map((s) => s.title),
        ['One', 'Two'],
      );
    });
  });
});

describe('suggestCollectionScreenEntryPath', () => {
  it('builds <outputDir>/<collectionId>/<screenSlug>.html', () => {
    assert.strictEqual(suggestCollectionScreenEntryPath('.open-design', 'fintech-onboarding', 'splash'), '.open-design/fintech-onboarding/splash.html');
  });
});
