-- The public catalog views run with caller privileges. Let anonymous readers
-- resolve only the Visual Corp organization row required by their RLS policies.
grant select (id, slug) on public.organizations to anon;

drop policy if exists organizations_public_catalog_read on public.organizations;
create policy organizations_public_catalog_read on public.organizations
  for select to anon
  using (slug = 'visual-corp');
