import type {
  Agent,
  AIInsight,
  Automation,
  Character,
  MetricSnapshot,
  SeriesPoint,
  Task,
} from "@/types";

const days = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const mins = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

/* -------------------------------- Character ------------------------------ */

export const character: Character = {
  id: "char_mara",
  name: "Mara Quinn",
  age: 23,
  city: "Chicago",
  occupation: "Маркетинг-координатор",
  story: "365 дней, чтобы выкупить своё время",
  logline:
    "23-летняя маркетинг-координатор из Чикаго записывает каждый должный час в красный блокнот — и даёт себе год, чтобы выкупить всё обратно.",
  voice:
    "Сухой, от первого лица, честный про цифры. Никогда не сладкий и не отчаянный. Короткие предложения, когда больно.",
  boundaries: [
    "Без откровенного контента",
    "Никогда не выходить из формата дневника от первого лица",
    "Не выдумывать цифры долга, противоречащие опубликованным эпизодам",
    "Без политики и медицинских тем",
  ],
  traits: [
    { label: "Тон", value: "Сухой, с самоиронией" },
    { label: "Стиль", value: "Дневниковая публицистика" },
    { label: "Фирменный предмет", value: "Красный блокнот" },
    { label: "Язык", value: "Русский" },
    { label: "Ритм публикаций", value: "Ежедневно · эпизоды по пятницам" },
  ],
};

/* --------------------------------- Metrics ------------------------------- */

const metricSet = (scale: number): MetricSnapshot[] => [
  { key: "revenue", label: "Выручка", value: "$4,820", raw: 4820 * scale, delta: 12.4, hint: "к прошлому периоду", accent: true },
  { key: "subs", label: "Подписчики", value: "184", raw: 184 * scale, delta: 8.2, hint: "активные подписки" },
  { key: "fans", label: "Новые фаны", value: "327", raw: Math.round(327 * scale), delta: 21.6, hint: "первый контакт установлен" },
  { key: "ppv", label: "Продажи PPV", value: "$1,940", raw: 1940 * scale, delta: 16.1, hint: "разовые доступы" },
  { key: "ltv", label: "Средний LTV", value: "$74", raw: 74 * scale, delta: 4.3, hint: "на фана, за всё время" },
  { key: "churn", label: "Отток", value: "4.8%", raw: 4.8, delta: -0.6, hint: "месячный отток подписок" },
];

export const metrics = (period: string): MetricSnapshot[] => {
  const scale =
    period === "7 days" ? 0.28 : period === "30 days" ? 1 : period === "90 days" ? 2.7 : 6.4;
  return metricSet(scale).map((m) =>
    m.key === "churn"
      ? { ...m, value: period === "7 days" ? "3.9%" : period === "90 days" ? "5.6%" : period === "All time" ? "6.1%" : "4.8%" }
      : {
          ...m,
          value:
            m.key === "subs"
              ? String(Math.round(m.raw))
              : m.key === "fans"
                ? String(Math.round(m.raw))
                : `$${Math.round(m.raw).toLocaleString("en-US")}`,
        },
  );
};

/* --------------------------------- Series -------------------------------- */

const revenue7: SeriesPoint[] = [
  { label: "Пн", value: 382, compare: 310 },
  { label: "Вт", value: 455, compare: 372 },
  { label: "Ср", value: 512, compare: 401 },
  { label: "Чт", value: 468, compare: 428 },
  { label: "Пт", value: 894, compare: 604 },
  { label: "Сб", value: 1120, compare: 712 },
  { label: "Вс", value: 989, compare: 648 },
];

const revenue30: SeriesPoint[] = Array.from({ length: 30 }, (_, i) => {
  const base = 90 + Math.sin(i / 2.4) * 42 + i * 3.6;
  const weekend = i % 7 === 5 || i % 7 === 6 ? 62 : 0;
  return {
    label: `${i + 1}`,
    value: Math.round(base + weekend),
    compare: Math.round(base * 0.78 + weekend * 0.6),
  };
});

export const revenue = (period: string): SeriesPoint[] =>
  period === "7 days"
    ? revenue7
    : period === "90 days"
      ? Array.from({ length: 13 }, (_, i) => ({
          label: `W${i + 1}`,
          value: Math.round(760 + i * 118 + Math.sin(i / 1.7) * 180),
          compare: Math.round(600 + i * 92 + Math.sin(i / 1.7) * 140),
        }))
      : period === "All time"
        ? Array.from({ length: 12 }, (_, i) => ({
            label: ["Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек", "Янв", "Фев"][i],
            value: Math.round(1180 + i * 340 + Math.sin(i / 1.4) * 320),
            compare: Math.round(880 + i * 250 + Math.sin(i / 1.4) * 240),
          }))
        : revenue30;

