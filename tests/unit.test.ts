/**
 * Модульные тесты Mara OS (node:test, собираются esbuild-ом — см. scripts/test.mjs).
 *
 * Покрытие:
 *   • форматтеры и утилиты UI;
 *   • слой AI: mock-провайдер, структурированные ответы агентов,
 *     business rules Sales Agent, дедупликация Memory Agent, Character Agent;
 *   • демо-репозитории: fans, conversations (draft → approve → send),
 *     content drafts, tasks, automations, ai_runs, память;
 *   • события (events) в демо-режиме;
 *   • сервис-локатор репозиториев.
 */
import './setup-env'
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { parseJsonFromText } from '../src/lib/ai/provider'
import { MockAIProvider } from '../src/lib/ai/mock'
import { CharacterAgent } from '../src/lib/ai/character-agent'
import { ConversationAgent } from '../src/lib/ai/conversation-agent'
import { MemoryAgent } from '../src/lib/ai/memory-agent'
import { SalesAgent } from '../src/lib/ai/sales-agent'
import { ContentAgent } from '../src/lib/ai/content-agent'
import { AnalyticsAgent } from '../src/lib/ai/analytics-agent'
import { AiOrchestrator, runReplyPipeline } from '../src/lib/ai/orchestrator'
import type { CharacterContext, ConversationTurn, FanContext, MemoryFact } from '../src/lib/ai/types'

import { demoRepositories } from '../src/repositories/demo'
import { demoStore, mutateDemoStore, resetDemoStore } from '../src/repositories/demo-store'
import { trackEvent } from '../src/lib/events'

/* ------------------------------ фикстуры ------------------------------ */

const CHARACTER: CharacterContext = {
  name: 'Mara Quinn',
  voice: 'Dry, first-person, honest about numbers. Never corporate, never robotic.',
  story: '365 days to buy back my time',
  lore: '$54k salary. $27k debt. One red notebook. One year.',
  boundaries: ['Never break the first-person diary frame', 'No explicit content'],
  personality: ['dry', 'confident', 'playful', 'intelligent'],
  recurringObjects: ['red notebook'],
}

const FAN: FanContext = {
  id: 'fan_test',
  name: 'Alex Rivera',
  relationshipLevel: 'fan',
  ltv: 240,
  purchases: 4,
  hasActiveSubscription: false,
  source: 'telegram',
}

const HISTORY: ConversationTurn[] = [
  { author: 'fan', body: 'That 6am gym set was unreal. Do you actually write the debt number down every morning?' },
  { author: 'mara', body: 'Every morning, page 43 and counting.' },
  { author: 'fan', body: 'I work night shifts so the 6am posts hit different. From Austin by the way' },
]

const MEMORIES: MemoryFact[] = [{ memory: 'Lives in Austin, TX', category: 'location', importance: 0.7 }]

const mock = () => new MockAIProvider(1)

/* ------------------------------ provider ------------------------------ */

describe('AI provider primitives', () => {
  test('parseJsonFromText: чистый JSON', () => {
    assert.deepEqual(parseJsonFromText('{"a": 1}'), { a: 1 })
  })
  test('parseJsonFromText: fenced ```json блок', () => {
    assert.deepEqual(parseJsonFromText('```json\n{"a": 2}\n```'), { a: 2 })
  })
  test('parseJsonFromText: JSON внутри лишнего текста', () => {
    assert.deepEqual(parseJsonFromText('sure! {"ok": true} done'), { ok: true })
  })
  test('parseJsonFromText: мусор — ошибка', () => {
    assert.throws(() => parseJsonFromText('no json here'))
  })

  test('MockAIProvider помечает вывод mock и даёт JSON для схемы', async () => {
    const p = mock()
    const res = await p.generate({ agent: 'conversation', prompt: 'Fan: Alex\nLast message: hey', schema: {} })
    assert.equal(res.mock, true)
    const parsed = parseJsonFromText(res.text) as Record<string, unknown>
    assert.equal(typeof parsed.reply, 'string')
  })

  test('embed: нормированный детерминированный вектор', async () => {
    const p = mock()
    const a = await p.embed('night shifts')
    const b = await p.embed('night shifts')
    assert.deepEqual(a, b)
    assert.ok(Math.abs(Math.hypot(...a) - 1) < 1e-9)
  })
})

