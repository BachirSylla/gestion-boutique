# Notes de décision

Chaque choix structurant a sa note : contexte, options envisagées, choix, raison.
On peut changer d'avis : on écrit alors une nouvelle note qui remplace l'ancienne (et on l'indique dans l'ancienne).

| N° | Sujet | Statut |
|---|---|---|
| [0001](0001-socle-technique.md) | Socle technique : Next.js 16, pnpm, Tailwind 4, Vitest, Playwright | Acceptée |
| [0002](0002-stockage-local-et-synchronisation.md) | Stockage local (Dexie / IndexedDB) et synchronisation maison | Acceptée (mise en œuvre : 0011) |
| [0003](0003-pwa-hors-ligne.md) | PWA et hors ligne côté Next.js (Serwist, `useOffline`, pas de `cacheComponents`) | Acceptée |
| [0004](0004-schema-et-rls.md) | Schéma multi-propriétaires et RLS ; tests d'isolation sur la base distante | Acceptée |
| [0005](0005-connexion-par-telephone.md) | Connexion par téléphone via un e-mail interne `.invalid` | Acceptée |
| [0006](0006-montants-quantites-arrondi.md) | Montants, quantités et règles d'arrondi (RG3) | Acceptée |
| [0007](0007-i18n.md) | Internationalisation (next-intl) | Acceptée |
| [0008](0008-migrations-distantes.md) | Migrations appliquées au projet distant sans Docker | Acceptée |
| [0009](0009-administration-des-comptes.md) | Administration des comptes : fonctions serveur, mots de passe provisoires, désactivation, journal | Acceptée |
| [0010](0010-journal-client.md) | Clients et journal client : immuabilité, écritures idempotentes, annulations, relances | Acceptée |
| [0011](0011-synchronisation-hors-ligne.md) | Hors ligne : écran local, file d'envoi idempotente, téléchargement par curseurs, indicateur | Acceptée |
| [0012](0012-catalogue-et-prix.md) | Catalogue et prix : grille versionnée, politique RG4, formats favoris, catalogue de départ | Acceptée |
| [0013](0013-stock.md) | Stock : conditionnements, mouvements immuables, FIFO, bilans de sac, RG4, inventaire, hors ligne | Acceptée |
| [0014](0014-documents.md) | Reçus PNG, relevés PDF (jsPDF à la demande), partage WhatsApp, relances, hors ligne | Acceptée |
| [0015](0015-caisse-et-tableau-de-bord.md) | Clôture (journal immuable, hors ligne), ventes du jour déduites, bénéfice brut, tableau de bord | Acceptée |
