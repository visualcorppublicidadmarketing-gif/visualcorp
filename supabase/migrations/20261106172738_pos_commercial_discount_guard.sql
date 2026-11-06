-- POS commercial discounts are capped at 40% and carry an auditable reason.
alter table public.sales
  add column if not exists discount_reason text not null default '';

alter table public.sales
  drop constraint if exists sales_discount_reason_length_check;
alter table public.sales
  add constraint sales_discount_reason_length_check
  check (char_length(discount_reason) <= 300);

create or replace function app_private.capture_pos_commercial_discount_reason()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match text[];
begin
  if new.idempotency_key is null then
    return new;
  end if;

  if coalesce(new.discount_total, 0) <= 0 then
    new.discount_reason := '';
    return new;
  end if;

  if coalesce(new.subtotal, 0) <= 0
    or new.discount_total > round(new.subtotal * 0.40, 2) then
    raise exception 'El descuento comercial no puede superar el 40%% del subtotal.'
      using errcode = '22023';
  end if;

  if tg_op = 'UPDATE'
    and old.discount_total = new.discount_total
    and char_length(coalesce(old.discount_reason, '')) > 0 then
    new.discount_reason := old.discount_reason;
    return new;
  end if;

  v_match := regexp_match(
    coalesce(new.note, ''),
    E'^Descuento comercial \\([0-9]{1,2}%\\): ([^\\n]{1,300})'
  );
  if v_match is null or char_length(trim(v_match[1])) = 0 then
    raise exception 'Registra el motivo del descuento comercial en la nota de la venta.'
      using errcode = '22023';
  end if;

  new.discount_reason := trim(v_match[1]);
  return new;
end;
$$;

revoke all on function app_private.capture_pos_commercial_discount_reason() from public, anon, authenticated;

drop trigger if exists sales_capture_pos_commercial_discount_reason on public.sales;
create trigger sales_capture_pos_commercial_discount_reason
  before insert or update of subtotal, discount_total
  on public.sales
  for each row execute function app_private.capture_pos_commercial_discount_reason();