/* ------------------------------ Character Agent ------------------------------ */

describe('CharacterAgent', () => {
  const agent = new CharacterAgent()

  test('systemPrompt содержит voice, story и boundaries', () => {
    const prompt = agent.systemPrompt(CHARACTER)
    assert.match(prompt, /Dry, first-person/)
    assert.match(prompt, /365 days to buy back my time/)
    assert.match(prompt, /No explicit content/)
    assert.match(prompt, /red notebook/)
  })

  test('check ловит AI-обороты и корпоративный тон', () => {
    assert.equal(agent.check("As an AI, I can't do that", CHARACTER).ok, false)
    assert.equal(agent.check('Let us leverage synergy here', CHARACTER).ok, false)
    assert.equal(agent.check('The notebook saw the number first.', CHARACTER).ok, true)
  })
})

/* ---------------------------- Conversation Agent ---------------------------- */

describe('ConversationAgent', () => {
  test('структурированный черновик ответа', async () => {
    const agent = new ConversationAgent(mock())
    const result = await agent.reply({ character: CHARACTER, fan: FAN, memories: MEMORIES, history: HISTORY })
    assert.ok(result.reply.length > 10)
    assert.ok(['greeting', 'flirting', 'price_check', 'story_followup', 'support', 'smalltalk', 'other'].includes(result.intent))
    assert.ok(['none', 'recommend_offer', 'wait', 'nurture'].includes(result.sales_action))
    assert.ok(result.confidence > 0 && result.confidence <= 1)
  })

  test('покупательский сигнал → рекомендация оффера', async () => {
    const agent = new ConversationAgent(mock())
    const result = await agent.reply({
      character: CHARACTER,
      fan: FAN,
      memories: [],
      history: [{ author: 'fan', body: 'how much is the PPV drop? want to buy' }],
    })
    assert.equal(result.sales_action, 'recommend_offer')
  })

  test('пустой ответ модели не падает: санитайзер подставляет defaults', async () => {
    class Broken extends MockAIProvider {
      override async generateStructured(request: never, parse: (raw: unknown) => never): Promise<never> {
        void request
        return Promise.resolve({ data: parse(null), mock: true, model: 'broken', durationMs: 1 } as never)
      }
    }
    const agent = new ConversationAgent(new Broken(1))
    const result = await agent.reply({ character: CHARACTER, fan: FAN, memories: [], history: HISTORY })
    assert.equal(result.intent, 'other')
    assert.equal(result.sales_action, 'none')
    assert.equal(result.memory_candidate, null)
    assert.equal(result.relationship_level, 'fan')
  })
})

/* ------------------------------ Memory Agent ------------------------------ */

describe('MemoryAgent', () => {
  test('извлекает факт из диалога', async () => {
    const agent = new MemoryAgent(mock())
    const result = await agent.extract({ history: HISTORY, existingMemories: [] })
    assert.ok(result.memory === null || typeof result.memory === 'string')
  })

  test('нет факта → memory null', async () => {
    const agent = new MemoryAgent(mock())
    const result = await agent.extract({
      history: [{ author: 'fan', body: 'haha nice' }],
      existingMemories: [],
    })
    assert.equal(result.memory, null)
  })

  test('дубль против существующих воспоминаний не создаётся', async () => {
    class FixedMemory extends MockAIProvider {
      override async generateStructured(_request: never, parse: (raw: unknown) => never): Promise<never> {
        return Promise.resolve({
          data: parse({ memory: 'Fan works night shifts', category: 'lifestyle', importance: 0.6 }),
          mock: true,
          model: 'fixed',
          durationMs: 1,
        } as never)
      }
    }
    const agent = new MemoryAgent(new FixedMemory(1))
    const dup = await agent.extract({
      history: [{ author: 'fan', body: 'I work night shifts' }],
      existingMemories: [{ memory: 'Fan works night shifts', category: 'lifestyle', importance: 0.6 }],
    })
    assert.equal(dup.memory, null)
    const fresh = await agent.extract({
      history: [{ author: 'fan', body: 'I work night shifts' }],
      existingMemories: [],
    })
    assert.equal(fresh.memory, 'Fan works night shifts')
  })
})

