-- Jalon 2 — Comptes : administration des propriétaires, gestion des employés, mots de passe,
-- journal des actions sur les comptes. Voir docs/decisions/0009-administration-des-comptes.md.
--
-- Principe : les écritures d'administration passent par des fonctions srv_* exécutables par le
-- serveur seulement (service_role). Chacune REVÉRIFIE le rôle de l'auteur (p_actor) : même si le
-- code serveur se trompait, la base refuse de franchir la frontière entre propriétaires.

-- ---------------------------------------------------------------------------
-- Journal des actions sur les comptes (qui a fait quoi, sur qui, quand)
-- ---------------------------------------------------------------------------
create type public.account_event_type as enum (
  'tenant_created',
  'tenant_suspended',
  'tenant_reactivated',
  'shop_created',
  'member_created',
  'member_disabled',
  'member_enabled',
  'member_shops_changed',
  'password_reset',
  'password_changed'
);

create table public.account_events (
  id uuid primary key default gen_random_uuid(),
  type public.account_event_type not null,
  tenant_id uuid references public.tenants (id),
  actor_id uuid references auth.users (id),
  target_user_id uuid references auth.users (id),
  shop_id uuid references public.shops (id),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
comment on table public.account_events is 'Journal des actions sur les comptes. Écrit uniquement par les fonctions serveur.';
create index account_events_tenant_idx on public.account_events (tenant_id, created_at desc);
create index account_events_target_idx on public.account_events (target_user_id, created_at desc);

revoke all on public.account_events from anon, authenticated;
grant select on public.account_events to authenticated;
grant all on public.account_events to service_role;
alter table public.account_events enable row level security;

-- Le propriétaire voit le journal de son tenant ; chacun voit ce qui le concerne ;
-- l'admin plateforme voit le journal des comptes (aucune donnée client n'y figure).
create policy account_events_select on public.account_events for select to authenticated
using (
  (tenant_id = (select private.current_tenant_id()) and (select private.is_owner()))
  or target_user_id = (select auth.uid())
  or (select private.is_platform_admin())
);

-- ---------------------------------------------------------------------------
-- Aides : rôle de l'auteur passé explicitement (le serveur agit avec service_role,
-- auth.uid() y est vide).
-- ---------------------------------------------------------------------------
create function private.actor_is_platform_admin(p_actor uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins a where a.user_id = p_actor)
$$;

-- Tenant dont l'auteur est le propriétaire actif (tenant actif), sinon null.
create function private.actor_owner_tenant(p_actor uuid) returns uuid
language sql stable security definer
set search_path = ''
as $$
  select p.tenant_id
  from public.profiles p
  join public.tenants t on t.id = p.tenant_id
  where p.user_id = p_actor and p.role = 'owner' and p.status = 'active' and t.status = 'active'
$$;

create function private.forbidden(p_message text) returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception '%', p_message using errcode = '42501';
end;
$$;

create function private.log_account_event(
  p_type public.account_event_type,
  p_tenant uuid,
  p_actor uuid,
  p_target uuid default null,
  p_shop uuid default null,
  p_details jsonb default '{}'::jsonb
) returns void
language sql security definer
set search_path = ''
as $$
  insert into public.account_events (type, tenant_id, actor_id, target_user_id, shop_id, details)
  values (p_type, p_tenant, p_actor, p_target, p_shop, coalesce(p_details, '{}'::jsonb))
$$;