export const audience = (period: string): SeriesPoint[] => {
  const len = period === "7 days" ? 7 : period === "90 days" ? 13 : period === "All time" ? 12 : 30;
  return Array.from({ length: len }, (_, i) => {
    const t = i / Math.max(1, len - 1);
    return {
      label: period === "All time" ? ["Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек", "Янв", "Фев"][i] : `${i + 1}`,
      value: Math.round(1840 + t * 641 + Math.sin(t * 6) * 60),
      compare: Math.round(1204 + t * 380 + Math.sin(t * 6) * 40),
    };
  });
};

export const engagement = (period: string): SeriesPoint[] => {
  const len = period === "7 days" ? 7 : period === "90 days" ? 13 : period === "All time" ? 12 : 30;
  return Array.from({ length: len }, (_, i) => ({
    label: `${i + 1}`,
    value: Number((5.2 + Math.sin(i / 2.1) * 1.8 + (i % 5) * 0.32).toFixed(1)),
    compare: Number((4.4 + Math.cos(i / 2.6) * 1.1).toFixed(1)),
  }));
};

export const funnel: SeriesPoint[] = [
  { label: "Охват", value: 412000 },
  { label: "Заходы в профиль", value: 38600 },
  { label: "Создано фанов", value: 2481 },
  { label: "Первая покупка", value: 684 },
  { label: "Подписчики", value: 184 },
  { label: "Ближний круг", value: 27 },
];

export const retention: SeriesPoint[] = [
  { label: "M1", value: 100 },
  { label: "M2", value: 86 },
  { label: "M3", value: 74 },
  { label: "M4", value: 63 },
  { label: "M5", value: 58 },
  { label: "M6", value: 52 },
];

export const revenueBySource: SeriesPoint[] = [
  { label: "Fanvue", value: 2810 },
  { label: "TikTok", value: 640 },
  { label: "Instagram", value: 512 },
  { label: "Telegram", value: 486 },
  { label: "Threads", value: 372 },
];

export const revenueByOffer: SeriesPoint[] = [
  { label: "Подписка", value: 2610 },
  { label: "Приветственный набор", value: 1632 },
  { label: "Ближний круг", value: 1323 },
  { label: "Сет «Зеркало в зале»", value: 778 },
  { label: "Поздний вечер", value: 479 },
];

export const topSpenders = [
  { fanId: "fan_ryan", name: "Ryan Whitfield", handle: "@ryanwhit", amount: 1240, orders: 21, last: mins(18) },
  { fanId: "fan_alex", name: "Alex Johnson", handle: "@alexjohnson", amount: 840, orders: 14, last: mins(4) },
  { fanId: "fan_jordan", name: "Jordan Vance", handle: "@jordanvance", amount: 812, orders: 11, last: mins(63) },
  { fanId: "fan_ben", name: "Ben Adler", handle: "@benadler", amount: 306, orders: 9, last: days(6) },
  { fanId: "fan_daniel", name: "Daniel Osei", handle: "@danielosei", amount: 236, orders: 8, last: mins(122) },
];

export const topContent = [
  { rank: 1, title: "Блокнот", views: 82400, followers: 2988, platform: "TikTok" as const, id: "cnt_01" },
  { rank: 2, title: "Снова понедельник", views: 61300, followers: 1871, platform: "Instagram" as const, id: "cnt_02" },
  { rank: 3, title: "Отчёт по долгу", views: 49200, followers: 1104, platform: "Threads" as const, id: "cnt_03" },
];

/* ----------------------------------- AI ---------------------------------- */