/* ------------------------------ Sales Agent ------------------------------ */

describe('SalesAgent', () => {
  const offers = [
    { id: 'o_ppv', name: 'PPV drop', price: 15, type: 'ppv' },
    { id: 'o_sub', name: 'Standard', price: 19.99, type: 'subscription' },
  ]

  test('явный интерес к покупке → recommend_offer с оффером', async () => {
    const agent = new SalesAgent(mock())
    const result = await agent.decide({
      fan: FAN,
      recentMessages: [{ author: 'fan', body: 'what does the ppv cost?' }],
      offers,
    })
    assert.equal(result.action, 'recommend_offer')
    assert.ok(result.offer_id === 'o_ppv' || result.offer_id === 'o_sub')
  })

  test('business rules: холодный фан не получает sell_now', async () => {
    class Pushy extends MockAIProvider {
      override async generateStructured(_r: never, parse: (raw: unknown) => never): Promise<never> {
        return Promise.resolve({
          data: parse({ action: 'sell_now', offer_id: 'o_sub', reason: 'Push.', confidence: 0.9 }),
          mock: true,
          model: 'pushy',
          durationMs: 1,
        } as never)
      }
    }
    const agent = new SalesAgent(new Pushy(1))
    const result = await agent.decide({
      fan: { ...FAN, purchases: 0, hasActiveSubscription: false },
      recentMessages: [{ author: 'fan', body: 'hi' }],
      offers,
    })
    assert.equal(result.action, 'nurture')
  })

  test('business rules: без офферов — no_sales', async () => {
    const agent = new SalesAgent(mock())
    const result = await agent.decide({
      fan: FAN,
      recentMessages: [{ author: 'fan', body: 'buy buy buy' }],
      offers: [],
    })
    assert.equal(result.action, 'no_sales')
  })

  test('business rules: низкая уверенность понижает действие до wait', async () => {
    class Unsure extends MockAIProvider {
      override async generateStructured(_r: never, parse: (raw: unknown) => never): Promise<never> {
        return Promise.resolve({
          data: parse({ action: 'sell_now', offer_id: 'o_ppv', reason: 'Maybe.', confidence: 0.3 }),
          mock: true,
          model: 'unsure',
          durationMs: 1,
        } as never)
      }
    }
    const agent = new SalesAgent(new Unsure(1))
    const result = await agent.decide({
      fan: { ...FAN, purchases: 5 },
      recentMessages: [{ author: 'fan', body: 'buy' }],
      offers,
    })
    assert.equal(result.action, 'wait')
  })
})

/* --------------------------- Content / Analytics --------------------------- */

describe('ContentAgent + AnalyticsAgent', () => {
  test('контент: 3 хука, подпись и варианты', async () => {
    const agent = new ContentAgent(mock())
    const result = await agent.generate({
      character: CHARACTER,
      platform: 'tiktok',
      contentType: 'reel',
      theme: 'gym',
      episodeTitle: 'Episode 02',
    })
    assert.ok(result.hooks.length >= 3)
    assert.ok(result.caption.length > 0)
    assert.ok(result.variants.length >= 2)
  })

  test('аналитика: конкретные инсайты с числами', async () => {
    const agent = new AnalyticsAgent(mock())
    const result = await agent.analyze({
      metrics: [{ key: 'revenue', label: 'Revenue', value: '$4,820', delta: 12.4 }],
      funnel: [{ label: 'Visitors', value: 100 }],
    })
    assert.ok(result.insights.length >= 1)
    assert.ok(result.insights[0].title.length > 0)
    assert.ok(result.insights.every((i) => i.confidence >= 0 && i.confidence <= 1))
  })
})

