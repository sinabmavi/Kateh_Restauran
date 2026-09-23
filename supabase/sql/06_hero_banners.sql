-- 06_hero_banners.sql
-- The 4 homepage slider banners, editable from Dashboard → Restaurant Settings → Banner Settings.
-- A blank field means "use the built-in default" (the text and photo the site shipped with).
-- Safe to run more than once. Run it in Supabase → SQL Editor.

create table if not exists public.hero_banners (
  id smallint primary key check (id between 1 and 4),
  name text not null,
  kicker text,
  title text,
  description text,
  button_label text,
  image_url text,
  updated_at timestamptz not null default now()
);

alter table public.hero_banners enable row level security;

drop policy if exists "Anyone can read hero banners" on public.hero_banners;
create policy "Anyone can read hero banners"
  on public.hero_banners for select
  using (true);

drop policy if exists "Admins can edit hero banners" on public.hero_banners;
create policy "Admins can edit hero banners"
  on public.hero_banners for update to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

-- Always exactly 4 banners: they can be edited, never added or deleted from the browser.
grant select on public.hero_banners to anon, authenticated;
revoke insert, delete on public.hero_banners from anon, authenticated;
revoke update on public.hero_banners from anon;
grant update on public.hero_banners to authenticated;

-- The 4 banners. Text/image columns start empty, so the site keeps showing its current defaults until you edit them.
insert into public.hero_banners (id, name) values
  (1, 'Book a Table'),
  (2, 'Order Now'),
  (3, 'See the Menu'),
  (4, 'Reserve Now')
on conflict (id) do nothing;

-- Check: should list 4 rows.
select id, name, title, image_url from public.hero_banners order by id;
