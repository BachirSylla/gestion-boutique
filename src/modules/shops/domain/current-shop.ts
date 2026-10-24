// Boutique courante : celle choisie si elle est encore accessible, sinon la première de la liste.

export function pickCurrentShopId(accessibleShopIds: readonly string[], preferredShopId: string | null | undefined): string | null {
  if (preferredShopId && accessibleShopIds.includes(preferredShopId)) return preferredShopId;
  return accessibleShopIds[0] ?? null;
}