/* ------------------------------ Orchestrator ------------------------------ */

describe('AI Orchestrator', () => {
  test('reply pipeline: draft + sales + memory, помечен mock', async () => {
    const logged: string[] = []
    const orchestrator = new AiOrchestrator(mock(), {
      log: async (entry) => {
        logged.push(entry.agent)
      },
    })
    const result = await runReplyPipeline(orchestrator, {
      character: CHARACTER,
      fan: FAN,
      memories: MEMORIES,
      history: HISTORY,
      offers: [{ id: 'o1', name: 'PPV', price: 15, type: 'ppv' }],
    })
    assert.equal(result.mock, true)
    assert.ok(result.draft.reply.length > 0)
    assert.ok(logged.includes('conversation'))
    assert.ok(logged.includes('sales'))
    assert.ok(logged.includes('memory'))
  })
})

/* ------------------------------ Демо-репозитории ------------------------------ */

describe('Demo repositories', () => {
  beforeEach(() => {
    resetDemoStore()
  })

  test('fans: список, фильтры сегментов и поиск', async () => {
    const repos = demoRepositories
    const all = await repos.fans.list()
    assert.ok(all.length >= 15, `ожидали ≥15 демо-фанов, получили ${all.length}`)
    const inner = await repos.fans.list({ segment: 'Inner circle' })
    assert.ok(inner.length > 0 && inner.every((f) => f.relationship === 'Inner circle'))
    const search = await repos.fans.list({ search: 'alex' })
    assert.ok(search.some((f) => f.name.toLowerCase().includes('alex')))
  })

  test('fan: память добавляется и читается', async () => {
    const repos = demoRepositories
    const fan = (await repos.fans.list())[0]
    const before = await repos.fans.memories(fan.id)
    await repos.fans.addMemory(fan.id, {
      statement: 'Works night shifts',
      category: 'lifestyle',
      confidence: 0.7,
      source: 'test',
    })
    const after = await repos.fans.memories(fan.id)
    assert.equal(after.length, before.length + 1)
    assert.ok(after.some((m) => m.statement === 'Works night shifts'))
    await repos.fans.setRelationship(fan.id, 'Favorite')
    const updated = await repos.fans.get(fan.id)
    assert.equal(updated?.relationship, 'Favorite')
  })

  test('conversations: draft → approve → sent, счётчики читаются', async () => {
    const repos = demoRepositories
    const conv = (await repos.conversations.list())[0]
    const draft = await repos.conversations.saveDraft(conv.id, 'Draft reply in Mara voice')
    assert.equal(draft.state, 'awaiting_approval')
    assert.equal(draft.author, 'ai_draft')

    const withDraft = (await repos.conversations.list()).find((c) => c.id === conv.id)!
    assert.ok(withDraft.awaitingApproval >= 1)

    const approved = await repos.conversations.approveDraft(conv.id, draft.id, 'Edited by human')
    assert.equal(approved.state, 'approved', 'одобрение — не доставка')
    assert.equal(approved.author, 'mara')
    assert.equal(approved.body, 'Edited by human')

    await repos.conversations.sendMessage(conv.id, { body: 'manual note', author: 'mara' })
    const msgs = await repos.conversations.messages(conv.id)
    assert.ok(msgs.some((m) => m.body === 'manual note' && m.state === 'approved'))

    await repos.conversations.markRead(conv.id)
    const read = (await repos.conversations.list()).find((c) => c.id === conv.id)!
    assert.equal(read.unread, 0)
  })

  test('content: черновик создаётся, статус меняется', async () => {
    const repos = demoRepositories
    const item = await repos.content.saveDraft({ title: 'New reel', hook: 'hook', platform: 'TikTok', type: 'Video' })
    assert.equal(item.status, 'Draft')
    const after = await repos.content.setStatus(item.id, 'Ready')
    assert.equal(after?.status, 'Ready')
    const list = await repos.content.list()
    assert.ok(list.some((c) => c.id === item.id && c.status === 'Ready'))
  })

  test('tasks: статус и новая задача', async () => {
    const repos = demoRepositories
    const [first] = await repos.ai.tasks()
    await repos.ai.setTaskStatus(first.id, 'Done')
    const tasks = await repos.ai.tasks()
    assert.equal(tasks.find((t) => t.id === first.id)?.status, 'Done')

    const added = await repos.ai.addTask({ title: 'Approve PPV', detail: 'x', priority: 'Urgent', group: 'Today', due: 'Fri' })
    assert.equal((await repos.ai.tasks())[0].id, added.id)
  })

  test('automations: enable/disable/run меняют состояние', async () => {
    const repos = demoRepositories
    const [auto] = await repos.ai.automations()
    const paused = await repos.ai.setAutomationStatus(auto.id, 'Paused')
    assert.equal(paused?.status, 'Paused')
    const ran = await repos.ai.recordAutomationRun(auto.id)
    assert.ok(ran && ran.runs >= 1 && ran.lastRun.length > 0)
  })

  test('ai_runs: лог пишется и читается', async () => {
    const repos = demoRepositories
    await repos.ai.logRun({ agent: 'conversation', input: { fan: 1 }, output: {}, status: 'success', model: 'mock', durationMs: 12 })
    const runs = await repos.ai.runs(10)
    assert.equal(runs[0].agent, 'conversation')
    assert.equal(runs[0].model, 'mock')
  })
})

