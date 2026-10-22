-- Public quote flow needs the same verified rate tiers and product images as the source catalog.
create or replace view public.public_quote_catalog_products with (security_barrier = true) as
  select p.id, p.name, p.slug, p.description, p.product_type as type,
    p.category_id, p.subcategory_id, coalesce(o.display_category, p.subcategory, p.category_id) as category,
    p.calc_type, p.price, p.price_inst, p.price_corp, p.price_scales, p.custom_options,
    p.currency, p.is_featured as featured, p.is_published,
    coalesce(o.sort_order, p.sort_order) as sort_order,
    coalesce(o.display_image_url, p.image_url) as image,
    coalesce(o.display_images, p.images) as images,
    coalesce(o.display_features, p.features) as features
  from public.catalog_products p
  left join public.website_product_overrides o
    on o.organization_id = p.organization_id and o.product_id = p.id
  where p.is_published and coalesce(o.is_published, true)
    and exists (select 1 from public.organizations org where org.id = p.organization_id and org.slug = 'visual-corp');
grant select on public.public_quote_catalog_products to anon, authenticated;

insert into public.site_settings (
  id, organization_id, brand, slogan, phone, email, address, whatsapp,
  hero_kicker, hero_title, hero_text
)
select 'main', org.id, 'Visual Corp', 'Agencia de publicidad y marketing',
  '0967872396', 'visualcorp.publicidad.marketing@gmail.com',
  'Av. Jaime Roldós y General Andrade, Milagro, Ecuador', '0967872396',
  'Agencia de publicidad y marketing', 'Hacemos visible lo que imaginas.',
  'Diseño, producción y marketing para marcas que quieren ocupar su espacio.'
from public.organizations org where org.slug = 'visual-corp'
on conflict (id) do update set
  organization_id = excluded.organization_id, brand = excluded.brand, slogan = excluded.slogan,
  phone = excluded.phone, email = excluded.email, address = excluded.address,
  whatsapp = excluded.whatsapp, hero_kicker = excluded.hero_kicker,
  hero_title = excluded.hero_title, hero_text = excluded.hero_text, updated_at = now();

insert into public.services (id, organization_id, name, short, detail, icon, tag, sort_order, is_published)
select svc.id, org.id, svc.name, svc.description, svc.description, 'sparkles', 'Servicio Visual Corp', svc.sort_order, true
from public.organizations org
cross join (values
  ('impresion', 'Impresión y papelería', 'Piezas gráficas para comunicar tu marca.', 1),
  ('gran-formato', 'Publicidad de gran formato', 'Soluciones para que tu mensaje se vea.', 2),
  ('rotulos', 'Rótulos y fachadas', 'Identidad visible para espacios y negocios.', 3),
  ('textil', 'Textil y promocionales', 'Piezas personalizadas para marcas y equipos.', 4),
  ('corte', 'Corte, grabado y señalética', 'Piezas gráficas y señalización a medida.', 5),
  ('eventos', 'Exhibición y eventos', 'Material visual para presentar ideas y proyectos.', 6)
) as svc(id, name, description, sort_order)
where org.slug = 'visual-corp'
on conflict (id) do update set name = excluded.name, short = excluded.short,
  detail = excluded.detail, sort_order = excluded.sort_order, is_published = true, updated_at = now();

insert into public.pages (id, organization_id, parent_id, slug, title, intro, page_type, is_published, sort_order)
select 'home', id, null, 'home', 'Inicio', 'Hacemos visible lo que imaginas.', 'home', true, 0
from public.organizations where slug = 'visual-corp'
on conflict (id) do update set title = excluded.title, intro = excluded.intro,
  is_published = true, updated_at = now();

insert into public.pages (id, organization_id, parent_id, slug, title, intro, page_type, is_published, sort_order)
select svc.id, svc.organization_id, 'home', svc.id, svc.name, svc.short, 'service', true, svc.sort_order
from public.services svc join public.organizations org on org.id = svc.organization_id
where org.slug = 'visual-corp'
on conflict (id) do update set title = excluded.title, intro = excluded.intro,
  is_published = true, sort_order = excluded.sort_order, updated_at = now();
