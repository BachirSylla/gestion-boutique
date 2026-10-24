# 0009 — Administration des comptes

**Date** : 24 oct. 2026 · **Statut** : acceptée

## Contexte
Jalon 2 : l'admin plateforme crée les propriétaires ; le propriétaire crée ses gérants et comptables ; chacun change son mot de passe ; un compte peut être désactivé, un propriétaire suspendu. La création de comptes exige la clé secrète (API d'administration de Supabase Auth) : elle se fait côté serveur, après vérification du rôle de l'appelant (CLAUDE.md §4.3).

## Choix

### Deux barrières
1. **Server Action** : vérifie le rôle de l'appelant (`authorizeAction(capability)`), lu avec la RLS.
2. **Fonction SQL `srv_*`** (exécutable par `service_role` seulement) : revérifie le rôle de l'auteur passé en paramètre (`p_actor`) et fait les écritures de façon atomique, avec le journal. Même une erreur dans le code serveur ne permet pas de franchir la frontière entre propriétaires.

Les lectures (listes, fiches) passent par le client au nom de l'utilisateur : la RLS décide de ce qu'il voit.

### Création d'un compte
Compte Auth créé d'abord (l'identifiant dérivé du téléphone est unique : un numéro déjà utilisé est refusé), puis la fonction SQL écrit profil, téléphone et rattachements. Si l'écriture SQL échoue, le compte Auth est supprimé (compensation).

### Mot de passe provisoire
Généré par le serveur (`crypto.randomInt`), format `kmrt-4827-pzaw` : facile à dicter, sans caractère ambigu, ~49 bits. Affiché **une seule fois**, avec « Copier le message » et « Envoyer par WhatsApp » (lien `wa.me` prérempli, sans API payante). `must_change_password` impose de le changer à la première connexion : toute page de l'application renvoie alors vers `/first-password`.

### Changement de mot de passe
- Premier mot de passe : pas de mot de passe actuel demandé (l'utilisateur vient de se connecter avec le provisoire), permis seulement si le changement est exigé.
- Depuis « Mon compte » : le mot de passe actuel est revérifié par une connexion jetable côté serveur, puis le nouveau est posé par l'API d'administration.
- Réinitialisation : l'admin pour un propriétaire, le propriétaire pour ses employés (vérifié par `srv_check_password_reset`, testé).

### Désactivation et suspension
- **Employé désactivé** : statut en base (la RLS lui coupe tout accès immédiatement) **et** bannissement dans Supabase Auth (plus de connexion ni de renouvellement de session). Réactivable.
- **Propriétaire suspendu** : statut en base ; la RLS coupe l'accès au propriétaire et à tous ses employés, qui sont déconnectés avec un message à leur prochaine requête. Pas de bannissement Auth : la réactivation reste immédiate. Les données sont conservées.

### Journal des comptes (`account_events`)
Création, suspension, réactivation, boutique créée, rattachements modifiés, désactivation, réinitialisation et changement de mot de passe. Écrit uniquement par les fonctions serveur, en lecture seule pour l'application (aucun droit d'écriture pour `authenticated`). Le propriétaire voit le journal de son tenant, chacun ce qui le concerne, l'admin le journal des comptes (aucune donnée client n'y figure). Il préfigure le « journal d'activité » prévu en V2.

### Boutique courante
Cookie `bitig_shop` (httpOnly), validé à chaque requête contre la liste des boutiques accessibles (déjà filtrée par la RLS) ; à défaut, la première. Le sélecteur n'apparaît que si l'utilisateur a plusieurs boutiques. Un rattachement retiré fait retomber sur une boutique encore accessible.

## Leçon retenue
Un test a révélé que `srv_create_shop` laissait passer un auteur quelconque : `not (false or null = x)` vaut `null`, et `if null` ne lève pas d'erreur. Corrigé (migration `20261024040000`) en comparant avec `is not distinct from`. Règle pour la suite : dans une garde PL/pgSQL, ne jamais laisser une condition pouvoir valoir `null` ; tester chaque garde avec un auteur sans rôle.