/* ------------------------------ События ------------------------------ */

describe('Event tracking (demo mode)', () => {
  test('события фана попадают в его ленту', async () => {
    resetDemoStore()
    const fan = (await demoRepositories.fans.list())[0]
    await trackEvent({
      type: 'purchase_created',
      entityType: 'fan',
      entityId: fan.id,
      platform: 'fanvue',
      payload: { amount: 15 },
    })
    const events = await demoRepositories.fans.events(fan.id)
    assert.ok(events.some((e) => e.type === 'purchase' && e.amount === 15))
    assert.ok(events.some((e) => e.amount === 15))
  })

  test('события без fan не падают', async () => {
    resetDemoStore()
    await trackEvent({ type: 'ai_generated', entityType: 'message', payload: {} })
    assert.ok(demoStore().events.length >= 1)
  })
})

/* ------------------------------ Демо-стор ------------------------------ */

describe('Demo store', () => {
  beforeEach(() => {
    resetDemoStore()
  })
  test('сброс возвращает вымышленный датасет', async () => {
    resetDemoStore()
    mutateDemoStore((s) => {
      s.readConversations.push('c1')
    })
    assert.deepEqual(demoStore().readConversations, ['c1'])
    resetDemoStore()
    assert.deepEqual(demoStore().readConversations, [])
  })
})

/* ------------------------------------------ выгрузки, удаление и пароли --- */
import { csvCell, fansToCsv, fanDossierToJson, exportFileName, toCsv } from '../src/lib/export'
import { passwordProblem, PASSWORD_MIN_LENGTH } from '../src/lib/passwordPolicy'

