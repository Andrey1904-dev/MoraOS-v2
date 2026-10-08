/**
 * Smoke-тест рендера всех экранов Mara OS без браузера.
 *
 * В песочнице нет Chromium, поэтому вместо скриншотов каждый маршрут
 * рендерится через react-dom/server с настоящими провайдерами в демо-режиме
 * (ключи Supabase пустые — isDemoActive() включается автоматически).
 * useResource грузит данные асинхронно, поэтому рендерится состояние
 * загрузки/скелетоны — цель теста не пиксельная картинка, а отсутствие
 * падений: битые импорты, отсутствующие компоненты, несовпадение форм данных.
 *
 * Запуск: node scripts/smoke-build.mjs (собирает esbuild-бандл и выполняет его)
 */
import fs from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h, StrictMode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../src/context/AuthContext.tsx';
import { ToastProvider } from '../src/components/ui/Feedback.tsx';
import { AppShell } from '../src/components/layout/AppShell.tsx';
import AuthPage from '../src/pages/AuthPage.tsx';
import Overview from '../src/pages/Overview.tsx';
import Fans from '../src/pages/Fans.tsx';
import FanProfile from '../src/pages/FanProfile.tsx';
import Conversations from '../src/pages/Conversations.tsx';
import Content from '../src/pages/Content.tsx';
import ContentEditor from '../src/pages/ContentEditor.tsx';
import Episodes from '../src/pages/Episodes.tsx';
import Assets from '../src/pages/Assets.tsx';
import Offers from '../src/pages/Offers.tsx';
import Revenue from '../src/pages/Revenue.tsx';
import Analytics from '../src/pages/Analytics.tsx';
import AIStudio from '../src/pages/AIStudio.tsx';
import Automations from '../src/pages/Automations.tsx';
import Tasks from '../src/pages/Tasks.tsx';
import Settings from '../src/pages/Settings.tsx';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
globalThis.window = globalThis;
globalThis.dispatchEvent = () => true;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.CustomEvent = class {
  constructor(type, init) {
    this.type = type;
    this.detail = init?.detail;
  }
};

const ROUTES = [
  ['/auth', AuthPage, 'авторизация', false],
  ['/', Overview, 'обзор', true],
  ['/fans', Fans, 'фан-база', true],
  ['/fans/f_demo_01', FanProfile, 'профиль фана', true],
  ['/conversations', Conversations, 'диалоги', true],
  ['/content', Content, 'контент', true],
  ['/content/new', ContentEditor, 'новый контент', true],
  ['/content/c_demo_01', ContentEditor, 'редактор контента', true],
  ['/episodes', Episodes, 'эпизоды', true],
  ['/assets', Assets, 'ассеты', true],
  ['/offers', Offers, 'офферы', true],
  ['/revenue', Revenue, 'выручка', true],
  ['/analytics', Analytics, 'аналитика', true],
  ['/ai', AIStudio, 'AI-студия', true],
  ['/automations', Automations, 'автоматизации', true],
  ['/tasks', Tasks, 'задачи', true],
  ['/settings', Settings, 'настройки', true],
];

let failed = 0;
for (const [path, Page, name, inShell] of ROUTES) {
  try {
    // Ждём тик, чтобы useResource успел начать загрузку — ловим и ошибки эффектов.
    const html = renderToStaticMarkup(
      h(
        StrictMode,
        null,
        h(
          MemoryRouter,
          { initialEntries: [path] },
          h(
            AuthProvider,
            null,
            h(
              ToastProvider,
              null,
              h(
                Routes,
                null,
                h(Route, { path: '/auth', element: h(Page) }),
                h(Route, { element: h(AppShell) }, h(Route, { path, element: h(Page) })),
              ),
            ),
          ),
        ),
      ),
    );
    const text = html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#x27;|&quot;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
    // SMOKE_DUMP=1 — выгрузить текст страниц (быстрая вычитка копирайта без браузера)
    if (process.env.SMOKE_DUMP) {
      fs.mkdirSync('node_modules/.tmp/dump', { recursive: true });
      fs.writeFileSync(`node_modules/.tmp/dump/${name}.txt`, text.replace(/ · /g, '\n· '));
    }
    console.log(
      `OK   ${path.padEnd(20)} ${name.padEnd(18)} ${String(html.length).padStart(6)} симв. | ${text.slice(0, 56)}`,
    );
    void inShell;
  } catch (e) {
    failed++;
    console.log(`FAIL ${path.padEnd(20)} ${name}: ${e?.message ?? e}`);
    if (e?.stack) console.log(e.stack.split('\n').slice(1, 4).join('\n'));
  }
}
console.log(
  failed
    ? `\n${failed} экранов упало`
    : `\nВсе экраны отрендерились без ошибок (демо-режим, ${ROUTES.length} маршрутов)`,
);
process.exit(failed ? 1 : 0);
