-- Jalon 3 — Clients et journal : réglages de boutique, moyens de paiement, clients,
-- journal immuable (prises, versements, annulations), demandes d'annulation, soldes.
-- Voir docs/decisions/0010-journal-client.md.

-- ---------------------------------------------------------------------------
-- Aides de droits par boutique
-- ---------------------------------------------------------------------------

-- Peut saisir dans la boutique : propriétaire ou gérant actifs, boutique accessible.
create function private.can_write_shop(p_shop_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.current_app_role() in ('owner', 'manager') and private.can_access_shop(p_shop_id)
$$;

-- Est propriétaire (actif) de la boutique.
create function private.is_shop_owner(p_shop_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_owner() and exists (
    select 1 from public.shops s where s.id = p_shop_id and s.tenant_id = private.current_tenant_id()
  )
$$;

-- ---------------------------------------------------------------------------
-- Journal immuable : aucune modification ni suppression, même avec la clé secrète.
-- Seule exception : la purge d'un propriétaire (tests, droit à l'effacement), réservée au rôle
-- postgres (mot de passe de la base, jamais exposé) via private.purge_tenant.
-- ---------------------------------------------------------------------------
create function private.forbid_journal_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'postgres' and current_setting('bitig.purge', true) = 'on' then
    return coalesce(old, new);
  end if;
  raise exception 'Le journal est immuable : une opération ne se modifie ni ne se supprime, elle s''annule'
    using errcode = 'BT000';
end;
$$;

-- ---------------------------------------------------------------------------
-- Réglages de boutique (paramètres plutôt que constantes, CLAUDE.md §7.1)
-- ---------------------------------------------------------------------------
create table public.shop_settings (
  shop_id uuid primary key references public.shops (id),
  -- Délai d'annulation libre du gérant, heure du serveur (0 à 60 min, 15 par défaut).
  cancel_window_minutes integer not null default 15 check (cancel_window_minutes between 0 and 60),
  -- Pas d'arrondi des lignes en quantité libre (RG3).
  rounding_step integer not null default 5 check (rounding_step in (1, 5, 25)),
  -- Alerte d'avance : solde sous ce seuil (par défaut boutique, réglable par client).
  advance_alert_threshold bigint not null default 1000 check (advance_alert_threshold >= 0),
  -- Crédit libre : relance si aucun versement depuis N jours.
  free_credit_reminder_days integer not null default 30 check (free_credit_reminder_days between 1 and 365),
  -- Crédit mensuel : jour d'échéance (null = fin de mois).
  monthly_due_day integer check (monthly_due_day between 1 and 28),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) default auth.uid()
);
comment on table public.shop_settings is 'Réglages d''une boutique (délais, arrondi, seuils, échéance).';

create function private.touch_settings() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

create trigger shop_settings_touch before update on public.shop_settings
for each row execute function private.touch_settings();

-- ---------------------------------------------------------------------------
-- Moyens de paiement (liste extensible par boutique ; jamais supprimés, désactivés)
-- ---------------------------------------------------------------------------
create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id),
  kind text not null check (kind in ('cash', 'wave', 'orange_money', 'other', 'custom')),
  -- Libellé libre pour un moyen personnalisé (donnée, pas traduction).
  label text check (char_length(btrim(label)) between 1 and 40),
  position integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check ((kind = 'custom') = (label is not null)),
  unique (id, shop_id)
);
create unique index payment_methods_builtin_uniq on public.payment_methods (shop_id, kind) where kind <> 'custom';
create index payment_methods_shop_idx on public.payment_methods (shop_id, position);

-- Chaque nouvelle boutique reçoit ses réglages par défaut et les moyens de paiement usuels.
create function private.init_shop() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.shop_settings (shop_id, updated_by) values (new.id, new.created_by) on conflict do nothing;
  insert into public.payment_methods (shop_id, kind, position)
  values (new.id, 'cash', 10), (new.id, 'wave', 20), (new.id, 'orange_money', 30), (new.id, 'other', 90)
  on conflict do nothing;
  return new;
end;
$$;

create trigger shops_init after insert on public.shops
for each row execute function private.init_shop();

