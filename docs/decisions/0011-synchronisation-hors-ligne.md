# 0011 — Hors ligne et synchronisation (mise en œuvre)

**Date** : 25 oct. 2026 · **Statut** : acceptée · Met en œuvre la note [0002](0002-stockage-local-et-synchronisation.md)

## Contexte
Invariant 5 : les saisies du quotidien fonctionnent sans réseau et se synchronisent ensuite sans doublon ni perte. Jalon 4 : appliqué aux saisies du jalon 3 (nouveau client, prise, versement, annulation, demande d'annulation). Le stock et la clôture suivront le même mécanisme.

## Choix

### Écran local plutôt que pages serveur
Les écrans de saisie quotidienne (liste des clients, fiche, prise, versement, nouveau client) forment **un seul écran** `/customers`, qui lit la **base locale** (IndexedDB, Dexie) et navigue par **ancre** (`/customers#/c/<id>/take`) :
- une ancre ne fait aucune requête : la navigation marche sans réseau ;
- le service worker garde la page `/customers` en cache (mise en cache demandée au démarrage) : l'application **s'ouvre à froid hors ligne** ;
- les liens internes sont des `<a>` simples : le routeur de Next.js attendrait le réseau.
Restent en ligne (pages serveur) : modification de la fiche, réglages, équipe, demandes d'annulation côté propriétaire, relances (calculées sur le serveur).

### Base locale (par utilisateur, effacée à la déconnexion)
Tables : clients, opérations, lignes de prise, demandes d'annulation, réglages et moyens de paiement des boutiques, noms des collègues, **file d'envoi**, curseurs. Les données des boutiques qui ne sont plus accessibles sont oubliées au démarrage. La déconnexion efface la base et les pages en cache (appareil partagé) ; s'il reste des saisies non envoyées, une confirmation prévient qu'elles seraient perdues.

### File d'envoi
- Toute saisie est écrite **d'abord sur l'appareil** (l'écran réagit immédiatement), avec un **identifiant généré sur l'appareil**.
- Envoi **dans l'ordre** aux fonctions idempotentes du jalon 3 (`record_take`, `record_payment`, `cancel_operation`, `request_cancellation`) ; un client créé hors ligne part avant ses opérations (`insert … on conflict do nothing`).
- Réseau coupé ou serveur indisponible : on s'arrête (ordre préservé) et on réessaie après 2 s, 4 s, 8 s… (60 s au plus), automatiquement, au retour du réseau, au retour sur l'application et toutes les 60 s.
- **Réponse perdue** (le serveur a enregistré, l'appareil ne le sait pas) : le renvoi reçoit « déjà connu », **jamais de doublon** (testé en unitaire et de bout en bout).
- **Refus métier** (client archivé, droits…) : la saisie reste affichée, marquée « Refusée : motif », **exclue des soldes**, et n'est retirée que par l'utilisateur (« J'ai compris, retirer »). Jamais de perte silencieuse.
- **Annulation arrivée hors délai** (le délai se compte à l'heure du serveur) : elle devient automatiquement une **demande d'annulation** au propriétaire, avec le motif saisi ou un motif par défaut.
- Après un envoi réussi, une copie provisoire de l'opération évite un « trou » à l'écran jusqu'au téléchargement suivant.

### Téléchargement incrémental
Par boutique, par **curseur** sur l'heure du serveur (opérations), la date de modification (clients) et la date de création ou de décision (demandes). Chaque requête repart **5 minutes avant le curseur** : une transaction lente peut valider une ligne d'horodatage antérieur ; les doublons sont fusionnés par identifiant. Le journal étant immuable, il est téléchargé **en entier** une fois puis par incréments : les soldes se recalculent sur l'appareil, exacts hors ligne. Volume estimé : quelques Mo par an et par boutique ; si cela devient lourd, on passera à des soldes de clôture périodiques.

### Projection et indicateur
Solde affiché = journal confirmé + saisies en attente − opérations annulées (y compris par une annulation en attente) − saisies refusées (`summarizeByCustomer`, testé). L'indicateur est toujours visible (en-tête sur téléphone, menu latéral sur ordinateur) : **Synchronisé** / **N envois en attente** / **Hors ligne · N en attente** / **N saisies refusées**, avec l'heure de la dernière synchronisation ; la page Synchronisation détaille l'état et liste les refus.

### Ce que le serveur continue de garantir
Rien de ce qui précède n'affaiblit les invariants : droits, délais, arrondi et immuabilité sont revérifiés par la base à chaque envoi. Un compte désactivé ne peut plus envoyer (RLS) : ses saisies sont refusées, visibles.

## Tests
- Unitaires (sans réseau) : décision après envoi, délais, conversion en demande, curseurs, projection, et moteur complet avec une base IndexedDB simulée et un faux serveur idempotent (hors ligne puis reprise, réponse perdue, ordre, refus, double clic).
- Bout en bout : ouverture à froid hors ligne, nouveau client et prise sans réseau, envoi au retour du réseau, renvoi après réponse perdue (une seule opération en base), refus visible (client archivé entre-temps) puis retiré.
