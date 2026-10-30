-- Water for Laura: schema, defaults, Row Level Security.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- settings: one row per user, created automatically on sign-up.
-- ---------------------------------------------------------------------------
create table public.settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Laura',
  daily_goal_ml integer not null default 2000 check (daily_goal_ml between 250 and 10000),
  quick_adds integer[] not null default '{150,250,500}',
  timezone text not null default 'Europe/Dublin',
  reminder_enabled boolean not null default false,
  reminder_start time not null default '09:00',
  reminder_end time not null default '21:00',
  reminder_interval_minutes integer not null default 120 check (reminder_interval_minutes between 15 and 720),
  suppression_minutes integer not null default 60 check (suppression_minutes between 0 and 720),
  last_reminder_slot text,
  updated_at timestamptz not null default now()
);

alter table public.settings enable row level security;

create policy "settings: owner read" on public.settings
  for select using (auth.uid() = user_id);
create policy "settings: owner insert" on public.settings
  for insert with check (auth.uid() = user_id);
create policy "settings: owner update" on public.settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- entries: every glass of water. Primary key is generated on the client so
-- offline retries upsert instead of duplicating.
-- ---------------------------------------------------------------------------
create table public.entries (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount_ml integer not null check (amount_ml > 0 and amount_ml <= 5000),
  consumed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index entries_user_consumed_idx on public.entries (user_id, consumed_at desc);

alter table public.entries enable row level security;

create policy "entries: owner read" on public.entries
  for select using (auth.uid() = user_id);
create policy "entries: owner insert" on public.entries
  for insert with check (auth.uid() = user_id);
create policy "entries: owner update" on public.entries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "entries: owner delete" on public.entries
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- push_subscriptions: one row per device. Keys are only readable by the owner
-- and by the service role used in the Edge Function.
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device_name text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id) where enabled;

alter table public.push_subscriptions enable row level security;

create policy "push: owner read" on public.push_subscriptions
  for select using (auth.uid() = user_id);
create policy "push: owner insert" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);
create policy "push: owner update" on public.push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "push: owner delete" on public.push_subscriptions
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();
create trigger entries_touch before update on public.entries
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Atomic slot claim used by the reminder function: returns true exactly once
-- per (user, slot) even if the function is invoked twice for the same window.
-- ---------------------------------------------------------------------------
create or replace function public.claim_reminder_slot(p_user_id uuid, p_slot text)
returns boolean
language sql
security definer
set search_path = public
as $$
  with claimed as (
    update public.settings
       set last_reminder_slot = p_slot
     where user_id = p_user_id
       and last_reminder_slot is distinct from p_slot
     returning user_id
  )
  select exists (select 1 from claimed);
$$;

revoke all on function public.claim_reminder_slot(uuid, text) from public, anon, authenticated;
