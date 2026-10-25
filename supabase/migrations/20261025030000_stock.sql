-- Jalon 5b — Stock : lots, conditionnements, mouvements (journal immuable), tranches de prix,
-- bilans de sac, inventaire, annulations. Voir docs/decisions/0013-stock.md.

-- ---------------------------------------------------------------------------
-- Lots (arrivages) : immuables
-- ---------------------------------------------------------------------------
create table public.lots (
  id uuid primary key,
  shop_id uuid not null,
  product_id uuid not null,
  package_count integer not null check (package_count between 1 and 500),
  purchase_price bigint not null check (purchase_price > 0),
  supplier text check (char_length(supplier) <= 80),
  source text not null default 'reception' check (source in ('reception', 'adjustment')),
  received_at timestamptz not null,
  server_created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id),
  foreign key (product_id, shop_id) references public.products (id, shop_id),
  unique (id, shop_id)
);
create index lots_product_idx on public.lots (product_id, server_created_at);
create trigger lots_immutable before update or delete on public.lots for each row execute function private.forbid_journal_change();

-- ---------------------------------------------------------------------------
-- Conditionnements : état projeté du journal, mis à jour uniquement par les fonctions ci-dessous
-- ---------------------------------------------------------------------------
create table public.packages (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  product_id uuid not null,
  lot_id uuid not null,
  seq integer not null,
  state text not null default 'closed' check (state in ('closed', 'opened', 'finished', 'sold_whole', 'removed')),
  -- Ouverture en cours (mouvement « open ») : ses tranches de prix servent au bilan.
  opening_id uuid,
  opened_at timestamptz,
  finished_at timestamptz,
  -- Reste estimé du conditionnement entamé, en millièmes (1000 plein … 100 presque vide), null si inconnu.
  remaining_estimate integer check (remaining_estimate between 0 and 1000),
  -- Mouvement qui l'a retiré du stock (ajustement) ou vendu entier, pour une annulation éventuelle.
  removed_by uuid,
  updated_at timestamptz not null default now(),
  foreign key (lot_id, shop_id) references public.lots (id, shop_id),
  foreign key (product_id, shop_id) references public.products (id, shop_id),
  unique (lot_id, seq),
  unique (id, shop_id)
);
-- Au plus un conditionnement entamé par produit (CLAUDE.md RG2, MVP).
create unique index packages_one_opened_per_product on public.packages (product_id) where state = 'opened';
create index packages_product_state_idx on public.packages (product_id, state);

-- ---------------------------------------------------------------------------
-- Tranches de prix d'un conditionnement entamé (RG2, RG4) : immuables
-- ---------------------------------------------------------------------------
create table public.package_price_segments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  package_id uuid not null,
  opening_id uuid not null,
  -- Reste au début de la tranche, en millièmes de la contenance (1000 = plein à l'ouverture).
  start_remaining integer not null check (start_remaining between 1 and 1000),
  retail_price bigint not null check (retail_price > 0),
  created_at timestamptz not null default now(),
  foreign key (package_id, shop_id) references public.packages (id, shop_id)
);
create index package_price_segments_package_idx on public.package_price_segments (package_id, opening_id);
create trigger package_price_segments_immutable before update or delete on public.package_price_segments for each row execute function private.forbid_journal_change();

-- ---------------------------------------------------------------------------
-- Mouvements de stock : journal immuable
-- ---------------------------------------------------------------------------
create table public.stock_movements (
  id uuid primary key,
  shop_id uuid not null,
  product_id uuid not null,
  kind text not null check (kind in ('reception', 'open', 'finish', 'whole_sale', 'adjustment', 'estimate', 'cancellation')),
  lot_id uuid,
  package_id uuid,
  -- Réception : nombre de conditionnements ; ajustement : écart (+ trouvé, − manquant).
  quantity integer,
  -- Vente entière : prix encaissé ou porté au compte.
  amount bigint check (amount > 0),
  customer_operation_id uuid references public.customer_operations (id),
  remaining_estimate integer check (remaining_estimate between 0 and 1000),
  reason text check (char_length(reason) <= 500),
  cancels_movement_id uuid unique,
  author_id uuid not null references auth.users (id),
  device_created_at timestamptz not null,
  server_created_at timestamptz not null default now(),
  schema_version smallint not null default 1,
  foreign key (product_id, shop_id) references public.products (id, shop_id),
  unique (id, shop_id),
  foreign key (cancels_movement_id, shop_id) references public.stock_movements (id, shop_id),
  check ((kind = 'cancellation') = (cancels_movement_id is not null)),
  check ((kind = 'whole_sale') = (amount is not null))
);
create index stock_movements_shop_idx on public.stock_movements (shop_id, server_created_at);
create index stock_movements_product_idx on public.stock_movements (product_id, device_created_at desc);
create trigger stock_movements_immutable before update or delete on public.stock_movements for each row execute function private.forbid_journal_change();
create trigger stock_movements_no_truncate before truncate on public.stock_movements for each statement execute function private.forbid_journal_change();