describe('CSV exports', () => {
  test('cells are quoted and protected against spreadsheet formula injection', () => {
    assert.equal(csvCell('plain'), 'plain')
    assert.equal(csvCell('a,b'), '"a,b"')
    assert.equal(csvCell('say "hi"'), '"say ""hi"""')
    assert.equal(csvCell('+1'), "'+1")
    assert.equal(csvCell('@cmd'), "'@cmd")
    assert.equal(csvCell('=1+1'), "'=1+1")
    assert.equal(csvCell(-5), '-5', 'числа не экранируются')
    assert.equal(csvCell(null), '')
  })

  test('toCsv writes CRLF lines with a header row', () => {
    assert.equal(toCsv(['a', 'b'], [[1, 'x,y']]), 'a,b\r\n1,"x,y"\r\n')
  })

  test('fansToCsv writes one line per fan with the documented columns', () => {
    const fan = {
      id: 'f1', name: 'Anna, K', handle: '@anna', source: 'Telegram', relationship: 'Fan', status: 'Active',
      ltv: 120, purchases: 2, subscription: null, lastActivity: '2026-10-01T10:00:00Z', joined: '2026-01-01',
      location: 'Berlin', tags: ['vip', 'gym'],
    }
    const [header, line] = fansToCsv([fan as never]).trimEnd().split('\r\n')
    assert.equal(header.split(',')[0], 'id')
    assert.ok(header.includes('ltv_usd'))
    assert.ok(line.startsWith("f1,\"Anna, K\",'@anna,Telegram"), 'хэндл с @ экранируется от формул')
    assert.ok(line.endsWith(',None,2026-10-01T10:00:00Z,2026-01-01,Berlin,vip; gym'))
  })

  test('export file names are sanitized and the dossier is valid JSON', () => {
    assert.equal(exportFileName('fan', '2026-10-08T12-00-00', '../../etc/passwd x'), 'mara-os-fan-etcpasswdx-2026-10-08T12-00-00')
    assert.equal(exportFileName('fans', '2026-10-08T12-00-00'), 'mara-os-fans-2026-10-08T12-00-00')
    const json = fanDossierToJson({ exportedAt: '2026-10-08T00:00:00Z', fan: {} as never, memories: [], events: [], purchases: [], conversations: [] })
    assert.equal(JSON.parse(json).exportedAt, '2026-10-08T00:00:00Z')
  })
})

describe('password policy', () => {
  test('minimum length is 8 and the problem text names it', () => {
    assert.equal(PASSWORD_MIN_LENGTH, 8)
    assert.match(passwordProblem('1234567') ?? '', /at least 8/)
    assert.equal(passwordProblem('12345678'), null)
  })

  test('passwords above 72 bytes are rejected (multi-byte characters count as bytes)', () => {
    assert.match(passwordProblem('ä'.repeat(40)) ?? '', /at most 72 bytes/)
    assert.equal(passwordProblem('a'.repeat(72)), null)
  })
})

describe('fan data export and erasure (demo repositories)', () => {
  test('export returns the dossier; erase hides the fan from every screen', async () => {
    const fans = await demoRepositories.fans.list()
    const target = fans[fans.length - 1]
    const dossier = await demoRepositories.fans.exportData(target.id)
    assert.ok(dossier)
    assert.equal(dossier.fan.id, target.id)
    assert.ok(Array.isArray(dossier.conversations))

    assert.equal(await demoRepositories.fans.erase(target.id), true)
    assert.equal((await demoRepositories.fans.list()).some((f) => f.id === target.id), false)
    assert.equal(await demoRepositories.fans.get(target.id), null)
    assert.equal(await demoRepositories.fans.exportData(target.id), null)
    assert.equal((await demoRepositories.conversations.list()).some((c) => c.fanId === target.id), false)
    assert.equal(await demoRepositories.fans.erase(target.id), false, 'повторное удаление ничего не находит')
  })

  test('replies written by the operator are approved, never reported as sent', async () => {
    const conv = (await demoRepositories.conversations.list())[0]
    const message = await demoRepositories.conversations.sendMessage(conv.id, { body: 'hello', author: 'mara' })
    assert.equal(message.state, 'approved')
    const draft = await demoRepositories.conversations.saveDraft(conv.id, 'draft text')
    const approved = await demoRepositories.conversations.approveDraft(conv.id, draft.id)
    assert.equal(approved.state, 'approved')
  })
})
