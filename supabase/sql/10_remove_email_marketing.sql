-- 10_remove_email_marketing.sql
-- Removes the first version of Email Marketing (its 5-minute job and its 4 tables).
-- Keeps everything the Customers page uses: birthdays, marketing_opt_out and admin_customer_directory().
-- Safe to run more than once. Run it in Supabase → SQL Editor.

-- 1. Stop the job that called the (now deleted) email-marketing function every 5 minutes.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from cron.job where jobname = 'email-marketing-tick') then
    perform cron.unschedule('email-marketing-tick');
  end if;
end $$;

-- 2. Remove the email marketing tables and their test data.
drop table if exists public.email_sends;
drop table if exists public.email_campaigns;
drop table if exists public.email_automations;
drop table if exists public.email_templates;

-- Check: both should return no rows.
select table_name from information_schema.tables where table_schema = 'public' and table_name like 'email_%';
select jobname from cron.job where jobname = 'email-marketing-tick';
