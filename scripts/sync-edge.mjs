#!/usr/bin/env node
/**
 * Копирует общие модули бота в Edge Function `telegram-api`.
 *
 * Supabase деплоит только каталог функции, поэтому bot/*.mjs дублируются в
 * supabase/functions/telegram-api/. Источник правды — каталог bot/.
 *
 *   npm run sync:edge          — скопировать;
 *   npm run sync:edge -- --check — проверить, что копии совпадают (для CI и тестов).
 */
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const EDGE_SHARED_FILES = Object.freeze(['core.mjs', 'format.mjs', 'api.mjs', 'ai.mjs'])
export const EDGE_DIR = path.join(root, 'supabase', 'functions', 'telegram-api')

/** Возвращает список расхождений; пустой массив — копии совпадают. */
export function findEdgeDrift({ sourceDir = path.join(root, 'bot'), targetDir = EDGE_DIR } = {}) {
  const drift = []
  for (const file of EDGE_SHARED_FILES) {
    const source = path.join(sourceDir, file)
    const copy = path.join(targetDir, file)
    if (!existsSync(copy)) {
      drift.push(`${file}: копия отсутствует`)
    } else if (!readFileSync(source).equals(readFileSync(copy))) {
      drift.push(`${file}: копия отличается от bot/${file}`)
    }
  }
  return drift
}

export function syncEdgeCopies({ sourceDir = path.join(root, 'bot'), targetDir = EDGE_DIR } = {}) {
  for (const file of EDGE_SHARED_FILES) {
    copyFileSync(path.join(sourceDir, file), path.join(targetDir, file))
  }
  return EDGE_SHARED_FILES.map((file) => path.join(targetDir, file))
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  if (process.argv.includes('--check')) {
    const drift = findEdgeDrift()
    if (drift.length) {
      console.error(`Копии Edge Function расходятся с bot/:\n  ${drift.join('\n  ')}\nЗапустите: npm run sync:edge`)
      process.exit(1)
    }
    console.log('Копии Edge Function совпадают с bot/.')
  } else {
    syncEdgeCopies()
    console.log(`Скопировано в ${path.relative(root, EDGE_DIR)}: ${EDGE_SHARED_FILES.join(', ')}`)
  }
}
