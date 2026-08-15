revoke execute on function public.upsert_inventory_item(jsonb) from public, anon, authenticated;
revoke execute on function public.delete_inventory_item(text) from public, anon, authenticated;
revoke execute on function public.process_inventory_transaction(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.seed_inventory_items(jsonb) from public, anon, authenticated;

grant execute on function public.upsert_inventory_item(jsonb) to service_role;
grant execute on function public.delete_inventory_item(text) to service_role;
grant execute on function public.process_inventory_transaction(jsonb, jsonb) to service_role;
grant execute on function public.seed_inventory_items(jsonb) to service_role;
