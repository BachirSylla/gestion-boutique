-- Correctif de sécurité : srv_create_shop acceptait un auteur qui n'est ni admin ni propriétaire.
-- « not (false or null = tenant) » vaut null en SQL, et « if null » ne lève pas d'erreur.
-- On compare avec « is not distinct from », qui ne renvoie jamais null.
create or replace function public.srv_create_shop(
  p_actor uuid,
  p_tenant_id uuid,
  p_name text,
  p_district text default null,
  p_city text default null,
  p_phone text default null
) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_shop uuid;
begin
  if not (private.actor_is_platform_admin(p_actor) or (private.actor_owner_tenant(p_actor) is not distinct from p_tenant_id and p_tenant_id is not null)) then
    perform private.forbidden('Seuls l''administrateur et le propriétaire créent une boutique');
  end if;
  insert into public.shops (tenant_id, name, district, city, phone_e164, created_by)
  values (p_tenant_id, btrim(p_name), nullif(btrim(p_district), ''), nullif(btrim(p_city), ''), nullif(p_phone, ''), p_actor)
  returning id into v_shop;
  perform private.log_account_event('shop_created', p_tenant_id, p_actor, null, v_shop);
  return v_shop;
end;
$$;