-- ---------------------------------------------------------------------------
-- Admin plateforme : créer un propriétaire (tenant + compte propriétaire + première boutique)
-- Le compte Auth (p_owner_id) est créé juste avant par le serveur.
-- ---------------------------------------------------------------------------
create function public.srv_create_tenant(
  p_actor uuid,
  p_tenant_name text,
  p_owner_id uuid,
  p_owner_name text,
  p_owner_phone text,
  p_shop_name text default null,
  p_shop_district text default null,
  p_shop_city text default null
) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_shop uuid;
begin
  if not private.actor_is_platform_admin(p_actor) then
    perform private.forbidden('Seul un administrateur de la plateforme crée un propriétaire');
  end if;

  insert into public.tenants (name, created_by) values (btrim(p_tenant_name), p_actor) returning id into v_tenant;
  insert into public.profiles (user_id, tenant_id, role, full_name, must_change_password, created_by)
  values (p_owner_id, v_tenant, 'owner', btrim(p_owner_name), true, p_actor);
  insert into public.profile_contacts (user_id, tenant_id, phone_e164) values (p_owner_id, v_tenant, p_owner_phone);

  perform private.log_account_event('tenant_created', v_tenant, p_actor, p_owner_id);
  perform private.log_account_event('member_created', v_tenant, p_actor, p_owner_id, null, jsonb_build_object('role', 'owner'));

  if nullif(btrim(coalesce(p_shop_name, '')), '') is not null then
    insert into public.shops (tenant_id, name, district, city, created_by)
    values (v_tenant, btrim(p_shop_name), nullif(btrim(p_shop_district), ''), nullif(btrim(p_shop_city), ''), p_actor)
    returning id into v_shop;
    perform private.log_account_event('shop_created', v_tenant, p_actor, null, v_shop);
  end if;

  return v_tenant;
end;
$$;

