# 0012 — Catalogue et prix

**Date** : 25 oct. 2026 · **Statut** : acceptée (choix validés avec le propriétaire du produit)

## Contexte
Jalon 5a : produits, prix de détail, prix du conditionnement entier, formats favoris à prix propre, historique des prix (RG3), politique de changement de prix (RG4), catalogue de départ.

## Choix

### Produit
Nom, catégorie, conditionnement (sac, bidon, carton…), unité de vente (kg, L, pièce, sachet), **contenance** en millièmes d'unité de vente, seuil « à racheter ». Contenance et unité sont **figées à la création** (les bilans de sac en dépendent) : pour les changer, on archive le produit et on en crée un autre. Le produit ne se supprime jamais (archivage).

### Grille de prix versionnée
Un changement de prix porte sur **toute la grille** : prix de détail, prix du conditionnement et **prix des formats favoris** (validé). Chaque grille est une ligne de `price_versions`, jamais modifiée (trigger) ; seul son état évolue : `pending` → `active` → `superseded`, ou `cancelled`. Une seule grille active et au plus une en attente par produit (index uniques). L'historique garde date, auteur et politique.

À la saisie d'un nouveau prix de détail, l'écran **propose** les prix des formats en conservant l'écart choisi par le boutiquier (riz ½ kg à 160 F pour 315 F/kg → 170 F pour 330 F/kg, au pas d'arrondi de la boutique) ; le propriétaire ajuste.

### Politique (RG4)
Réglages par boutique : hausse **après écoulement**, baisse **immédiate** par défaut (premier client). La politique proposée dépend du sens du changement et reste modifiable pour ce changement-là.
- **Immédiat** : la nouvelle grille devient active tout de suite (une attente éventuelle est annulée).
- **Après écoulement** : la grille est enregistrée **en attente** (« hausse en attente : X F au prochain arrivage ») ; elle s'activera à l'ouverture du premier conditionnement d'un lot reçu après le changement (jalon 5b). Une nouvelle attente remplace la précédente.
L'estimation du reste du conditionnement entamé (plein 100 %, ¾, ½, ¼, **presque vide 10 %**, validé) servira au découpage du chiffre attendu (jalon 5b).

### Prises (RG3)
- Les **formats favoris** apparaissent en boutons dans la prise détaillée : un toucher ajoute la ligne, un autre ajoute un format (− / + pour ajuster). Montant = nombre × prix du format, **sans arrondi**.
- Une ligne libre peut être rattachée à un produit : son prix de détail est repris, le montant arrondi au pas de la boutique.
- Mode rapide : des puces de produits remplissent la note (« riz + huile »).
- Le prix copié sur la ligne est celui que **l'appareil connaissait** (hors ligne : dernier prix connu, RG3) : le serveur ne le compare pas au prix actuel, il revérifie seulement les calculs. Un changement de prix ultérieur ne modifie jamais une ligne enregistrée (testé).
- Le catalogue et les grilles actives sont téléchargés sur l'appareil à chaque synchronisation.

### Catalogue de départ
Paramètre de la plateforme (`starter_products`, prix indicatifs) : riz brisé, riz parfumé, huile, sucre, lait en poudre, oignon, pomme de terre, avec leurs formats usuels. Le propriétaire l'ajoute d'un bouton (les produits déjà présents ne sont pas dupliqués) puis l'adapte.

## Droits
Catalogue et prix : le propriétaire seul écrit (fonctions `create_product`, `change_price`, `add_starter_catalog`, `cancel_pending_price`) ; tous les membres de la boutique lisent (les gérants en ont besoin pour les prises).
