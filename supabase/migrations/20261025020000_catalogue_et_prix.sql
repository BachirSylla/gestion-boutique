-- Jalon 5a — Catalogue et prix : produits, grille de prix versionnée (RG3, RG4), catalogue de départ,
-- formats favoris dans les prises. Voir docs/decisions/0012-catalogue-et-prix.md.

-- ---------------------------------------------------------------------------
-- Politique de changement de prix par boutique (RG4). Premier client : hausse après écoulement, baisse immédiate.
-- ---------------------------------------------------------------------------
alter table public.shop_settings
  add column price_hike_policy text not null default 'after_sellout' check (price_hike_policy in ('immediate', 'after_sellout')),
  add column price_drop_policy text not null default 'immediate' check (price_drop_policy in ('immediate', 'after_sellout'));
grant update (price_hike_policy, price_drop_policy) on public.shop_settings to authenticated;

-- ---------------------------------------------------------------------------
-- Catalogue de départ (paramètre de la plateforme, proposé à la création d'une boutique ; prix indicatifs)
-- ---------------------------------------------------------------------------
create table public.starter_products (
  id integer primary key generated always as identity,
  position integer not null,
  name text not null,
  category text,
  package_label text not null,
  sale_unit text not null check (sale_unit in ('kg', 'l', 'piece', 'sachet')),
  capacity_milli bigint not null check (capacity_milli > 0),
  retail_price bigint not null check (retail_price > 0),
  package_price bigint check (package_price > 0),
  formats jsonb not null default '[]'::jsonb
);
comment on table public.starter_products is 'Catalogue de départ proposé aux nouvelles boutiques (paramètre de la plateforme).';

insert into public.starter_products (position, name, category, package_label, sale_unit, capacity_milli, retail_price, package_price, formats) values
  (10, 'Riz brisé', 'Céréales', 'sac', 'kg', 50000, 315, 15000, '[{"label":"½ kg","quantity_milli":500,"price":160},{"label":"1 kg","quantity_milli":1000,"price":315}]'),
  (20, 'Riz parfumé', 'Céréales', 'sac', 'kg', 25000, 600, 14500, '[{"label":"½ kg","quantity_milli":500,"price":300},{"label":"1 kg","quantity_milli":1000,"price":600}]'),
  (30, 'Huile', 'Huiles', 'bidon', 'l', 20000, 1100, 21000, '[{"label":"¼ L","quantity_milli":250,"price":275},{"label":"½ L","quantity_milli":500,"price":550},{"label":"1 L","quantity_milli":1000,"price":1100}]'),
  (40, 'Sucre', 'Épicerie', 'sac', 'kg', 50000, 600, 28500, '[{"label":"½ kg","quantity_milli":500,"price":300},{"label":"1 kg","quantity_milli":1000,"price":600}]'),
  (50, 'Lait en poudre (sachet)', 'Laitiers', 'carton', 'sachet', 48000, 250, 11500, '[{"label":"1 sachet","quantity_milli":1000,"price":250}]'),
  (60, 'Oignon', 'Légumes', 'sac', 'kg', 25000, 400, 9000, '[{"label":"1 kg","quantity_milli":1000,"price":400}]'),
  (70, 'Pomme de terre', 'Légumes', 'sac', 'kg', 25000, 450, 10000, '[{"label":"1 kg","quantity_milli":1000,"price":450}]');

-- ---------------------------------------------------------------------------
-- Produits (propres à chaque boutique)
-- ---------------------------------------------------------------------------
create table public.products (
  id uuid primary key,
  shop_id uuid not null references public.shops (id),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  category text check (char_length(category) <= 40),
  -- Conditionnement (sac, bidon, carton…) et contenance en millièmes d'unité de vente (50 kg = 50 000).
  package_label text not null check (char_length(btrim(package_label)) between 1 and 30),
  sale_unit text not null check (sale_unit in ('kg', 'l', 'piece', 'sachet')),
  capacity_milli bigint not null check (capacity_milli > 0),
  -- Filtre « à racheter » : nombre de conditionnements fermés au-dessous duquel racheter.
  reorder_threshold integer not null default 1 check (reorder_threshold >= 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (id, shop_id)
);
comment on table public.products is 'Produit vendu par une boutique. Contenance et unité figées à la création (les bilans en dépendent).';
create index products_shop_idx on public.products (shop_id, updated_at);

create function private.touch_product() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.shop_id <> old.shop_id or new.capacity_milli <> old.capacity_milli or new.sale_unit <> old.sale_unit then
    raise exception 'Boutique, contenance et unité d''un produit ne changent pas : archivez-le et créez-en un autre' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger products_touch before update on public.products for each row execute function private.touch_product();

-- ---------------------------------------------------------------------------
-- Grille de prix versionnée : historique avec date d'effet et auteur (RG3), politique (RG4).
-- Une seule grille active et au plus une en attente par produit. Une grille n'est jamais supprimée.
-- ---------------------------------------------------------------------------
create table public.price_versions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  product_id uuid not null,
  retail_price bigint not null check (retail_price > 0),
  package_price bigint check (package_price > 0),
  -- Formats favoris à prix propre : [{id, label, quantity_milli, price}].
  formats jsonb not null default '[]'::jsonb check (jsonb_typeof(formats) = 'array'),
  mode text not null check (mode in ('initial', 'immediate', 'after_sellout')),
  status text not null check (status in ('active', 'pending', 'superseded', 'cancelled')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) default auth.uid(),
  activated_at timestamptz,
  ended_at timestamptz,
  foreign key (product_id, shop_id) references public.products (id, shop_id),
  check ((status = 'active') = (activated_at is not null and ended_at is null) or status = 'superseded'),
  check ((status = 'pending') <= (activated_at is null))
);
create unique index price_versions_active_uniq on public.price_versions (product_id) where status = 'active';
create unique index price_versions_pending_uniq on public.price_versions (product_id) where status = 'pending';
create index price_versions_shop_idx on public.price_versions (shop_id, created_at);

-- Seul l'état d'une grille évolue (en attente → active → remplacée), jamais ses prix.
create function private.guard_price_version() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'postgres' and current_setting('bitig.purge', true) = 'on' then
    return coalesce(old, new);
  end if;
  if tg_op = 'DELETE' or new.retail_price <> old.retail_price or new.package_price is distinct from old.package_price
     or new.formats <> old.formats or new.mode <> old.mode or new.product_id <> old.product_id
     or new.created_at <> old.created_at or new.created_by is distinct from old.created_by then
    raise exception 'Une grille de prix ne se modifie pas : on en crée une nouvelle' using errcode = 'BT000';
  end if;
  return new;
end;
$$;
create trigger price_versions_guard before update or delete on public.price_versions for each row execute function private.guard_price_version();

-- Validation d'une grille : prix entiers > 0, formats {label, quantity_milli > 0, price > 0}, identifiants ajoutés.
create function private.normalize_formats(p_formats jsonb) returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare
  v_format jsonb;
  v_out jsonb := '[]'::jsonb;
begin
  if p_formats is null then
    return v_out;
  end if;
  if jsonb_typeof(p_formats) <> 'array' or jsonb_array_length(p_formats) > 12 then
    raise exception 'Formats : liste de 12 au plus' using errcode = 'BT004';
  end if;
  for v_format in select * from jsonb_array_elements(p_formats) loop
    if char_length(btrim(coalesce(v_format->>'label', ''))) not between 1 and 30
       or coalesce((v_format->>'quantity_milli')::bigint, 0) <= 0
       or coalesce((v_format->>'price')::bigint, 0) <= 0 then
      raise exception 'Format invalide (libellé, quantité et prix obligatoires)' using errcode = 'BT004';
    end if;
    v_out := v_out || jsonb_build_object(
      'id', coalesce(v_format->>'id', gen_random_uuid()::text),
      'label', btrim(v_format->>'label'),
      'quantity_milli', (v_format->>'quantity_milli')::bigint,
      'price', (v_format->>'price')::bigint
    );
  end loop;
  return v_out;
end;
$$;

-- Grilles active et en attente de chaque produit (RLS de l'utilisateur).
create view public.product_prices with (security_invoker = true) as
select
  p.id as product_id,
  p.shop_id,
  a.id as active_version_id,
  a.retail_price,
  a.package_price,
  a.formats,
  a.activated_at,
  w.id as pending_version_id,
  w.retail_price as pending_retail_price,
  w.package_price as pending_package_price,
  w.formats as pending_formats,
  w.created_at as pending_since
from public.products p
left join public.price_versions a on a.product_id = p.id and a.status = 'active'
left join public.price_versions w on w.product_id = p.id and w.status = 'pending';

-- ---------------------------------------------------------------------------
-- Écritures du catalogue (propriétaire de la boutique)
-- ---------------------------------------------------------------------------
create function public.create_product(
  p_id uuid,
  p_shop_id uuid,
  p_name text,
  p_category text,
  p_package_label text,
  p_sale_unit text,
  p_capacity_milli bigint,
  p_reorder_threshold integer,
  p_retail_price bigint,
  p_package_price bigint,
  p_formats jsonb
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.products where id = p_id) then
    return jsonb_build_object('status', 'duplicate', 'product_id', p_id);
  end if;
  if not private.is_shop_owner(p_shop_id) then
    perform private.forbidden('Seul le propriétaire gère le catalogue');
  end if;
  insert into public.products (id, shop_id, name, category, package_label, sale_unit, capacity_milli, reorder_threshold)
  values (p_id, p_shop_id, btrim(p_name), nullif(btrim(p_category), ''), btrim(p_package_label), p_sale_unit, p_capacity_milli, coalesce(p_reorder_threshold, 1));
  insert into public.price_versions (shop_id, product_id, retail_price, package_price, formats, mode, status, activated_at)
  values (p_shop_id, p_id, p_retail_price, p_package_price, private.normalize_formats(p_formats), 'initial', 'active', now());
  return jsonb_build_object('status', 'created', 'product_id', p_id);
end;
$$;

-- Ajoute le catalogue de départ (produits absents seulement, par nom) à une boutique.
create function public.add_starter_catalog(p_shop_id uuid) returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_row public.starter_products;
  v_count integer := 0;
begin
  if not private.is_shop_owner(p_shop_id) then
    perform private.forbidden('Seul le propriétaire gère le catalogue');
  end if;
  for v_row in select * from public.starter_products order by position loop
    if not exists (select 1 from public.products p where p.shop_id = p_shop_id and lower(p.name) = lower(v_row.name) and p.archived_at is null) then
      perform public.create_product(gen_random_uuid(), p_shop_id, v_row.name, v_row.category, v_row.package_label, v_row.sale_unit,
        v_row.capacity_milli, 1, v_row.retail_price, v_row.package_price, v_row.formats);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- Changement de prix (RG4). « immediate » : la nouvelle grille s'applique tout de suite.
-- « after_sellout » : enregistrée en attente ; elle s'appliquera à l'ouverture du premier conditionnement
-- d'un lot reçu après le changement (jalon 5b). Une nouvelle attente remplace la précédente.
create function public.change_price(
  p_product_id uuid,
  p_retail_price bigint,
  p_package_price bigint,
  p_formats jsonb,
  p_mode text,
  p_remaining_estimate integer default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_id uuid;
begin
  select * into v_product from public.products where id = p_product_id;
  if v_product.id is null or not private.is_shop_owner(v_product.shop_id) then
    perform private.forbidden('Seul le propriétaire change un prix');
  end if;
  if p_mode not in ('immediate', 'after_sellout') then
    raise exception 'Politique inconnue' using errcode = 'BT004';
  end if;
  if p_remaining_estimate is not null and p_remaining_estimate not in (1000, 750, 500, 250, 100) then
    raise exception 'Estimation du reste invalide' using errcode = 'BT004';
  end if;

  update public.price_versions set status = 'cancelled', ended_at = now() where product_id = p_product_id and status = 'pending';

  if p_mode = 'immediate' then
    update public.price_versions set status = 'superseded', ended_at = now() where product_id = p_product_id and status = 'active';
    insert into public.price_versions (shop_id, product_id, retail_price, package_price, formats, mode, status, activated_at)
    values (v_product.shop_id, p_product_id, p_retail_price, p_package_price, private.normalize_formats(p_formats), 'immediate', 'active', now())
    returning id into v_id;
  else
    insert into public.price_versions (shop_id, product_id, retail_price, package_price, formats, mode, status)
    values (v_product.shop_id, p_product_id, p_retail_price, p_package_price, private.normalize_formats(p_formats), 'after_sellout', 'pending')
    returning id into v_id;
  end if;
  return jsonb_build_object('status', case when p_mode = 'immediate' then 'active' else 'pending' end, 'version_id', v_id);
end;
$$;

create function public.cancel_pending_price(p_product_id uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_shop uuid;
begin
  select shop_id into v_shop from public.products where id = p_product_id;
  if v_shop is null or not private.is_shop_owner(v_shop) then
    perform private.forbidden('Seul le propriétaire change un prix');
  end if;
  update public.price_versions set status = 'cancelled', ended_at = now() where product_id = p_product_id and status = 'pending';
end;
$$;

-- ---------------------------------------------------------------------------
-- Prises : lignes rattachées à un produit, lignes « format » à prix propre (RG3)
-- ---------------------------------------------------------------------------
alter table public.take_lines
  add column format_label text check (char_length(format_label) <= 30),
  add column format_count integer check (format_count > 0),
  add constraint take_lines_format_check check ((format_label is null) = (format_count is null));

alter table public.take_lines
  add constraint take_lines_product_fk foreign key (product_id, shop_id) references public.products (id, shop_id);

-- Montant d'une ligne : format = nombre × prix du format (sans arrondi) ; sinon quantité × prix, arrondi au pas.
create function private.take_line_amount(p_line jsonb, p_step integer) returns bigint
language sql immutable
set search_path = ''
as $$
  select case
    when p_line ? 'format_count' and (p_line->>'format_count') is not null
      then (p_line->>'format_count')::bigint * (p_line->>'unit_price')::bigint
    else private.line_amount((p_line->>'quantity_milli')::bigint, (p_line->>'unit_price')::bigint, p_step)
  end
$$;

-- record_take : même contrat que le jalon 3, avec produit et format facultatifs par ligne.
-- Le prix copié est celui que l'appareil connaissait (hors ligne : dernier prix connu, RG3) : il n'est
-- pas comparé au prix du serveur ; seuls les calculs sont revérifiés.
create or replace function public.record_take(
  p_id uuid,
  p_customer_id uuid,
  p_mode text,
  p_amount bigint,
  p_note text,
  p_lines jsonb,
  p_device_created_at timestamptz
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_customer public.customers;
  v_existing jsonb;
  v_step integer;
  v_line jsonb;
  v_position integer := 0;
  v_line_amount bigint;
  v_total bigint := 0;
  v_product uuid;
begin
  v_existing := private.existing_operation(p_id, p_customer_id);
  if v_existing is not null then
    return v_existing;
  end if;
  v_customer := private.writable_customer(p_customer_id, p_device_created_at);

  if p_mode = 'quick' then
    if p_amount is null or p_amount <= 0 or coalesce(jsonb_array_length(p_lines), 0) > 0 then
      raise exception 'Prise rapide : un montant > 0, sans lignes' using errcode = 'BT004';
    end if;
    v_total := p_amount;
  elsif p_mode = 'detailed' then
    if coalesce(jsonb_typeof(p_lines), '') <> 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 50 then
      raise exception 'Prise détaillée : de 1 à 50 lignes' using errcode = 'BT004';
    end if;
    select rounding_step into v_step from public.shop_settings where shop_id = v_customer.shop_id;
    for v_line in select * from jsonb_array_elements(p_lines) loop
      v_product := nullif(v_line->>'product_id', '')::uuid;
      if v_product is not null and not exists (select 1 from public.products p where p.id = v_product and p.shop_id = v_customer.shop_id) then
        raise exception 'Produit inconnu dans cette boutique' using errcode = 'BT004';
      end if;
      v_line_amount := private.take_line_amount(v_line, coalesce(v_step, 5));
      if v_line_amount is null or v_line_amount <= 0 then
        raise exception 'Ligne de montant nul' using errcode = 'BT004';
      end if;
      if v_line ? 'line_amount' and (v_line->>'line_amount')::bigint <> v_line_amount then
        raise exception 'Montant de ligne incohérent (attendu %)', v_line_amount using errcode = 'BT004';
      end if;
      v_total := v_total + v_line_amount;
    end loop;
    if p_amount is not null and p_amount <> v_total then
      raise exception 'Total incohérent (attendu %)', v_total using errcode = 'BT004';
    end if;
  else
    raise exception 'Mode de prise inconnu' using errcode = 'BT004';
  end if;

  insert into public.customer_operations (id, shop_id, customer_id, kind, amount, take_mode, note, author_id, device_created_at)
  values (p_id, v_customer.shop_id, p_customer_id, 'take', v_total, p_mode, nullif(btrim(p_note), ''), auth.uid(), p_device_created_at);

  if p_mode = 'detailed' then
    for v_line in select * from jsonb_array_elements(p_lines) loop
      insert into public.take_lines (operation_id, shop_id, position, label, product_id, quantity_milli, unit, unit_price, line_amount, format_label, format_count)
      values (
        p_id, v_customer.shop_id, v_position, btrim(v_line->>'label'), nullif(v_line->>'product_id', '')::uuid,
        (v_line->>'quantity_milli')::bigint, v_line->>'unit', (v_line->>'unit_price')::bigint,
        private.take_line_amount(v_line, coalesce(v_step, 5)),
        nullif(btrim(v_line->>'format_label'), ''), nullif(v_line->>'format_count', '')::integer
      );
      v_position := v_position + 1;
    end loop;
  end if;

  return jsonb_build_object('status', 'created', 'operation_id', p_id, 'amount', v_total);
end;
$$;

-- ---------------------------------------------------------------------------
-- Purge : nouvelles tables
-- ---------------------------------------------------------------------------
create or replace function private.purge_tenant(p_tenant_id uuid) returns setof uuid
language plpgsql
set search_path = ''
as $$
declare
  v_users uuid[];
begin
  perform set_config('bitig.purge', 'on', true);
  select coalesce(array_agg(user_id), '{}') into v_users from public.profiles where tenant_id = p_tenant_id;
  delete from public.cancellation_requests where shop_id in (select id from public.shops where tenant_id = p_tenant_id);
  delete from public.take_lines where shop_id in (select id from public.shops where tenant_id = p_tenant_id);
  delete from public.customer_operations where shop_id in (select id from public.shops where tenant_id = p_tenant_id) and kind = 'cancellation';
  delete from public.customer_operations where shop_id in (select id from public.shops where tenant_id = p_tenant_id);
  delete from public.customers where shop_id in (select id from public.shops where tenant_id = p_tenant_id);
  delete from public.price_versions where shop_id in (select id from public.shops where tenant_id = p_tenant_id);
  delete from public.products where shop_id in (select id from public.shops where tenant_id = p_tenant_id);
  delete from public.payment_methods where shop_id in (select id from public.shops where tenant_id = p_tenant_id);
  delete from public.shop_settings where shop_id in (select id from public.shops where tenant_id = p_tenant_id);
  delete from public.account_events where tenant_id = p_tenant_id;
  delete from public.shop_members where tenant_id = p_tenant_id;
  delete from public.profile_contacts where tenant_id = p_tenant_id;
  delete from public.profiles where tenant_id = p_tenant_id;
  delete from public.shops where tenant_id = p_tenant_id;
  delete from public.tenants where id = p_tenant_id;
  perform set_config('bitig.purge', 'off', true);
  return query select unnest(v_users);
end;
$$;
revoke all on function private.purge_tenant(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Droits et RLS
-- ---------------------------------------------------------------------------
revoke all on public.starter_products, public.products, public.price_versions, public.product_prices from anon, authenticated;
grant select on public.starter_products to authenticated;
grant select, update (name, category, package_label, reorder_threshold, archived_at) on public.products to authenticated;
grant select on public.price_versions, public.product_prices to authenticated;
grant all on public.starter_products, public.products, public.price_versions to service_role;
grant select on public.product_prices to service_role;

revoke all on function
  public.create_product(uuid, uuid, text, text, text, text, bigint, integer, bigint, bigint, jsonb),
  public.add_starter_catalog(uuid),
  public.change_price(uuid, bigint, bigint, jsonb, text, integer),
  public.cancel_pending_price(uuid)
from public, anon;
grant execute on function
  public.create_product(uuid, uuid, text, text, text, text, bigint, integer, bigint, bigint, jsonb),
  public.add_starter_catalog(uuid),
  public.change_price(uuid, bigint, bigint, jsonb, text, integer),
  public.cancel_pending_price(uuid)
to authenticated;
revoke all on function private.touch_product(), private.guard_price_version(), private.normalize_formats(jsonb), private.take_line_amount(jsonb, integer) from public, anon;

alter table public.starter_products enable row level security;
alter table public.products enable row level security;
alter table public.price_versions enable row level security;

-- Catalogue de départ : donnée de la plateforme, sans information de boutique.
create policy starter_products_select on public.starter_products for select to authenticated using (true);

-- Produits et prix : tous les membres de la boutique lisent (gérants pour les prises) ; le propriétaire modifie.
create policy products_select on public.products for select to authenticated
using (shop_id in (select private.accessible_shop_ids()));
create policy products_update_owner on public.products for update to authenticated
using ((select private.is_shop_owner(shop_id))) with check ((select private.is_shop_owner(shop_id)));
create policy price_versions_select on public.price_versions for select to authenticated
using (shop_id in (select private.accessible_shop_ids()));
