/**
 * Типы схемы Mara OS (Supabase / PostgreSQL).
 *
 * Соответствуют миграциям supabase/migrations/ (0002–0004). Формат — как у
 * `supabase gen types`, но поддерживается вручную: меняете SQL — обновляйте файл.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type RelationshipLevelDb =
  | 'visitor'
  | 'follower'
  | 'regular'
  | 'fan'
  | 'favorite'
  | 'inner_circle'
export type FanStatusDb = 'active' | 'new' | 'inactive' | 'churn_risk' | 'churned'
export type PlatformDb = 'telegram' | 'fanvue' | 'instagram' | 'tiktok' | 'threads' | 'manual'
export type ConversationStatusDb = 'open' | 'waiting' | 'closed'
export type SenderTypeDb = 'fan' | 'mara' | 'system'
export type MessageTypeDb = 'text' | 'image' | 'video' | 'ppv' | 'system'
export type MessageStatusDb = 'draft' | 'awaiting_approval' | 'approved' | 'sent' | 'failed'
export type ContentTypeDb =
  | 'photo'
  | 'video'
  | 'reel'
  | 'short'
  | 'story'
  | 'post'
  | 'carousel'
  | 'thread'
  | 'message'
  | 'ppv'
export type ContentStatusDb = 'idea' | 'draft' | 'ready' | 'scheduled' | 'published' | 'archived'
export type AssetKindDb = 'image' | 'video' | 'audio' | 'document' | 'other'
export type AssetCategoryDb =
  | 'portrait'
  | 'lifestyle'
  | 'fashion'
  | 'gym'
  | 'home'
  | 'car'
  | 'travel'
  | 'story'
  | 'ppv'
  | 'private'
  | 'other'
export type ApprovalStatusDb = 'pending' | 'approved' | 'rejected'
export type OfferTypeDb = 'subscription' | 'ppv' | 'bundle' | 'vip' | 'custom' | 'telegram_vip'
export type OfferStatusDb = 'draft' | 'live' | 'paused' | 'archived'
export type PurchaseStatusDb = 'pending' | 'paid' | 'refunded' | 'failed'
export type SubscriptionStatusDb = 'active' | 'cancelled' | 'expired' | 'paused'
export type RevenueCategoryDb = 'subscription' | 'ppv' | 'tip' | 'custom' | 'affiliate' | 'other'
export type TaskTypeDb = 'content' | 'fan' | 'sales' | 'technical' | 'analytics' | 'marketing' | 'admin'
export type TaskStatusDb = 'todo' | 'in_progress' | 'waiting' | 'done' | 'cancelled'
export type TaskPriorityDb = 'low' | 'medium' | 'high' | 'urgent'
export type RunStatusDb = 'success' | 'error' | 'pending'
export type AutomationTriggerTypeDb = 'schedule' | 'event' | 'condition' | 'manual'
export type AutomationStatusDb = 'active' | 'paused' | 'disabled'
export type EpisodeStatusDb = 'outline' | 'in_production' | 'scheduled' | 'published' | 'archived'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; email: string; created_at: string }
        Insert: { id: string; email: string; created_at?: string }
        Update: { id?: string; email?: string; created_at?: string }
        Relationships: []
      }
      characters: {
        Row: {
          id: string
          user_id: string
          name: string
          slug: string
          description: string
          age_display: string
          location: string
          occupation: string
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          slug: string
          description?: string
          age_display?: string
          location?: string
          occupation?: string
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['characters']['Insert']>
        Relationships: []
      }
      character_traits: {
        Row: {
          id: string
          user_id: string
          character_id: string
          personality: Json
          tone: string
          interests: Json
          dislikes: Json
          speech_style: string
          boundaries: Json
          lore: string
          backstory: string
          recurring_objects: Json
          story_rules: Json
          public_persona: string
          private_persona: string
          relationship_rules: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          character_id: string
          personality?: Json
          tone?: string
          interests?: Json
          dislikes?: Json
          speech_style?: string
          boundaries?: Json
          lore?: string
          backstory?: string
          recurring_objects?: Json
          story_rules?: Json
          public_persona?: string
          private_persona?: string
          relationship_rules?: Json
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['character_traits']['Insert']>
        Relationships: []
      }
      fans: {
        Row: {
          id: string
          user_id: string
          character_id: string | null
          display_name: string
          username: string
          email: string | null
          telegram_user_id: number | null
          source: string
          status: FanStatusDb
          relationship_level: RelationshipLevelDb
          segments: string[]
          lifetime_value: number
          total_purchases: number
          last_interaction_at: string | null
          location: string
          joined_at: string
          notes: string
          tags: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          character_id?: string | null
          display_name: string
          username?: string
          email?: string | null
          telegram_user_id?: number | null
          source?: string
          status?: FanStatusDb
          relationship_level?: RelationshipLevelDb
          segments?: string[]
          lifetime_value?: number
          total_purchases?: number
          last_interaction_at?: string | null
          location?: string
          joined_at?: string
          notes?: string
          tags?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['fans']['Insert']>
        Relationships: []
      }
      fan_memories: {
        Row: {
          id: string
          user_id: string
          fan_id: string
          memory: string
          category: string
          importance: number
          source_message_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          fan_id: string
          memory: string
          category?: string
          importance?: number
          source_message_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['fan_memories']['Insert']>
        Relationships: []
      }
      conversations: {
        Row: {
          id: string
          user_id: string
          character_id: string | null
          fan_id: string
          platform: PlatformDb
          subject: string
          status: ConversationStatusDb
          unread_count: number
          awaiting_approval_count: number
          pinned: boolean
          last_message_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          character_id?: string | null
          fan_id: string
          platform?: PlatformDb
          subject?: string
          status?: ConversationStatusDb
          unread_count?: number
          awaiting_approval_count?: number
          pinned?: boolean
          last_message_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['conversations']['Insert']>
        Relationships: []
      }
      messages: {
        Row: {
          id: string
          user_id: string
          conversation_id: string
          sender_type: SenderTypeDb
          sender_id: string | null
          content: string
          platform: PlatformDb
          message_type: MessageTypeDb
          status: MessageStatusDb
          ai_generated: boolean
          approved: boolean
          sent_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          conversation_id: string
          sender_type: SenderTypeDb
          sender_id?: string | null
          content: string
          platform?: PlatformDb
          message_type?: MessageTypeDb
          status?: MessageStatusDb
          ai_generated?: boolean
          approved?: boolean
          sent_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['messages']['Insert']>
        Relationships: []
      }
      episodes: {
        Row: {
          id: string
          user_id: string
          character_id: string | null
          number: number
          title: string
          summary: string
          status: EpisodeStatusDb
          start_date: string | null
          end_date: string | null
          key_events: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          character_id?: string | null
          number: number
          title: string
          summary?: string
          status?: EpisodeStatusDb
          start_date?: string | null
          end_date?: string | null
          key_events?: Json
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['episodes']['Insert']>
        Relationships: []
      }
      content: {
        Row: {
          id: string
          user_id: string
          character_id: string | null
          episode_id: string | null
          title: string
          description: string
          content_type: ContentTypeDb
          platform: PlatformDb
          status: ContentStatusDb
          caption: string
          hook: string
          script: string
          cta: string
          asset_ids: string[]
          scheduled_at: string | null
          published_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          character_id?: string | null
          episode_id?: string | null
          title: string
          description?: string
          content_type?: ContentTypeDb
          platform?: PlatformDb
          status?: ContentStatusDb
          caption?: string
          hook?: string
          script?: string
          cta?: string
          asset_ids?: string[]
          scheduled_at?: string | null
          published_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['content']['Insert']>
        Relationships: []
      }
      assets: {
        Row: {
          id: string
          user_id: string
          character_id: string | null
          kind: AssetKindDb
          category: AssetCategoryDb
          title: string
          description: string
          storage_path: string | null
          url: string | null
          thumbnail_url: string | null
          prompt: string
          model: string
          tags: string[]
          approval: ApprovalStatusDb
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          character_id?: string | null
          kind?: AssetKindDb
          category?: AssetCategoryDb
          title: string
          description?: string
          storage_path?: string | null
          url?: string | null
          thumbnail_url?: string | null
          prompt?: string
          model?: string
          tags?: string[]
          approval?: ApprovalStatusDb
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['assets']['Insert']>
        Relationships: []
      }
      content_performance: {
        Row: {
          id: string
          user_id: string
          content_id: string
          platform: PlatformDb
          views: number
          likes: number
          comments: number
          shares: number
          saves: number
          clicks: number
          profile_visits: number
          conversions: number
          revenue: number
          measured_at: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          content_id: string
          platform: PlatformDb
          views?: number
          likes?: number
          comments?: number
          shares?: number
          saves?: number
          clicks?: number
          profile_visits?: number
          conversions?: number
          revenue?: number
          measured_at?: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['content_performance']['Insert']>
        Relationships: []
      }
      offers: {
        Row: {
          id: string
          user_id: string
          character_id: string | null
          name: string
          description: string
          price: number
          currency: string
          type: OfferTypeDb
          status: OfferStatusDb
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          character_id?: string | null
          name: string
          description?: string
          price: number
          currency?: string
          type: OfferTypeDb
          status?: OfferStatusDb
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['offers']['Insert']>
        Relationships: []
      }
      purchases: {
        Row: {
          id: string
          user_id: string
          fan_id: string
          offer_id: string | null
          amount: number
          currency: string
          platform: PlatformDb
          status: PurchaseStatusDb
          purchased_at: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          fan_id: string
          offer_id?: string | null
          amount: number
          currency?: string
          platform?: PlatformDb
          status?: PurchaseStatusDb
          purchased_at?: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['purchases']['Insert']>
        Relationships: []
      }
      subscriptions: {
        Row: {
          id: string
          user_id: string
          fan_id: string
          offer_id: string | null
          platform: PlatformDb
          status: SubscriptionStatusDb
          started_at: string
          expires_at: string | null
          cancelled_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          fan_id: string
          offer_id?: string | null
          platform?: PlatformDb
          status?: SubscriptionStatusDb
          started_at?: string
          expires_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['subscriptions']['Insert']>
        Relationships: []
      }
      revenue_events: {
        Row: {
          id: string
          user_id: string
          fan_id: string | null
          offer_id: string | null
          category: RevenueCategoryDb
          amount: number
          currency: string
          platform: PlatformDb | null
          purchase_id: string | null
          occurred_at: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          fan_id?: string | null
          offer_id?: string | null
          category: RevenueCategoryDb
          amount: number
          currency?: string
          platform?: PlatformDb | null
          purchase_id?: string | null
          occurred_at?: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['revenue_events']['Insert']>
        Relationships: []
      }
      tasks: {
        Row: {
          id: string
          user_id: string
          title: string
          detail: string
          type: TaskTypeDb
          status: TaskStatusDb
          priority: TaskPriorityDb
          due_date: string | null
          source: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          detail?: string
          type?: TaskTypeDb
          status?: TaskStatusDb
          priority?: TaskPriorityDb
          due_date?: string | null
          source?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['tasks']['Insert']>
        Relationships: []
      }
      ai_runs: {
        Row: {
          id: string
          user_id: string
          agent: string
          input: Json
          output: Json
          status: RunStatusDb
          model: string
          tokens: number | null
          duration_ms: number | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          agent: string
          input?: Json
          output?: Json
          status?: RunStatusDb
          model?: string
          tokens?: number | null
          duration_ms?: number | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['ai_runs']['Insert']>
        Relationships: []
      }
      ai_insights: {
        Row: {
          id: string
          user_id: string
          kind: 'insight' | 'recommendation' | 'risk'
          title: string
          body: string
          recommendation: string
          confidence: number | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          kind?: 'insight' | 'recommendation' | 'risk'
          title: string
          body?: string
          recommendation?: string
          confidence?: number | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['ai_insights']['Insert']>
        Relationships: []
      }
      automations: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string
          trigger_type: AutomationTriggerTypeDb
          trigger_config: Json
          action_type: string
          action_config: Json
          status: AutomationStatusDb
          enabled: boolean
          last_run_at: string | null
          next_run_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          description?: string
          trigger_type?: AutomationTriggerTypeDb
          trigger_config?: Json
          action_type?: string
          action_config?: Json
          status?: AutomationStatusDb
          enabled?: boolean
          last_run_at?: string | null
          next_run_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['automations']['Insert']>
        Relationships: []
      }
      automation_runs: {
        Row: {
          id: string
          user_id: string
          automation_id: string
          status: RunStatusDb
          detail: Json
          started_at: string
          finished_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          automation_id: string
          status?: RunStatusDb
          detail?: Json
          started_at?: string
          finished_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['automation_runs']['Insert']>
        Relationships: []
      }
      events: {
        Row: {
          id: string
          user_id: string
          type: string
          entity_type: string | null
          entity_id: string | null
          platform: string | null
          payload: Json
          occurred_at: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: string
          entity_type?: string | null
          entity_id?: string | null
          platform?: string | null
          payload?: Json
          occurred_at?: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['events']['Insert']>
        Relationships: []
      }
      telegram_link_codes: {
        Row: {
          code_hash: string
          telegram_chat_id: number
          telegram_user_id: number
          telegram_display: string
          created_at: string
          expires_at: string
          used_at: string | null
        }
        Insert: {
          code_hash: string
          telegram_chat_id: number
          telegram_user_id: number
          telegram_display?: string
          created_at?: string
          expires_at: string
          used_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['telegram_link_codes']['Insert']>
        Relationships: []
      }
      rate_limits: {
        Row: {
          key: string
          window_start: string
          hits: number
        }
        Insert: {
          key: string
          window_start?: string
          hits?: number
        }
        Update: Partial<Database['public']['Tables']['rate_limits']['Insert']>
        Relationships: []
      }
      telegram_links: {
        Row: {
          user_id: string
          telegram_chat_id: number
          telegram_user_id: number
          linked_at: string
        }
        Insert: {
          user_id: string
          telegram_chat_id: number
          telegram_user_id: number
          linked_at?: string
        }
        Update: Partial<Database['public']['Tables']['telegram_links']['Insert']>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      link_telegram_account: {
        Args: { p_code_hash: string; p_user_id: string }
        Returns: boolean
      }
      consume_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
