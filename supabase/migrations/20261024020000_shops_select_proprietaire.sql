-- Correctif : un propriétaire doit pouvoir lire la boutique qu'il vient de créer dans la même
-- requête (insert ... returning, utilisé par supabase-js .insert().select()).
-- accessible_shop_ids() ne voit pas encore la nouvelle ligne : on ajoute la condition directe
-- « boutique de mon propriétaire et je suis propriétaire », équivalente pour les boutiques existantes.
drop policy shops_select on public.shops;

create policy shops_select on public.shops for select to authenticated
using (
  (tenant_id = (select private.current_tenant_id()) and (select private.is_owner()))
  or id in (select private.accessible_shop_ids())
  or (select private.is_platform_admin())
);
