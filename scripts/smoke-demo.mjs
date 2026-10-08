/**
 * Регрессионный тест демо-режима Mara OS.
 *
 * Проверяет полный сценарий «вход в демо → данные CRM → AI-пайплайн → выход»
 * в сборке, где заданы ключи Supabase (именно такая уезжает на GitHub Pages):
 * кнопка «Explore demo mode» не должна трогать облако и молча падать.
 *
 * Тест выполняется в Node: src/lib + src/repositories + src/lib/ai собираются
 * esbuild-ом с «боевыми» переменными окружения.
 *
 * Запуск: node scripts/smoke-demo.mjs
 */
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outfile = path.join(root, 'node_modules', '.tmp', 'smoke-demo.mjs');

/* Браузерное окружение-заглушка */
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
globalThis.window = globalThis;
globalThis.location = { origin: 'https://example.test', pathname: '/' };
globalThis.dispatchEvent = () => true;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.CustomEvent = class {
  constructor(type, init) {
    this.type = type;
    this.detail = init?.detail;
  }
};

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

await build({
  entryPoints: [path.join(root, 'scripts', 'smoke-demo-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  logLevel: 'error',
  plugins: [aliasPlugin],
  define: {
    'process.env.NODE_ENV': '"production"',
    // ключи заданы — ровно та сборка, в которой демо не должно ломаться
    'import.meta.env': JSON.stringify({
      VITE_SUPABASE_URL: 'https://example-project.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'sb_publishable_example_key',
    }),
  },
});

const demo = await import(pathToFileURL(outfile).href);

let failed = 0;
const check = (name, condition, detail = '') => {
  if (condition) {
    console.log(`OK   ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

check('ключи Supabase распознаны', demo.isDemoOnly() === false);
check('по умолчанию работает облачный бэкенд', demo.getBackend().mode === 'supabase');

demo.setDemoMode(true);
check('после «Explore demo mode» бэкенд переключился', demo.getBackend().mode === 'demo');

const user = await demo.getBackend().auth.signIn('demo@mara.app', 'demo');
check('вход в демо выполнен', user?.email === 'demo@mara.app');
check('сессия демо сохраняется', (await demo.getBackend().auth.getUser())?.id === 'demo-user');

const repos = await demo.getRepositories();

const fans = await repos.fans.list();
check('демо-фан-база заполнена', fans.length >= 15, `фанов: ${fans.length}`);
check('есть фан уровня inner circle', fans.some((f) => f.relationship === 'Inner circle'));

const conversations = await repos.conversations.list();
check('демо-диалоги есть', conversations.length >= 5, `диалогов: ${conversations.length}`);

const offers = await repos.commerce.offers();
check('демо-офферы есть', offers.length >= 3, `офферов: ${offers.length}`);

const content = await repos.content.list();
check('демо-контент есть', content.length >= 5, `позиций: ${content.length}`);

const tasks = await repos.ai.tasks();
check('демо-задачи есть', tasks.length >= 3, `задач: ${tasks.length}`);

/* Human-in-the-loop: черновик от AI → правка → одобрение → отправка. */
const conv = conversations[0];
const draft = await repos.conversations.saveDraft(conv.id, 'smoke draft');
check('черновик AI ждёт одобрения', draft.state === 'awaiting_approval');
const approved = await repos.conversations.approveDraft(conv.id, draft.id, 'approved by human');
check('одобрение фиксирует решение (approved), а не доставку (sent)', approved.state === 'approved' && approved.body === 'approved by human');

/* Полный AI-пайплайн на mock-провайдере (работает без API-ключа). */
const fan = await repos.fans.get(conversations[0].fanId);
const messages = await repos.conversations.messages(conv.id);
const orchestrator = demo.getAiOrchestrator();
const pipeline = await demo.runReplyPipeline(orchestrator, {
  character: {
    name: 'Mara Quinn',
    voice: 'Dry, first-person, honest about numbers.',
    story: '365 days to buy back my time',
    lore: '$54k salary. $27k debt. One red notebook.',
    boundaries: ['Never break the diary frame'],
    personality: ['dry', 'confident'],
    recurringObjects: ['red notebook'],
  },
  fan: {
    id: fan.id,
    name: fan.name,
    relationshipLevel: 'fan',
    ltv: fan.ltv,
    purchases: fan.purchases,
    hasActiveSubscription: Boolean(fan.subscription),
    source: 'telegram',
  },
  memories: [],
  history: messages.slice(-6).map((m) => ({ author: m.author === 'fan' ? 'fan' : 'mara', body: m.body })),
  offers: offers.map((o) => ({ id: o.id, name: o.name, price: o.price, type: o.kind.toLowerCase() })),
});
check('AI-пайплайн вернул черновик', pipeline.draft.reply.length > 10);
check('вывод помечен как mock', pipeline.mock === true);

await demo.getBackend().auth.signOut();
check('выход из демо очищает сессию', (await demo.getBackend().auth.getUser()) === null);
demo.setDemoMode(false);
check('после выхода возвращается облачный режим', demo.getBackend().mode === 'supabase');

console.log(failed ? `\n${failed} проверок упало` : '\nДемо-режим Mara OS работает во всех состояниях');
process.exit(failed ? 1 : 0);
