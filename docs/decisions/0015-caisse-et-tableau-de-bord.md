# 0015 — Caisse, ventes du jour, bénéfice et tableau de bord

**Date** : 26 oct. 2026 · **Statut** : acceptée

## Contexte
RG7 (clôture de journée, ventes du jour, contrôle) et RG8 (bénéfice brut, argent encaissé). La clôture est une saisie du quotidien : elle doit marcher **hors ligne**. Le soir, le boutiquier compte sa caisse : elle contient aussi les versements des clients à compte et l'argent des sacs vendus entiers, qu'il ne faut pas compter deux fois.

## Décisions produit (validées par l'utilisateur, reportées dans CLAUDE.md RG7)
- La clôture saisit **tout l'argent reçu dans la journée par moyen de paiement**, hors fond de caisse.
- **Ventes au comptant au détail** = argent reçu − versements des clients à compte du jour − ventes de sacs entiers au comptant du jour. Affichées avant d'enregistrer ; un résultat négatif est signalé, jamais corrigé.
- **Ventes du jour** = prises à compte + sacs entiers au comptant + comptant au détail. Un sac entier vendu sur un compte est une prise : compté une fois.
- **Contrôle** : chiffre attendu des sacs et comptant déclaré **affichés côte à côte**, sans signalement automatique (reporté après le pilote).

## Choix techniques
- **Journal immuable** `day_closings` + `day_closing_amounts` (montants entiers par moyen de paiement de la boutique). Une correction est une **nouvelle clôture** du même jour ; la dernière reçue par le serveur fait foi, l'historique reste. Écriture par `record_day_closing` seulement : idempotente (UUID de l'appareil), propriétaire ou gérant de la boutique, jour de la boutique entre J−62 et J+1, montants entiers ≥ 0 et moyens de la boutique, sans doublon. Total calculé par la base.
- **Les ventes au comptant ne sont pas stockées** : elles se déduisent à la lecture (projection), comme les soldes.
- **Hors ligne** : commande `cash.close` dans la file d'envoi ; l'appareil garde les clôtures et les ventes de sacs entiers des 62 derniers jours (Dexie v4). Une clôture en attente d'envoi fait foi sur l'appareil (plus récente que tout ce que le serveur a reçu).
- **Jour d'une opération** = jour de sa saisie (heure de l'appareil) dans le fuseau de la boutique ; annulations exclues quel que soit leur jour.
- **Estimation sans clôture** : pour chaque produit, rythme des 3 derniers sacs terminés (Σ comptant estimé / Σ durées, au moins 6 h par sac). Affichée « ≈ … » avec le badge « Estimation ».
- **Bénéfice brut** (RG8) = marges des bilans de sac (comptés le jour où le sac est terminé) + marges des sacs vendus entiers (prix de vente − prix d'achat du lot, le jour de la vente), par produit et période. Calculé **sur le serveur** (écran Bénéfices, en ligne : ce n'est pas une saisie du quotidien), avec la session de l'utilisateur (RLS).
- **Argent encaissé** d'une période : jour clôturé → tout l'argent reçu déclaré ; jour sans clôture → versements et sacs entiers au comptant seulement (le comptant au détail n'est pas connu).
- Toutes les règles sont des fonctions pures testées (`cash`, `reporting`), avec des exemples chiffrés.

## Droits
- Clôture : propriétaire et gérants de la boutique (base). Lecture : membres de la boutique (RLS).
- **Bénéfices** : propriétaire et comptable (nouvelle capacité `viewProfits`) ; le gérant voit la caisse et les ventes du jour. Limite connue : le gérant saisit déjà les prix d'achat et voit les bilans de sac (jalon 5) ; la restriction des bénéfices est donc une restriction d'écran, pas une barrière de données. À revoir si un propriétaire veut cacher les prix d'achat à ses gérants.

## Tableau de bord
Accueil : dû par les clients et avances (existant), gros boutons, **ventes du jour** (appareil, hors ligne), **bénéfice brut du mois** (propriétaire, comptable), « À relancer », **stock à surveiller** (produits au seuil de rachat, rupture estimée), **dernières opérations** (journal client, stock, clôtures). Téléphone : une colonne ; ordinateur : grilles à deux colonnes.

## Conséquences
- Contrôle automatique d'écart de caisse : après le pilote, avec un seuil réglable.
- Dépenses et bénéfice net : V2 (même écran Bénéfices).
