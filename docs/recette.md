# Guide de recette — tester toutes les fonctionnalités de Bitig

Ce guide fait le tour complet de l'application, écran par écran, avec ce qu'on doit voir. Comptez **1 h 30 à 2 h**. Cochez au fur et à mesure ; notez tout écart (écran, ce qui était attendu, ce qui s'est passé, capture).

## 0. Avant de commencer

**Adresse** : `https://gestion-boutique-six.vercel.app`

**Comptes**

| Rôle | Numéro | Mot de passe |
|---|---|---|
| Administrateur de la plateforme | votre numéro | votre mot de passe |
| Propriétaire de démo (Fatou Diallo) | 70 000 00 01 | affiché à la création de la démo |
| Gérant de démo (Moussa Ndiaye) | 70 000 00 02 | affiché à la création de la démo |

**Matériel** : un téléphone Android (Chrome) **et** un ordinateur. Certains tests se font avec deux comptes ouverts en même temps : utilisez une fenêtre de navigation privée pour le second.

**Important — le journal est immuable** : tout ce que vous saisissez dans la démo y reste (on annule, on ne supprime pas). Pour retrouver la démo intacte après la recette :
`pnpm demo:reset -- --confirm` puis `pnpm demo:seed -- --confirm` (nouveaux mots de passe affichés).

**Valeurs attendues** : les chiffres ci-dessous sont ceux de la démo **juste après sa création**, avant toute saisie.

---

## 1. Connexion et comptes

**Connexion** (téléphone)
- [ ] La page `/login` n'a ni « Créer un compte » ni « Mot de passe oublié par SMS » : seulement numéro + mot de passe.
- [ ] Le numéro s'accepte sous plusieurs formes : `70 000 00 01`, `700000001`, `+221 70 000 00 01`.
- [ ] Mauvais mot de passe → message clair, pas de détail technique.
- [ ] Une fois connecté, se déconnecter puis se reconnecter : la session tient (on reste connecté en rouvrant l'application).

**Administrateur** (votre compte, ordinateur)
- [ ] Menu **Propriétaires** : la liste contient « [démo] Fatou Diallo ».
- [ ] **Nouveau propriétaire** → nom, numéro, boutique → **Créer le propriétaire** : un mot de passe provisoire s'affiche, avec un bouton pour le copier / partager.
- [ ] Se connecter avec ce nouveau compte (fenêtre privée) : l'application demande **Choisissez votre mot de passe** avant tout.
- [ ] Fiche du propriétaire → **Réinitialiser le mot de passe** : la fenêtre de confirmation Bitig apparaît (pas l'alerte du navigateur), puis un nouveau mot de passe provisoire.
- [ ] **Suspendre le propriétaire** (bouton brique dans la confirmation) → ce propriétaire ne peut plus se connecter. **Réactiver** → il peut à nouveau.
- [ ] L'administrateur ne voit **pas** les clients ni les montants des boutiques.

**Propriétaire** (Fatou)
- [ ] **Équipe** → **Ajouter un employé** (gérant ou comptable, rattaché à une boutique) → mot de passe provisoire affiché.
- [ ] Fiche employé → **Désactiver le compte** → il ne peut plus se connecter ; son historique reste. Réactiver.
- [ ] **Boutiques** → **Nouvelle boutique** ; le sélecteur de boutique apparaît en haut ; passer d'une boutique à l'autre change toutes les données affichées.
- [ ] **Mon compte** → **Changer le mot de passe**.

**Droits** (à vérifier avec le gérant Moussa)
- [ ] Moussa ne voit ni **Catalogue**, ni **Équipe**, ni **Réglages**, ni **Bénéfices**. En tapant l'adresse `/profits` ou `/catalog`, il est renvoyé à l'accueil.
- [ ] Moussa ne voit que sa boutique (pas de sélecteur s'il n'en a qu'une).

---

## 2. Accueil (tableau de bord)

**Propriétaire, juste après la création de la démo**
- [ ] « Vos clients vous doivent » : **30 700 F** ; « 3 clients endettés · Avances détenues : 880 F ».
- [ ] Deux gros boutons : **Nouvelle prise** (safran) et **Versement**.
- [ ] **Ventes du jour** : badge « Estimation » ou « Sans clôture » tant que la clôture du jour n'est pas faite ; lien « Faire la clôture ».
- [ ] **Bénéfice brut du mois** (si la démo a été créée ce mois-ci) : **9 450 F** (5 bilans de sac + 1 sac de sucre vendu entier).
- [ ] **À relancer** : Ibrahima Fall (plafond dépassé de 2 775 F) et Mariama Sow (avance sous le seuil de 1 000 F).
- [ ] **Stock à surveiller** : les produits au seuil de rachat (1 conditionnement fermé ou moins) — les quatre produits de la démo : riz et lait (1 fermé), huile et sucre (aucun) — avec la rupture estimée.
- [ ] **Dernières opérations** : clôtures, prises, versements, mouvements de stock, avec l'auteur et l'heure.

**Gérant** : mêmes blocs **sans** « Bénéfice brut du mois » ; la barre du bas affiche **Caisse** au lieu de **Bénéfices**.

**Ordinateur** : menu latéral à gauche, blocs en deux colonnes.

---

## 3. Clients et journal (gérant, téléphone)

**Liste**
- [ ] Recherche dès la première lettre (nom ou téléphone) ; filtres par type ; tri par solde.
- [ ] Dette et avance se distinguent **par le signe et le mot** (« doit » / « avance »), pas seulement par la couleur.

**Fiche client** (Awa Ndiaye)
- [ ] Solde **−5 425 F « doit »**, type crédit mensuel, plafond 25 000 F avec une barre de remplissage, historique groupé par jour avec l'auteur de chaque opération.

**Nouveau client**
- [ ] **Nouveau client** : nom obligatoire, téléphone facultatif, type (avance / mensuel / libre), plafond, note.

**Prise rapide** — chronométrer : **moins de 10 secondes**
- [ ] Accueil → **Nouvelle prise** → choisir le client → montant → **Enregistrer la prise**.
- [ ] Le nouveau solde s'affiche **pendant** la saisie ; « Prise enregistrée. » avec un bouton **Annuler** quelques secondes.
- [ ] Les montants s'écrivent avec espace (`13 680 F`), clavier numérique sur téléphone.

**Prise détaillée**
- [ ] Mode **Détaillé** : les boutons favoris (Riz brisé 1 kg, Huile ½ L…) ajoutent une ligne en un toucher ; le total = somme des lignes.
- [ ] Quantité libre : 0,25 kg de riz à 315 F/kg → **80 F** (arrondi au pas de 5 F de la boutique).
- [ ] Ibrahima (plafond 20 000 F) : une nouvelle prise est **enregistrée** mais l'écran signale le dépassement (jamais bloquant).

**Versement**
- [ ] **Versement** : montant + moyen (Espèces, Wave, Orange Money, Autre) → le solde augmente.

**Annulations**
- [ ] Juste après une saisie : **Annuler l'opération** → fenêtre de confirmation brique → l'opération reste visible, **barrée**, et ne compte plus dans le solde.
- [ ] Sur une opération de plus de 15 minutes, ou saisie par Fatou : le gérant voit **Demander l'annulation** (motif obligatoire).
- [ ] Fatou : menu **Annulations** (pastille avec le nombre en attente) → **Valider l'annulation** ou **Refuser** ; le gérant voit la décision.
- [ ] Une annulation ne s'annule pas.

**Archivage**
- [ ] Fiche → modifier → **Archiver le client** : confirmation si le solde n'est pas nul ; le client disparaît de la liste, son historique reste.

---

## 4. Reçus, relevés, relances (téléphone avec WhatsApp)

- [ ] Après une prise : **Envoyer le reçu** → le menu de partage du téléphone s'ouvre → WhatsApp → l'image du reçu part. Elle montre : boutique, date et heure, client, lignes ou note, total, **ancien et nouveau solde**, échéance (client mensuel), prénom du gérant, numéro d'opération.
- [ ] Sur ordinateur, le reçu se **télécharge** (`Recu_Awa-Ndiaye_AAAA-MM-JJ_HHhMM.png`).
- [ ] Bouton **Reçu** sur une ancienne opération de l'historique.
- [ ] Fiche → **Relevé** → « Ce mois-ci », « Le mois dernier » ou dates choisies → **Préparer le relevé (PDF)** : PDF A4 avec solde reporté, total pris, total versé, reste à payer, tableau avec le **solde après chaque ligne**, annulations **barrées**.
- [ ] **À relancer** → **Relancer par WhatsApp** : WhatsApp s'ouvre avec un message poli prérempli (montant, boutique), modifiable avant envoi. (Les clients de démo n'ont pas de numéro : ajoutez le vôtre à un client pour tester l'envoi.)

---

## 5. Catalogue et prix (propriétaire, ordinateur)

- [ ] **Catalogue** : les 4 produits de démo, avec conditionnement, contenance, prix de détail, prix du sac entier, formats favoris.
- [ ] Riz brisé : badge / mention **hausse en attente : 330 F/kg au prochain arrivage** ; **Annuler** cette hausse est possible.
- [ ] **Nouveau produit** : contenance, prix de détail, prix du conditionnement, **Ajouter un format** (le prix du format se calcule, ajustable).
- [ ] Nouvelle boutique : **Ajouter le catalogue de départ** propose riz, huile, sucre, lait, oignon, pomme de terre…
- [ ] Fiche produit → modifier le prix de détail → **Enregistrer le nouveau prix**. Baisse : « Tout de suite » proposé par défaut, l'application demande le reste du sac entamé (plein, ¾, ½, ¼, presque vide). Hausse : « après écoulement » proposé par défaut. Les prix des formats se recalculent et restent ajustables.
- [ ] L'historique des prix garde chaque changement avec la date et l'auteur. Les anciennes prises gardent leur prix.

---

## 6. Stock (gérant, téléphone)

- [ ] **Stock** : une carte par produit, pictos de sacs (pleins / entamé), « 1 sac fermé · 1 entamé (plein) », rupture estimée ; filtres **Tous / Entamés / À racheter**.
- [ ] **Réception** : nombre de sacs + prix d'achat → les sacs fermés augmentent.
- [ ] **Ouvrir** : un sac fermé passe entamé (le plus ancien d'abord). Impossible d'en ouvrir un second du même produit.
- [ ] **Terminé** : fenêtre « Le conditionnement entamé de … est-il bien terminé ? » → **Oui, il est terminé** → un **bilan de sac** apparaît dans la fiche produit.
- [ ] Bilan du premier sac de riz de la démo : **attendu 15 750 F, coût 14 400 F, marge 1 350 F**.
- [ ] **Vendre entier** : au comptant ou **sur le compte d'un client** (crée une prise sur sa fiche).
- [ ] Reste estimé de l'entamé : plein, ¾, ½, ¼, presque vide.
- [ ] **Inventaire** : saisir le nombre de sacs fermés comptés → « Écart : +1 » → **Enregistrer l'inventaire** → ajustement avec auteur et motif.
- [ ] Annuler un mouvement de stock : mêmes règles que les prises (délai libre, sinon demande au propriétaire).

---

## 7. Caisse et bénéfices

**Caisse** (gérant)
- [ ] **Caisse** → **Aujourd'hui** / **Hier**. Saisir pour chaque moyen **tout l'argent reçu** (sans le fond de caisse).
- [ ] Le calcul s'affiche avant d'enregistrer : argent reçu − versements des clients − sacs entiers au comptant = **ventes au comptant au détail**. Sous chaque moyen : « Dont versements de clients : … ».
- [ ] Saisir trop peu (moins que les versements du jour) → message d'alerte brique, rien n'est corrigé en silence.
- [ ] **Enregistrer la clôture** → « Clôture faite » ; ventes du jour = prises à compte + sacs entiers au comptant + comptant au détail.
- [ ] Refaire une clôture du même jour → elle remplace la précédente ; **Dernières clôtures** affiche « Corrigée ».

**Bénéfices** (Fatou)
- [ ] **Bénéfices** : bénéfice brut (vert) à côté de l'**argent encaissé**, avec l'explication « une vente à crédit crée du bénéfice avant que l'argent ne rentre ».
- [ ] Tableau **Par produit** ; sur téléphone, le détail passe sous le nom du produit (pas de défilement horizontal).
- [ ] Périodes : **Ce mois-ci**, **Le mois dernier**, dates choisies → **Afficher**.
- [ ] Bloc « Comptant au détail : attendu et déclaré » côte à côte.

---

## 8. Hors ligne et synchronisation (téléphone)

1. [ ] Ouvrir l'application **avec le réseau** (indicateur en haut : « Synchronisé »), parcourir Clients, Stock, Caisse.
2. [ ] Passer en **mode avion**.
3. [ ] Indicateur « Hors ligne ». Rouvrir l'application depuis l'icône : elle s'affiche quand même.
4. [ ] Saisir une prise, un versement, ouvrir / terminer un sac, vendre un sac entier, faire la clôture : tout s'enregistre, marqué « En attente d'envoi » ; l'indicateur affiche « Hors ligne · N en attente ».
5. [ ] Envoyer un reçu hors ligne : il se fabrique quand même.
6. [ ] Couper le mode avion : en quelques secondes, « Synchronisé ». Sur l'ordinateur (Fatou), les saisies apparaissent **une seule fois** (pas de doublon).
7. [ ] Se déconnecter avec des saisies en attente → fenêtre d'avertissement (« seront perdues »).
8. [ ] Deux appareils hors ligne qui saisissent pour le même client : après reconnexion, les deux opérations sont là et le solde est juste.

---

## 9. Application installée et affichage

- [ ] Chrome Android → menu → **Ajouter à l'écran d'accueil** : icône Bitig, ouverture plein écran.
- [ ] Téléphone (360–390 px), tablette, ordinateur : aucun débordement horizontal, boutons faciles à toucher, action principale en bas sur téléphone.
- [ ] Aucune alerte grise du navigateur nulle part : toutes les confirmations utilisent la fenêtre Bitig.
- [ ] Ordinateur : on peut tout faire au clavier (Tab, Entrée, Échap ferme la fenêtre de confirmation).

---

## 10. Après la recette

- [ ] Envoyer la liste des écarts (une ligne par problème) : chaque correction aura sa petite branche.
- [ ] Remettre la démo à neuf si besoin : `pnpm demo:reset -- --confirm` puis `pnpm demo:seed -- --confirm`.
