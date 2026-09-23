-- 08_reservation_emails.sql
-- Emails guests from info@kateh.io when they reserve a table and whenever the reservation's status changes.
-- A trigger on `reservations` calls the `reservation-email` Edge Function; the function decides which email to send.
-- Email problems can never block or fail a booking. Safe to run more than once. Run it in Supabase → SQL Editor.

-- 1. Lets the database make web requests (to call the Edge Function) after a booking is saved.
create extension if not exists pg_net with schema extensions;

-- 2. Remembers the last email each guest received, so no email is ever sent twice.
create table if not exists public.reservation_emails (
  reservation_id text primary key,
  last_kind text not null check (last_kind in ('received', 'confirmed', 'cancelled', 'completed')),
  sent_to text,
  updated_at timestamptz not null default now()
);

alter table public.reservation_emails enable row level security;
-- No policies on purpose: only the Edge Function (service role) reads or writes this table.
revoke all on public.reservation_emails from anon, authenticated;

-- 3. The trigger. Runs after a reservation is created, or when its status or payment status changes.
create or replace function public.queue_reservation_email()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status or new.payment_status is distinct from old.payment_status then
    perform net.http_post(
      url := 'https://pplynhbzvjyyhbbkmdjw.supabase.co/functions/v1/reservation-email',
      body := jsonb_build_object('reservation_id', new.id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;
  return new;
exception when others then
  -- Never let an email problem stop a booking from being saved.
  raise warning 'reservation email not queued: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists reservation_email_after_change on public.reservations;
create trigger reservation_email_after_change
  after insert or update of status, payment_status on public.reservations
  for each row execute function public.queue_reservation_email();

-- Check: should return one row named reservation_email_after_change.
select tgname from pg_trigger where tgname = 'reservation_email_after_change';
