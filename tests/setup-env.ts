/**
 * Окружение для unit-тестов в Node: минимальный localStorage, чтобы демо-стор
 * и переключатель режима работали так же, как в браузере. Импортируется
 * первым в unit.test.ts — esbuild сохраняет порядок импортов в бандле.
 */
const store = new Map<string, string>()

const fake: Storage = {
  get length() {
    return store.size
  },
  clear: () => store.clear(),
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  key: (i: number) => [...store.keys()][i] ?? null,
  removeItem: (k: string) => void store.delete(k),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
}

Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true })

// В тестах ключи Supabase не заданы → isDemoActive() === true автоматически.
