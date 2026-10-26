alter table public.marketing_posts
  add column if not exists tags text[] not null default '{}',
  add column if not exists calendar_color text not null default '';

comment on column public.marketing_posts.tags is 'Editorial tags, including organization-specific tags entered by the marketing team.';
comment on column public.marketing_posts.calendar_color is 'Optional calendar color selected for this publication.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'marketing_posts_calendar_color_check') then
    alter table public.marketing_posts add constraint marketing_posts_calendar_color_check
      check (calendar_color = '' or calendar_color in ('#7141a6','#2477a8','#17846d','#c28a13','#d45a35','#bc3e68','#5966b3','#697582'));
  end if;
end $$;