-- Boutiques existantes.
insert into public.shop_settings (shop_id) select id from public.shops on conflict do nothing;
insert into public.payment_methods (shop_id, kind, position)
select s.id, m.kind, m.position
from public.shops s
cross join (values ('cash', 10), ('wave', 20), ('orange_money', 30), ('other', 90)) as m(kind, position)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Clients (fiche modifiable ; l'historique est dans le journal)
-- ---------------------------------------------------------------------------
create table public.customers (
  -- Identifiant généré sur l'appareil (création hors ligne possible au jalon 4).
  id uuid primary key,
  shop_id uuid not null references public.shops (id),
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  phone_e164 text check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  type text not null check (type in ('advance', 'monthly', 'free')),
  -- Plafond de crédit : simple alerte, jamais bloquant.
  credit_limit bigint check (credit_limit > 0),
  -- Seuil d'alerte d'avance propre au client (sinon celui de la boutique).
  alert_threshold bigint check (alert_threshold >= 0),
  -- Jour d'échéance propre au client mensuel (sinon celui de la boutique ; null partout = fin de mois).
  monthly_due_day integer check (monthly_due_day between 1 and 28),
  note text check (char_length(note) <= 500),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) default auth.uid(),
  unique (id, shop_id)
);
comment on table public.customers is 'Client à compte d''une boutique (avance, crédit mensuel, crédit libre).';
create index customers_shop_idx on public.customers (shop_id) where archived_at is null;

create function private.touch_customer() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.shop_id <> old.shop_id or new.id <> old.id then
    raise exception 'Un client ne change pas de boutique' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

create trigger customers_touch before update on public.customers
for each row execute function private.touch_customer();

-- ---------------------------------------------------------------------------
-- Journal client : prises, versements, annulations (immuable)
-- ---------------------------------------------------------------------------
create table public.customer_operations (
  -- Identifiant généré sur l'appareil : un renvoi ne crée jamais de doublon.
  id uuid primary key,
  shop_id uuid not null,
  customer_id uuid not null,
  kind text not null check (kind in ('take', 'payment', 'cancellation')),
  -- Montant entier (XOF) > 0 pour une prise ou un versement ; absent pour une annulation.
  amount bigint,
  take_mode text check (take_mode in ('quick', 'detailed')),
  note text check (char_length(note) <= 500),
  payment_method_id uuid,
  cancels_operation_id uuid unique,
  cancellation_reason text check (char_length(cancellation_reason) <= 500),
  author_id uuid not null references auth.users (id),
  device_created_at timestamptz not null,
  server_created_at timestamptz not null default now(),
  schema_version smallint not null default 1,
  foreign key (customer_id, shop_id) references public.customers (id, shop_id),
  foreign key (payment_method_id, shop_id) references public.payment_methods (id, shop_id),
  unique (id, customer_id),
  unique (id, shop_id),
  foreign key (cancels_operation_id, customer_id) references public.customer_operations (id, customer_id),
  check (
    (kind = 'take' and amount > 0 and take_mode is not null and payment_method_id is null and cancels_operation_id is null)
    or (kind = 'payment' and amount > 0 and take_mode is null and payment_method_id is not null and cancels_operation_id is null)
    or (kind = 'cancellation' and amount is null and take_mode is null and payment_method_id is null and cancels_operation_id is not null)
  )
);
comment on table public.customer_operations is 'Journal client immuable. Une erreur se corrige par une opération d''annulation.';
create index customer_operations_customer_idx on public.customer_operations (customer_id, device_created_at desc);
create index customer_operations_shop_idx on public.customer_operations (shop_id, device_created_at desc);

create trigger customer_operations_immutable before update or delete on public.customer_operations
for each row execute function private.forbid_journal_change();
create trigger customer_operations_no_truncate before truncate on public.customer_operations
for each statement execute function private.forbid_journal_change();

-- Lignes d'une prise détaillée : prix unitaire FIGÉ (copié au moment de la prise, RG3).
create table public.take_lines (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null,
  shop_id uuid not null,
  position smallint not null check (position >= 0),
  label text not null check (char_length(btrim(label)) between 1 and 80),
  -- Rattachements au catalogue et au conditionnement entamé (jalon 5).
  product_id uuid,
  package_id uuid,
  -- Quantité en millièmes d'unité de vente (500 = 0,5 kg).
  quantity_milli bigint not null check (quantity_milli > 0),
  unit text not null check (unit in ('kg', 'l', 'piece', 'sachet', 'other')),
  unit_price bigint not null check (unit_price > 0),
  line_amount bigint not null check (line_amount > 0),
  foreign key (operation_id, shop_id) references public.customer_operations (id, shop_id),
  unique (operation_id, position)
);
comment on table public.take_lines is 'Lignes d''une prise détaillée, prix unitaire figé. Immuables.';

