-- Jalon 4 — Index pour la synchronisation incrémentale (curseurs par boutique).
-- Voir docs/decisions/0011-synchronisation-hors-ligne.md. Aucune donnée n'est modifiée.
create index customer_operations_shop_server_idx on public.customer_operations (shop_id, server_created_at);
create index customers_shop_updated_idx on public.customers (shop_id, updated_at);
create index cancellation_requests_shop_created_idx on public.cancellation_requests (shop_id, created_at);
create index cancellation_requests_shop_decided_idx on public.cancellation_requests (shop_id, decided_at) where decided_at is not null;
create index take_lines_operation_idx on public.take_lines (operation_id);