export const agents: Agent[] = [
  {
    id: "character",
    name: "Агент персонажа",
    role: "Держит Мару в образе",
    status: "Online",
    lastRun: mins(3),
    tasks: 148,
    successRate: 99.1,
    description:
      "Отвечает за голос Мары, границы и непрерывность сюжета. Проверяет каждое исходящее сообщение и подпись по карточке персонажа.",
    capabilities: ["Проверка голоса", "Непрерывность", "Контроль границ"],
  },
  {
    id: "conversation",
    name: "Агент диалогов",
    role: "Пишет черновик каждого ответа",
    status: "Online",
    lastRun: mins(1),
    tasks: 1240,
    successRate: 94.7,
    description:
      "Пишет ответы голосом Мары, определяет намерение и эскалирует всё, что требует решения человека. Никогда не отправляет без одобрения.",
    capabilities: ["Черновики ответов", "Определение намерений", "Эскалация"],
  },
  {
    id: "memory",
    name: "Агент памяти",
    role: "Запоминает фанов",
    status: "Online",
    lastRun: mins(7),
    tasks: 862,
    successRate: 96.3,
    description:
      "Извлекает факты, предпочтения и границы из диалогов и превращает их в структурированные воспоминания с оценкой уверенности.",
    capabilities: ["Извлечение фактов", "Модель предпочтений", "Затухание"],
  },
  {
    id: "content",
    name: "Агент контента",
    role: "Строит сюжет",
    status: "Online",
    lastRun: mins(22),
    tasks: 316,
    successRate: 91.8,
    description:
      "Превращает сюжетные биты в хуки, подписи и раскадровки. Сопоставляет эпизоды с ассетами и предлагает календарь публикаций.",
    capabilities: ["Хуки", "Подписи", "Раскадровки", "Календарь"],
  },
  {
    id: "sales",
    name: "Агент продаж",
    role: "Монетизирует без давления",
    status: "Online",
    lastRun: mins(12),
    tasks: 508,
    successRate: 88.4,
    description:
      "Предлагает подходящий оффер нужному фану в нужный момент — на основе LTV, ритма покупок и предпочтений в контенте.",
    capabilities: ["Подбор оффера", "Тайминг", "Возврат"],
  },
  {
    id: "analytics",
    name: "Агент аналитики",
    role: "Объясняет цифры",
    status: "Idle",
    lastRun: mins(48),
    tasks: 194,
    successRate: 97.2,
    description:
      "Следит за результатами на площадках, находит работающее и формулирует инсайт, по которому оператору стоит действовать сегодня.",
    capabilities: ["Поиск аномалий", "Атрибуция", "Инсайты"],
  },
];

export const insights: AIInsight[] = [
  {
    id: "ins_01",
    kind: "insight",
    title: "Сюжет обгоняет одиночные посты",
    body: `Сюжет «365 дней» опережает одиночные лайфстайл-посты на 34%.`,
    recommendation: "Продолжайте сюжет на этой неделе — эпизод 05 должен выйти в пятницу, а не на следующей неделе.",
    confidence: 93,
    cta: { label: "Создать эпизод", to: "/episodes" },
  },
  {
    id: "ins_02",
    kind: "recommendation",
    title: "Кластер риска оттока",
    body: "4 подписчика поставили паузу в течение 48 часов после изменения цены. Все четверо смотрели эпизод 03, но не 04.",
    recommendation: "До пятницы отправьте превью эпизода 04 с ценой лояльности на месяц.",
    confidence: 81,
    cta: { label: "Черновики сообщений", to: "/conversations" },
  },
  {
    id: "ins_03",
    kind: "recommendation",
    title: "Спрос на фитнес-PPV",
    body: "Фаны с воспоминанием о фитнесе покупали в 3,2 раза чаще, когда PPV ссылался на тренировки.",
    recommendation: "Ведите следующий дроп сетом «6 утра в зале», а не квартирным сетом.",
    confidence: 87,
    cta: { label: "Открыть контент", to: "/content" },
  },
  {
    id: "ins_04",
    kind: "risk",
    title: "Задержка ответов",
    body: "Медианное время первого ответа выросло до 41 минуты. Фаны ближнего круга отвечают в 6 раз чаще, если ответ приходит быстрее 10 минут.",
    recommendation: "Одобрите 12 черновиков в очереди в ближайший час.",
    confidence: 90,
    cta: { label: "Открыть инбокс", to: "/conversations" },
  },
];

