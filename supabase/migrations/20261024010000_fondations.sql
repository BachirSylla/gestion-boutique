-- Jalon 1 — Fondations : propriétaires (tenants), boutiques, utilisateurs, rattachements, rôles.
-- Isolation imposée par la RLS (invariant 4). Voir docs/decisions/0004-schema-et-rls.md.

-- ---------------------------------------------------------------------------
-- Schéma privé : fonctions d'aide, non exposé par l'API (PostgREST n'expose que public).
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- Par défaut, Supabase donne tous les droits à anon sur les nouveaux objets de public.
-- Bitig n'a aucune donnée publique : anon n'a droit à rien, maintenant et à l'avenir.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon, public;
-- Les droits de authenticated sont accordés table par table, explicitement.
alter default privileges in schema public revoke all on tables from authenticated;
alter default privileges in schema public revoke all on functions from authenticated;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.tenant_status as enum ('active', 'suspended');
create type public.app_role as enum ('owner', 'manager', 'accountant');
create type public.account_status as enum ('active', 'disabled');

-- ---------------------------------------------------------------------------
-- Utilitaire : mise à jour automatique de updated_at
-- ---------------------------------------------------------------------------
create function private.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Propriétaires (tenants)
-- ---------------------------------------------------------------------------
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  status public.tenant_status not null default 'active',
  -- Valeurs par défaut des nouvelles boutiques (multi-pays possible, section 7.1).
  default_locale text not null default 'fr-SN',
  default_currency char(3) not null default 'XOF',
  default_timezone text not null default 'Africa/Dakar',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) default auth.uid(),
  updated_at timestamptz not null default now()
);
comment on table public.tenants is 'Propriétaire : compte client de la plateforme (tenant).';

create trigger tenants_set_updated_at before update on public.tenants
for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Boutiques
-- ---------------------------------------------------------------------------
create table public.shops (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  district text check (char_length(district) <= 120),
  city text check (char_length(city) <= 120),
  phone_e164 text check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  locale text not null default 'fr-SN',
  currency char(3) not null default 'XOF',
  timezone text not null default 'Africa/Dakar',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) default auth.uid(),
  updated_at timestamptz not null default now(),
  -- Cible des clés étrangères composites : garantit qu'un rattachement reste dans le même tenant.
  unique (id, tenant_id)
);
comment on table public.shops is 'Boutique : point de vente indépendant (stock, prix, clients, réglages).';
create index shops_tenant_id_idx on public.shops (tenant_id);

create trigger shops_set_updated_at before update on public.shops
for each row execute function private.set_updated_at();

-- Une boutique ne change jamais de propriétaire.
create function private.forbid_tenant_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'tenant_id ne peut pas être modifié' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger shops_forbid_tenant_change before update on public.shops
for each row execute function private.forbid_tenant_change();

-- ---------------------------------------------------------------------------
-- Profils des utilisateurs d'un propriétaire (propriétaire, gérant, comptable)
-- Lisibles par tous les membres du même propriétaire : le nom sert d'auteur des opérations.
-- Le téléphone est à part (profile_contacts) : visible par soi et par le propriétaire seulement.
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users (id),
  tenant_id uuid not null references public.tenants (id),
  role public.app_role not null,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  status public.account_status not null default 'active',
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (user_id, tenant_id)
);
comment on table public.profiles is 'Utilisateur rattaché à un seul propriétaire, avec son rôle.';
create index profiles_tenant_id_idx on public.profiles (tenant_id);

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function private.set_updated_at();

create trigger profiles_forbid_tenant_change before update on public.profiles
for each row execute function private.forbid_tenant_change();

create table public.profile_contacts (
  user_id uuid primary key,
  tenant_id uuid not null,
  phone_e164 text not null unique check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  updated_at timestamptz not null default now(),
  foreign key (user_id, tenant_id) references public.profiles (user_id, tenant_id) on delete cascade
);
comment on table public.profile_contacts is 'Téléphone (identifiant de connexion) d''un utilisateur : visible par lui-même et par son propriétaire.';
create index profile_contacts_tenant_id_idx on public.profile_contacts (tenant_id);

