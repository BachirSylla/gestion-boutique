# 0010 — Clients et journal client

**Date** : 24 oct. 2026 · **Statut** : acceptée

## Contexte
Jalon 3 : clients à compte (avance, mensuel, libre), prises (rapide, détaillée sans stock), versements, soldes, annulations et demandes, liste « À relancer ». Invariants : journal immuable, prix figé, montants entiers, isolation, traçabilité, et préparation du hors ligne (jalon 4).

## Choix

### Journal immuable garanti par la base
- `customer_operations` (prise, versement, annulation) et `take_lines` : **aucun droit d'écriture** pour `authenticated` ; les écritures passent par des fonctions SQL. Un **trigger refuse toute modification ou suppression**, même avec la clé secrète (`service_role`) ; `truncate` aussi.
- Seule exception : `private.purge_tenant`, réservée au rôle `postgres` (mot de passe de la base, jamais exposé, pas d'autorisation accordée), pour les tests de bout en bout et le futur droit à l'effacement (CDP). Elle n'est appelable ni par l'API ni par le serveur.
- Une erreur se corrige par une opération `cancellation` qui référence l'originale (unique : on n'annule pas deux fois ; une annulation ne s'annule pas). L'originale reste affichée, barrée.

### Écritures idempotentes, prêtes pour le hors ligne
`record_take`, `record_payment`, `cancel_operation`, `request_cancellation`, `decide_cancellation` :
- l'**identifiant est généré par l'appareil** (UUID) : un renvoi du même identifiant renvoie `duplicate` sans rien écrire ; le même identifiant envoyé par un autre utilisateur est refusé (jamais écrasé) ;
- elles contrôlent elles-mêmes les droits avec `auth.uid()` (propriétaire ou gérant de la boutique ; comptable en lecture seule) ;
- chaque opération porte l'auteur, la boutique, l'heure de l'appareil (`device_created_at`, date métier affichée) et l'heure du serveur (`server_created_at`).
Au jalon 4, la file d'envoi appellera directement ces fonctions depuis l'appareil.

### Prix figé et arrondi (RG3)
Une prise détaillée stocke, par ligne, le libellé, la quantité (millièmes), l'unité, le **prix unitaire copié** et le montant. Le serveur **recalcule** chaque ligne avec le pas d'arrondi de la boutique (`private.line_amount`) et refuse un montant ou un total incohérent. Un test vérifie que l'arrondi SQL et l'arrondi TypeScript (`lineAmount`) donnent le même résultat sur 2 000 cas aléatoires. Les formats favoris à prix propre et le rattachement au conditionnement entamé viendront avec le catalogue (jalon 5) : `product_id` et `package_id` sont déjà prévus.

### Soldes
Projection du journal : vue `customer_balances` (`security_invoker`, donc soumise à la RLS de l'utilisateur), et la même règle en TypeScript pur (`computeBalance`) pour l'appareil. Solde = Σ versements − Σ prises, opérations annulées exclues.

### Annulations (validé avec le propriétaire du produit)
- Gérant : sa propre opération, dans le délai de la boutique (**15 min par défaut, de 0 à 60 min, modifiable à tout moment**), compté à l'**heure du serveur** ; le délai en vigueur au moment de l'annulation s'applique.
- Au-delà, ou pour l'opération d'un autre : **demande** (motif obligatoire, une seule en attente par opération). Le propriétaire valide (l'annulation est créée en son nom, avec le motif de la demande) ou refuse ; la décision est tracée. Le propriétaire voit une pastille des demandes en attente.
- Le propriétaire annule directement. « Annuler » est proposé quelques secondes juste après une saisie, selon la même règle.

### Relances (validé)
Toujours **manuelles** : la liste « À relancer » propose un lien `wa.me` avec un message prérempli, modifiable. Raisons : échéance passée pour un mensuel (une prise faite jusqu'à la dernière échéance reste impayée), plafond dépassé, avance sous le seuil, crédit libre sans versement depuis N jours.

### Réglages par boutique
`shop_settings` (délai d'annulation, pas d'arrondi, seuil d'avance par défaut 1 000 F, relance du crédit libre après 30 jours, échéance fin de mois) et `payment_methods` (espèces, Wave, Orange Money, autre, plus des moyens personnalisés ; jamais supprimés, désactivés), créés automatiquement avec chaque boutique. Les valeurs par défaut sont à valider pendant le pilote.

### Codes d'erreur métier
Les fonctions lèvent des codes SQLSTATE propres (`BT001` hors délai → demande nécessaire, `BT002` déjà annulée, `BT003` client archivé, `BT004` saisie invalide, `BT005` identifiant réutilisé, `BT006` demande déjà en attente ou traitée), traduits en messages par l'interface.

## Leçons retenues
- Après une action qui fait disparaître l'élément affiché (demande traitée, opération annulée), la confirmation doit vivre hors de cet élément : sinon le rechargement de la page l'efface.
- Depuis le poste de développement, la base distante (Londres) ajoute 1 à 3 s par page ; les délais des tests de bout en bout en tiennent compte. Sur Vercel, proche de la base, ce sera bien plus rapide.
