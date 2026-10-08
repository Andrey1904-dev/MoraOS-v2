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
  occupation: "Marketing Coordinator",
  story: "365 days to buy back my time",
  logline:
    "A 23-year-old marketing coordinator in Chicago counts every hour she owes in a red notebook — and gives herself one year to buy all of it back.",
  voice:
    "Dry, first-person, honest about numbers. Never sweet, never desperate. Short sentences when it hurts.",
  boundaries: [
    "No explicit content",
    "Never break the first-person diary frame",
    "Never invent real debt numbers that contradict published episodes",
    "No political or medical topics",
  ],
  traits: [
    { label: "Tone", value: "Dry, self-aware" },
    { label: "Style", value: "Editorial diary" },
    { label: "Signature object", value: "Red notebook" },
    { label: "Language", value: "English" },
    { label: "Posting cadence", value: "Daily · episode Fridays" },
  ],
};

/* --------------------------------- Metrics ------------------------------- */

const metricSet = (scale: number): MetricSnapshot[] => [
  { key: "revenue", label: "Revenue", value: "$4,820", raw: 4820 * scale, delta: 12.4, hint: "vs previous period", accent: true },
  { key: "subs", label: "Subscribers", value: "184", raw: 184 * scale, delta: 8.2, hint: "active subscriptions" },
  { key: "fans", label: "New Fans", value: "327", raw: Math.round(327 * scale), delta: 21.6, hint: "first contact created" },
  { key: "ppv", label: "PPV Sales", value: "$1,940", raw: 1940 * scale, delta: 16.1, hint: "one-time unlocks" },
  { key: "ltv", label: "Average LTV", value: "$74", raw: 74 * scale, delta: 4.3, hint: "per fan, lifetime" },
  { key: "churn", label: "Churn", value: "4.8%", raw: 4.8, delta: -0.6, hint: "monthly subscription churn" },
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
  { label: "Mon", value: 382, compare: 310 },
  { label: "Tue", value: 455, compare: 372 },
  { label: "Wed", value: 512, compare: 401 },
  { label: "Thu", value: 468, compare: 428 },
  { label: "Fri", value: 894, compare: 604 },
  { label: "Sat", value: 1120, compare: 712 },
  { label: "Sun", value: 989, compare: 648 },
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
            label: ["Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb"][i],
            value: Math.round(1180 + i * 340 + Math.sin(i / 1.4) * 320),
            compare: Math.round(880 + i * 250 + Math.sin(i / 1.4) * 240),
          }))
        : revenue30;