export const automations: Automation[] = [
  {
    id: "auto_01",
    name: "Онбординг нового фана",
    trigger: "Создан новый фан",
    status: "Active",
    runs: 2481,
    lastRun: mins(12),
    steps: [
      { id: "s1", label: "Создать профиль в CRM", detail: "Запись о фана, атрибуция источника, первый контакт", actor: "system" },
      { id: "s2", label: "Присвоить уровень отношений", detail: "Гость → Подписчик, по источнику и вовлечённости", actor: "system" },
      { id: "s3", label: "Запустить отслеживание памяти", detail: "Агент памяти подписывается на диалоги фана", actor: "ai" },
      { id: "s4", label: "Поставить приветственное сообщение в очередь", detail: "Черновик создан, ждёт одобрения", actor: "ai" },
    ],
  },
  {
    id: "auto_02",
    name: "Покупка PPV → следующее действие",
    trigger: "Фан покупает PPV",
    status: "Active",
    runs: 684,
    lastRun: mins(4),
    steps: [
      { id: "s1", label: "Обновить LTV", detail: "Сумма добавляется к пожизненной ценности и атрибуции выручки", actor: "system" },
      { id: "s2", label: "Обновить отношения", detail: "Подписчик → Фанат при $1, Фанат → Ближний круг при $500", actor: "system" },
      { id: "s3", label: "Добавить событие", detail: "Событие покупки записывается в таймлайн фана", actor: "system" },
      { id: "s4", label: "AI предлагает следующее действие", detail: "Агент продаж предлагает продолжение оффера", actor: "ai" },
    ],
  },
  {
    id: "auto_03",
    name: "Спасение при риске оттока",
    trigger: "Нет активности 7 дней",
    status: "Active",
    runs: 96,
    lastRun: mins(38),
    steps: [
      { id: "s1", label: "Обнаружить неактивность", detail: "Оценка «спит» считается ночью", actor: "system" },
      { id: "s2", label: "Достать воспоминания", detail: "Топ-3 предпочтения для персонализации", actor: "ai" },
      { id: "s3", label: "Черновик сообщения о возврате", detail: "Тон: честный, скидка только при LTV > $200", actor: "ai" },
      { id: "s4", label: "Уведомить оператора", detail: "Задача создаётся в группе «Сегодня»", actor: "system" },
    ],
  },
  {
    id: "auto_04",
    name: "Публикация эпизода",
    trigger: "Эпизод помечен «Готово»",
    status: "Paused",
    runs: 5,
    lastRun: days(2),
    steps: [
      { id: "s1", label: "Прикрепить ассеты", detail: "Одобренные ассеты подбираются под бит эпизода", actor: "system" },
      { id: "s2", label: "Сгенерировать подпись и хук", detail: "Агент контента пишет 3 варианта", actor: "ai" },
      { id: "s3", label: "Собрать версии для площадок", detail: "Варианты 9:16, 4:5 и только текст", actor: "system" },
      { id: "s4", label: "Запланировать на пятницу, 18:00", detail: "Ждёт одобрения оператора", actor: "system" },
    ],
  },
];

export const tasks: Task[] = [
  { id: "t1", title: "Одобрить 8 ответов AI", detail: "Агент диалогов: 8 черновиков ждут больше 30 минут.", status: "Todo", priority: "High", group: "Сегодня", due: "09:30", source: "Conversations" },
  { id: "t2", title: "Просмотреть 3 изображения", detail: "Ассеты ast_05, ast_11, ast_12 ждут одобрения.", status: "Todo", priority: "Normal", group: "Сегодня", due: "11:00", source: "Assets" },
  { id: "t3", title: "Опубликовать эпизод 05", detail: "«Реальность» — запланирован на пятницу 18:00, нужна финальная подпись.", status: "Todo", priority: "High", group: "Сегодня", due: "18:00", source: "Episodes" },
  { id: "t4", title: "Проверить 2 фанов с риском оттока", detail: "Ben Adler и Andre Silva перешли порог в 7 дней.", status: "Todo", priority: "High", group: "Сегодня", due: "12:00", source: "Fans" },
  { id: "t5", title: "Написать план эпизода 06", detail: "Чикагский бит — нужно решение по второму персонажу.", status: "In progress", priority: "Normal", group: "Сегодня", due: "20:00", source: "AI Studio" },
  { id: "t6", title: "Одобрить подпись к сету «Зеркало в зале»", detail: "Агент контента сгенерировал 3 варианта хука.", status: "In progress", priority: "Normal", group: "Сегодня", due: "15:00", source: "Content" },
  { id: "t7", title: "Настроить A/B-тест приветственного набора", detail: "$24 против $19 для фанов с TikTok.", status: "Todo", priority: "Low", group: "На этой неделе", due: "Чт", source: "Offers" },
  { id: "t8", title: "Обновить сводки памяти ближнего круга", detail: "27 фанам ближнего круга нужен свежий срез предпочтений.", status: "Todo", priority: "Low", group: "На этой неделе", due: "Пт", source: "AI Studio" },
  { id: "t9", title: "Сверить выплату Fanvue", detail: "Февральская выплата $2,810 против учёта.", status: "Done", priority: "Normal", group: "Сегодня", due: "08:00", source: "Revenue" },
  { id: "t10", title: "Опубликовать трейлер эпизода 04", detail: "Версии для TikTok и Instagram.", status: "Done", priority: "Normal", group: "Сегодня", due: "07:40", source: "Content" },
];

export const actionQueue = [
  { id: "q1", label: "12 диалогов ждут одобрения", meta: " старейший 41 мин", tone: "warn" as const, to: "/conversations" },
  { id: "q2", label: "3 единицы контента готовы к публикации", meta: " эпизод 05 + 2 сторис", tone: "pos" as const, to: "/content" },
  { id: "q3", label: "2 ценных фана активны", meta: " Ryan · Alex", tone: "accent" as const, to: "/fans" },
  { id: "q4", label: "1 подписчик в риске оттока", meta: " Ben Adler", tone: "neg" as const, to: "/fans" },
];
