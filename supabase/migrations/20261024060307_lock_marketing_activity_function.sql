-- The audit function is trigger-only; do not expose its SECURITY DEFINER
-- entry point through the PostgREST RPC API.
revoke all on function public.log_marketing_post_activity() from public, anon, authenticated;

