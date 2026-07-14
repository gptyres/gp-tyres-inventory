drop policy if exists "service role manages organization photos" on public.photos;
create policy "service role manages organization photos"
on public.photos
for all
to service_role
using (organization_id = '8bbf5ea0-b71f-4c2a-a2c0-55ce7316e8c6'::uuid)
with check (organization_id = '8bbf5ea0-b71f-4c2a-a2c0-55ce7316e8c6'::uuid);

drop policy if exists "service role manages organization photo activity" on public.photo_activity;
create policy "service role manages organization photo activity"
on public.photo_activity
for all
to service_role
using (organization_id = '8bbf5ea0-b71f-4c2a-a2c0-55ce7316e8c6'::uuid)
with check (organization_id = '8bbf5ea0-b71f-4c2a-a2c0-55ce7316e8c6'::uuid);