create trigger take_lines_immutable before update or delete on public.take_lines
for each row execute function private.forbid_journal_change();
create trigger take_lines_no_truncate before truncate on public.take_lines
for each statement execute function private.forbid_journal_change();

-- ---------------------------------------------------------------------------
-- Demandes d'annulation (gérant hors délai ou opération d'un autre → décision du propriétaire)
-- ---------------------------------------------------------------------------
create table public.cancellation_requests (
  id uuid primary key,
  shop_id uuid not null,
  operation_id uuid not null,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  requested_by uuid not null references auth.users (id),
  device_created_at timestamptz not null,
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 500),
  cancellation_id uuid references public.customer_operations (id),
  foreign key (operation_id, shop_id) references public.customer_operations (id, shop_id),
  check ((status = 'pending') = (decided_at is null)),
  check ((status = 'approved') = (cancellation_id is not null))
);
create unique index cancellation_requests_pending_uniq on public.cancellation_requests (operation_id) where status = 'pending';
create index cancellation_requests_shop_idx on public.cancellation_requests (shop_id, status, created_at desc);

-- Une demande ne se supprime pas ; seule la décision (une fois) la modifie, par la fonction dédiée.
create function private.guard_cancellation_request() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'postgres' and current_setting('bitig.purge', true) = 'on' then
    return coalesce(old, new);
  end if;
  if tg_op = 'DELETE' or old.status <> 'pending'
     or new.id <> old.id or new.operation_id <> old.operation_id or new.reason <> old.reason
     or new.requested_by <> old.requested_by or new.shop_id <> old.shop_id then
    raise exception 'Une demande d''annulation ne se modifie que par sa décision, une seule fois' using errcode = 'BT000';
  end if;
  return new;
end;
$$;

create trigger cancellation_requests_guard before update or delete on public.cancellation_requests
for each row execute function private.guard_cancellation_request();

-- ---------------------------------------------------------------------------
-- Soldes (projection du journal). Solde = Σ versements − Σ prises, opérations annulées exclues.
-- security_invoker : la vue applique la RLS de l'utilisateur.
-- ---------------------------------------------------------------------------
create view public.customer_balances with (security_invoker = true) as
select
  c.id as customer_id,
  c.shop_id,
  coalesce(sum(case when o.kind = 'payment' then o.amount else -o.amount end) filter (where o.id is not null and x.id is null), 0)::bigint as balance,
  coalesce(sum(o.amount) filter (where o.kind = 'take' and x.id is null), 0)::bigint as total_taken,
  coalesce(sum(o.amount) filter (where o.kind = 'payment' and x.id is null), 0)::bigint as total_paid,
  max(o.device_created_at) filter (where o.kind = 'payment' and x.id is null) as last_payment_at,
  min(o.device_created_at) filter (where o.kind = 'take' and x.id is null) as first_take_at,
  max(o.device_created_at) as last_operation_at
from public.customers c
left join public.customer_operations o on o.customer_id = c.id and o.kind in ('take', 'payment')
left join public.customer_operations x on x.cancels_operation_id = o.id
group by c.id, c.shop_id;

-- ---------------------------------------------------------------------------
-- Arrondi d'une ligne en quantité libre (RG3) : au plus proche, la moitié vers le haut.
-- Même règle que lineAmount() (src/shared/domain/money.ts), testée des deux côtés.
-- ---------------------------------------------------------------------------
create function private.line_amount(p_quantity_milli bigint, p_unit_price bigint, p_step integer) returns bigint
language sql immutable
set search_path = ''
as $$
  select (floor((p_quantity_milli::numeric * p_unit_price * 2 + p_step * 1000) / (p_step * 2000)) * p_step)::bigint
$$;

