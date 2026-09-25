-- 11_email_marketing.sql
-- Email Marketing (new version). Emails are sent from info@kateh.io by the `marketing-email` Edge Function.
-- Needs 09_customer_club.sql (customer list, birthdays). Run 10_remove_email_marketing.sql first if you ran the old version.
-- Safe to run more than once. Run it in Supabase → SQL Editor.

-- ─────────────────────────────────────────────────────────── 1. Settings (one row)

create table if not exists public.marketing_settings (
  id smallint primary key default 1 check (id = 1),
  sender_name text,
  reply_to text,
  test_emails text,
  batch_size integer not null default 40 check (batch_size between 1 and 500),
  quiet_start text,
  quiet_end text,
  updated_at timestamptz not null default now()
);

insert into public.marketing_settings (id) values (1) on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────── 2. Saved messages

create table if not exists public.marketing_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  message jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────── 3. Emails (one-off and automatic)

create table if not exists public.marketing_emails (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  message jsonb not null,
  audience jsonb not null default '{"mode": "all"}'::jsonb,
  mode text not null check (mode in ('now', 'scheduled', 'automatic')),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled', 'active', 'paused')),
  send_at timestamptz,
  frequency text check (frequency in ('daily', 'weekdays', 'monthly')),
  weekdays smallint[],
  month_day smallint check (month_day between 1 and 28),
  send_time text,
  repeat_policy text not null default 'every_run' check (repeat_policy in ('every_run', 'once', 'monthly', 'yearly')),
  preset text,
  next_run_at timestamptz,
  last_run_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only one birthday email.
create unique index if not exists marketing_emails_birthday_unique on public.marketing_emails (preset) where preset = 'birthday';
create index if not exists marketing_emails_due_idx on public.marketing_emails (status, next_run_at);

-- ─────────────────────────────────────────────────────────── 4. History: each send-out and each recipient

create table if not exists public.marketing_runs (
  id uuid primary key default gen_random_uuid(),
  email_id uuid references public.marketing_emails (id) on delete set null,
  name text not null,
  subject text not null,
  kind text not null check (kind in ('one_off', 'automatic')),
  message jsonb not null,
  status text not null default 'sending' check (status in ('sending', 'sent', 'partial', 'failed')),
  recipients_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists marketing_runs_started_idx on public.marketing_runs (started_at desc);

-- One row per email to one customer. `dedupe_key` means nobody ever receives the same email twice by mistake.
create table if not exists public.marketing_sends (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.marketing_runs (id) on delete cascade,
  email_id uuid references public.marketing_emails (id) on delete set null,
  user_id uuid,
  email text not null,
  full_name text,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed')),
  error text,
  attempts integer not null default 0,
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz
);

create index if not exists marketing_sends_queue_idx on public.marketing_sends (status, id);
create index if not exists marketing_sends_run_idx on public.marketing_sends (run_id);
create index if not exists marketing_sends_user_sent_idx on public.marketing_sends (user_id, sent_at);

-- ─────────────────────────────────────────────────────────── 5. Permissions: admins only

alter table public.marketing_settings enable row level security;
alter table public.marketing_templates enable row level security;
alter table public.marketing_emails enable row level security;
alter table public.marketing_runs enable row level security;
alter table public.marketing_sends enable row level security;

drop policy if exists "Admins manage marketing settings" on public.marketing_settings;
create policy "Admins manage marketing settings" on public.marketing_settings
  for all to authenticated using (public.club_is_admin()) with check (public.club_is_admin());

drop policy if exists "Admins manage marketing templates" on public.marketing_templates;
create policy "Admins manage marketing templates" on public.marketing_templates
  for all to authenticated using (public.club_is_admin()) with check (public.club_is_admin());

drop policy if exists "Admins manage marketing emails" on public.marketing_emails;
create policy "Admins manage marketing emails" on public.marketing_emails
  for all to authenticated using (public.club_is_admin()) with check (public.club_is_admin());

drop policy if exists "Admins read marketing runs" on public.marketing_runs;
create policy "Admins read marketing runs" on public.marketing_runs
  for select to authenticated using (public.club_is_admin());

drop policy if exists "Admins read marketing sends" on public.marketing_sends;
create policy "Admins read marketing sends" on public.marketing_sends
  for select to authenticated using (public.club_is_admin());

revoke all on public.marketing_settings, public.marketing_templates, public.marketing_emails, public.marketing_runs, public.marketing_sends from anon;
grant select, insert, update, delete on public.marketing_templates, public.marketing_emails to authenticated;
grant select, update on public.marketing_settings to authenticated;
grant select on public.marketing_runs, public.marketing_sends to authenticated;

-- ─────────────────────────────────────────────────────────── 6. Every minute: scheduled and automatic emails

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'marketing-email-tick') then
    perform cron.unschedule('marketing-email-tick');
  end if;
end $$;

select cron.schedule(
  'marketing-email-tick',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://pplynhbzvjyyhbbkmdjw.supabase.co/functions/v1/marketing-email',
    body := '{"action": "tick"}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);

-- Check: should list the tick job and the 5 marketing tables.
select jobname, schedule from cron.job where jobname = 'marketing-email-tick';
select table_name from information_schema.tables where table_schema = 'public' and table_name like 'marketing_%' order by table_name;
