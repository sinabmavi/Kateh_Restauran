-- 05_super_admin.sql
-- Adds a Super Admin role. Only super admins can add, edit or remove admins (through the `manage-admins` Edge Function).
-- Safe to run more than once. Run it in Supabase → SQL Editor.

-- 1. Role and name for every admin. Existing admins stay normal admins.
alter table public.admin_users add column if not exists role text not null default 'admin';
alter table public.admin_users add column if not exists full_name text;
alter table public.admin_users add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'admin_users_role_check') then
    alter table public.admin_users add constraint admin_users_role_check check (role in ('admin', 'super_admin'));
  end if;
end $$;

create unique index if not exists admin_users_user_id_unique on public.admin_users (user_id);

-- Fill in names for admins that already exist.
update public.admin_users a
set full_name = p.full_name
from public.profiles p
where p.id = a.user_id and a.full_name is null;

-- 2. Nobody can change the admin list from the browser. Only the Edge Function (service role) and the SQL Editor can.
revoke insert, update, delete on public.admin_users from anon, authenticated;

-- 3. Make YOUR account the Super Admin.
--    First create the login in Authentication → Users (Add user, tick Auto Confirm User), then replace the email below.
insert into public.admin_users (user_id, role, full_name)
select u.id, 'super_admin', coalesce(u.raw_user_meta_data ->> 'full_name', 'Super Admin')
from auth.users u
where u.email = 'hadi@kateh.io'
on conflict (user_id) do update set role = 'super_admin';

-- Check: this should list your account with role = super_admin.
select a.user_id, u.email, a.full_name, a.role from public.admin_users a join auth.users u on u.id = a.user_id;