-- ---------------------------------------------------------------------------
-- Écritures du journal (appelées par l'appareil, en ligne ou à la synchronisation).
-- Idempotentes : un identifiant déjà connu renvoie « duplicate » sans rien écrire.
-- ---------------------------------------------------------------------------

-- Contexte commun : client accessible en écriture, non archivé ; horodatage plausible.
create function private.writable_customer(p_customer_id uuid, p_device_created_at timestamptz) returns public.customers
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_customer public.customers;
begin
  select * into v_customer from public.customers where id = p_customer_id;
  if v_customer.id is null or not private.can_write_shop(v_customer.shop_id) then
    perform private.forbidden('Seuls le propriétaire et les gérants de la boutique enregistrent une opération');
  end if;
  if v_customer.archived_at is not null then
    raise exception 'Client archivé' using errcode = 'BT003';
  end if;
  if p_device_created_at is null or p_device_created_at > now() + interval '1 day' then
    raise exception 'Heure de l''appareil invalide' using errcode = 'BT004';
  end if;
  return v_customer;
end;
$$;

create function private.existing_operation(p_id uuid, p_customer_id uuid) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_op public.customer_operations;
begin
  select * into v_op from public.customer_operations where id = p_id;
  if v_op.id is null then
    return null;
  end if;
  if v_op.customer_id <> p_customer_id or v_op.author_id <> auth.uid() then
    raise exception 'Identifiant d''opération déjà utilisé' using errcode = 'BT005';
  end if;
  return jsonb_build_object('status', 'duplicate', 'operation_id', v_op.id);
end;
$$;

-- Prise. p_lines (mode détaillé) : [{label, quantity_milli, unit, unit_price, line_amount?}].
-- Le serveur recalcule chaque ligne avec le pas d'arrondi de la boutique et le total.
create function public.record_take(
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
      v_line_amount := private.line_amount((v_line->>'quantity_milli')::bigint, (v_line->>'unit_price')::bigint, coalesce(v_step, 5));
      if v_line_amount <= 0 then
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
      insert into public.take_lines (operation_id, shop_id, position, label, quantity_milli, unit, unit_price, line_amount)
      values (
        p_id, v_customer.shop_id, v_position, btrim(v_line->>'label'),
        (v_line->>'quantity_milli')::bigint, v_line->>'unit', (v_line->>'unit_price')::bigint,
        private.line_amount((v_line->>'quantity_milli')::bigint, (v_line->>'unit_price')::bigint, coalesce(v_step, 5))
      );
      v_position := v_position + 1;
    end loop;
  end if;

  return jsonb_build_object('status', 'created', 'operation_id', p_id, 'amount', v_total);
end;
$$;

create function public.record_payment(
  p_id uuid,
  p_customer_id uuid,
  p_amount bigint,
  p_payment_method_id uuid,
  p_note text,
  p_device_created_at timestamptz
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_customer public.customers;
  v_existing jsonb;
begin
  v_existing := private.existing_operation(p_id, p_customer_id);
  if v_existing is not null then
    return v_existing;
  end if;
  v_customer := private.writable_customer(p_customer_id, p_device_created_at);
  if p_amount is null or p_amount <= 0 then
    raise exception 'Versement : un montant > 0' using errcode = 'BT004';
  end if;
  if not exists (select 1 from public.payment_methods m where m.id = p_payment_method_id and m.shop_id = v_customer.shop_id and m.active) then
    raise exception 'Moyen de paiement inconnu' using errcode = 'BT004';
  end if;
  insert into public.customer_operations (id, shop_id, customer_id, kind, amount, payment_method_id, note, author_id, device_created_at)
  values (p_id, v_customer.shop_id, p_customer_id, 'payment', p_amount, p_payment_method_id, nullif(btrim(p_note), ''), auth.uid(), p_device_created_at);
  return jsonb_build_object('status', 'created', 'operation_id', p_id, 'amount', p_amount);
end;
$$;

-- Opération annulable (prise ou versement, pas encore annulée), dans une boutique accessible.
create function private.cancellable_operation(p_operation_id uuid) returns public.customer_operations
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_op public.customer_operations;
begin
  select * into v_op from public.customer_operations where id = p_operation_id;
  if v_op.id is null or not private.can_write_shop(v_op.shop_id) then
    perform private.forbidden('Opération introuvable ou hors de vos boutiques');
  end if;
  if v_op.kind = 'cancellation' then
    raise exception 'Une annulation ne s''annule pas' using errcode = 'BT002';
  end if;
  if exists (select 1 from public.customer_operations c where c.cancels_operation_id = v_op.id) then
    raise exception 'Opération déjà annulée' using errcode = 'BT002';
  end if;
  return v_op;
end;
$$;

-- Annulation directe : propriétaire toujours ; gérant pour sa propre opération dans le délai
-- (heure du serveur, délai en vigueur maintenant). Sinon BT001 : il faut une demande.
create function public.cancel_operation(p_id uuid, p_operation_id uuid, p_reason text, p_device_created_at timestamptz) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_op public.customer_operations;
  v_window integer;
begin
  select * into v_op from public.customer_operations where id = p_id;
  if v_op.id is not null then
    if v_op.cancels_operation_id <> p_operation_id or v_op.author_id <> auth.uid() then
      raise exception 'Identifiant d''opération déjà utilisé' using errcode = 'BT005';
    end if;
    return jsonb_build_object('status', 'duplicate', 'operation_id', p_id);
  end if;

  v_op := private.cancellable_operation(p_operation_id);
  if not private.is_shop_owner(v_op.shop_id) then
    select cancel_window_minutes into v_window from public.shop_settings where shop_id = v_op.shop_id;
    if v_op.author_id <> auth.uid() or now() - v_op.server_created_at > make_interval(mins => coalesce(v_window, 15)) then
      raise exception 'Hors délai ou opération d''un autre : faites une demande d''annulation' using errcode = 'BT001';
    end if;
  end if;

  insert into public.customer_operations (id, shop_id, customer_id, kind, cancels_operation_id, cancellation_reason, author_id, device_created_at)
  values (p_id, v_op.shop_id, v_op.customer_id, 'cancellation', v_op.id, nullif(btrim(p_reason), ''), auth.uid(), coalesce(p_device_created_at, now()));
  return jsonb_build_object('status', 'created', 'operation_id', p_id);
end;
$$;

create function public.request_cancellation(p_id uuid, p_operation_id uuid, p_reason text, p_device_created_at timestamptz) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_op public.customer_operations;
begin
  if exists (select 1 from public.cancellation_requests r where r.id = p_id) then
    return jsonb_build_object('status', 'duplicate', 'request_id', p_id);
  end if;
  v_op := private.cancellable_operation(p_operation_id);
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Le motif est obligatoire' using errcode = 'BT004';
  end if;
  if exists (select 1 from public.cancellation_requests r where r.operation_id = v_op.id and r.status = 'pending') then
    raise exception 'Une demande est déjà en attente pour cette opération' using errcode = 'BT006';
  end if;
  insert into public.cancellation_requests (id, shop_id, operation_id, reason, requested_by, device_created_at)
  values (p_id, v_op.shop_id, v_op.id, btrim(p_reason), auth.uid(), coalesce(p_device_created_at, now()));
  return jsonb_build_object('status', 'created', 'request_id', p_id);
end;
$$;

-- Décision du propriétaire. Validation : crée l'annulation (auteur : le propriétaire, motif de la demande).
create function public.decide_cancellation(p_request_id uuid, p_approve boolean, p_note text, p_cancellation_id uuid) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_request public.cancellation_requests;
  v_op public.customer_operations;
begin
  select * into v_request from public.cancellation_requests where id = p_request_id for update;
  if v_request.id is null or not private.is_shop_owner(v_request.shop_id) then
    perform private.forbidden('Seul le propriétaire décide d''une demande d''annulation');
  end if;
  if v_request.status <> 'pending' then
    raise exception 'Demande déjà traitée' using errcode = 'BT006';
  end if;

  if p_approve then
    v_op := private.cancellable_operation(v_request.operation_id);
    insert into public.customer_operations (id, shop_id, customer_id, kind, cancels_operation_id, cancellation_reason, author_id, device_created_at)
    values (coalesce(p_cancellation_id, gen_random_uuid()), v_op.shop_id, v_op.customer_id, 'cancellation', v_op.id, v_request.reason, auth.uid(), now())
    returning id into p_cancellation_id;
    update public.cancellation_requests
    set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(p_note), ''), cancellation_id = p_cancellation_id
    where id = p_request_id;
  else
    update public.cancellation_requests
    set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(p_note), '')
    where id = p_request_id;
  end if;
  return jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end, 'cancellation_id', p_cancellation_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Purge d'un propriétaire (tests de bout en bout, droit à l'effacement). Rôle postgres uniquement :
