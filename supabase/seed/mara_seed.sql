-- ============================================================================
-- Mara OS — демо-сид вымышленного датасета
--
-- Все данные ФИКТИВНЫЕ: персонаж, фанаты, переписки и покупки придуманы
-- для демонстрации интерфейса. Реальных персональных данных здесь нет.
--
-- Применение (после schema.sql): Supabase Dashboard → SQL Editor → Run.
-- Сид привязывается к ПЕРВОМУ пользователю проекта; чтобы выбрать другого,
-- замените вызов в конце файла на
--   select public.mara_seed('<user-uuid>');
-- Повторный запуск безопасен: если персонаж Mara уже существует, сид
-- ничего не дублирует.
-- ============================================================================

create or replace function public.mara_seed(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_character uuid;
  v_ep1 uuid; v_ep2 uuid; v_ep3 uuid;
  v_fan uuid;
  v_offer_sub uuid; v_offer_ppv uuid; v_offer_vip uuid; v_offer_bundle uuid; v_offer_tip uuid;
  v_conv uuid;
  v_content uuid;
begin
  if p_user_id is null then
    raise exception 'mara_seed: user id is null';
  end if;

  -- Идемпотентность: персонаж Mara уже есть — сид был применён ранее.
  select id into v_character from public.characters
   where user_id = p_user_id and slug = 'mara-quinn' limit 1;
  if v_character is not null then
    return 'Mara OS seed already applied — nothing to do.';
  end if;

  /* ------------------------------ Character ------------------------------ */
  insert into public.characters (user_id, name, slug, description, age_display, location, occupation, status)
  values (
    p_user_id, 'Mara Quinn', 'mara-quinn',
    'A fictional virtual creator documenting one year of trying to buy back her time.',
    '23+', 'Chicago', 'Marketing Coordinator', 'active'
  ) returning id into v_character;

  insert into public.character_traits (
    user_id, character_id, personality, tone, interests, dislikes, speech_style,
    boundaries, lore, backstory, recurring_objects, story_rules,
    public_persona, private_persona, relationship_rules
  ) values (
    p_user_id, v_character,
    '["dry", "confident", "playful", "slightly chaotic", "occasionally vulnerable", "intelligent"]',
    'Dry, first-person, honest about numbers. Never corporate, never robotic.',
    '["strength training", "film photography", "espresso", "budgeting in a red notebook", "early mornings"]',
    '["small talk about weather", "corporate motivational quotes", "being called an AI"]',
    'Short sentences. Conversational. A little ironic. Feminine without performing.',
    '["Never break the first-person diary frame", "No explicit content", "Never invent debt numbers that contradict published episodes", "No political or medical topics"]',
    'Mara earns $54,000 a year as a marketing coordinator and carries $27,000 of debt. She gave herself 365 days to buy back her time. The red notebook is where she counts the hours.',
    'Day 0: Mara opens a red notebook and writes "365 days to buy back my time. $54k salary. $27k debt. One year." Every episode is a week of that year.',
    '["red notebook"]',
    '["Every post belongs to an episode week", "Debt may only go down on screen", "Fans learn numbers before strangers do"]',
    'Confident, dry, playful. Posts daily, episodes on Fridays.',
    'Occasionally vulnerable; admits fear in DM-style confessions but never spirals.',
    '{"visitor": "warm, brief, one question back", "fan": "remembers details, teases gently", "inner_circle": "first-name basis, early numbers, voice-note tone"}'
  );

  /* ------------------------------- Episodes ------------------------------ */
  insert into public.episodes (user_id, character_id, number, title, summary, status, start_date, end_date, key_events)
  values
    (p_user_id, v_character, 1, 'Episode 01 · First 30 days',
     'The red notebook opens. Mara publishes her numbers, tells the internet she is in debt, and posts every single day for a month.',
     'published', current_date - 120, current_date - 91,
     '["Published the debt number", "First 1,000 followers", "First PPV drop"]'),
    (p_user_id, v_character, 2, 'Episode 02 · The gym arc',
     'Early mornings, a 6am gym set, and the first week where content starts paying more than overtime.',
     'published', current_date - 90, current_date - 61,
     '["6am gym set goes mini-viral", "184 subscribers", "First $500 week"]'),
    (p_user_id, v_character, 3, 'Episode 03 · Counting hours',
     'Mara starts pricing her hours against her salary. The notebook gets heavier; the audience starts answering back.',
     'in_production', current_date - 60, current_date - 31,
     '["Hour-price framework", "Inner circle opens", "Churn scare"]')
  returning id into v_ep3;

  select id into v_ep1 from public.episodes where user_id = p_user_id and number = 1;
  select id into v_ep2 from public.episodes where user_id = p_user_id and number = 2;

  /* -------------------------------- Offers ------------------------------- */
  insert into public.offers (user_id, character_id, name, description, price, currency, type, status) values
    (p_user_id, v_character, 'Standard Subscription', 'Full feed + episodes, billed monthly.', 19.99, 'USD', 'subscription', 'live')
    returning id into v_offer_sub;
  insert into public.offers (user_id, character_id, name, description, price, currency, type, status) values
    (p_user_id, v_character, 'VIP Inner Circle', 'Early numbers, priority replies, monthly call raffle.', 49.00, 'USD', 'vip', 'live')
    returning id into v_offer_vip;
  insert into public.offers (user_id, character_id, name, description, price, currency, type, status) values
    (p_user_id, v_character, 'PPV · Late-night notebook', 'Long-form diary page + photo set, unlock once.', 15.00, 'USD', 'ppv', 'live')
    returning id into v_offer_ppv;
  insert into public.offers (user_id, character_id, name, description, price, currency, type, status) values
    (p_user_id, v_character, 'Weekend Bundle', 'Two PPV drops bundled for the weekend.', 25.00, 'USD', 'bundle', 'live')
    returning id into v_offer_bundle;
  insert into public.offers (user_id, character_id, name, description, price, currency, type, status) values
    (p_user_id, v_character, 'Tip · Notebook fund', 'One-time tip toward the debt counter.', 5.00, 'USD', 'custom', 'live')
    returning id into v_offer_tip;

  /* --------------------------------- Fans -------------------------------- */
  -- fictional demo fans only
  insert into public.fans (user_id, character_id, display_name, username, source, status, relationship_level, segments, lifetime_value, total_purchases, last_interaction_at, location, joined_at, notes, tags) values
    (p_user_id, v_character, 'Alex Rivera', '@alexriv', 'telegram', 'active', 'inner_circle', '{subscriber,buyer,high_value,vip,gym}', 840, 14, now() - interval '4 minutes', 'Austin, TX, US', now() - interval '212 days', 'Buys every fitness PPV within an hour.', '{fitness,high-spender}'),
    (p_user_id, v_character, 'Ryan Whitfield', '@ryanwhit', 'fanvue', 'active', 'inner_circle', '{subscriber,buyer,high_value,vip,story}', 1240, 21, now() - interval '18 minutes', 'New York, US', now() - interval '268 days', 'Highest LTV in the base. Tips after every storyline drop.', '{whale,storyline-fan}'),
    (p_user_id, v_character, 'Jake Morrison', '@jakemor', 'tiktok', 'active', 'fan', '{buyer,gym}', 216, 6, now() - interval '2 hours', 'Denver, US', now() - interval '74 days', 'Came from the 6am gym reel.', '{gym}'),
    (p_user_id, v_character, 'Chris Novak', '@chrisnovak', 'instagram', 'new', 'follower', '{new}', 0, 0, now() - interval '40 minutes', 'Toronto, CA', now() - interval '3 days', 'Replied to the red notebook story.', '{new}'),
    (p_user_id, v_character, 'Daniel Osei', '@danielosei', 'fanvue', 'active', 'favorite', '{buyer,ppv_buyer}', 236, 8, now() - interval '3 hours', 'London, UK', now() - interval '96 days', 'No subscription, but buys 2-3 PPVs a month.', '{ppv-only}'),
    (p_user_id, v_character, 'Mike Carter', '@mikecarter', 'telegram', 'churn_risk', 'fan', '{buyer,churn_risk}', 306, 9, now() - interval '6 days', 'Berlin, DE', now() - interval '151 days', 'Cancelled 6 days ago after 4 months.', '{churn-risk,win-back}'),
    (p_user_id, v_character, 'Sarah Kim', '@sarahkim_', 'instagram', 'active', 'regular', '{subscriber}', 168, 6, now() - interval '71 minutes', 'Seattle, US', now() - interval '121 days', 'Engages with apartment and morning-routine content.', '{lifestyle}'),
    (p_user_id, v_character, 'Omar Haddad', '@omarhaddad', 'fanvue', 'active', 'regular', '{subscriber}', 204, 7, now() - interval '23 hours', 'Dubai, AE', now() - interval '88 days', 'Opens every message, buys late-night PPV drops.', '{late-night-buyer}'),
    (p_user_id, v_character, 'Victor Malinov', '@victormal', 'threads', 'inactive', 'follower', '{inactive,story}', 132, 5, now() - interval '4 days', 'Warsaw, PL', now() - interval '63 days', 'Asks about the notebook storyline almost every week.', '{storyline-fan}');

  /* -------------------------------- Content ------------------------------ */
  insert into public.content (user_id, character_id, episode_id, title, description, content_type, platform, status, caption, hook, cta, published_at) values
    (p_user_id, v_character, v_ep2, '6am gym set · week 9', 'Morning strength session, diary voiceover.', 'reel', 'tiktok', 'published',
     '6am. The notebook says I owe myself 41 more mornings like this.',
     'I price every hour of my life now. This one costs $0.', 'Follow the countdown', now() - interval '9 days')
  returning id into v_content;

  insert into public.content (user_id, character_id, episode_id, title, description, content_type, platform, status, caption, hook, cta, published_at) values
    (p_user_id, v_character, v_ep1, 'The red notebook, page one', 'Where the debt number first went public.', 'post', 'instagram', 'published',
     '$54k salary. $27k debt. One red notebook. One year.',
     '365 days to buy back my time.', 'Start from episode one', now() - interval '112 days'),
    (p_user_id, v_character, v_ep2, 'Debt counter −$400', 'First month where PPV covered a loan payment.', 'story', 'instagram', 'published',
     'Paid February off in a weekend. The notebook noticed.', 'The first payment content ever made.', 'Full story in episode two', now() - interval '42 days'),
    (p_user_id, v_character, v_ep3, 'Hour-price framework', 'How Mara prices one hour of her life.', 'carousel', 'threads', 'ready',
     'My employer pays $26/hour for me. The internet pays more. Here is the math.', 'An hour is a currency. Count yours.', 'Save the framework', null),
    (p_user_id, v_character, v_ep3, 'Episode 03 teaser', 'Counting hours — teaser cut.', 'short', 'tiktok', 'scheduled',
     'Tomorrow: what one hour of Mara actually costs.', '48 hours of my life are already spoken for.', 'Episode drops Friday', now() + interval '2 days');

  insert into public.content_performance (user_id, content_id, platform, views, likes, comments, shares, saves, clicks, profile_visits, conversions, revenue)
  values (p_user_id, v_content, 'tiktok', 184000, 21300, 947, 3110, 5280, 8420, 11900, 232, 1140);

  /* ------------------------- Conversations & messages -------------------- */
  select id into v_fan from public.fans where user_id = p_user_id and username = '@alexriv' limit 1;

  insert into public.conversations (user_id, character_id, fan_id, platform, subject, status, unread_count, last_message_at)
  values (p_user_id, v_character, v_fan, 'telegram', 'Gym PPV reactions', 'open', 1, now() - interval '4 minutes')
  returning id into v_conv;

  insert into public.messages (user_id, conversation_id, sender_type, content, platform, message_type, status, ai_generated, approved, sent_at) values
    (p_user_id, v_conv, 'fan', 'That 6am set was unreal. Do you actually write the debt number down every morning?', 'telegram', 'text', 'sent', false, false, now() - interval '9 minutes'),
    (p_user_id, v_conv, 'mara', 'Every morning, page 43 and counting. The number barely moves but the handwriting gets angrier.', 'telegram', 'text', 'sent', false, true, now() - interval '7 minutes'),
    (p_user_id, v_conv, 'fan', 'Angrier handwriting is still progress. Friday episode?', 'telegram', 'text', 'sent', false, false, now() - interval '4 minutes');

  select id into v_fan from public.fans where user_id = p_user_id and username = '@chrisnovak' limit 1;
  insert into public.conversations (user_id, character_id, fan_id, platform, subject, status, unread_count, last_message_at)
  values (p_user_id, v_character, v_fan, 'instagram', 'New follower from the notebook story', 'open', 2, now() - interval '40 minutes')
  returning id into v_conv;
  insert into public.messages (user_id, conversation_id, sender_type, content, platform, message_type, status, ai_generated, sent_at) values
    (p_user_id, v_conv, 'fan', 'Found you through the red notebook post. Is the $27k real?', 'instagram', 'text', 'sent', false, now() - interval '50 minutes'),
    (p_user_id, v_conv, 'fan', 'Also the handwriting mention got me, my notebook is a spreadsheet', 'instagram', 'text', 'sent', false, now() - interval '40 minutes'),
    (p_user_id, v_conv, 'mara', 'Real number, rounded to keep my pride on life support. Welcome to the year of counting.', 'instagram', 'text', 'awaiting_approval', true, null);

  /* ------------------- Purchases / subscriptions / revenue --------------- */
  select id into v_fan from public.fans where user_id = p_user_id and username = '@ryanwhit' limit 1;
  insert into public.subscriptions (user_id, fan_id, offer_id, platform, status, started_at, expires_at)
  values (p_user_id, v_fan, v_offer_vip, 'fanvue', 'active', now() - interval '200 days', now() + interval '30 days');
  insert into public.purchases (user_id, fan_id, offer_id, amount, platform, status, purchased_at) values
    (p_user_id, v_fan, v_offer_vip, 49, 'fanvue', 'paid', now() - interval '4 days'),
    (p_user_id, v_fan, v_offer_ppv, 15, 'fanvue', 'paid', now() - interval '2 days'),
    (p_user_id, v_fan, v_offer_tip, 20, 'fanvue', 'paid', now() - interval '1 days');
  insert into public.revenue_events (user_id, fan_id, offer_id, category, amount, platform, occurred_at) values
    (p_user_id, v_fan, v_offer_vip, 'subscription', 49, 'fanvue', now() - interval '4 days'),
    (p_user_id, v_fan, v_offer_ppv, 'ppv', 15, 'fanvue', now() - interval '2 days'),
    (p_user_id, v_fan, v_offer_tip, 'tip', 20, 'fanvue', now() - interval '1 days');

  select id into v_fan from public.fans where user_id = p_user_id and username = '@danielosei' limit 1;
  insert into public.purchases (user_id, fan_id, offer_id, amount, platform, status, purchased_at) values
    (p_user_id, v_fan, v_offer_ppv, 15, 'fanvue', 'paid', now() - interval '6 hours'),
    (p_user_id, v_fan, v_offer_bundle, 25, 'fanvue', 'paid', now() - interval '9 days');
  insert into public.revenue_events (user_id, fan_id, offer_id, category, amount, platform, occurred_at) values
    (p_user_id, v_fan, v_offer_ppv, 'ppv', 15, 'fanvue', now() - interval '6 hours'),
    (p_user_id, v_fan, v_offer_bundle, 'ppv', 25, 'fanvue', now() - interval '9 days');

  /* ------------------------- Insights / tasks / AI ----------------------- */
  insert into public.ai_insights (user_id, kind, title, body, recommendation, confidence) values
    (p_user_id, 'recommendation', 'Fashion reels outperform apartment reels by 42% in profile visits',
     'Across the last 9 reels, fashion-led cuts drove 42% more profile visits per impression than lifestyle cuts with the same captions.',
     'Next week: raise fashion share of short-form from 20% to 35%, keep apartment hooks for stories only.', 0.87),
    (p_user_id, 'insight', 'PPV buyers convert after 3+ exchanges',
     'Fans who exchanged three or more messages in a week bought PPV at 2.8× the base rate.',
     'Prioritise reply depth over broadcast volume for new Telegram fans.', 0.81),
    (p_user_id, 'risk', 'Churn risk among inactive subscribers is rising',
     '11 subscribers with no interaction in 14+ days. Their median LTV is $96.',
     'Run the win-back draft in Conversations → Awaiting approval.', 0.74);

  insert into public.tasks (user_id, title, detail, type, status, priority, due_date, source) values
    (p_user_id, 'Approve 12 pending replies', 'Conversation Agent drafts older than 40 minutes.', 'sales', 'todo', 'high', current_date, 'AI Studio'),
    (p_user_id, 'Cut Episode 03 teaser', '45s vertical cut from the gym arc footage.', 'content', 'in_progress', 'urgent', current_date + 1, 'Content'),
    (p_user_id, 'Churn-risk win-back pass', 'Draft personal replies for the 11 sleeping subscribers.', 'fan', 'todo', 'medium', current_date + 3, 'Analytics Agent');

  insert into public.automations (user_id, name, description, trigger_type, trigger_config, action_type, action_config, status, enabled, last_run_at, next_run_at) values
    (p_user_id, 'Weekly revenue digest', 'Every Monday 09:00 — revenue summary to Telegram.', 'schedule', '{"cron": "0 9 * * 1"}', 'send_telegram_report', '{"channel": "owner"}', 'active', true, now() - interval '2 days', now() + interval '5 days'),
    (p_user_id, 'New-fan welcome draft', 'On fan_created: generate welcome reply draft for approval.', 'event', '{"event": "fan_created"}', 'create_draft_reply', '{"agent": "conversation"}', 'paused', false, null, null);

  insert into public.events (user_id, type, entity_type, platform, payload) values
    (p_user_id, 'fan_created', 'fan', 'tiktok', '{"source": "seed"}'),
    (p_user_id, 'purchase_created', 'offer', 'fanvue', '{"amount": 15}'),
    (p_user_id, 'reply_approved', 'message', 'telegram', '{"agent": "conversation"}');

  return 'Mara OS demo seed applied.';
end $$;

revoke all on function public.mara_seed(uuid) from public, anon, authenticated;
grant execute on function public.mara_seed(uuid) to service_role;

-- Применить к первому пользователю проекта (или замените на свой uuid):
select public.mara_seed((select id from auth.users order by created_at limit 1))
  where exists (select 1 from auth.users)
    and not exists (select 1 from public.characters where slug = 'mara-quinn');
