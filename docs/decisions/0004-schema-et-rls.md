# 0004 — Schéma multi-propriétaires et RLS

**Date** : 24 oct. 2026 · **Statut** : acceptée

## Schéma (jalon 1)
| Table | Rôle |
|---|---|
| `tenants` | Propriétaire (compte client de la plateforme), statut actif / suspendu, valeurs par défaut (langue, devise, fuseau) |
| `shops` | Boutique, rattachée à un seul propriétaire, archivable (jamais supprimée) |
| `profiles` | Utilisateur d'un propriétaire : rôle (`owner`, `manager`, `accountant`), nom, statut, mot de passe à changer |
| `profile_contacts` | Téléphone (identifiant de connexion) : séparé de `profiles` pour restreindre sa visibilité |
| `platform_admins` | Administrateurs de la plateforme, sans propriétaire |
| `shop_members` | Rattachement gérant / comptable ↔ boutique, révoqué (`revoked_at`) mais jamais supprimé |

Garanties portées par la base :
- **Clés étrangères composites** `(shop_id, tenant_id)` et `(user_id, tenant_id)` : un rattachement ne peut pas mélanger deux propriétaires, même avec la clé secrète.
- `tenant_id` d'une boutique ou d'un profil ne change jamais (trigger).
- Un propriétaire n'est jamais rattaché (il voit toutes ses boutiques) ; un rattachement n'est que révoqué, une seule fois ; l'auteur de la révocation est l'utilisateur courant.
- Les colonnes d'auteur (`created_by`) prennent `auth.uid()` par défaut et ne sont pas accordées en écriture au client : impossible d'usurper un auteur.

## Visibilité (validée avec le propriétaire du produit)
- Le propriétaire voit **toutes ses boutiques**, sans rattachement explicite.
- Les membres d'un même propriétaire voient le **nom** de leurs collègues (auteur des opérations).
- Le **téléphone** d'un employé n'est visible que par lui-même et par son propriétaire.
- L'admin plateforme voit les propriétaires (nom, téléphone) et les boutiques, **pas** les employés ni, plus tard, les données clients.
- Un profil désactivé ou un propriétaire suspendu ne voient plus rien (fonctions d'aide), et le compte Auth est en plus banni (jalon 2).

## Mise en œuvre
- Fonctions d'aide `security definer` dans un schéma `private` non exposé par l'API : `current_tenant_id()`, `current_app_role()`, `is_owner()`, `is_platform_admin()`, `accessible_shop_ids()`, `can_access_shop()`. Appelées sous la forme `(select …)` dans les politiques pour n'être évaluées qu'une fois par requête.
- Droits SQL minimaux en plus de la RLS : `anon` n'a aucun droit (y compris sur les objets futurs, via `alter default privileges`) ; `authenticated` reçoit table par table et colonne par colonne ce dont il a besoin ; aucun `delete` ni `truncate`.
- Les créations de comptes et l'administration passent par du code serveur (clé secrète) qui vérifie le rôle de l'appelant.

## Tests d'isolation
`pnpm test:rls` (Vitest + `pg`, via le pooler en mode session) :
- chaque scénario crée deux propriétaires, trois boutiques, des employés de chaque rôle et un admin **dans une transaction annulée à la fin** : rien ne reste dans la base distante ;
- l'utilisateur est simulé comme le fait PostgREST (`set local role authenticated` + `request.jwt.claims`) ;
- des **méta-tests** parcourent le catalogue Postgres : RLS activée et au moins une politique sur toute table de `public`, aucun droit pour `anon`, ni `delete` ni `truncate` pour `authenticated`, `search_path` fixé sur les fonctions `security definer`. Toute nouvelle table est donc couverte d'office.

## Leçon retenue
Une politique de lecture fondée sur une fonction qui relit la table (`accessible_shop_ids()`) ne voit pas la ligne en cours d'insertion : `insert … returning` échouait pour le propriétaire. Correctif (migration `20261024020000`) : condition directe « boutique de mon propriétaire et je suis propriétaire ». À appliquer de la même façon aux futures tables écrites avec `returning`.
