/**
 * Модульные тесты бизнес-логики (node:test).
 *
 * В песочнице нет браузера, а логика написана на TypeScript, поэтому набор
 * собирается esbuild в один CJS-бандл и запускается встроенным тест-раннером
 * Node. Проверяются слой AI (mock-провайдер, агенты, business rules, дедупликация
 * памяти), демо-репозитории (fans / conversations / content / tasks) и
 * трекинг событий. CRM-данные — вымышленные сиды из src/data.
 *
 * Запуск: npm test
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outfile = path.join(root, 'node_modules', '.tmp', 'unit.test.cjs');

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
        } catch { /* не существует */ }
      }
      return { path: target + '.ts' };
    });
  },
};
const miniAppOutfile = path.join(root, 'node_modules', '.tmp', 'mini-app.test.cjs');

// Интеграция Telegram Mini App — отдельный бандл без браузерных заглушек setup.ts.
await build({
  entryPoints: [path.join(root, 'tests', 'mini-app.test.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: miniAppOutfile,
  logLevel: 'error',
  define: {
    'process.env.NODE_ENV': '"test"',
    'import.meta.env': JSON.stringify({ DEV: false }),
  },
  external: ['node:test', 'node:assert/strict'],
  plugins: [aliasPlugin],
});

await build({
  entryPoints: [path.join(root, 'tests', 'unit.test.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile,
  logLevel: 'error',
  define: {
    'process.env.NODE_ENV': '"test"',
    'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }),
  },
  external: ['node:test', 'node:assert/strict'],
  plugins: [aliasPlugin],
});

try {
  execFileSync(process.execPath, ['--test', outfile], { stdio: 'inherit', cwd: root });
  execFileSync(process.execPath, ['--test', miniAppOutfile], { stdio: 'inherit', cwd: root });
  execFileSync(process.execPath, ['--test', path.join(root, 'tests', 'telegram.test.mjs')], {
    stdio: 'inherit',
    cwd: root,
  });
} catch (e) {
  process.exit(e.status ?? 1);
}
