# Bitig — le carnet du boutiquier

Application web PWA pour les boutiquiers de quartier au Sénégal : comptes clients, stock par sac, reçus WhatsApp, hors ligne d'abord.
La référence produit est [CLAUDE.md](CLAUDE.md) ; les choix techniques sont dans [docs/decisions/](docs/decisions/).

## Mise en route

Prérequis : Node.js 22, pnpm 11. Pas de Docker : on travaille sur le projet Supabase distant.

```bash
pnpm install
cp .env.example .env      # puis remplir les valeurs (voir les commentaires)
pnpm dev                  # http://localhost:3000
```

## Commandes

| Commande | Rôle |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Développement, build et serveur de production |
| `pnpm lint` / `pnpm typecheck` | ESLint (dont : pas de texte en dur, frontières des modules) et TypeScript |
| `pnpm test` | Règles métier pures (sans réseau) |
| `pnpm test:rls` | Isolation RLS sur la base distante (transactions annulées, rien n'est conservé) |
| `pnpm test:e2e` | Parcours de bout en bout sur le build de production, captures 360 / 768 / 1280 px (`docs/captures/`). Crée puis supprime des comptes de test préfixés `[e2e]` |
| `pnpm db:push --dry-run` / `pnpm db:push` | Applique `supabase/migrations/` au projet distant (pooler en mode session) |
| `pnpm db:status` | Migrations appliquées / en attente |
| `pnpm db:types` | Régénère `src/shared/supabase/database.types.ts` |
| `pnpm auth:config [--apply]` | Réglages Supabase Auth (inscriptions fermées, mot de passe ≥ 8) |
| `pnpm admin:bootstrap` | Crée le premier administrateur de la plateforme |
| `pnpm check:secrets [--build]` | Vérifie qu'aucun secret n'est dans le dépôt (et dans le build client) |
| `pnpm icons` | Régénère les icônes PNG de la PWA depuis `public/icons/*.svg` |

## Premier administrateur de la plateforme

Il n'y a pas d'inscription publique. Le premier compte administrateur se crée depuis un poste de développement qui a la clé secrète dans `.env` :

```bash
pnpm admin:bootstrap -- --phone "77 614 89 91" --name "Prénom Nom"
```

Le mot de passe (8 caractères minimum) est demandé deux fois dans le terminal, sans être affiché ni enregistré. Le script est idempotent : relancé, il confirme que le compte existe et qu'il est administrateur. On se connecte ensuite sur `/login` avec le numéro et ce mot de passe.

## Comptes (jalon 2)

- **Administrateur** (`/admin`) : crée un propriétaire, son compte et sa première boutique ; ajoute des boutiques ; réinitialise le mot de passe du propriétaire ; suspend ou réactive le propriétaire.
- **Propriétaire** (`/team`, `/shops`) : crée ses gérants et comptables, choisit leurs boutiques, les désactive, réinitialise leur mot de passe ; crée et modifie ses boutiques.
- Chaque compte créé reçoit un **mot de passe provisoire**, affiché une seule fois (copie ou envoi WhatsApp), à changer à la première connexion.
- **Mon compte** (`/account`) : changement de mot de passe.

Détails : [docs/decisions/0009](docs/decisions/0009-administration-des-comptes.md).

## Clients et journal (jalon 3)

- **Clients** (`/customers`) : recherche instantanée, filtres par type, tri ; fiche avec solde, plafond, échéance, historique par jour.
- **Prise** (rapide ou détaillée) et **versement** ; depuis l'accueil, « Nouvelle prise » → client → montant → enregistrer.
- **Annulations** : libre pour le gérant dans le délai de la boutique, demande au propriétaire sinon (`/cancellations`).
- **À relancer** (`/reminders`) : relance manuelle par WhatsApp, message prérempli.
- **Réglages** (`/settings`) : délai d'annulation, arrondi, seuils, échéance, moyens de paiement.
- Le journal est **immuable** (garanti par la base) ; seule `private.purge_tenant`, réservée au rôle `postgres`, peut effacer un propriétaire (tests, droit à l'effacement).

Détails : [docs/decisions/0010](docs/decisions/0010-journal-client.md).

## Hors ligne (jalon 4)

- Les clients, fiches, prises, versements et nouveaux clients se saisissent **sans réseau** : tout est écrit sur l'appareil puis envoyé dès que le réseau revient, sans doublon.
- L'indicateur (en-tête ou menu latéral) montre : synchronisé, envois en attente, hors ligne, saisies refusées. La page `/sync` détaille l'état et les refus.
- La première connexion sur un appareil demande le réseau (téléchargement des données de la boutique).
- La déconnexion efface les données de l'appareil.

Détails : [docs/decisions/0011](docs/decisions/0011-synchronisation-hors-ligne.md).

## Catalogue et stock (jalon 5)

- **Catalogue** (`/catalog`, propriétaire) : produits, catalogue de départ, grille de prix (détail, conditionnement, formats favoris) avec historique ; changement immédiat ou après écoulement de l'ancien stock.
- **Prise détaillée** : formats favoris en un toucher, lignes rattachées au sac entamé.
- **Stock** (`/stock`, hors ligne) : réception, ouvrir / terminer un sac (FIFO), vente de sac entier (comptant ou compte client), reste estimé, bilans de sac, inventaire.

Détails : [0012](docs/decisions/0012-catalogue-et-prix.md), [0013](docs/decisions/0013-stock.md).

## Documents (jalon 6)

- **Reçu** (image PNG) de chaque prise ou versement : ancien et nouveau solde, lignes, auteur, numéro d'opération. Bouton « Envoyer le reçu » juste après la saisie et dans l'historique.
- **Relevé de compte** (PDF A4) : ce mois-ci, le mois dernier ou dates choisies ; solde après chaque ligne, annulations barrées.
- **Partage** WhatsApp via le menu de partage du téléphone, sinon téléchargement. **Relance** par lien `wa.me` prérempli.
- Tout est généré sur l'appareil : fonctionne hors ligne.

Détails : [0014](docs/decisions/0014-documents.md).

## Caisse et tableau de bord (jalon 7)

- **Caisse** (`/cash`, hors ligne) : ventes du jour et clôture du soir. On saisit tout l'argent reçu par moyen de paiement ; l'application en déduit les ventes au comptant au détail (versements et sacs entiers retirés). Une nouvelle clôture du même jour corrige la précédente.
- **Bénéfices** (`/profits`, propriétaire et comptable) : bénéfice brut par période et par produit, à côté de l'argent encaissé ; comptant attendu des sacs et comptant déclaré côte à côte.
- **Accueil** : ventes du jour, bénéfice brut du mois, stock à surveiller, dernières opérations.

Détails : [0015](docs/decisions/0015-caisse-et-tableau-de-bord.md).

## Organisation

```
src/app/              routes Next.js (minces)
src/modules/<module>/ domaines métier : domain/ (pur, testé), data/, ui/, index.ts, server.ts
src/shared/           domaine partagé (montants, quantités, téléphone), UI, clients Supabase, PWA
supabase/migrations/  schéma versionné (jamais modifié une fois appliqué)
tests/rls/  tests/e2e/
scripts/              outillage
docs/decisions/       notes de décision
```

## Sécurité

- La clé secrète Supabase n'est utilisée que côté serveur (`import "server-only"`) et dans les scripts locaux. Jamais dans une variable `NEXT_PUBLIC_*`.
- Sur Vercel, seules trois variables sont nécessaires : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`.
- Lancer `pnpm check:secrets` avant chaque commit.
