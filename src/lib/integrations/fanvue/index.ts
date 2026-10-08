/**
 * Fanvue integration — abstraction layer.
 *
 * Реальная интеграция подключается только после проверки официальной
 * документации/API Fanvue и доступных возможностей. До тех пор приложение
 * работает через MockFanvueAdapter с тем же контрактом.
 */

export interface FanvueSubscriber {
  id: string
  username: string
  displayName: string
  subscribedAt: string
  status: 'active' | 'cancelled' | 'expired'
  spendTotal: number
}

export interface FanvueEarningsSummary {
  currency: string
  subscriptions: number
  ppv: number
  tips: number
  total: number
  periodStart: string
  periodEnd: string
}

export interface FanvueClient {
  readonly mode: 'mock' | 'live'
  listSubscribers(): Promise<FanvueSubscriber[]>
  earnings(periodDays: number): Promise<FanvueEarningsSummary>
  /** Синхронизация подписчиков/покупок в таблицы Mara OS. */
  sync(): Promise<{ imported: number; skipped: number }>
}

/** Заглушка до официальной интеграции: поведение продумано, данных нет. */
export class MockFanvueAdapter implements FanvueClient {
  readonly mode = 'mock' as const

  async listSubscribers(): Promise<FanvueSubscriber[]> {
    return []
  }

  async earnings(periodDays: number): Promise<FanvueEarningsSummary> {
    const end = new Date()
    const start = new Date(Date.now() - periodDays * 86_400_000)
    return {
      currency: 'USD',
      subscriptions: 0,
      ppv: 0,
      tips: 0,
      total: 0,
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
    }
  }

  async sync(): Promise<{ imported: number; skipped: number }> {
    return { imported: 0, skipped: 0 }
  }
}

let client: FanvueClient | null = null

/** Точка доступа к Fanvue: всегда через эту фабрику, не напрямую. */
export function getFanvueClient(): FanvueClient {
  if (!client) client = new MockFanvueAdapter()
  return client
}