export const audience = (period: string): SeriesPoint[] => {
  const len = period === "7 days" ? 7 : period === "90 days" ? 13 : period === "All time" ? 12 : 30;
  return Array.from({ length: len }, (_, i) => {
    const t = i / Math.max(1, len - 1);
    return {
      label: period === "All time" ? ["Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb"][i] : `${i + 1}`,
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
  { label: "Reach", value: 412000 },
  { label: "Profile visits", value: 38600 },
  { label: "Fans created", value: 2481 },
  { label: "First purchase", value: 684 },
  { label: "Subscribers", value: 184 },
  { label: "Inner circle", value: 27 },
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
  { label: "Subscription", value: 2610 },
  { label: "Welcome bundle", value: 1632 },
  { label: "Inner circle", value: 1323 },
  { label: "Gym mirror set", value: 778 },
  { label: "Late night", value: 479 },
];

export const topSpenders = [
  { fanId: "fan_ryan", name: "Ryan Whitfield", handle: "@ryanwhit", amount: 1240, orders: 21, last: mins(18) },
  { fanId: "fan_alex", name: "Alex Johnson", handle: "@alexjohnson", amount: 840, orders: 14, last: mins(4) },
  { fanId: "fan_jordan", name: "Jordan Vance", handle: "@jordanvance", amount: 812, orders: 11, last: mins(63) },
  { fanId: "fan_ben", name: "Ben Adler", handle: "@benadler", amount: 306, orders: 9, last: days(6) },
  { fanId: "fan_daniel", name: "Daniel Osei", handle: "@danielosei", amount: 236, orders: 8, last: mins(122) },
];

export const topContent = [
  { rank: 1, title: "The notebook", views: 82400, followers: 2988, platform: "TikTok" as const, id: "cnt_01" },
  { rank: 2, title: "Monday again", views: 61300, followers: 1871, platform: "Instagram" as const, id: "cnt_02" },
  { rank: 3, title: "Debt update", views: 49200, followers: 1104, platform: "Threads" as const, id: "cnt_03" },
];

/* ----------------------------------- AI ---------------------------------- */

export const agents: Agent[] = [
  {
    id: "character",
    name: "Character Agent",
    role: "Keeps Mara consistent",
    status: "Online",
    lastRun: mins(3),
    tasks: 148,
    successRate: 99.1,
    description:
      "Owns Mara's voice, boundaries and storyline continuity. Reviews every outbound message and caption against the character card.",
    capabilities: ["Voice checks", "Continuity", "Boundary guardrails"],
  },
  {
    id: "conversation",
    name: "Conversation Agent",
    role: "Drafts every reply",
    status: "Online",
    lastRun: mins(1),
    tasks: 1240,
    successRate: 94.7,
    description:
      "Writes replies in Mara's voice, detects intent, escalates anything that needs a human decision. Never sends without approval.",
    capabilities: ["Draft replies", "Intent detection", "Escalation"],
  },
  {
    id: "memory",
    name: "Memory Agent",
    role: "Remembers the fans",
    status: "Online",
    lastRun: mins(7),
    tasks: 862,
    successRate: 96.3,
    description:
      "Extracts facts, preferences and boundaries from conversations and turns them into structured memories with confidence scores.",
    capabilities: ["Fact extraction", "Preference modelling", "Decay"],
  },
  {
    id: "content",
    name: "Content Agent",
    role: "Builds the storyline",
    status: "Online",
    lastRun: mins(22),
    tasks: 316,
    successRate: 91.8,
    description:
      "Turns story beats into hooks, captions and shot lists. Matches episodes to assets and proposes the publishing calendar.",
    capabilities: ["Hooks", "Captions", "Shot lists", "Calendar"],
  },
  {
    id: "sales",
    name: "Sales Agent",
    role: "Monetizes without pressure",
    status: "Online",
    lastRun: mins(12),
    tasks: 508,
    successRate: 88.4,
    description:
      "Recommends the right offer for the right fan at the right moment, based on LTV, purchase rhythm and content preference.",
    capabilities: ["Offer matching", "Timing", "Win-back"],
  },
  {
    id: "analytics",
    name: "Analytics Agent",
    role: "Explains the numbers",
    status: "Idle",
    lastRun: mins(48),
    tasks: 194,
    successRate: 97.2,
    description:
      "Watches performance across platforms, finds what works and writes the insight the operator should act on today.",
    capabilities: ["Anomaly detection", "Attribution", "Insights"],
  },
];

export const insights: AIInsight[] = [
  {
    id: "ins_01",
    kind: "insight",
    title: "Storyline outperformance",
    body: `Mara's "365 days" storyline is outperforming standalone lifestyle posts by 34%.`,
    recommendation: "Continue the storyline this week — episode 05 should ship Friday, not next week.",
    confidence: 93,
    cta: { label: "Create episode", to: "/episodes" },
  },
  {
    id: "ins_02",
    kind: "recommendation",
    title: "Churn risk cluster",
    body: "4 subscribers paused within 48 hours of the price change. All four watched episode 03 but not 04.",
    recommendation: "Send the episode 04 preview with a one-month loyalty price before Friday.",
    confidence: 81,
    cta: { label: "Draft messages", to: "/conversations" },
  },
  {
    id: "ins_03",
    kind: "recommendation",
    title: "Fitness PPV demand",
    body: "Fans with a fitness memory bought 3.2× more often when the PPV referenced training.",
    recommendation: "Lead the next drop with the 6am gym set instead of the apartment set.",
    confidence: 87,
    cta: { label: "Open content", to: "/content" },
  },
  {
    id: "ins_04",
    kind: "risk",
    title: "Reply latency",
    body: "Median first-reply time rose to 41 minutes. Inner-circle fans reply 6× more when answered under 10 minutes.",
    recommendation: "Approve the 12 queued drafts in the next hour.",
    confidence: 90,
    cta: { label: "Open inbox", to: "/conversations" },
  },
];

export const automations: Automation[] = [
  {
    id: "auto_01",
    name: "New fan onboarding",
    trigger: "New fan created",
    status: "Active",
    runs: 2481,
    lastRun: mins(12),
    steps: [
      { id: "s1", label: "Create CRM profile", detail: "Fan record, source attribution, first-touch content", actor: "system" },
      { id: "s2", label: "Assign relationship level", detail: "Visitor → Follower, based on source and engagement", actor: "system" },
      { id: "s3", label: "Start memory tracking", detail: "Memory Agent subscribes to the fan's conversations", actor: "ai" },
      { id: "s4", label: "Queue welcome message", detail: "Draft created, waits for approval", actor: "ai" },
    ],
  },
  {
    id: "auto_02",
    name: "PPV purchase → next action",
    trigger: "Fan purchases PPV",
    status: "Active",
    runs: 684,
    lastRun: mins(4),
    steps: [
      { id: "s1", label: "Update LTV", detail: "Amount added to lifetime value and revenue attribution", actor: "system" },
      { id: "s2", label: "Update relationship", detail: "Follower → Fan at $1, Fan → Inner circle at $500", actor: "system" },
      { id: "s3", label: "Add event", detail: "Purchase event written to the fan timeline", actor: "system" },
      { id: "s4", label: "AI recommends next action", detail: "Sales Agent proposes the follow-up offer", actor: "ai" },
    ],
  },
  {
    id: "auto_03",
    name: "Churn risk rescue",
    trigger: "No activity for 7 days",
    status: "Active",
    runs: 96,
    lastRun: mins(38),
    steps: [
      { id: "s1", label: "Detect inactivity", detail: "Sleeping score computed nightly", actor: "system" },
      { id: "s2", label: "Pull memories", detail: "Top 3 preferences used for personalization", actor: "ai" },
      { id: "s3", label: "Draft win-back message", detail: "Tone: honest, no discount unless LTV > $200", actor: "ai" },
      { id: "s4", label: "Notify operator", detail: "Task created in Today", actor: "system" },
    ],
  },
  {
    id: "auto_04",
    name: "Episode publishing",
    trigger: "Episode marked Ready",
    status: "Paused",
    runs: 5,
    lastRun: days(2),
    steps: [
      { id: "s1", label: "Attach assets", detail: "Approved assets matched to the episode beat", actor: "system" },
      { id: "s2", label: "Generate caption + hook", detail: "Content Agent writes 3 variants", actor: "ai" },
      { id: "s3", label: "Build platform cuts", detail: "9:16, 4:5 and text-only variants", actor: "system" },
      { id: "s4", label: "Schedule Friday 18:00", detail: "Awaiting operator approval", actor: "system" },
    ],
  },
];

export const tasks: Task[] = [
  { id: "t1", title: "Approve 8 AI replies", detail: "Conversation Agent has 8 drafts waiting over 30 minutes.", status: "Todo", priority: "High", group: "Today", due: "09:30", source: "Conversations" },
  { id: "t2", title: "Review 3 images", detail: "Assets ast_05, ast_11, ast_12 are pending approval.", status: "Todo", priority: "Normal", group: "Today", due: "11:00", source: "Assets" },
  { id: "t3", title: "Publish Episode 05", detail: "Reality check — scheduled Friday 18:00, needs final caption.", status: "Todo", priority: "High", group: "Today", due: "18:00", source: "Episodes" },
  { id: "t4", title: "Check 2 churn-risk fans", detail: "Ben Adler and Andre Silva both crossed the 7-day threshold.", status: "Todo", priority: "High", group: "Today", due: "12:00", source: "Fans" },
  { id: "t5", title: "Write episode 06 outline", detail: "Chicago beat — needs a second character decision.", status: "In progress", priority: "Normal", group: "Today", due: "20:00", source: "AI Studio" },
  { id: "t6", title: "Approve gym mirror set caption", detail: "3 hook variants generated by Content Agent.", status: "In progress", priority: "Normal", group: "Today", due: "15:00", source: "Content" },
  { id: "t7", title: "Set up welcome bundle A/B test", detail: "$24 vs $19 for TikTok-sourced fans.", status: "Todo", priority: "Low", group: "This week", due: "Thu", source: "Offers" },
  { id: "t8", title: "Refresh inner-circle memory summaries", detail: "27 inner-circle fans need an updated preference snapshot.", status: "Todo", priority: "Low", group: "This week", due: "Fri", source: "AI Studio" },
  { id: "t9", title: "Reconcile Fanvue payout", detail: "February payout $2,810 vs ledger.", status: "Done", priority: "Normal", group: "Today", due: "08:00", source: "Revenue" },
  { id: "t10", title: "Publish episode 04 trailer", detail: "TikTok + Instagram cuts.", status: "Done", priority: "Normal", group: "Today", due: "07:40", source: "Content" },
];

export const actionQueue = [
  { id: "q1", label: "12 conversations awaiting approval", meta: " oldest 41 min", tone: "warn" as const, to: "/conversations" },
  { id: "q2", label: "3 content pieces ready to publish", meta: " episode 05 + 2 stories", tone: "pos" as const, to: "/content" },
  { id: "q3", label: "2 high-value fans active", meta: " Ryan · Alex", tone: "accent" as const, to: "/fans" },
  { id: "q4", label: "1 subscriber at churn risk", meta: " Ben Adler", tone: "neg" as const, to: "/fans" },
];