create trigger profile_contacts_set_updated_at before update on public.profile_contacts
for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Administrateurs de la plateforme (rôle à part, sans propriétaire)
-- ---------------------------------------------------------------------------
create table public.platform_admins (
  user_id uuid primary key references auth.users (id),
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  phone_e164 text not null unique check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  created_at timestamptz not null default now()
);
comment on table public.platform_admins is 'Éditeur de Bitig. Ne voit pas le détail des comptes clients des boutiques.';

-- ---------------------------------------------------------------------------
-- Rattachement gérant / comptable ↔ boutique (le propriétaire voit toutes ses boutiques
-- sans rattachement). Jamais supprimé : on renseigne revoked_at (traçabilité).
-- ---------------------------------------------------------------------------
create table public.shop_members (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  user_id uuid not null,
  tenant_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) default auth.uid(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id),
  foreign key (shop_id, tenant_id) references public.shops (id, tenant_id),
  foreign key (user_id, tenant_id) references public.profiles (user_id, tenant_id),
  check ((revoked_at is null) = (revoked_by is null))
);
comment on table public.shop_members is 'Rattachement d''un gérant ou comptable à une boutique de son propriétaire.';
create unique index shop_members_active_uniq on public.shop_members (shop_id, user_id) where revoked_at is null;
create index shop_members_user_id_idx on public.shop_members (user_id) where revoked_at is null;

-- Seuls les gérants et comptables sont rattachés ; un rattachement ne se modifie que pour être révoqué.
create function private.check_shop_member() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if (select p.role from public.profiles p where p.user_id = new.user_id) = 'owner' then
      raise exception 'Un propriétaire accède à toutes ses boutiques sans rattachement' using errcode = 'check_violation';
    end if;
  elsif tg_op = 'UPDATE' then
    -- L'auteur de la révocation est l'utilisateur courant (le serveur le fournit explicitement).
    if auth.uid() is not null and new.revoked_at is not null then
      new.revoked_by := auth.uid();
    end if;
    if old.revoked_at is not null
       or new.shop_id <> old.shop_id or new.user_id <> old.user_id or new.tenant_id <> old.tenant_id
       or new.created_at <> old.created_at or new.created_by is distinct from old.created_by then
      raise exception 'Un rattachement ne peut être que révoqué, une seule fois' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger shop_members_check before insert or update on public.shop_members
for each row execute function private.check_shop_member();

-- ---------------------------------------------------------------------------
-- Fonctions d'aide pour la RLS (security definer : lisent les tables sans repasser par la RLS).
-- Un profil désactivé ou un propriétaire suspendu n'ont plus accès à rien.
-- ---------------------------------------------------------------------------
create function private.current_tenant_id() returns uuid
language sql stable security definer
set search_path = ''
as $$
  select p.tenant_id
  from public.profiles p
  join public.tenants t on t.id = p.tenant_id
  where p.user_id = auth.uid() and p.status = 'active' and t.status = 'active'
$$;

create function private.current_app_role() returns public.app_role
language sql stable security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  join public.tenants t on t.id = p.tenant_id
  where p.user_id = auth.uid() and p.status = 'active' and t.status = 'active'
$$;

create function private.is_owner() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(private.current_app_role() = 'owner', false)
$$;

create function private.is_platform_admin() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins a where a.user_id = auth.uid())
$$;

-- Boutiques accessibles à l'utilisateur courant : toutes celles du tenant pour le propriétaire,
-- celles de ses rattachements actifs pour un gérant ou un comptable.
create function private.accessible_shop_ids() returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select s.id
  from public.shops s
  where s.tenant_id = private.current_tenant_id()
    and (
      private.current_app_role() = 'owner'
      or exists (
        select 1 from public.shop_members m
        where m.shop_id = s.id and m.user_id = auth.uid() and m.revoked_at is null
      )
    )