-- aucune autorisation n'est donnée, la fonction n'est pas appelable par l'API.
-- Renvoie les comptes Auth à supprimer ensuite.
-- ---------------------------------------------------------------------------
create function private.purge_tenant(p_tenant_id uuid) returns setof uuid
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
-- Droits SQL
-- ---------------------------------------------------------------------------
revoke all on public.shop_settings, public.payment_methods, public.customers, public.customer_operations,
  public.take_lines, public.cancellation_requests, public.customer_balances from anon, authenticated;

grant select, update (cancel_window_minutes, rounding_step, advance_alert_threshold, free_credit_reminder_days, monthly_due_day)
  on public.shop_settings to authenticated;
grant select, insert (shop_id, kind, label, position), update (label, position, active) on public.payment_methods to authenticated;
grant select,
  insert (id, shop_id, full_name, phone_e164, type, credit_limit, alert_threshold, monthly_due_day, note),
  update (full_name, phone_e164, type, credit_limit, alert_threshold, monthly_due_day, note, archived_at)
  on public.customers to authenticated;
-- Journal : lecture seule ; les écritures passent par les fonctions ci-dessus.
grant select on public.customer_operations, public.take_lines, public.cancellation_requests, public.customer_balances to authenticated;

grant all on public.shop_settings, public.payment_methods, public.customers, public.customer_operations,
  public.take_lines, public.cancellation_requests to service_role;
