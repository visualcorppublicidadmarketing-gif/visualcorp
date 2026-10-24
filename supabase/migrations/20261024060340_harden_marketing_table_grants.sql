-- Remove inherited anonymous/public grants. Import and activity records are
-- readable to authorized members but changed only by database-side operations.
do $$
declare t text;
begin
  foreach t in array array['marketing_posts','marketing_assets','marketing_post_assets','marketing_lead_tracking',
    'marketing_sales_snapshots','marketing_strategy_items','marketing_work_items','marketing_work_item_history',
    'marketing_post_events','marketing_import_batches'] loop
    execute format('revoke all on public.%I from public, anon', t);
    if t in ('marketing_post_events','marketing_import_batches') then
      execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from authenticated', t);
      execute format('grant select on public.%I to authenticated', t);
    else
      execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    end if;
  end loop;
end $$;

