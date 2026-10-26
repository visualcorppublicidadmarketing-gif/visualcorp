insert into public.equipment_areas (organization_id,code,name)
select o.id,v.code,v.name
from public.organizations o
cross join (values
  ('LASER','Láser'),
  ('SUBLIMACION','Sublimación'),
  ('TALLER','Taller'),
  ('IMPRESION','Impresión'),
  ('TROQUELADO','Troquelado'),
  ('NEONES','Neones')
) as v(code,name)
where o.slug='visual-corp'
on conflict (organization_id,code) do update set name=excluded.name,active=true;
