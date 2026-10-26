-- Jalon 7 — Caisse : clôture de journée (RG7). Voir docs/decisions/0015-caisse-et-tableau-de-bord.md.
-- La clôture saisit tout l'argent reçu dans la journée par moyen de paiement (hors fond de caisse).
-- Les ventes au comptant au détail s'en déduisent à la lecture (versements et ventes de sacs entiers retirés).
-- Une clôture ne se modifie pas : une nouvelle clôture du même jour la remplace (la dernière reçue fait foi).

-- ---------------------------------------------------------------------------
-- Clôtures : journal immuable
-- ---------------------------------------------------------------------------
create table public.day_closings (
  id uuid primary key,
  shop_id uuid not null references public.shops (id),
  -- Jour de la boutique (fuseau de la boutique), pas forcément le jour de la saisie.
  business_date date not null,
  total_received bigint not null check (total_received between 0 and 1000000000000),
  note text check (char_length(note) <= 500),
  author_id uuid not null references auth.users (id),
  device_created_at timestamptz not null,
  server_created_at timestamptz not null default now(),
  schema_version smallint not null default 1,
  unique (id, shop_id)
);
create index day_closings_shop_date_idx on public.day_closings (shop_id, business_date, server_created_at desc);
create index day_closings_shop_server_idx on public.day_closings (shop_id, server_created_at);
create trigger day_closings_immutable before update or delete on public.day_closings for each row execute function private.forbid_journal_change();
create trigger day_closings_no_truncate before truncate on public.day_closings for each statement execute function private.forbid_journal_change();

create table public.day_closing_amounts (
  closing_id uuid not null,
  shop_id uuid not null,
  payment_method_id uuid not null,
  amount bigint not null check (amount between 0 and 1000000000000),
  primary key (closing_id, payment_method_id),
  foreign key (closing_id, shop_id) references public.day_closings (id, shop_id),
  foreign key (payment_method_id, shop_id) references public.payment_methods (id, shop_id)
);
create trigger day_closing_amounts_immutable before update or delete on public.day_closing_amounts for each row execute function private.forbid_journal_change();
create trigger day_closing_amounts_no_truncate before truncate on public.day_closing_amounts for each statement execute function private.forbid_journal_change();

-- ---------------------------------------------------------------------------
-- Écriture (idempotente : l'identifiant vient de l'appareil)
-- p_amounts : [{ "payment_method_id": uuid, "amount": entier ≥ 0 }, …]
-- ---------------------------------------------------------------------------
create function public.record_day_closing(
  p_id uuid,
  p_shop_id uuid,
  p_business_date date,
  p_amounts jsonb,
  p_note text,
  p_device_created_at timestamptz
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_existing public.day_closings;
  v_today date;
  v_item jsonb;
  v_method uuid;
  v_amount bigint;
  v_total bigint := 0;
  v_seen uuid[] := '{}';
begin
  select * into v_existing from public.day_closings where id = p_id;
  if v_existing.id is not null then
    if v_existing.author_id <> auth.uid() then
      raise exception 'Identifiant de clôture déjà utilisé' using errcode = 'BT005';
    end if;
    return jsonb_build_object('status', 'duplicate', 'closing_id', v_existing.id);
  end if;

  if p_shop_id is null or not private.can_write_shop(p_shop_id) then
    perform private.forbidden('Seuls le propriétaire et les gérants de la boutique font la clôture');
  end if;
  if p_device_created_at is null or p_device_created_at > now() + interval '1 day' then
    raise exception 'Heure de l''appareil invalide' using errcode = 'BT004';
  end if;
  select (now() at time zone s.timezone)::date into v_today from public.shops s where s.id = p_shop_id;
  if p_business_date is null or p_business_date > v_today + 1 or p_business_date < v_today - 62 then
    raise exception 'Jour de clôture invalide' using errcode = 'BT004';
  end if;
  if p_amounts is null or jsonb_typeof(p_amounts) <> 'array' or jsonb_array_length(p_amounts) = 0 or jsonb_array_length(p_amounts) > 20 then
    raise exception 'Montants de clôture absents' using errcode = 'BT004';
  end if;

  -- Contrôle de chaque montant avant toute écriture.
  for v_item in select * from jsonb_array_elements(p_amounts) loop
    if jsonb_typeof(v_item -> 'amount') <> 'number' or (v_item ->> 'amount')::numeric <> trunc((v_item ->> 'amount')::numeric)
      or (v_item ->> 'amount')::numeric < 0 or (v_item ->> 'amount')::numeric > 1000000000000 then
      raise exception 'Montant de clôture invalide (entier ≥ 0)' using errcode = 'BT004';
    end if;
    v_method := (v_item ->> 'payment_method_id')::uuid;
    if v_method is null or v_method = any (v_seen)
      or not exists (select 1 from public.payment_methods m where m.id = v_method and m.shop_id = p_shop_id) then
      raise exception 'Moyen de paiement inconnu ou en double' using errcode = 'BT004';
    end if;
    v_seen := v_seen || v_method;
    v_total := v_total + (v_item ->> 'amount')::bigint;
  end loop;

  insert into public.day_closings (id, shop_id, business_date, total_received, note, author_id, device_created_at)
  values (p_id, p_shop_id, p_business_date, v_total, nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), p_device_created_at);
  for v_item in select * from jsonb_array_elements(p_amounts) loop
    v_method := (v_item ->> 'payment_method_id')::uuid;
    v_amount := (v_item ->> 'amount')::bigint;
    insert into public.day_closing_amounts (closing_id, shop_id, payment_method_id, amount) values (p_id, p_shop_id, v_method, v_amount);
  end loop;
  return jsonb_build_object('status', 'created', 'closing_id', p_id, 'total_received', v_total);
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
  v_shops uuid[];
begin
  perform set_config('bitig.purge', 'on', true);
  select coalesce(array_agg(user_id), '{}') into v_users from public.profiles where tenant_id = p_tenant_id;
  select coalesce(array_agg(id), '{}') into v_shops from public.shops where tenant_id = p_tenant_id;
  delete from public.day_closing_amounts where shop_id = any (v_shops);
  delete from public.day_closings where shop_id = any (v_shops);
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
-- Droits et RLS : lecture par les membres de la boutique, écriture par la fonction seulement
-- ---------------------------------------------------------------------------
revoke all on public.day_closings, public.day_closing_amounts from anon, authenticated;
grant select on public.day_closings, public.day_closing_amounts to authenticated;
grant all on public.day_closings, public.day_closing_amounts to service_role;

revoke all on function public.record_day_closing(uuid, uuid, date, jsonb, text, timestamptz) from public, anon;
grant execute on function public.record_day_closing(uuid, uuid, date, jsonb, text, timestamptz) to authenticated;

alter table public.day_closings enable row level security;
alter table public.day_closing_amounts enable row level security;
create policy day_closings_select on public.day_closings for select to authenticated using (shop_id in (select private.accessible_shop_ids()));
create policy day_closing_amounts_select on public.day_closing_amounts for select to authenticated using (shop_id in (select private.accessible_shop_ids()));
