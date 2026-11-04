// Bundles the server (and @axlebook/shared) into dist/server.js.
// node_modules packages are left external, so native modules keep working.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const rootPkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const version = process.env.AXLEBOOK_VERSION ?? rootPkg.version ?? 'dev';

await build({
  entryPoints: ['src/server.ts'],
  outfile: 'dist/server.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  packages: 'external',
  // Inline the workspace package; keep real dependencies external.
  plugins: [
    {
      name: 'inline-workspace',
      setup(b) {
        // Inline the workspace package and any file inside it (e.g. locale JSON).
        b.onResolve({ filter: /^@axlebook\/shared(\/.*)?$/ }, (args) => {
          const sub = args.path.slice('@axlebook/shared'.length);
          const target = sub ? `../../packages/shared${sub}` : '../../packages/shared/src/index.ts';
          // fileURLToPath, not URL.pathname: the latter gives "/C:/…" on Windows.
          return { path: fileURLToPath(new URL(target, import.meta.url)) };
        });
      },
    },
  ],
  define: { __AXLEBOOK_VERSION__: JSON.stringify(version) },
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
});
console.log(`built dist/server.js (version ${version})`);
