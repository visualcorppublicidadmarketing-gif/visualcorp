-- The link table is intentionally accessed only by guarded SECURITY DEFINER
-- RPCs. This explicit deny policy documents that no direct API row access is
-- permitted, even if grants are changed later.
create policy personnel_account_links_deny_client_access
  on public.personnel_account_links
  as restrictive for all to authenticated
  using (false) with check (false);