grant select on public.customer_balances to service_role;

revoke all on function
  public.record_take(uuid, uuid, text, bigint, text, jsonb, timestamptz),
  public.record_payment(uuid, uuid, bigint, uuid, text, timestamptz),
  public.cancel_operation(uuid, uuid, text, timestamptz),
  public.request_cancellation(uuid, uuid, text, timestamptz),
  public.decide_cancellation(uuid, boolean, text, uuid)
from public, anon;
grant execute on function
  public.record_take(uuid, uuid, text, bigint, text, jsonb, timestamptz),
  public.record_payment(uuid, uuid, bigint, uuid, text, timestamptz),
  public.cancel_operation(uuid, uuid, text, timestamptz),
  public.request_cancellation(uuid, uuid, text, timestamptz),
  public.decide_cancellation(uuid, boolean, text, uuid)
to authenticated;

revoke all on function
  private.can_write_shop(uuid), private.is_shop_owner(uuid), private.writable_customer(uuid, timestamptz),
  private.existing_operation(uuid, uuid), private.cancellable_operation(uuid), private.line_amount(bigint, bigint, integer),
  private.forbid_journal_change(), private.guard_cancellation_request(), private.touch_settings(), private.touch_customer(), private.init_shop()
from public, anon;
grant execute on function private.can_write_shop(uuid), private.is_shop_owner(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.shop_settings enable row level security;
alter table public.payment_methods enable row level security;
alter table public.customers enable row level security;
alter table public.customer_operations enable row level security;
alter table public.take_lines enable row level security;
alter table public.cancellation_requests enable row level security;

create policy shop_settings_select on public.shop_settings for select to authenticated
using (shop_id in (select private.accessible_shop_ids()));
create policy shop_settings_update_owner on public.shop_settings for update to authenticated
using ((select private.is_shop_owner(shop_id))) with check ((select private.is_shop_owner(shop_id)));

create policy payment_methods_select on public.payment_methods for select to authenticated
using (shop_id in (select private.accessible_shop_ids()));
create policy payment_methods_insert_owner on public.payment_methods for insert to authenticated
with check (kind = 'custom' and (select private.is_shop_owner(shop_id)));
create policy payment_methods_update_owner on public.payment_methods for update to authenticated
using ((select private.is_shop_owner(shop_id))) with check ((select private.is_shop_owner(shop_id)));

-- Clients : tous les membres de la boutique lisent (comptable compris) ; propriétaire et gérants écrivent.
create policy customers_select on public.customers for select to authenticated
using (shop_id in (select private.accessible_shop_ids()));
create policy customers_insert on public.customers for insert to authenticated
with check ((select private.can_write_shop(shop_id)));
create policy customers_update on public.customers for update to authenticated
using ((select private.can_write_shop(shop_id))) with check ((select private.can_write_shop(shop_id)));

create policy customer_operations_select on public.customer_operations for select to authenticated
using (shop_id in (select private.accessible_shop_ids()));
create policy take_lines_select on public.take_lines for select to authenticated
using (shop_id in (select private.accessible_shop_ids()));
create policy cancellation_requests_select on public.cancellation_requests for select to authenticated
using (shop_id in (select private.accessible_shop_ids()));
