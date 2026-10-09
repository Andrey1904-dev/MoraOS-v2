import { useState } from "react";
import {
  Bell,
  Bot,
  KeyRound,
  Layers,
  Plug,
  Send,
  ShieldCheck,
  Users,
} from "lucide-react";
import { PageContainer, PageHeader, Grid } from "@/components/layout/Page";
import { Card, CardHeader, Badge, Avatar, Divider, KeyStat } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, inputClass, textareaClass, Select, Switch } from "@/components/ui/Controls";

import { useResource } from "@/hooks/useResource";
import { repositories } from "@/repositories";
import { media } from "@/data/media";
import { TelegramSection } from "./settings/TelegramSection";
import { cn } from "@/utils/cn";

const SECTIONS = ["Персонаж", "AI", "Площадки", "Уведомления", "Команда", "Безопасность", "Telegram"] as const;

export default function Settings() {
  const { data: character } = useResource(() => repositories.character.get());
  const [section, setSection] = useState<(typeof SECTIONS)[number]>("Персонаж");

  const [ai, setAi] = useState({
    conversations: true,
    autoSend: false,
    memory: true,
    sales: true,
    content: true,
    escalation: true,
  });

  const [notifications, setNotifications] = useState({
    drafts: true,
    churn: true,
    revenue: true,
    publish: false,
    weekly: true,
  });

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Система"
        title="Настройки"
        description="Карточка персонажа, поведение AI, подключение площадок и параметры рабочей области."
        actions={
          <Button variant="primary" disabled title="Сохранение настроек пока недоступно" aria-label="Сохранить изменения (пока недоступно)">
            Сохранить изменения
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[200px_minmax(0,1fr)]">
        {/* Section nav */}
        <nav aria-label="Разделы настроек" className="hide-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 lg:sticky lg:top-20 lg:mx-0 lg:flex-col lg:self-start lg:px-0">
          {SECTIONS.map((s) => {
            const Icon =
              s === "Персонаж" ? Bot : s === "AI" ? Layers : s === "Площадки" ? Plug : s === "Уведомления" ? Bell : s === "Команда" ? Users : s === "Telegram" ? Send : ShieldCheck;
            return (
              <button
                key={s}
                onClick={() => setSection(s)}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors",
                  section === s ? "bg-surface-3 text-ink" : "text-muted hover:bg-surface-2 hover:text-ink-2",
                )}
              >
                <Icon className={cn("size-[15px]", section === s ? "text-accent-hi" : "text-faint")} strokeWidth={1.75} />
                {s}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 space-y-4">
          {section === "Персонаж" && (
            <>
              <Card>
                <CardHeader title="Персонаж" subtitle="Единый источник правды для всех агентов" />
                <div className="px-5 pb-5">
                  <div className="flex items-start gap-4">
                    <Avatar name="Mara Quinn" src={media.mara} size={64} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-[17px] font-medium text-ink">{character?.name ?? "Mara Quinn"}</h2>
                        <Badge tone="accent">Активный персонаж</Badge>
                      </div>
                      <div className="mt-1 text-[12.5px] text-muted">
                        {character?.age} · {character?.city} · {character?.occupation}
                      </div>
                      <div className="mt-2 text-[12.5px] text-ink-2">История: {character?.story}</div>
                    </div>
                  </div>

                  <Divider className="my-5" />

                  <div className="grid gap-5 lg:grid-cols-2">
                    <Field label="Имя">
                      <input defaultValue={character?.name} className={inputClass} />
                    </Field>
                    <Field label="Возраст">
                      <input defaultValue={String(character?.age ?? 23)} className={inputClass} />
                    </Field>
                    <Field label="Город">
                      <input defaultValue={character?.city} className={inputClass} />
                    </Field>
                    <Field label="Род занятий">
                      <input defaultValue={character?.occupation} className={inputClass} />
                    </Field>
                    <Field label="История" className="lg:col-span-2" hint="Используется Агентом контента для проверки непрерывности.">
                      <input defaultValue={character?.story} className={inputClass} />
                    </Field>
                    <Field label="Логлайн" className="lg:col-span-2">
                      <textarea rows={3} defaultValue={character?.logline} className={textareaClass} />
                    </Field>
                    <Field label="Голос" className="lg:col-span-2" hint="Каждое сгенерированное сообщение проверяется по этому описанию.">
                      <textarea rows={2} defaultValue={character?.voice} className={textareaClass} />
                    </Field>
                  </div>
                </div>
              </Card>

              <Card>
                <CardHeader title="Черты" subtitle="Статические атрибуты, передаваемые в промпты" />
                <div className="grid gap-px bg-line sm:grid-cols-2">
                  {(character?.traits ?? []).map((t) => (
                    <div key={t.label} className="bg-surface px-5 py-3.5">
                      <div className="label">{t.label}</div>
                      <div className="mt-1.5 text-[12.5px] text-ink">{t.value}</div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <CardHeader title="Границы" subtitle="Жёсткие правила — промпты их не переопределяют" />
                <div className="space-y-2 px-5 pb-5">
                  {(character?.boundaries ?? []).map((b) => (
                    <div key={b} className="flex items-start gap-2.5 rounded-lg border border-line bg-canvas-2/50 px-3.5 py-2.5">
                      <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-accent-hi" strokeWidth={1.8} />
                      <span className="text-[12.5px] text-ink-2">{b}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}

          {section === "AI" && (
            <>
              <Card>
                <CardHeader title="Поведение AI" subtitle="Что разрешено агентам" />
                <div className="divide-y divide-line px-5 pb-2">
                  <Switch
                    checked={ai.conversations}
                    onChange={(v) => setAi({ ...ai, conversations: v })}
                    label="AI-диалоги"
                    description="Агент диалогов готовит черновик ответа на каждое входящее сообщение."
                  />
                  <Switch
                    checked={ai.autoSend}
                    onChange={(v) => setAi({ ...ai, autoSend: v })}
                    label="Автоотправка"
                    description="Отправлять одобренные черновики автоматически. Держите выключенным, пока не подключён AI-провайдер."
                  />
                  <Switch
                    checked={ai.memory}
                    onChange={(v) => setAi({ ...ai, memory: v })}
                    label="Память"
                    description="Извлекать факты, предпочтения и границы из диалогов."
                  />
                  <Switch
                    checked={ai.sales}
                    onChange={(v) => setAi({ ...ai, sales: v })}
                    label="Рекомендации продаж"
                    description="Предлагать офферы на основе LTV, ритма покупок и предпочтений в контенте."
                  />
                  <Switch
                    checked={ai.content}
                    onChange={(v) => setAi({ ...ai, content: v })}
                    label="Генерация контента"
                    description="Хуки, подписи и раскадровки для каждого бита эпизода."
                  />
                  <Switch
                    checked={ai.escalation}
                    onChange={(v) => setAi({ ...ai, escalation: v })}
                    label="Эскалация нестандартных случаев"
                    description="Всё, что выходит за рамки карточки персонажа, становится задачей."
                  />
                </div>
              </Card>

              <Grid className="lg:grid-cols-2">
                <Card>
                  <CardHeader title="Маршрутизация моделей" subtitle="Какой провайдер за что отвечает" />
                  <div className="space-y-4 px-5 pb-5">
                    {[
                      { label: "Агент диалогов", value: "mock-provider" },
                      { label: "Агент памяти", value: "mock-provider" },
                      { label: "Агент контента", value: "mock-provider" },
                      { label: "Генерация изображений", value: "local" },
                    ].map((r) => (
                      <div key={r.label} className="flex items-center gap-3">
                        <span className="min-w-0 flex-1 text-[12.5px] text-muted">{r.label}</span>
                        <Select value={r.value as "mock-provider"} onChange={() => {}} options={["mock-provider", "cloud-pro", "local"] as const} className="w-44" />
                      </div>
                    ))}
                  </div>
                </Card>

                <Card>
                  <CardHeader title="Безопасность вывода" subtitle="Ограничения, применяемые к каждому результату" />
                  <div className="space-y-3 px-5 pb-5">
                    {[
                      { label: "Соблюдение карточки персонажа", value: "Строгое" },
                      { label: "Фильтр границ", value: "Включён" },
                      { label: "Одобрение отправки человеком", value: "Обязательно" },
                      { label: "Защита от prompt-инъекций", value: "Включена" },
                    ].map((r) => (
                      <div key={r.label} className="flex items-center justify-between">
                        <span className="text-[12.5px] text-muted">{r.label}</span>
                        <Badge tone={r.value === "Обязательно" ? "warn" : "pos"} dot>
                          {r.value}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </Card>
              </Grid>
            </>
          )}

          {section === "Площадки" && (
            <Card>
              <CardHeader title="Площадки" subtitle="В v1 коннекторы существуют только в интерфейсе" />
              <div className="divide-y divide-line px-5 pb-3">
                {[
                  { name: "Fanvue", detail: "Подписки, PPV, переписка", status: "Не подключено" },
                  { name: "Telegram", detail: "Бот-ассистент и Mini App · личные сообщения фанов не подключены", status: "Только бот" },
                  { name: "TikTok", detail: "Публикация + аналитика", status: "Не подключено" },
                  { name: "Instagram", detail: "Публикация + инбокс сообщений", status: "Не подключено" },
                  { name: "Threads", detail: "Текстовые посты + ответы", status: "Не подключено" },
                ].map((p) => (
                  <div key={p.name} className="flex flex-wrap items-center gap-3 py-3.5">
                    <span className="grid size-8 place-items-center rounded-lg border border-line bg-canvas-2 text-[11px] font-semibold text-ink-2">
                      {p.name.slice(0, 2)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-ink">{p.name}</div>
                      <div className="text-[11.5px] text-muted">{p.detail}</div>
                    </div>
                    <Badge tone={p.status === "Только бот" ? "info" : "neutral"} dot>
                      {p.status}
                    </Badge>
                    <Button size="sm" variant="subtle" disabled title="Коннекторы пока недоступны" aria-label={`Настроить ${p.name} (пока недоступно)`}>
                      Настроить
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {section === "Уведомления" && (
            <Card>
              <CardHeader title="Уведомления" subtitle="Что доходит до оператора" />
              <div className="divide-y divide-line px-5 pb-2">
                <Switch checked={notifications.drafts} onChange={(v) => setNotifications({ ...notifications, drafts: v })} label="Черновики ждут слишком долго" description="Уведомлять, если черновик ждёт больше 30 минут." />
                <Switch checked={notifications.churn} onChange={(v) => setNotifications({ ...notifications, churn: v })} label="Сигналы оттока" description="Фаны с высоким LTV, превысившие порог неактивности." />
                <Switch checked={notifications.revenue} onChange={(v) => setNotifications({ ...notifications, revenue: v })} label="Вехи выручки" description="Ежедневные и еженедельные сводки выручки." />
                <Switch checked={notifications.publish} onChange={(v) => setNotifications({ ...notifications, publish: v })} label="Подтверждения публикаций" description="Каждая успешная публикация на площадке." />
                <Switch checked={notifications.weekly} onChange={(v) => setNotifications({ ...notifications, weekly: v })} label="Еженедельный разбор бизнеса" description="Дайджест по понедельникам с выводами Агента аналитики." />
              </div>
            </Card>
          )}

          {section === "Команда" && (
            <Card>
              <CardHeader
                title="Команда"
                subtitle="Роли в рабочей области"
                action={<Button size="sm" variant="subtle" disabled title="Пока недоступно">Пригласить</Button>}
              />
              <div>
                {[
                  { name: "Андрей", role: "Владелец", email: "andrey@maraos.app", tone: "#8a5a4a" },
                  { name: "Ника", role: "Оператор", email: "nika@maraos.app", tone: "#4a6a8a" },
                  { name: "Лео", role: "Редактор", email: "leo@maraos.app", tone: "#4a8a72" },
                ].map((m) => (
                  <div key={m.email} className="flex items-center gap-3 border-b border-line/60 px-5 py-3.5 last:border-0">
                    <Avatar name={m.name} tone={m.tone} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] text-ink">{m.name}</div>
                      <div className="text-[11.5px] text-faint">{m.email}</div>
                    </div>
                    <Badge tone={m.role === "Владелец" ? "accent" : "neutral"}>{m.role}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {section === "Безопасность" && (
            <Grid className="lg:grid-cols-2">
              <Card>
                <CardHeader title="Безопасность" subtitle="Защита рабочей области" />
                <div className="space-y-3 px-5 pb-5">
                  <div className="flex items-center gap-3 rounded-lg border border-line bg-canvas-2/50 px-4 py-3">
                    <KeyRound className="size-4 text-faint" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] text-ink">Двухфакторная аутентификация</div>
                      <div className="text-[11px] text-faint">Обязательна для всех владельцев</div>
                    </div>
                    <Badge tone="pos" dot>
                      Вкл.
                    </Badge>
                  </div>
                  {[
                    { label: "Длительность сессии", value: "7 дней" },
                    { label: "Журнал аудита", value: "Включён" },
                    { label: "Выдано API-ключей", value: "2" },
                    { label: "Хранение данных", value: "ЕС" },
                  ].map((r) => (
                    <div key={r.label} className="flex items-center justify-between text-[12.5px]">
                      <span className="text-muted">{r.label}</span>
                      <span className="text-ink">{r.value}</span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <CardHeader title="Архитектура" subtitle="Что реализовано сегодня" />
                <div className="px-5 pb-5">
                  <div className="grid grid-cols-2 gap-5">
                    <KeyStat label="Слой интерфейса" value="Готов" hint="эта сборка" />
                    <KeyStat label="Репозитории" value="Реализованы" hint="демо и Supabase используют один интерфейс" />
                  </div>
                  <Divider className="my-4" />
                  <div className="space-y-2">
                    {[
                      { name: "FanRepository", status: "Реализован" },
                      { name: "ContentRepository", status: "Реализован" },
                      { name: "ConversationRepository", status: "Реализован" },
                      { name: "CommerceRepository", status: "Реализован" },
                      { name: "AnalyticsRepository", status: "Реализован" },
                      { name: "AIProvider", status: "Mock-провайдер, пока не настроен" },
                      { name: "FanvueAdapter", status: "Не начато" },
                      { name: "TelegramAdapter", status: "Бот и Mini App работают" },
                    ].map((r) => (
                      <div key={r.name} className="flex items-center justify-between rounded-lg border border-line bg-canvas-2/40 px-3 py-2">
                        <span className="font-mono text-[11.5px] text-ink-2">{r.name}</span>
                        <span className="text-right text-[11.5px] text-muted">{r.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </Grid>
          )}
          {section === "Telegram" && <TelegramSection />}
        </div>
      </div>
    </PageContainer>
  );
}