-- Admin plateforme ou propriétaire du tenant : créer une boutique.
create function public.srv_create_shop(
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
  if not (private.actor_is_platform_admin(p_actor) or private.actor_owner_tenant(p_actor) = p_tenant_id) then
    perform private.forbidden('Seuls l''administrateur et le propriétaire créent une boutique');
  end if;
  insert into public.shops (tenant_id, name, district, city, phone_e164, created_by)
  values (p_tenant_id, btrim(p_name), nullif(btrim(p_district), ''), nullif(btrim(p_city), ''), nullif(p_phone, ''), p_actor)
  returning id into v_shop;
  perform private.log_account_event('shop_created', p_tenant_id, p_actor, null, v_shop);
  return v_shop;
end;
$$;

-- Admin plateforme : suspendre / réactiver un propriétaire.
create function public.srv_set_tenant_status(p_actor uuid, p_tenant_id uuid, p_status public.tenant_status) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_old public.tenant_status;
begin
  if not private.actor_is_platform_admin(p_actor) then
    perform private.forbidden('Seul un administrateur de la plateforme suspend un propriétaire');
  end if;
  select status into v_old from public.tenants where id = p_tenant_id for update;
  if v_old is null then
    raise exception 'Propriétaire introuvable' using errcode = 'no_data_found';
  end if;
  if v_old = p_status then
    return;
  end if;
  update public.tenants set status = p_status where id = p_tenant_id;
  perform private.log_account_event(
    case when p_status = 'suspended' then 'tenant_suspended'::public.account_event_type else 'tenant_reactivated'::public.account_event_type end,
    p_tenant_id, p_actor);
end;
$$;

-- ---------------------------------------------------------------------------
-- Propriétaire : employés (gérants, comptables)
-- ---------------------------------------------------------------------------

-- Cible gérée par l'auteur : un employé (non propriétaire) du tenant dont l'auteur est propriétaire.
create function private.assert_manages_member(p_actor uuid, p_target uuid) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_tenant uuid := private.actor_owner_tenant(p_actor);
begin
  if v_tenant is null
     or not exists (select 1 from public.profiles p where p.user_id = p_target and p.tenant_id = v_tenant and p.role <> 'owner') then
    perform private.forbidden('Seul le propriétaire gère ses employés');
  end if;
  return v_tenant;
end;
$$;

-- Rattache exactement les boutiques demandées (révoque les autres). Renvoie {added, removed}.
create function private.sync_member_shops(p_actor uuid, p_tenant uuid, p_user uuid, p_shop_ids uuid[]) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_wanted uuid[] := coalesce(p_shop_ids, '{}');
  v_removed uuid[];
  v_added uuid[];
begin
  if exists (select 1 from unnest(v_wanted) s(id) where not exists (
    select 1 from public.shops sh where sh.id = s.id and sh.tenant_id = p_tenant and sh.archived_at is null)) then
    perform private.forbidden('Boutique inconnue ou d''un autre propriétaire');
  end if;

  with revoked as (
    update public.shop_members m set revoked_at = now(), revoked_by = p_actor
    where m.user_id = p_user and m.revoked_at is null and not (m.shop_id = any (v_wanted))
    returning m.shop_id
  )
  select coalesce(array_agg(shop_id), '{}') into v_removed from revoked;

  with inserted as (
    insert into public.shop_members (shop_id, user_id, tenant_id, created_by)
    select s.id, p_user, p_tenant, p_actor
    from (select distinct id from unnest(v_wanted) u(id)) s
    where not exists (select 1 from public.shop_members m where m.shop_id = s.id and m.user_id = p_user and m.revoked_at is null)
    returning shop_id
  )
  select coalesce(array_agg(shop_id), '{}') into v_added from inserted;

  return jsonb_build_object('added', to_jsonb(v_added), 'removed', to_jsonb(v_removed));
end;
$$;

create function public.srv_create_member(
  p_actor uuid,
  p_user_id uuid,
  p_role public.app_role,
  p_full_name text,
  p_phone text,
  p_shop_ids uuid[]
) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_tenant uuid := private.actor_owner_tenant(p_actor);
begin
  if v_tenant is null then
    perform private.forbidden('Seul le propriétaire crée un employé');
  end if;
  if p_role = 'owner' then
    perform private.forbidden('Un propriétaire est créé par l''administrateur de la plateforme');
  end if;
  if coalesce(array_length(p_shop_ids, 1), 0) = 0 then
    raise exception 'Un employé doit être rattaché à au moins une boutique' using errcode = 'check_violation';
  end if;

  insert into public.profiles (user_id, tenant_id, role, full_name, must_change_password, created_by)
  values (p_user_id, v_tenant, p_role, btrim(p_full_name), true, p_actor);
  insert into public.profile_contacts (user_id, tenant_id, phone_e164) values (p_user_id, v_tenant, p_phone);
  perform private.sync_member_shops(p_actor, v_tenant, p_user_id, p_shop_ids);
  perform private.log_account_event('member_created', v_tenant, p_actor, p_user_id, null,
    jsonb_build_object('role', p_role, 'shops', to_jsonb(p_shop_ids)));
end;
$$;

create function public.srv_set_member_shops(p_actor uuid, p_user_id uuid, p_shop_ids uuid[]) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_tenant uuid := private.assert_manages_member(p_actor, p_user_id);
  v_changes jsonb;
begin
  if coalesce(array_length(p_shop_ids, 1), 0) = 0 then
    raise exception 'Un employé doit être rattaché à au moins une boutique' using errcode = 'check_violation';
  end if;
  v_changes := private.sync_member_shops(p_actor, v_tenant, p_user_id, p_shop_ids);
  if v_changes->'added' <> '[]'::jsonb or v_changes->'removed' <> '[]'::jsonb then
    perform private.log_account_event('member_shops_changed', v_tenant, p_actor, p_user_id, null, v_changes);
  end if;
  return v_changes;
end;
$$;

create function public.srv_set_member_status(p_actor uuid, p_user_id uuid, p_status public.account_status) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_tenant uuid := private.assert_manages_member(p_actor, p_user_id);
  v_old public.account_status;
begin
  select status into v_old from public.profiles where user_id = p_user_id for update;
  if v_old = p_status then
    return;
  end if;
  update public.profiles set status = p_status where user_id = p_user_id;
  perform private.log_account_event(
    case when p_status = 'disabled' then 'member_disabled'::public.account_event_type else 'member_enabled'::public.account_event_type end,
    v_tenant, p_actor, p_user_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Mots de passe
-- ---------------------------------------------------------------------------

-- Qui peut réinitialiser le mot de passe de qui (CLAUDE.md §4.2) :
-- l'admin plateforme pour un propriétaire, le propriétaire pour ses employés.
-- Renvoie le tenant de la cible ; lève 42501 sinon.
create function public.srv_check_password_reset(p_actor uuid, p_user_id uuid) returns uuid
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_target public.profiles%rowtype;
begin
  select * into v_target from public.profiles where user_id = p_user_id;
  if v_target.user_id is null then
    perform private.forbidden('Compte introuvable');
  end if;
  if v_target.role = 'owner' then
    if not private.actor_is_platform_admin(p_actor) then
      perform private.forbidden('Seul l''administrateur réinitialise le mot de passe d''un propriétaire');
    end if;
  elsif private.actor_owner_tenant(p_actor) is distinct from v_target.tenant_id then
    perform private.forbidden('Seul le propriétaire réinitialise le mot de passe de ses employés');
  end if;
  return v_target.tenant_id;
end;
$$;

-- À appeler APRÈS le changement effectif du mot de passe dans Auth : le compte devra le changer.
create function public.srv_record_password_reset(p_actor uuid, p_user_id uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_tenant uuid := public.srv_check_password_reset(p_actor, p_user_id);
begin
  update public.profiles set must_change_password = true where user_id = p_user_id;
  perform private.log_account_event('password_reset', v_tenant, p_actor, p_user_id);
end;
$$;

-- L'utilisateur a changé son propre mot de passe (vérifié par le serveur).
create function public.srv_record_password_change(p_user_id uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
begin
  update public.profiles set must_change_password = false where user_id = p_user_id returning tenant_id into v_tenant;
  perform private.log_account_event('password_changed', v_tenant, p_user_id, p_user_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Droits : fonctions srv_* pour le serveur uniquement ; aides privées idem.
-- ---------------------------------------------------------------------------
revoke all on function
  public.srv_create_tenant(uuid, text, uuid, text, text, text, text, text),
  public.srv_create_shop(uuid, uuid, text, text, text, text),
  public.srv_set_tenant_status(uuid, uuid, public.tenant_status),
  public.srv_create_member(uuid, uuid, public.app_role, text, text, uuid[]),
  public.srv_set_member_shops(uuid, uuid, uuid[]),
  public.srv_set_member_status(uuid, uuid, public.account_status),
  public.srv_check_password_reset(uuid, uuid),
  public.srv_record_password_reset(uuid, uuid),
  public.srv_record_password_change(uuid)
from public, anon, authenticated;

grant execute on function
  public.srv_create_tenant(uuid, text, uuid, text, text, text, text, text),
  public.srv_create_shop(uuid, uuid, text, text, text, text),
  public.srv_set_tenant_status(uuid, uuid, public.tenant_status),
  public.srv_create_member(uuid, uuid, public.app_role, text, text, uuid[]),
  public.srv_set_member_shops(uuid, uuid, uuid[]),
  public.srv_set_member_status(uuid, uuid, public.account_status),
  public.srv_check_password_reset(uuid, uuid),
  public.srv_record_password_reset(uuid, uuid),
  public.srv_record_password_change(uuid)
to service_role;

revoke all on function
  private.actor_is_platform_admin(uuid),
  private.actor_owner_tenant(uuid),
  private.forbidden(text),
  private.log_account_event(public.account_event_type, uuid, uuid, uuid, uuid, jsonb),
  private.assert_manages_member(uuid, uuid),
  private.sync_member_shops(uuid, uuid, uuid, uuid[])
from public, anon, authenticated;

grant execute on function
  private.actor_is_platform_admin(uuid),
  private.actor_owner_tenant(uuid),
  private.forbidden(text),
  private.log_account_event(public.account_event_type, uuid, uuid, uuid, uuid, jsonb),
  private.assert_manages_member(uuid, uuid),
  private.sync_member_shops(uuid, uuid, uuid, uuid[])
to service_role;
