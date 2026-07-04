do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'sheet_inventory_sync_runs'
    ) then
      alter publication supabase_realtime add table public.sheet_inventory_sync_runs;
    end if;
  end if;
end $$;