-- Lignes de prise rattachées au conditionnement entamé (RG1/RG2).
alter table public.take_lines add constraint take_lines_package_fk foreign key (package_id, shop_id) references public.packages (id, shop_id);
create index take_lines_package_idx on public.take_lines (package_id) where package_id is not null;

-- ---------------------------------------------------------------------------
-- Demandes d'annulation : aussi pour un mouvement de stock (mêmes règles que le journal client)
-- ---------------------------------------------------------------------------
alter table public.cancellation_requests alter column operation_id drop not null;
alter table public.cancellation_requests
  add column stock_movement_id uuid,
  add constraint cancellation_requests_stock_fk foreign key (stock_movement_id, shop_id) references public.stock_movements (id, shop_id),
  add column stock_cancellation_id uuid references public.stock_movements (id),
  add constraint cancellation_requests_target_check check ((operation_id is null) <> (stock_movement_id is null));
alter table public.cancellation_requests drop constraint cancellation_requests_check1;
alter table public.cancellation_requests add constraint cancellation_requests_approved_check
  check ((status = 'approved') = (cancellation_id is not null or stock_cancellation_id is not null));
create unique index cancellation_requests_pending_stock_uniq on public.cancellation_requests (stock_movement_id) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Aides
-- ---------------------------------------------------------------------------

-- Produit de la boutique où l'utilisateur peut saisir (propriétaire ou gérant), non archivé.
create function private.writable_product(p_product_id uuid, p_device_created_at timestamptz) returns public.products
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_product public.products;
begin
  select * into v_product from public.products where id = p_product_id;
  if v_product.id is null or not private.can_write_shop(v_product.shop_id) then
    perform private.forbidden('Seuls le propriétaire et les gérants de la boutique gèrent le stock');
  end if;
  if v_product.archived_at is not null then
    raise exception 'Produit archivé' using errcode = 'BT003';
  end if;
  if p_device_created_at is null or p_device_created_at > now() + interval '1 day' then
    raise exception 'Heure de l''appareil invalide' using errcode = 'BT004';
  end if;
  return v_product;
end;
$$;

-- Mouvement déjà enregistré avec cet identifiant (renvoi) : « duplicate », ou refus si l'identifiant est détourné.
create function private.existing_movement(p_id uuid) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_move public.stock_movements;
begin
  select * into v_move from public.stock_movements where id = p_id;
  if v_move.id is null then
    return null;
  end if;
  if v_move.author_id <> auth.uid() then
    raise exception 'Identifiant de mouvement déjà utilisé' using errcode = 'BT005';
  end if;
  return jsonb_build_object('status', 'duplicate', 'movement_id', v_move.id, 'package_id', v_move.package_id);
end;
$$;

