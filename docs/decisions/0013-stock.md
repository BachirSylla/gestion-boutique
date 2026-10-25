# 0013 — Stock, bilans de sac et inventaire

**Date** : 25 oct. 2026 · **Statut** : acceptée (choix validés avec le propriétaire du produit)

## Contexte
Jalon 5b (RG2, RG4, RG6) : suivre les conditionnements, pas chaque vente. Réception, ouverture et fin de sac, vente de sac entier, bilan de sac, vue stock, inventaire. Ouverture, fin et vente entière sont des saisies du quotidien : elles doivent fonctionner hors ligne.

## Modèle
- **Lots** (arrivages) et **mouvements de stock** : journaux immuables (trigger, même avec la clé secrète ; purge réservée au rôle postgres).
- **Conditionnements** : un par sac reçu, avec un **état projeté** (fermé, entamé, terminé, vendu entier, retiré), mis à jour uniquement par les fonctions d'écriture, jamais par le client. **Au plus un entamé par produit**, garanti par un index unique (MVP ; à rouvrir si un boutiquier le demande).
- **Tranches de prix** d'un sac entamé : à l'ouverture, une tranche au prix de détail actif (reste 100 %) ; à chaque changement de prix immédiat, une nouvelle tranche au reste estimé (plein, ¾, ½, ¼, **presque vide = 10 %**). Le reste estimé ne peut pas remonter.

## Règles
- **FIFO** : l'ouverture et la vente entière prennent le sac fermé du lot reçu le plus tôt.
- **RG4 après écoulement** : à l'ouverture, si un prix est en attente et que le sac vient d'un lot reçu après le changement, la grille en attente devient active avant de calculer la tranche. L'ancien stock (entamé et fermé) garde l'ancien prix.
- **Prises rattachées** : une ligne de prise liée à un produit est rattachée au sac entamé **au moment de la saisie** (heure de l'appareil) ; une prise saisie hors ligne la veille va donc au sac entamé la veille, pas à celui d'aujourd'hui.
- **Vente entière** : au comptant, ou sur le compte d'un client (la fonction crée la prise dans la même transaction, identifiant prévu sur l'appareil).
- **Inventaire (RG6)** : on compte les sacs fermés et on estime le reste de l'entamé ; chaque écart devient un ajustement (auteur, motif). Manquants : les plus anciens sortent. Trouvés : un lot d'ajustement au dernier prix d'achat connu. Inventaire partiel possible.
- **Annulation** (validé) : mêmes règles que le journal client (gérant : son propre mouvement dans le délai, sinon demande ; propriétaire : direct). L'annulation n'est permise que si elle a encore un sens (réception dont aucun sac n'est entamé, sac encore entamé par cette ouverture…), sinon refus explicite. Annuler une vente entière sur compte annule aussi la prise.

## Bilan de sac
Vue `package_reviews` (et la même formule en TypeScript, `expectedRevenue`, vérifiée sur 40 cas aléatoires) :
- chiffre attendu = Σ tranches (part vendue × contenance × prix de détail), **sans arrondi intermédiaire, arrondi à l'entier à la fin** (RG3) ;
- prises à compte = lignes détaillées non annulées rattachées au sac ;
- comptant estimé = attendu − prises à compte (approximation affichée : les prises rapides ne sont pas rattachées) ;
- coût = prix d'achat du lot ; marge brute = attendu − coût ; durée = fin − ouverture.
Exemples du cahier testés : 15 750 / 2 205 / 13 545 / 1 350 F ; baisse à mi-sac 16 125 F.

## Hors ligne
Réception, ouverture, fin, vente entière, estimation, ajustement, annulation et demande passent par la **file d'envoi** (fonctions idempotentes). L'appareil garde le stock courant, les 150 derniers mouvements et les 60 derniers bilans, remplacés à chaque synchronisation. Le stock affiché = stock téléchargé + saisies en attente (`projectStock`). Les conflits sont explicites : ouvrir alors qu'un autre appareil vient d'ouvrir → refus « déjà entamé » visible ; annulation arrivée hors délai → demande au propriétaire.

## Vue stock
Cartes produit avec pictos de sacs (pleins / entamé selon le reste estimé), filtres « Entamés » et « À racheter » (fermés ≤ seuil du produit), date de rupture estimée (stock restant × durée moyenne des 3 derniers sacs), boutons « Ouvrir » et « Terminé » ; fiche produit avec reste estimé, vente entière, réception, bilans et mouvements annulables.