$$;

create function private.can_access_shop(p_shop_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from private.accessible_shop_ids() id where id = p_shop_id)
$$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Droits SQL (en plus de la RLS) : uniquement ce que le client a le droit de faire.
-- Les créations de comptes et les opérations d'administration passent par le serveur
-- (clé secrète, service_role) après vérification du rôle de l'appelant.
-- ---------------------------------------------------------------------------
revoke all on public.tenants, public.shops, public.profiles, public.profile_contacts,
  public.platform_admins, public.shop_members from anon, authenticated;

grant select on public.tenants to authenticated;
grant select, insert (id, tenant_id, name, district, city, phone_e164, locale, currency, timezone),
  update (name, district, city, phone_e164, archived_at) on public.shops to authenticated;
grant select on public.profiles to authenticated;
grant select on public.profile_contacts to authenticated;
grant select on public.platform_admins to authenticated;
grant select, insert (id, shop_id, user_id, tenant_id), update (revoked_at) on public.shop_members to authenticated;

grant all on public.tenants, public.shops, public.profiles, public.profile_contacts,
  public.platform_admins, public.shop_members to service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.tenants enable row level security;
alter table public.shops enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_contacts enable row level security;
alter table public.platform_admins enable row level security;
alter table public.shop_members enable row level security;

-- tenants : son propriétaire ; l'admin plateforme voit tous les propriétaires.
create policy tenants_select on public.tenants for select to authenticated
using (id = (select private.current_tenant_id()) or (select private.is_platform_admin()));

-- shops : boutiques accessibles ; l'admin voit les boutiques (création pour un propriétaire).
create policy shops_select on public.shops for select to authenticated
using (id in (select private.accessible_shop_ids()) or (select private.is_platform_admin()));

create policy shops_insert_owner on public.shops for insert to authenticated
with check (tenant_id = (select private.current_tenant_id()) and (select private.is_owner()));

create policy shops_update_owner on public.shops for update to authenticated
using (tenant_id = (select private.current_tenant_id()) and (select private.is_owner()))
with check (tenant_id = (select private.current_tenant_id()) and (select private.is_owner()));

-- profiles : soi-même, les collègues du même propriétaire ; l'admin voit les propriétaires seulement.
create policy profiles_select on public.profiles for select to authenticated
using (
  user_id = (select auth.uid())
  or tenant_id = (select private.current_tenant_id())
  or (role = 'owner' and (select private.is_platform_admin()))
);

-- profile_contacts : soi-même, son propriétaire ; l'admin voit le téléphone des propriétaires.
create policy profile_contacts_select on public.profile_contacts for select to authenticated
using (
  user_id = (select auth.uid())
  or (tenant_id = (select private.current_tenant_id()) and (select private.is_owner()))
  or (
    (select private.is_platform_admin())
    and exists (select 1 from public.profiles p where p.user_id = profile_contacts.user_id and p.role = 'owner')
  )
);

-- platform_admins : chacun ne voit que sa propre ligne (sert à savoir si l'on est admin).
create policy platform_admins_select_self on public.platform_admins for select to authenticated
using (user_id = (select auth.uid()));

-- shop_members : rattachements des boutiques accessibles ; le propriétaire les gère.
create policy shop_members_select on public.shop_members for select to authenticated
using (shop_id in (select private.accessible_shop_ids()));

create policy shop_members_insert_owner on public.shop_members for insert to authenticated
with check (tenant_id = (select private.current_tenant_id()) and (select private.is_owner()));

create policy shop_members_update_owner on public.shop_members for update to authenticated
using (tenant_id = (select private.current_tenant_id()) and (select private.is_owner()))
with check (tenant_id = (select private.current_tenant_id()) and (select private.is_owner()));
