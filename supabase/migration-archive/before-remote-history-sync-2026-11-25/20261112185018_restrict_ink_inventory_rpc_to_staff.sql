-- PostgreSQL grants EXECUTE to PUBLIC for new functions by default. Ink
-- inventory RPCs are intended for authenticated Visual Corp staff only.
revoke all on function public.record_ink_daily_percent(uuid, numeric, text, text)
  from public, anon;
revoke all on function public.refill_active_ink(uuid, boolean, text, text)
  from public, anon;
revoke all on function public.batch_record_machine_inks(jsonb, text, text)
  from public, anon;

grant execute on function public.record_ink_daily_percent(uuid, numeric, text, text)
  to authenticated;
grant execute on function public.refill_active_ink(uuid, boolean, text, text)
  to authenticated;
grant execute on function public.batch_record_machine_inks(jsonb, text, text)
  to authenticated;
