-- 07_site_images_storage.sql
-- Storage for images uploaded from the dashboard (menu dishes and homepage banners).
-- Anyone can view the images; only admins can upload, replace or delete them.
-- Safe to run more than once. Run it in Supabase → SQL Editor.

-- Public bucket, 10 MB per file, images only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-images', 'site-images', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins can upload site images" on storage.objects;
create policy "Admins can upload site images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'site-images' and exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

drop policy if exists "Admins can replace site images" on storage.objects;
create policy "Admins can replace site images"
  on storage.objects for update to authenticated
  using (bucket_id = 'site-images' and exists (select 1 from public.admin_users a where a.user_id = auth.uid()))
  with check (bucket_id = 'site-images' and exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

drop policy if exists "Admins can delete site images" on storage.objects;
create policy "Admins can delete site images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'site-images' and exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

-- Check: should show the bucket as public with a 10485760-byte (10 MB) limit.
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'site-images';
