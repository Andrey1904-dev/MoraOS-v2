/**
 * Telegram connector — существующая рабочая интеграция.
 *
 * Клиент привязки аккаунта и API bot server живут в src/lib/telegram.ts
 * (Mini App bridge — src/lib/telegram-mini-app.ts). Этот модуль —
 * просто точка входа в едином дереве integrations.
 */
export * from '../../telegram'
