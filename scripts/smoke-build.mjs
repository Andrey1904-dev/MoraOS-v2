/**
 * Сборка smoke-теста рендера в Node-бандл и его запуск.
 *
 *   node scripts/smoke-build.mjs   # все экраны Mara OS, демо-режим
 *
 * Ранее были режимы с заглушками контекстов автомобильного домена — они ушли
 * вместе с ним: теперь страницы сами работают поверх `repositories`,
 * которые без ключей Supabase автоматически переключаются на демо-данные.
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outfile = path.join(root, 'node_modules', '.tmp', 'smoke-render.cjs');

// Алиас @/ из vite.config — esbuild его не читает, резолвим вручную.
const aliasPlugin = {
  name: 'at-alias',
  setup(b) {
    b.onResolve({ filter: /^@\// }, (args) => {
      const target = path.join(root, 'src', args.path.slice(2));
      const cands = [target + '.ts', target + '.tsx', target + '.mjs', path.join(target, 'index.ts'), target];
      for (const cand of cands) {
        try {
          if (fs.statSync(cand).isFile()) return { path: cand };
        } catch {
          /* не существует */
        }
      }
      return { path: target + '.ts' };
    });
  },
};

// CSS-файлы в бандле не нужны: разметка тестируется, не стили.
const cssStub = {
  name: 'css-stub',
  setup(b) {
    b.onResolve({ filter: /\.css$/ }, (args) => ({ path: args.path, namespace: 'css' }));
    b.onLoad({ filter: /.*/, namespace: 'css' }, () => ({ contents: '' }));
  },
};

await build({
  entryPoints: [path.join(here, 'smoke-render.mjs')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  outfile,
  logLevel: 'error',
  define: {
    'process.env.NODE_ENV': '"production"',
    'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }),
  },
  plugins: [aliasPlugin, cssStub],
});

console.log(`сборка: ${path.relative(root, outfile)}\n`);
try {
  execFileSync(process.execPath, [outfile], { stdio: 'inherit', env: process.env });
} catch (e) {
  process.exit(e.status ?? 1);
}