-- Conditionnement fermé le plus ancien (FIFO : lot reçu en premier, puis numéro d'ordre).
create function private.oldest_closed_package(p_product_id uuid) returns public.packages
language sql volatile security definer
set search_path = ''
as $$
  select k.* from public.packages k join public.lots l on l.id = k.lot_id
  where k.product_id = p_product_id and k.state = 'closed'
  order by l.received_at, l.server_created_at, k.seq
  limit 1
  for update of k
$$;

-- ---------------------------------------------------------------------------
-- Saisies de stock (en ligne ou à la synchronisation ; idempotentes)
-- ---------------------------------------------------------------------------

-- Réception : un lot de N conditionnements fermés au prix d'achat donné.
create function public.receive_lot(p_id uuid, p_product_id uuid, p_count integer, p_purchase_price bigint, p_supplier text, p_device_created_at timestamptz) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_existing jsonb := private.existing_movement(p_id);
  v_product public.products;
begin
  if v_existing is not null then
    return v_existing;
  end if;
  v_product := private.writable_product(p_product_id, p_device_created_at);
  if coalesce(p_count, 0) not between 1 and 500 or coalesce(p_purchase_price, 0) <= 0 then
    raise exception 'Réception : de 1 à 500 conditionnements, prix d''achat > 0' using errcode = 'BT004';
  end if;
  insert into public.lots (id, shop_id, product_id, package_count, purchase_price, supplier, received_at, created_by)
  values (p_id, v_product.shop_id, p_product_id, p_count, p_purchase_price, nullif(btrim(p_supplier), ''), p_device_created_at, auth.uid());
  insert into public.packages (shop_id, product_id, lot_id, seq)
  select v_product.shop_id, p_product_id, p_id, n from generate_series(1, p_count) n;
  insert into public.stock_movements (id, shop_id, product_id, kind, lot_id, quantity, author_id, device_created_at)
  values (p_id, v_product.shop_id, p_product_id, 'reception', p_id, p_count, auth.uid(), p_device_created_at);
  return jsonb_build_object('status', 'created', 'movement_id', p_id, 'lot_id', p_id);
end;
$$;

-- Ouverture (FIFO). Active le prix en attente si ce conditionnement vient d'un lot reçu après le changement (RG4).
create function public.open_package(p_id uuid, p_product_id uuid, p_device_created_at timestamptz) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_existing jsonb := private.existing_movement(p_id);
  v_product public.products;
  v_package public.packages;
  v_lot public.lots;
  v_pending public.price_versions;
  v_price bigint;
begin
  if v_existing is not null then
    return v_existing;
  end if;
  v_product := private.writable_product(p_product_id, p_device_created_at);
  if exists (select 1 from public.packages where product_id = p_product_id and state = 'opened') then
    raise exception 'Un conditionnement de ce produit est déjà entamé' using errcode = 'BT010';
  end if;
  v_package := private.oldest_closed_package(p_product_id);
  if v_package.id is null then
    raise exception 'Aucun conditionnement fermé en stock' using errcode = 'BT011';
  end if;
  select * into v_lot from public.lots where id = v_package.lot_id;

  select * into v_pending from public.price_versions where product_id = p_product_id and status = 'pending';
  if v_pending.id is not null and v_lot.server_created_at > v_pending.created_at then
    update public.price_versions set status = 'superseded', ended_at = now() where product_id = p_product_id and status = 'active';
    update public.price_versions set status = 'active', activated_at = now() where id = v_pending.id;
  end if;
  select retail_price into v_price from public.price_versions where product_id = p_product_id and status = 'active';
  if v_price is null then
    raise exception 'Aucun prix de détail pour ce produit' using errcode = 'BT004';
  end if;

  update public.packages set state = 'opened', opening_id = p_id, opened_at = p_device_created_at, finished_at = null,
    remaining_estimate = 1000, updated_at = now() where id = v_package.id;
  insert into public.stock_movements (id, shop_id, product_id, kind, lot_id, package_id, author_id, device_created_at)
  values (p_id, v_product.shop_id, p_product_id, 'open', v_lot.id, v_package.id, auth.uid(), p_device_created_at);
  insert into public.package_price_segments (shop_id, package_id, opening_id, start_remaining, retail_price)
  values (v_product.shop_id, v_package.id, p_id, 1000, v_price);
  return jsonb_build_object('status', 'created', 'movement_id', p_id, 'package_id', v_package.id, 'retail_price', v_price,
    'price_activated', v_pending.id is not null and v_lot.server_created_at > v_pending.created_at);
end;
$$;

-- Fin du conditionnement entamé : déclenche le bilan de sac.
create function public.finish_package(p_id uuid, p_product_id uuid, p_device_created_at timestamptz) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_existing jsonb := private.existing_movement(p_id);
  v_product public.products;
  v_package public.packages;
begin
  if v_existing is not null then
    return v_existing;
  end if;
  v_product := private.writable_product(p_product_id, p_device_created_at);
  select * into v_package from public.packages where product_id = p_product_id and state = 'opened' for update;
  if v_package.id is null then
    raise exception 'Aucun conditionnement entamé pour ce produit' using errcode = 'BT012';
  end if;
  update public.packages set state = 'finished', finished_at = p_device_created_at, remaining_estimate = 0, updated_at = now() where id = v_package.id;
  insert into public.stock_movements (id, shop_id, product_id, kind, lot_id, package_id, author_id, device_created_at)
  values (p_id, v_product.shop_id, p_product_id, 'finish', v_package.lot_id, v_package.id, auth.uid(), p_device_created_at);
  return jsonb_build_object('status', 'created', 'movement_id', p_id, 'package_id', v_package.id);
end;
$$;

-- Estimation du reste du conditionnement entamé (inventaire, ou à tout moment).
create function public.estimate_remaining(p_id uuid, p_product_id uuid, p_estimate integer, p_device_created_at timestamptz) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_existing jsonb := private.existing_movement(p_id);
  v_product public.products;
  v_package public.packages;
begin
  if v_existing is not null then
    return v_existing;
  end if;
  v_product := private.writable_product(p_product_id, p_device_created_at);
  if p_estimate not in (1000, 750, 500, 250, 100) then
    raise exception 'Estimation du reste invalide' using errcode = 'BT004';
  end if;
  select * into v_package from public.packages where product_id = p_product_id and state = 'opened' for update;
  if v_package.id is null then
    raise exception 'Aucun conditionnement entamé pour ce produit' using errcode = 'BT012';
  end if;
  update public.packages set remaining_estimate = p_estimate, updated_at = now() where id = v_package.id;
  insert into public.stock_movements (id, shop_id, product_id, kind, lot_id, package_id, remaining_estimate, author_id, device_created_at)
  values (p_id, v_product.shop_id, p_product_id, 'estimate', v_package.lot_id, v_package.id, p_estimate, auth.uid(), p_device_created_at);
  return jsonb_build_object('status', 'created', 'movement_id', p_id);
end;
$$;

-- Vente d'un conditionnement entier (FIFO), au comptant ou sur le compte d'un client (crée alors une prise).
create function public.sell_whole_package(
  p_id uuid,
  p_product_id uuid,
  p_price bigint,
  p_customer_id uuid,
  p_take_id uuid,
  p_device_created_at timestamptz
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_existing jsonb := private.existing_movement(p_id);
  v_product public.products;
  v_package public.packages;
  v_customer public.customers;
begin
  if v_existing is not null then
    return v_existing;
  end if;
  v_product := private.writable_product(p_product_id, p_device_created_at);
  if coalesce(p_price, 0) <= 0 then
    raise exception 'Prix du conditionnement > 0' using errcode = 'BT004';
  end if;
  if p_customer_id is not null then
    v_customer := private.writable_customer(p_customer_id, p_device_created_at);
    if v_customer.shop_id <> v_product.shop_id or p_take_id is null then
      raise exception 'Client d''une autre boutique ou prise sans identifiant' using errcode = 'BT004';
    end if;
  end if;
  v_package := private.oldest_closed_package(p_product_id);
  if v_package.id is null then
    raise exception 'Aucun conditionnement fermé en stock' using errcode = 'BT011';
  end if;

  if p_customer_id is not null then
    insert into public.customer_operations (id, shop_id, customer_id, kind, amount, take_mode, author_id, device_created_at)
    values (p_take_id, v_product.shop_id, p_customer_id, 'take', p_price, 'detailed', auth.uid(), p_device_created_at);
    insert into public.take_lines (operation_id, shop_id, position, label, product_id, package_id, quantity_milli, unit, unit_price, line_amount)
    values (p_take_id, v_product.shop_id, 0, v_product.name || ' (' || v_product.package_label || ')', p_product_id, v_package.id,
      v_product.capacity_milli, v_product.sale_unit, p_price, p_price);
  end if;
  update public.packages set state = 'sold_whole', removed_by = p_id, updated_at = now() where id = v_package.id;
  insert into public.stock_movements (id, shop_id, product_id, kind, lot_id, package_id, amount, customer_operation_id, author_id, device_created_at)
  values (p_id, v_product.shop_id, p_product_id, 'whole_sale', v_package.lot_id, v_package.id, p_price, case when p_customer_id is null then null else p_take_id end,
    auth.uid(), p_device_created_at);
  return jsonb_build_object('status', 'created', 'movement_id', p_id, 'package_id', v_package.id);
end;
$$;

-- Ajustement d'inventaire (RG6) : écart entre compté et théorique, avec auteur et motif.
-- Manquants : les conditionnements fermés les plus anciens sortent. Trouvés : un lot d'ajustement
-- au dernier prix d'achat connu (ou au prix fourni).
create function public.adjust_stock(p_id uuid, p_product_id uuid, p_delta integer, p_reason text, p_purchase_price bigint, p_device_created_at timestamptz) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_existing jsonb := private.existing_movement(p_id);
  v_product public.products;
  v_price bigint;
  v_package public.packages;
begin
  if v_existing is not null then
    return v_existing;
  end if;
  v_product := private.writable_product(p_product_id, p_device_created_at);
  if coalesce(p_delta, 0) = 0 or abs(p_delta) > 500 then
    raise exception 'Écart d''inventaire invalide' using errcode = 'BT004';
  end if;
  if p_delta < 0 then
    if (select count(*) from public.packages where product_id = p_product_id and state = 'closed') < -p_delta then
      raise exception 'Pas assez de conditionnements fermés' using errcode = 'BT011';
    end if;
    for i in 1..(-p_delta) loop
      v_package := private.oldest_closed_package(p_product_id);
      update public.packages set state = 'removed', removed_by = p_id, updated_at = now() where id = v_package.id;
    end loop;
    insert into public.stock_movements (id, shop_id, product_id, kind, quantity, reason, author_id, device_created_at)
    values (p_id, v_product.shop_id, p_product_id, 'adjustment', p_delta, nullif(btrim(p_reason), ''), auth.uid(), p_device_created_at);
  else
    v_price := coalesce(p_purchase_price, (select purchase_price from public.lots where product_id = p_product_id order by server_created_at desc limit 1));
    if v_price is null or v_price <= 0 then
      raise exception 'Prix d''achat nécessaire pour un conditionnement trouvé' using errcode = 'BT004';
    end if;
    insert into public.lots (id, shop_id, product_id, package_count, purchase_price, source, received_at, created_by)
    values (p_id, v_product.shop_id, p_product_id, p_delta, v_price, 'adjustment', p_device_created_at, auth.uid());
    insert into public.packages (shop_id, product_id, lot_id, seq) select v_product.shop_id, p_product_id, p_id, n from generate_series(1, p_delta) n;
    insert into public.stock_movements (id, shop_id, product_id, kind, lot_id, quantity, reason, author_id, device_created_at)
    values (p_id, v_product.shop_id, p_product_id, 'adjustment', p_id, p_delta, nullif(btrim(p_reason), ''), auth.uid(), p_device_created_at);
  end if;
  return jsonb_build_object('status', 'created', 'movement_id', p_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Annulation d'un mouvement de stock (mêmes règles que le journal client)
-- ---------------------------------------------------------------------------

-- Effet de l'annulation sur l'état du stock ; lève une erreur si l'annulation n'a plus de sens.
create function private.apply_stock_cancellation(p_cancellation_id uuid, p_move public.stock_movements, p_reason text, p_actor uuid, p_device timestamptz) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_package public.packages;
begin
  if p_move.kind = 'cancellation' then
    raise exception 'Une annulation ne s''annule pas' using errcode = 'BT002';
  end if;
  if exists (select 1 from public.stock_movements where cancels_movement_id = p_move.id) then
    raise exception 'Mouvement déjà annulé' using errcode = 'BT002';
  end if;
  select * into v_package from public.packages where id = p_move.package_id for update;

  case p_move.kind
    when 'reception' then
      if exists (select 1 from public.packages where lot_id = p_move.lot_id and state <> 'closed') then
        raise exception 'Des conditionnements de ce lot sont déjà entamés ou vendus' using errcode = 'BT013';
      end if;
      update public.packages set state = 'removed', removed_by = p_cancellation_id, updated_at = now() where lot_id = p_move.lot_id;
    when 'open' then
      if v_package.state <> 'opened' or v_package.opening_id <> p_move.id then
        raise exception 'Ce conditionnement n''est plus entamé par cette ouverture' using errcode = 'BT013';
      end if;
      update public.packages set state = 'closed', opening_id = null, opened_at = null, remaining_estimate = null, updated_at = now() where id = v_package.id;
    when 'finish' then
      if v_package.state <> 'finished' then
        raise exception 'Ce conditionnement n''est plus terminé' using errcode = 'BT013';
      end if;
      if exists (select 1 from public.packages where product_id = p_move.product_id and state = 'opened') then
        raise exception 'Un autre conditionnement de ce produit est entamé' using errcode = 'BT010';
      end if;
      update public.packages set state = 'opened', finished_at = null, remaining_estimate = null, updated_at = now() where id = v_package.id;
    when 'whole_sale' then
      if v_package.state <> 'sold_whole' or v_package.removed_by <> p_move.id then
        raise exception 'Ce conditionnement n''est plus vendu par ce mouvement' using errcode = 'BT013';
      end if;
      update public.packages set state = 'closed', removed_by = null, updated_at = now() where id = v_package.id;
      if p_move.customer_operation_id is not null
         and not exists (select 1 from public.customer_operations where cancels_operation_id = p_move.customer_operation_id) then
        insert into public.customer_operations (id, shop_id, customer_id, kind, cancels_operation_id, cancellation_reason, author_id, device_created_at)
        select gen_random_uuid(), o.shop_id, o.customer_id, 'cancellation', o.id, nullif(btrim(p_reason), ''), p_actor, p_device
        from public.customer_operations o where o.id = p_move.customer_operation_id;
      end if;
    when 'adjustment' then
      if p_move.quantity < 0 then
        update public.packages set state = 'closed', removed_by = null, updated_at = now() where removed_by = p_move.id and state = 'removed';
      else
        if exists (select 1 from public.packages where lot_id = p_move.lot_id and state <> 'closed') then
          raise exception 'Des conditionnements de cet ajustement sont déjà entamés ou vendus' using errcode = 'BT013';
        end if;
        update public.packages set state = 'removed', removed_by = p_cancellation_id, updated_at = now() where lot_id = p_move.lot_id;
      end if;
    when 'estimate' then
      update public.packages k set remaining_estimate = (
        select m.remaining_estimate from public.stock_movements m
        where m.package_id = k.id and m.kind = 'estimate' and m.id <> p_move.id and m.device_created_at >= k.opened_at
          and not exists (select 1 from public.stock_movements c where c.cancels_movement_id = m.id)
        order by m.device_created_at desc limit 1)
      where k.id = p_move.package_id and k.state = 'opened';
    else
      null;
  end case;

  insert into public.stock_movements (id, shop_id, product_id, kind, lot_id, package_id, reason, cancels_movement_id, author_id, device_created_at)
  values (p_cancellation_id, p_move.shop_id, p_move.product_id, 'cancellation', p_move.lot_id, p_move.package_id, nullif(btrim(p_reason), ''), p_move.id, p_actor, p_device);
end;
$$;

create function public.cancel_stock_movement(p_id uuid, p_movement_id uuid, p_reason text, p_device_created_at timestamptz) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_existing jsonb := private.existing_movement(p_id);
  v_move public.stock_movements;
  v_window integer;
begin
  if v_existing is not null then
    return v_existing;
  end if;
  select * into v_move from public.stock_movements where id = p_movement_id;
  if v_move.id is null or not private.can_write_shop(v_move.shop_id) then
    perform private.forbidden('Mouvement introuvable ou hors de vos boutiques');
  end if;
  if not private.is_shop_owner(v_move.shop_id) then
    select cancel_window_minutes into v_window from public.shop_settings where shop_id = v_move.shop_id;
    if v_move.author_id <> auth.uid() or now() - v_move.server_created_at > make_interval(mins => coalesce(v_window, 15)) then
      raise exception 'Hors délai ou mouvement d''un autre : faites une demande d''annulation' using errcode = 'BT001';
    end if;
  end if;
  perform private.apply_stock_cancellation(p_id, v_move, p_reason, auth.uid(), coalesce(p_device_created_at, now()));
  return jsonb_build_object('status', 'created', 'movement_id', p_id);
end;
$$;

create function public.request_stock_cancellation(p_id uuid, p_movement_id uuid, p_reason text, p_device_created_at timestamptz) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_move public.stock_movements;
begin
  if exists (select 1 from public.cancellation_requests r where r.id = p_id) then
    return jsonb_build_object('status', 'duplicate', 'request_id', p_id);
  end if;
  select * into v_move from public.stock_movements where id = p_movement_id;
  if v_move.id is null or not private.can_write_shop(v_move.shop_id) then
    perform private.forbidden('Mouvement introuvable ou hors de vos boutiques');
  end if;
  if v_move.kind = 'cancellation' or exists (select 1 from public.stock_movements where cancels_movement_id = v_move.id) then
    raise exception 'Mouvement déjà annulé ou annulation' using errcode = 'BT002';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Le motif est obligatoire' using errcode = 'BT004';
  end if;
  if exists (select 1 from public.cancellation_requests r where r.stock_movement_id = v_move.id and r.status = 'pending') then
    raise exception 'Une demande est déjà en attente pour ce mouvement' using errcode = 'BT006';
  end if;
  insert into public.cancellation_requests (id, shop_id, stock_movement_id, reason, requested_by, device_created_at)
  values (p_id, v_move.shop_id, v_move.id, btrim(p_reason), auth.uid(), coalesce(p_device_created_at, now()));
  return jsonb_build_object('status', 'created', 'request_id', p_id);
end;
$$;

-- Décision du propriétaire : demandes sur une opération client ou sur un mouvement de stock.
create or replace function public.decide_cancellation(p_request_id uuid, p_approve boolean, p_note text, p_cancellation_id uuid) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_request public.cancellation_requests;
  v_op public.customer_operations;
  v_move public.stock_movements;
begin
  select * into v_request from public.cancellation_requests where id = p_request_id for update;
  if v_request.id is null or not private.is_shop_owner(v_request.shop_id) then
    perform private.forbidden('Seul le propriétaire décide d''une demande d''annulation');
  end if;
  if v_request.status <> 'pending' then
    raise exception 'Demande déjà traitée' using errcode = 'BT006';
  end if;
  p_cancellation_id := coalesce(p_cancellation_id, gen_random_uuid());

  if not p_approve then
    update public.cancellation_requests set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(p_note), '')
    where id = p_request_id;
    return jsonb_build_object('status', 'rejected');
  end if;

  if v_request.stock_movement_id is not null then
    select * into v_move from public.stock_movements where id = v_request.stock_movement_id;
    perform private.apply_stock_cancellation(p_cancellation_id, v_move, v_request.reason, auth.uid(), now());
    update public.cancellation_requests
    set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(p_note), ''), stock_cancellation_id = p_cancellation_id
    where id = p_request_id;
  else
    v_op := private.cancellable_operation(v_request.operation_id);
    insert into public.customer_operations (id, shop_id, customer_id, kind, cancels_operation_id, cancellation_reason, author_id, device_created_at)
    values (p_cancellation_id, v_op.shop_id, v_op.customer_id, 'cancellation', v_op.id, v_request.reason, auth.uid(), now());
    update public.cancellation_requests
    set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(p_note), ''), cancellation_id = p_cancellation_id
    where id = p_request_id;
  end if;
  return jsonb_build_object('status', 'approved', 'cancellation_id', p_cancellation_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Changement de prix immédiat avec un conditionnement entamé : nouvelle tranche à partir du reste estimé
-- ---------------------------------------------------------------------------
create or replace function public.change_price(
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
  v_package public.packages;
  v_last_start integer;
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
    select * into v_package from public.packages where product_id = p_product_id and state = 'opened' for update;
    if v_package.id is not null then
      if p_remaining_estimate is null then
        raise exception 'Estimez le reste du conditionnement entamé' using errcode = 'BT014';
      end if;
      select min(start_remaining) into v_last_start from public.package_price_segments where package_id = v_package.id and opening_id = v_package.opening_id;
      if p_remaining_estimate > v_last_start then
        raise exception 'Le reste estimé ne peut pas dépasser celui du dernier changement de prix' using errcode = 'BT004';
      end if;
    end if;
    update public.price_versions set status = 'superseded', ended_at = now() where product_id = p_product_id and status = 'active';
    insert into public.price_versions (shop_id, product_id, retail_price, package_price, formats, mode, status, activated_at)
    values (v_product.shop_id, p_product_id, p_retail_price, p_package_price, private.normalize_formats(p_formats), 'immediate', 'active', now())
    returning id into v_id;
    if v_package.id is not null then
      insert into public.package_price_segments (shop_id, package_id, opening_id, start_remaining, retail_price)
      values (v_product.shop_id, v_package.id, v_package.opening_id, p_remaining_estimate, p_retail_price);
      update public.packages set remaining_estimate = p_remaining_estimate, updated_at = now() where id = v_package.id;
    end if;
  else
    insert into public.price_versions (shop_id, product_id, retail_price, package_price, formats, mode, status)
    values (v_product.shop_id, p_product_id, p_retail_price, p_package_price, private.normalize_formats(p_formats), 'after_sellout', 'pending')
    returning id into v_id;
  end if;
  return jsonb_build_object('status', case when p_mode = 'immediate' then 'active' else 'pending' end, 'version_id', v_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Prises : chaque ligne d'un produit est rattachée au conditionnement entamé au moment de la prise
-- (heure de l'appareil : une prise saisie hors ligne va au sac entamé à ce moment-là).
-- ---------------------------------------------------------------------------
create function private.package_open_at(p_product_id uuid, p_at timestamptz) returns uuid
language sql stable security definer
set search_path = ''
as $$
  select k.id from public.packages k
  where k.product_id = p_product_id and k.opened_at is not null and k.opened_at <= p_at
    and (k.finished_at is null or k.finished_at >= p_at) and k.state in ('opened', 'finished')
  order by k.opened_at desc
  limit 1
$$;

create function private.attach_take_lines_to_packages() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.product_id is not null and new.package_id is null then
    new.package_id := private.package_open_at(new.product_id, (select o.device_created_at from public.customer_operations o where o.id = new.operation_id));
  end if;
  return new;
end;
$$;
create trigger take_lines_attach_package before insert on public.take_lines for each row execute function private.attach_take_lines_to_packages();

-- ---------------------------------------------------------------------------
-- Bilan de sac (RG2) : projection à la fin d'un conditionnement.
-- Chiffre attendu = Σ tranches (part vendue pendant la tranche × contenance × prix de détail),
-- sans arrondi intermédiaire, arrondi à l'entier à la fin (RG3). Même formule que packageReview().
-- ---------------------------------------------------------------------------
create view public.package_reviews with (security_invoker = true) as
with segments as (
  select s.package_id, s.retail_price, s.start_remaining,
    coalesce(lead(s.start_remaining) over (partition by s.package_id order by s.start_remaining desc, s.created_at), 0) as end_remaining
  from public.package_price_segments s
  join public.packages k on k.id = s.package_id and s.opening_id = k.opening_id
),
expected as (
  select sg.package_id,
    round(sum((sg.start_remaining - sg.end_remaining)::numeric * pr.capacity_milli * sg.retail_price) / 1000000)::bigint as expected_revenue
  from segments sg
  join public.packages k on k.id = sg.package_id
  join public.products pr on pr.id = k.product_id
  group by sg.package_id
),
account as (
  select l.package_id, sum(l.line_amount)::bigint as account_takes
  from public.take_lines l
  join public.customer_operations o on o.id = l.operation_id
  where l.package_id is not null and not exists (select 1 from public.customer_operations c where c.cancels_operation_id = o.id)
  group by l.package_id
)
select
  k.id as package_id,
  k.shop_id,
  k.product_id,
  k.lot_id,
  k.opened_at,
  k.finished_at,
  e.expected_revenue,
  coalesce(a.account_takes, 0) as account_takes,
  e.expected_revenue - coalesce(a.account_takes, 0) as estimated_cash_sales,
  l.purchase_price as cost,
  e.expected_revenue - l.purchase_price as gross_margin
from public.packages k
join public.lots l on l.id = k.lot_id
join expected e on e.package_id = k.id
left join account a on a.package_id = k.id
where k.state = 'finished';

-- ---------------------------------------------------------------------------
-- Purge : nouvelles tables
-- ---------------------------------------------------------------------------
create or replace function private.purge_tenant(p_tenant_id uuid) returns setof uuid
language plpgsql
set search_path = ''
as $$
declare
  v_users uuid[];
  v_shops uuid[];
begin
  perform set_config('bitig.purge', 'on', true);
  select coalesce(array_agg(user_id), '{}') into v_users from public.profiles where tenant_id = p_tenant_id;
  select coalesce(array_agg(id), '{}') into v_shops from public.shops where tenant_id = p_tenant_id;
  delete from public.cancellation_requests where shop_id = any (v_shops);
  delete from public.stock_movements where shop_id = any (v_shops) and kind = 'cancellation';
  delete from public.stock_movements where shop_id = any (v_shops);
  delete from public.take_lines where shop_id = any (v_shops);
  delete from public.package_price_segments where shop_id = any (v_shops);
  delete from public.packages where shop_id = any (v_shops);
  delete from public.lots where shop_id = any (v_shops);
  delete from public.customer_operations where shop_id = any (v_shops) and kind = 'cancellation';
  delete from public.customer_operations where shop_id = any (v_shops);
  delete from public.customers where shop_id = any (v_shops);
  delete from public.price_versions where shop_id = any (v_shops);
  delete from public.products where shop_id = any (v_shops);
  delete from public.payment_methods where shop_id = any (v_shops);
  delete from public.shop_settings where shop_id = any (v_shops);
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
revoke all on public.lots, public.packages, public.package_price_segments, public.stock_movements, public.package_reviews from anon, authenticated;
grant select on public.lots, public.packages, public.package_price_segments, public.stock_movements, public.package_reviews to authenticated;
grant all on public.lots, public.packages, public.package_price_segments, public.stock_movements to service_role;
grant select on public.package_reviews to service_role;

revoke all on function
  public.receive_lot(uuid, uuid, integer, bigint, text, timestamptz),
  public.open_package(uuid, uuid, timestamptz),
  public.finish_package(uuid, uuid, timestamptz),
  public.estimate_remaining(uuid, uuid, integer, timestamptz),
  public.sell_whole_package(uuid, uuid, bigint, uuid, uuid, timestamptz),
  public.adjust_stock(uuid, uuid, integer, text, bigint, timestamptz),
  public.cancel_stock_movement(uuid, uuid, text, timestamptz),
  public.request_stock_cancellation(uuid, uuid, text, timestamptz)
from public, anon;
grant execute on function
  public.receive_lot(uuid, uuid, integer, bigint, text, timestamptz),
  public.open_package(uuid, uuid, timestamptz),
  public.finish_package(uuid, uuid, timestamptz),
  public.estimate_remaining(uuid, uuid, integer, timestamptz),
  public.sell_whole_package(uuid, uuid, bigint, uuid, uuid, timestamptz),
  public.adjust_stock(uuid, uuid, integer, text, bigint, timestamptz),
  public.cancel_stock_movement(uuid, uuid, text, timestamptz),
  public.request_stock_cancellation(uuid, uuid, text, timestamptz)
to authenticated;
revoke all on function
  private.writable_product(uuid, timestamptz), private.existing_movement(uuid), private.oldest_closed_package(uuid),
  private.apply_stock_cancellation(uuid, public.stock_movements, text, uuid, timestamptz), private.package_open_at(uuid, timestamptz),
  private.attach_take_lines_to_packages()
from public, anon;

alter table public.lots enable row level security;
alter table public.packages enable row level security;
alter table public.package_price_segments enable row level security;
alter table public.stock_movements enable row level security;

create policy lots_select on public.lots for select to authenticated using (shop_id in (select private.accessible_shop_ids()));
create policy packages_select on public.packages for select to authenticated using (shop_id in (select private.accessible_shop_ids()));
create policy package_price_segments_select on public.package_price_segments for select to authenticated using (shop_id in (select private.accessible_shop_ids()));
create policy stock_movements_select on public.stock_movements for select to authenticated using (shop_id in (select private.accessible_shop_ids()));
