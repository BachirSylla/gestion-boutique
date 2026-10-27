# Pilote avec le premier boutiquier

Objectif : faire tourner Bitig dans une vraie boutique pendant 2 à 4 semaines, relever ce qui gêne et corriger.

## 1. Mettre en ligne (une fois)

1. Sur [vercel.com](https://vercel.com), importer le dépôt GitHub `BachirSylla/gestion-boutique` (préréglage Next.js, aucune commande à changer).
2. Dans *Settings → Environment Variables*, ajouter seulement :
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY` (**jamais** dans une variable `NEXT_PUBLIC_*`)
3. Déployer la branche `main`. Ouvrir l'adresse `https://….vercel.app/login` et se connecter avec le compte administrateur.
4. **Supabase Auth : aucun réglage obligatoire.** Bitig n'envoie ni e-mail ni SMS et n'utilise aucun lien de redirection : connexion par numéro et mot de passe, réinitialisations faites par l'administrateur ou le propriétaire depuis l'application. Par hygiène, dans le tableau de bord Supabase (*Authentication → URL Configuration*) :
   - **Site URL** : remplacer `http://localhost:3000` par l'adresse Vercel (`https://….vercel.app`, ou le domaine définitif plus tard) ;
   - **Redirect URLs** : rien à ajouter.
   Les autres réglages Auth (inscription publique désactivée, longueur du mot de passe, sessions longues pour le hors ligne) sont déjà appliqués ; `pnpm auth:config` vérifie qu'ils n'ont pas changé.
5. Avant de facturer des boutiquiers : passer aux offres payantes (usage commercial, pas de mise en pause, sauvegardes) — voir CLAUDE.md §7.5. D'ici là, faire une sauvegarde régulière de la base.

## 2. Préparer la boutique

1. **Administration → Nouveau propriétaire** : nom, numéro, nom et quartier de la boutique. Noter le mot de passe provisoire affiché.
2. Le propriétaire se connecte, change son mot de passe, puis :
   - **Catalogue** : ajouter le catalogue de départ, ajuster prix, contenances et formats favoris ;
   - **Réglages** : pas d'arrondi, délai d'annulation, politique de prix, moyens de paiement ;
   - **Équipe** : créer le ou les gérants ;
   - **Clients** : saisir les clients à compte et leur solde de départ (une prise ou un versement « reprise du carnet »).
3. Sur chaque téléphone : ouvrir l'adresse dans Chrome, se connecter **avec le réseau**, puis *Ajouter à l'écran d'accueil*.

Pour une démonstration avant d'installer chez le boutiquier : `pnpm demo:seed -- --confirm` (voir le README), puis `pnpm demo:reset -- --confirm`.

## 3. Ce qu'on observe pendant le pilote

Avant le pilote, faire le tour complet de l'application avec le guide de recette : [recette.md](recette.md).


| Sujet | Question |
|---|---|
| Rapidité | Une prise rapide prend-elle moins de 10 secondes ? |
| Hors ligne | Des saisies faites sans réseau sont-elles bien arrivées (indicateur « Synchronisé ») ? |
| Stock | Le boutiquier pense-t-il à appuyer sur « Ouvrir » et « Terminé » ? Les bilans de sac lui parlent-ils ? |
| Caisse | La clôture du soir est-elle faite ? Les ventes au comptant déduites lui semblent-elles justes ? |
| Reçus | Les reçus et relevés partent-ils bien dans WhatsApp ? Les clients les comprennent-ils ? |
| Relances | La liste « À relancer » est-elle utile, trop longue, trop courte ? |
| Réglages à valider | Seuil d'alerte d'avance (1 000 F), relance du crédit libre (30 jours), pas d'arrondi (5 F) |

Noter chaque remarque avec : date, écran, ce qui était attendu, ce qui s'est passé (une capture d'écran aide beaucoup).

## 4. Points ouverts à trancher pendant le pilote

- Contrôle automatique des écarts de caisse et son seuil (CLAUDE.md RG7).
- Plusieurs sacs entamés en même temps pour un même produit (CLAUDE.md §13).
- Faut-il cacher les prix d'achat aux gérants (aujourd'hui, ils les saisissent à la réception) ?
