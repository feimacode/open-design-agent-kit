import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');
const isDev = process.argv.includes('--dev');

async function buildContext(options: esbuild.BuildOptions) {
  return esbuild.context({
    bundle: true,
    sourcemap: isDev,
    minify: !isDev,
    logLevel: 'info',
    ...options,
  });
}

async function main() {
  const extensionCtx = await buildContext({
    entryPoints: ['src/extension/extension.ts'],
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    outdir: 'dist',
    external: ['vscode'],
  });

  // Browser-target bundle(s) for webview client scripts. Neither touches the
  // `vscode` API directly (only postMessage), so nothing needs to be
  // external. Explicit `out` names keep both outputs flat in dist/webview/
  // regardless of their nested source paths (esbuild would otherwise mirror
  // src/webview/gallery/main.ts's directory structure into the output).
  const webviewCtx = await buildContext({
    entryPoints: [
      { in: 'src/webview/main.ts', out: 'main' },
      { in: 'src/webview/gallery/main.ts', out: 'gallery' },
      { in: 'src/webview/preview/main.ts', out: 'preview' },
    ],
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
    outdir: 'dist/webview',
  });

  const contexts = [extensionCtx, webviewCtx];

  if (isWatch) {
    await Promise.all(contexts.map((ctx) => ctx.watch()));
  } else {
    await Promise.all(contexts.map((ctx) => ctx.rebuild()));
    await Promise.all(contexts.map((ctx) => ctx.dispose()));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
