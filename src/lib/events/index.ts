/**
 * Система событий Mara OS.
 *
 * События — основа воронки (visitor → follower → fan → subscriber → buyer),
 * атрибуции контента и входов для автоматизаций. Записываются в таблицу
 * `events` (Supabase) или в демо-стор — в зависимости от активного режима.
 * Трекинг никогда не ломает UX: ошибки гасятся, но считаются в консоль.
 */

export type MaraEventType =
  | 'fan_created'
  | 'fan_message'
  | 'content_view'
  | 'profile_visit'
  | 'subscription_started'
  | 'subscription_cancelled'
  | 'purchase_created'
  | 'offer_viewed'
  | 'telegram_linked'
  | 'ai_generated'
  | 'reply_approved'
  | 'fan_exported'
  | 'fan_erased'
  | 'demo_reset'
  | 'content_created'
  | 'content_published'
  | 'reply_sent'
  | 'automation_run'

export interface MaraEvent {
  type: MaraEventType
  entityType?: string
  entityId?: string
  platform?: string
  payload?: Record<string, unknown>
}

/**
 * Записать событие. Fire-and-forget для вызывающего кода: возвращает
 * Promise, но его можно не ждать.
 */
export async function trackEvent(event: MaraEvent): Promise<void> {
  try {
    const { isDemoActive, getBackend } = await import('@/lib')
    if (isDemoActive()) {
      const { mutateDemoStore, demoId } = await import('@/repositories/demo-store')
      mutateDemoStore((s) => {
        s.events.unshift({
          id: demoId('evt'),
          fanId: event.entityType === 'fan' ? (event.entityId ?? null) : null,
          type: event.type,
          title: event.type.replaceAll('_', ' '),
          detail: JSON.stringify(event.payload ?? {}),
          at: new Date().toISOString(),
          amount: typeof event.payload?.amount === 'number' ? event.payload.amount : undefined,
        })
      })
      return
    }
    const backend = getBackend()
    const token = await backend.auth.getAccessToken()
    if (!token) return
    const { getSupabase, ensureProfile } = await import('@/lib/supabase')
    const { data } = await getSupabase().auth.getUser()
    if (!data.user) return
    await ensureProfile({ id: data.user.id, email: data.user.email ?? '' }).catch(() => {})
    const { error } = await getSupabase()
      .from('events')
      .insert({
        user_id: data.user.id,
        type: event.type,
        entity_type: event.entityType ?? null,
        entity_id: event.entityId ?? null,
        platform: event.platform ?? null,
        payload: (event.payload ?? {}) as unknown as import('@/types/database.types').Json,
      })
    if (error) console.warn('[events] track failed:', error.message)
  } catch (e) {
    console.warn('[events] track failed:', e instanceof Error ? e.message : e)
  }
}
