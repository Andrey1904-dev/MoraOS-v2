/**
 * Social platform connectors — abstraction layer.
 *
 * TikTok / Instagram / Threads / Fanvue / Telegram подключаются через
 * единый интерфейс: UI и агенты не знают о конкретных API. Реализации
 * добавляются только после проверки официальных API соответствующих
 * платформ; никаких обходов ограничений, скрейпинга и накруток.
 */

export type SocialPlatformKey = 'tiktok' | 'instagram' | 'threads' | 'fanvue' | 'telegram'

export interface PublishRequest {
  contentId: string
  caption: string
  assetUrls: string[]
  scheduledAt?: string
}

export interface PublishResult {
  ok: boolean
  externalId?: string
  url?: string
  error?: string
}

export interface PlatformMetrics {
  views: number
  likes: number
  comments: number
  shares: number
  saves: number
  profileVisits: number
  measuredAt: string
}

export interface SocialPlatformAdapter {
  readonly platform: SocialPlatformKey
  readonly connected: boolean
  publish(request: PublishRequest): Promise<PublishResult>
  metrics(contentId: string): Promise<PlatformMetrics | null>
}

class DisconnectedAdapter implements SocialPlatformAdapter {
  readonly connected = false
  constructor(readonly platform: SocialPlatformKey) {}
  async publish(): Promise<PublishResult> {
    return { ok: false, error: `${this.platform} is not connected yet — wire the official API first.` }
  }
  async metrics(): Promise<PlatformMetrics | null> {
    return null
  }
}

const adapters = new Map<SocialPlatformKey, SocialPlatformAdapter>()

export function getPlatformAdapter(platform: SocialPlatformKey): SocialPlatformAdapter {
  let adapter = adapters.get(platform)
  if (!adapter) {
    adapter = new DisconnectedAdapter(platform)
    adapters.set(platform, adapter)
  }
  return adapter
}
