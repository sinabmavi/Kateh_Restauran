-- 09_customer_club.sql
-- Customer Club: birthdays and the customer directory for admins.
-- Safe to run more than once. Run it in Supabase → SQL Editor.

-- ─────────────────────────────────────────────────────────── 1. Birthdays and email preferences

alter table public.profiles add column if not exists birthday date;
alter table public.profiles add column if not exists marketing_opt_out boolean not null default false;

-- New accounts send their birthday with the sign-up form; copy it onto the profile row when it is created.
create or replace function public.profile_birthday_from_signup()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.birthday is null then
    begin
      select nullif(u.raw_user_meta_data ->> 'birthday', '')::date into new.birthday
      from auth.users u
      where u.id = new.id;
    exception when others then
      new.birthday := null;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists profile_birthday_from_signup on public.profiles;
create trigger profile_birthday_from_signup
  before insert on public.profiles
  for each row execute function public.profile_birthday_from_signup();

-- Fill in birthdays for accounts that already exist and gave one at sign-up.
update public.profiles p
set birthday = (u.raw_user_meta_data ->> 'birthday')::date
from auth.users u
where u.id = p.id
  and p.birthday is null
  and (u.raw_user_meta_data ->> 'birthday') ~ '^\d{4}-\d{2}-\d{2}$';

-- ─────────────────────────────────────────────────────────── 2. Admin helper and customer directory

create or replace function public.club_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_users a where a.user_id = auth.uid());
$$;

grant execute on function public.club_is_admin() to authenticated;

-- Every registered customer (staff excluded) with contact details and order/reservation stats. Admins only.
create or replace function public.admin_customer_directory()
returns table (
  user_id uuid,
  full_name text,
  email text,
  phone text,
  birthday date,
  joined_at timestamptz,
  email_confirmed boolean,
  marketing_opt_out boolean,
  orders_count integer,
  reservations_count integer,
  total_spent numeric,
  last_order_at timestamptz,
  last_reservation_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.club_is_admin() then
    raise exception 'Only admins can view customers' using errcode = '42501';
  end if;

  return query
  select
    u.id,
    coalesce(nullif(p.full_name, ''), u.raw_user_meta_data ->> 'full_name')::text,
    u.email::text,
    coalesce(nullif(p.phone, ''), u.raw_user_meta_data ->> 'phone')::text,
    p.birthday,
    u.created_at,
    (u.email_confirmed_at is not null),
    coalesce(p.marketing_opt_out, false),
    coalesce(o.cnt, 0)::integer,
    coalesce(r.cnt, 0)::integer,
    coalesce(o.spent, 0)::numeric,
    o.last_at,
    r.last_at,
    u.last_sign_in_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join lateral (
    select count(*) as cnt,
           sum(ord.total) filter (where ord.payment_status = 'paid') as spent,
           max(ord.created_at) as last_at
    from public.orders ord
    where ord.user_id = u.id and ord.status <> 'pending_payment'
  ) o on true
  left join lateral (
    select count(*) as cnt, max(res.created_at) as last_at
    from public.reservations res
    where res.user_id = u.id and not (res.status = 'cancelled' and res.payment_status = 'unpaid')
  ) r on true
  where not exists (select 1 from public.admin_users a where a.user_id = u.id)
  order by u.created_at desc;
end;
$$;

revoke all on function public.admin_customer_directory() from public, anon;
grant execute on function public.admin_customer_directory() to authenticated, service_role;

-- Check: should return your customers (run it while signed in as an admin in the app; the SQL Editor is not an admin).
