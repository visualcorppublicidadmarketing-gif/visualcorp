alter table public.marketing_posts
  add column design_ready boolean not null default false,
  add column video_ready boolean not null default false,
  add column canvas_width integer,
  add column canvas_height integer,
  add constraint marketing_posts_canvas_dimensions_valid check (
    (canvas_width is null and canvas_height is null)
    or (
      canvas_width between 1 and 20000
      and canvas_height between 1 and 20000
    )
  );

comment on column public.marketing_posts.design_ready is 'Indica si el diseño final de esta publicación está listo.';
comment on column public.marketing_posts.video_ready is 'Indica si el vídeo final de esta publicación está listo.';
comment on column public.marketing_posts.canvas_width is 'Ancho de la pieza en píxeles; la proporción se calcula desde ancho y alto.';
comment on column public.marketing_posts.canvas_height is 'Alto de la pieza en píxeles; la proporción se calcula desde ancho y alto.';
