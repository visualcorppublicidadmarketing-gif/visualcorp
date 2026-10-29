-- Move overdue, non-terminal Marketing work forward once daily, without relying
-- on a user opening the Kanban. The schedule is interpreted in Ecuador time.

create or replace function public.roll_overdue_marketing_posts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/Guayaquil')::date;
  v_post record;
  v_next_date date;
  v_target_date date;
  v_moved integer := 0;
begin
  for v_post in
    select p.id, p.organization_id, p.scheduled_date, p.scheduled_time
    from public.marketing_posts p
    where p.scheduled_date ~ '^\d{4}-\d{2}-\d{2}$'
      and pg_input_is_valid(p.scheduled_date, 'date')
      and case
        when pg_input_is_valid(p.scheduled_date, 'date') then p.scheduled_date::date < v_today
        else false
      end
      and p.status !~* '(publicad|complet|terminad|finalizad|cancelad|anulad|archivad)'
    order by p.scheduled_date, p.id
    for update of p skip locked
  loop
    v_next_date := v_post.scheduled_date::date + 1;
    while extract(isodow from v_next_date) in (6, 7) loop
      v_next_date := v_next_date + 1;
    end loop;

    v_target_date := v_next_date;
    if v_next_date < v_today then
      v_target_date := v_today;
      while extract(isodow from v_target_date) in (6, 7) loop
        v_target_date := v_target_date + 1;
      end loop;
    end if;

    update public.marketing_posts
    set scheduled_date = to_char(v_target_date, 'YYYY-MM-DD'),
        updated_at = timezone('UTC', now())
    where id = v_post.id
      and organization_id = v_post.organization_id;

    insert into public.marketing_post_events(
      organization_id, post_id, actor_id, field_name, previous_value, new_value
    ) values (
      v_post.organization_id,
      v_post.id,
      null,
      'schedule',
      concat_ws(' ', v_post.scheduled_date, nullif(v_post.scheduled_time, '')),
      concat_ws(' ', to_char(v_target_date, 'YYYY-MM-DD'), nullif(v_post.scheduled_time, ''))
    );
    v_moved := v_moved + 1;
  end loop;

  return v_moved;
end;
$$;

revoke all on function public.roll_overdue_marketing_posts() from public, anon, authenticated, service_role;

comment on function public.roll_overdue_marketing_posts() is
  'Reprograma publicaciones vencidas no terminales al siguiente día hábil y registra el cambio en marketing_post_events.';

do $$
begin
  if exists (select 1 from cron.job where jobname = 'marketing-overdue-publications-daily') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'marketing-overdue-publications-daily';
  end if;

  perform cron.schedule(
    'marketing-overdue-publications-daily',
    '5 10 * * *',
    'select public.roll_overdue_marketing_posts();'
  );
end;
$$;
