/**
 * Точка входа smoke-теста демо-режима: только то, что нужно scripts/smoke-demo.mjs.
 * Отдельный файл нужен, чтобы esbuild не тащил в бандл лишнее из src/lib.
 */
export {
  getBackend,
  setDemoMode,
  isDemoOnly,
  isDemoActive,
} from '@/lib';
export { getRepositories } from '@/repositories';
export { getAiOrchestrator, runReplyPipeline } from '@/lib/ai';
