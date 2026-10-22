create or replace function public.mark_sale_refund_completed(p_return uuid,p_note text default '') returns void language plpgsql security definer set search_path='' as $$
declare v_r public.sale_returns%rowtype; v_branch uuid;
begin
 if auth.uid() is null then raise exception 'Inicia sesión para registrar el reembolso.'; end if;
 select * into v_r from public.sale_returns where id=p_return for update;
 select branch_id into v_branch from public.sales where id=v_r.sale_id and organization_id=v_r.organization_id;
 if v_r.id is null or v_r.refund_amount<=0 or v_r.refund_status<>'pending' or not app_private.has_org_role(v_r.organization_id,v_branch,array['owner','admin','manager']) then raise exception 'Reembolso pendiente no encontrado o sin autorización.'; end if;
 update public.sale_returns set refund_status='refunded',note=concat_ws(E'\n',nullif(note,''),left(trim(coalesce(p_note,'')),500)) where id=v_r.id;
end $$;
revoke all on function public.mark_sale_refund_completed(uuid,text) from public,anon; grant execute on function public.mark_sale_refund_completed(uuid,text) to authenticated;
