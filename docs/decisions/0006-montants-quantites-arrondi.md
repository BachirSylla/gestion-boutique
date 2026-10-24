# 0006 — Montants, quantités et règles d'arrondi

**Date** : 24 oct. 2026 · **Statut** : acceptée (règles d'arrondi validées par le propriétaire du produit)

## Représentation
- **Montants** : entiers dans la devise de la boutique (XOF, sans décimales). `bigint` en base, `number` entier en TypeScript (sûr jusqu'à 9 × 10^15). Jamais de flottant.
- **Quantités** : entiers en **millièmes d'unité de vente** (1 kg = 1 000, ½ L = 500, 1 pièce = 1 000). Exact en SQL comme en TypeScript. La saisie refuse plus de trois décimales.
- Les calculs intermédiaires (quantité × prix) se font en `bigint`.

## Règles d'arrondi (RG3)
1. **Format de vente favori** (½ kg, 1 kg, ½ L, 1 L…) : chaque format a **son propre prix**, fixé par le boutiquier (ex. riz ½ kg = 160 F, et non 157,5 F). C'est ce prix qui est copié sur la ligne.
2. **Quantité libre** : montant de ligne = quantité × prix unitaire, **arrondi par ligne** au **pas d'arrondi de la boutique** (réglage : 1, 5 ou 25 F ; **5 F par défaut**), au plus proche, **la moitié vers le haut**.
   Ex. 0,25 kg × 315 F = 78,75 F → 80 F (pas de 5 F), 79 F (pas de 1 F), 75 F (pas de 25 F).
3. **Total d'une prise** = somme des lignes déjà arrondies.
4. **Bilan de sac** (RG2) : calculé sur le prix de détail au kilo / litre, **sans arrondi intermédiaire**, arrondi à l'entier à la fin.

Mise en œuvre : `src/shared/domain/money.ts` (`lineAmount`, `divideRoundHalfUp`, `sumAmounts`), couvert par des tests. « La moitié vers le haut » signifie vers +∞ (pertinent seulement si un montant négatif devait être arrondi).

## Affichage
`13 680 F` : espace insécable U+00A0 comme séparateur de milliers (et non l'espace fine U+202F que produit `Intl` en français, absente de certaines polices), signe moins typographique `−`.
