# CLAUDE.md — Bitig, le carnet du boutiquier

> Ce fichier est la référence du projet pour Claude Code.
> Il décrit **quoi construire et pourquoi**. Il ne dicte pas **comment coder** : tu es libre de tes choix techniques tant que les contraintes de la section 2 sont respectées.
> Langue du projet : **français** (interface, documentation, messages de commit). Le code (identifiants, noms de fichiers) peut être en anglais ou en français : choisis une convention et tiens-la.

---

## 1. Le produit en bref

**Bitig** (« boutique » en wolof) est une application web **PWA** pour les boutiquiers de quartier au Sénégal. Ils vendent des denrées courantes (riz, huile, sucre, lait, épices…), achetées en gros (sac de 50 kg, bidon de 20 L, carton) et revendues au détail (kilo, litre, demi-litre, pièce).

L'application remplace le **carnet papier** ou les notes du téléphone, qui disparaissent si le téléphone est perdu ou réinitialisé. Elle répond à trois besoins :

1. **Ne jamais perdre les comptes clients** : sauvegarde en ligne, récupération sur n'importe quel appareil.
2. **Suivre les clients à compte** : avance, crédit mensuel, crédit libre, sans litige grâce aux reçus et relevés WhatsApp.
3. **Suivre le stock sans saisir chaque vente** : on note l'ouverture et la fin d'un sac, pas chaque vente de 500 g.

**Utilisateurs** : boutiquiers et gérants pressés, parfois peu à l'aise avec l'écrit, sur Android d'entrée de gamme avec un réseau instable. Certains utilisent aussi un **ordinateur** (le premier client utilise les deux). L'application doit être aussi bonne sur téléphone, tablette et ordinateur.

**Cible commerciale** : un premier boutiquier, puis d'autres. C'est un produit **multi-propriétaires** (SaaS multi-tenant), chaque propriétaire pouvant avoir **plusieurs boutiques**.

---

## 2. Comment travailler sur ce projet

### 2.1 Ta liberté technique

Tu choisis les bibliothèques, les patterns, l'organisation interne des fichiers, la gestion d'état, la validation, la génération de PDF, le stockage local, la stratégie de tests, etc.

- Quand ce document cite une bibliothèque, c'est **un exemple**, pas une obligation. Si tu trouves mieux (plus léger, mieux maintenu, plus adapté au hors ligne ou aux appareils modestes), prends-le.
- Pour un choix structurant (stockage local, moteur de synchronisation, génération de PDF, i18n…), écris une courte note de décision dans `docs/decisions/` : contexte, options envisagées, choix, raison. Cela permet de changer d'avis plus tard en connaissance de cause.
- Préfère les solutions **simples, légères et maintenues**. Chaque dépendance doit se justifier : l'application tourne sur des téléphones modestes avec une connexion chère.

### 2.2 Décisions déjà prises (ne pas remettre en cause sans en parler)

| Sujet | Décision |
|---|---|
| Type d'application | Web **PWA** installable, responsive téléphone / tablette / ordinateur |
| Front | **Next.js** + **Tailwind CSS** |
| Back et base | **Supabase** (PostgreSQL, Auth, RLS, Edge Functions / fonctions SQL). Pas de serveur back séparé |
| Hébergement front | **Vercel** |
| Langue | Français d'abord, **wolof** ajouté plus tard |
| Paiements | **Hors application** : on enregistre seulement le montant et le moyen |
| Partage client | Reçus et relevés envoyés par **WhatsApp** (PDF ou image), sans API payante |

### 2.3 Invariants non négociables

Ce sont des règles de produit et de sécurité, pas des choix de style. Elles doivent être garanties **par la base de données**, pas seulement par le front.

1. **Journal immuable.** Une opération enregistrée (prise, versement, mouvement de stock) n'est **jamais modifiée ni supprimée**. Une erreur se corrige par une **opération d'annulation** qui référence l'originale. Soldes, stocks et bénéfices se **déduisent** du journal.
2. **Prix figé.** Chaque ligne de prise ou de vente copie le **prix unitaire du moment**. Un changement de prix ultérieur ne change jamais l'historique, les reçus déjà envoyés ni les soldes.
3. **Montants en entiers.** Francs CFA (XOF), sans décimales, jamais de nombres à virgule flottante pour l'argent. Les quantités de produit peuvent être décimales (0,5 kg) : choisis une représentation exacte.
4. **Isolation des données.** Un utilisateur ne voit et ne modifie **que** les boutiques auxquelles il est rattaché. C'est imposé par la **RLS** sur chaque table exposée, testé automatiquement.
5. **Hors ligne d'abord.** Les saisies du quotidien (prise, versement, ouverture et fin de sac, vente de sac entier, clôture) fonctionnent **sans réseau** et se synchronisent ensuite **sans doublon ni perte**.
6. **Clé secrète côté serveur uniquement.** La clé secrète / `service_role` n'apparaît **jamais** dans le code client ni dans une variable `NEXT_PUBLIC_*`.
7. **Traçabilité.** Chaque opération enregistre **qui** (utilisateur), **où** (boutique), **quand** (heure de l'appareil et heure du serveur).
8. **Textes externalisés.** Aucun texte d'interface en dur : tout passe par le système de traduction, pour ajouter le wolof sans refonte.

### 2.4 Dépôt et base de données Supabase

- Dépôt GitHub : `https://github.com/BachirSylla/gestion-boutique.git`. Travaille sur des branches, avec des commits petits et explicites (en français) ; ne pousse sur la branche principale qu'avec l'accord de l'utilisateur.

**Base de données : travail directement sur le projet distant**

- Projet Supabase : `prpcafqjcedrrluglqpl` (URL `https://prpcafqjcedrrluglqpl.supabase.co`).
- **Pas de Docker, pas de base locale.** Les migrations s'appliquent directement au projet distant (par exemple `supabase link` puis `supabase db push`, ou `psql` avec la chaîne de connexion). Choisis l'outillage qui fonctionne le mieux.
- Les identifiants sont dans `.env` / `.env.local` (voir `.env.example`). **Ne jamais** les écrire dans le code, les migrations, les logs ou les commits.
- **Toute modification de schéma passe par un fichier de migration versionné** dans le dépôt (`supabase/migrations/`), jamais par l'éditeur SQL à la main sans fichier correspondant.
- Une migration déjà appliquée ne se modifie pas : on en écrit une nouvelle.
- **Demande confirmation à l'utilisateur avant toute opération destructrice** sur la base distante : `drop`, `truncate`, suppression de colonne, réinitialisation, ou migration qui supprime des données. C'est la base de production future.
- Après un changement de schéma, régénère les types TypeScript de la base si tu les utilises.
- Si la connexion directe `db.<ref>.supabase.co:5432` échoue (elle passe par IPv6, souvent indisponible), utilise la chaîne du **pooler en mode session** donnée dans le tableau de bord Supabase (*Connect*).

### 2.5 Façon de travailler

- Avance **par jalons** (section 12). À la fin de chaque jalon : l'application tourne, les tests passent, et tu résumes ce qui a été fait et ce qui reste.
- Les **règles métier** (section 5) sont la partie la plus importante : mets-les dans du code pur, testable sans interface ni réseau, et couvre-les de tests automatisés avec les exemples chiffrés de ce document.
- Si une règle de ce document est ambiguë ou contradictoire, **ne devine pas** sur un point qui touche l'argent ou les droits d'accès : pose la question. Pour le reste, fais un choix raisonnable et note-le.
- Tiens ce fichier à jour si une décision produit change (avec l'accord de l'utilisateur).

---

## 3. Glossaire

| Terme | Sens |
|---|---|
| **Propriétaire** | Personne qui possède une ou plusieurs boutiques. C'est le compte client de la plateforme (le « tenant ») |
| **Boutique** | Point de vente. Unité indépendante : stock, prix, clients, réglages et calculs propres |
| **Gérant** | Employé qui tient une ou plusieurs boutiques |
| **Comptable** | Accès en lecture et export uniquement |
| **Administrateur de la plateforme** | Toi (l'éditeur de Bitig). Crée les comptes propriétaires |
| **Client** | Client de la boutique qui a un compte (avance, mensuel ou libre). Le client au comptant n'a pas de fiche |
| **Prise** | Marchandise prise par un client à compte. Diminue son solde |
| **Versement** | Argent donné par un client à compte (avance, acompte, règlement). Augmente son solde |
| **Solde** | Versements − prises. Positif = avance détenue ; négatif = dette du client |
| **Produit** | Article vendu (riz brisé, huile, sucre…) |
| **Conditionnement** | Unité d'achat : sac de 50 kg, bidon de 20 L, carton de 24 |
| **Unité de vente** | Unité de vente au détail : kg, L, pièce, sachet |
| **Lot** | Un arrivage d'un produit : quantité de conditionnements, prix d'achat, prix de vente associés |
| **Ouvrir un sac** | Mettre un conditionnement en vente au détail |
| **Sac terminé** | Le conditionnement entamé est épuisé |
| **Bilan de sac** | Calcul fait à la fin d'un sac : chiffre attendu, ventes comptant estimées, marge, durée |
| **Clôture de journée** | Saisie facultative, le soir, des totaux encaissés au comptant (espèces, Wave, Orange Money) |
| **Transfert** | Déplacement de conditionnements fermés d'une boutique à une autre du même propriétaire |

---

## 4. Acteurs, rôles et permissions

### 4.1 Hiérarchie

```
Administrateur de la plateforme
└── Propriétaire (tenant)
    ├── Boutique A ── gérants, comptable, clients, produits, stock
    └── Boutique B ── gérants, comptable, clients, produits, stock
```

- Un **client appartient à une seule boutique**.
- Un gérant ou comptable peut être rattaché à **une ou plusieurs boutiques** du même propriétaire.
- Un utilisateur n'appartient qu'à **un seul propriétaire**.

### 4.2 Matrice des permissions

| Action | Admin plateforme | Propriétaire | Gérant | Comptable |
|---|:-:|:-:|:-:|:-:|
| Créer / suspendre un propriétaire | ✅ | | | |
| Réinitialiser le mot de passe d'un propriétaire | ✅ | | | |
| Créer une boutique | ✅ | ✅ | | |
| Créer / désactiver un gérant ou comptable, réinitialiser son mot de passe | | ✅ | | |
| Gérer les clients (créer, modifier la fiche) | | ✅ | ✅ | |
| Enregistrer prise, versement | | ✅ | ✅ | |
| Annuler sa propre opération dans le délai libre | | ✅ | ✅ | |
| Annuler hors délai / opération d'un autre | | ✅ | demande | |
| Valider ou refuser une demande d'annulation | | ✅ | | |
| Gérer le catalogue produits | | ✅ | | |
| Changer un prix, régler la politique de prix | | ✅ | | |
| Réception, ouverture, fin de sac, vente de sac entier | | ✅ | ✅ | |
| Inventaire et ajustement | | ✅ | ✅ | |
| Clôture de journée | | ✅ | ✅ | |
| Créer / recevoir un transfert | | ✅ | ✅ (ses boutiques) | |
| Voir rapports, bénéfices | | ✅ | ventes du jour seulement | ✅ |
| Exporter | | ✅ | | ✅ |
| Vue consolidée multi-boutiques | | ✅ | | ✅ (boutiques autorisées) |
| Changer son propre mot de passe | ✅ | ✅ | ✅ | ✅ |

L'administrateur de la plateforme ne consulte pas le détail des comptes clients des boutiques en usage normal. Prévois un accès support explicite et tracé si besoin, mais pas par défaut.

### 4.3 Comptes et connexion

- **Aucune inscription publique, aucun SMS.** Seule une page de connexion existe.
- L'**administrateur** crée le propriétaire et lui donne ses identifiants. Le **propriétaire** crée ses gérants et comptables.
- **Identifiant = numéro de téléphone** sénégalais (+221) + mot de passe. Si Supabase Auth impose un e-mail ou un SMS pour le téléphone, dérive un identifiant interne du numéro : l'utilisateur ne saisit que son numéro.
- À la première connexion, inviter à changer le mot de passe initial.
- Mot de passe oublié : la réinitialisation est faite par l'admin (pour un propriétaire) ou le propriétaire (pour ses employés).
- La création de comptes et la réinitialisation utilisent la clé secrète : **uniquement côté serveur** (Edge Function, route serveur…), après vérification du rôle de l'appelant.
- Un compte désactivé ne peut plus se connecter ni synchroniser ; son historique reste.
- La session persiste pour l'usage hors ligne. La première connexion sur un appareil exige le réseau.
- Prévois un moyen de créer le **premier administrateur** de la plateforme (script ou migration de démarrage documentée).

---

## 5. Règles métier

> Ces règles sont le cœur du produit. Chacune doit être couverte par des tests automatisés.

### RG1 — Comptes clients et solde

**Types de client**

| Type | Fonctionnement | Règle d'alerte |
|---|---|---|
| Avance | Verse une somme, prend jusqu'à épuisement, recharge | Alerte quand le solde passe sous un **seuil** réglable (par client, avec une valeur par défaut boutique) |
| Crédit mensuel | Prend au quotidien, paie en fin de mois | Échéance (fin de mois par défaut, jour réglable). Relance à l'échéance |
| Crédit libre | Prend quand il veut, rembourse en tout ou en partie quand il peut | Relance si aucun versement depuis N jours (réglable) |

- Un client peut changer de type ; cela ne modifie pas son historique.
- **Solde = Σ versements − Σ prises**, opérations annulées exclues.
- **Plafond de crédit** facultatif : **simple alerte**, jamais bloquant. La prise est enregistrée, l'interface signale le dépassement.
- Un client a : nom (obligatoire), téléphone (facultatif mais recommandé pour WhatsApp), type, plafond facultatif, seuil d'alerte facultatif, note.
- Un client peut être **archivé** (il disparaît des listes) ; un client avec un solde non nul ne peut pas être archivé sans confirmation.

**Prise**

- Toujours un **montant total > 0**.
- Deux modes, au choix à chaque saisie :
  - **Rapide** : montant + note libre facultative (« riz + huile »). Des puces de produits fréquents aident à remplir la note.
  - **Détaillé** : lignes produit × quantité en unité de vente (ou conditionnement entier) × prix unitaire figé. Montant = somme des lignes. Des **boutons favoris** (Riz 1 kg, Huile ½ L…) ajoutent une ligne en un toucher.
- Une prise détaillée sur un produit est rattachée au **conditionnement entamé** de ce produit au moment de la prise (sert au bilan de sac, RG2).

**Versement**

- Montant > 0 + moyen de paiement : `espèces`, `Wave`, `Orange Money`, `autre` (liste extensible par boutique). Note facultative.

**Annulation**

- Annuler = créer une opération d'annulation qui référence l'originale (motif facultatif). L'originale reste visible, marquée annulée.
- Le **gérant** peut annuler **sa propre** opération librement pendant un délai réglable par boutique (**15 minutes par défaut**, de 0 à **60 minutes**, modifiable à tout moment par le propriétaire ; le délai en vigueur au moment de l'annulation s'applique). Le délai se compte à l'**heure du serveur** (réception de l'opération → réception de l'annulation), pour ne pas dépendre de l'heure du téléphone. Hors ligne, une annulation arrivée hors délai devient une demande d'annulation, jamais une perte silencieuse.
- Au-delà, ou pour l'opération d'un autre, il crée une **demande d'annulation** (motif obligatoire). Le **propriétaire** la valide ou la refuse ; la décision est tracée et notifiée dans l'application.
- Le propriétaire peut annuler directement.
- Une annulation ne s'annule pas. Pour rétablir, on ressaisit.

### RG2 — Stock : on suit les conditionnements, pas chaque vente

**Produit**

- Nom, catégorie facultative.
- **Conditionnement** (ex. sac) + **contenance** en unité de vente (ex. 50 kg) = facteur de conversion.
- **Prix de vente au détail** par unité de vente (ex. 315 F/kg).
- **Prix de vente du conditionnement entier** (ex. 14 400 F le sac), facultatif.
- **Formats de vente favoris** pour la saisie détaillée (ex. 1 kg, ½ kg pour le riz ; ½ L, 1 L pour l'huile).
- Produits vendus seulement à l'unité (savon, boîte de tomate) : même logique, le conditionnement est le carton, l'unité de vente la pièce.
- Un **catalogue de départ** prérempli (riz brisé, riz parfumé, huile, sucre, lait en poudre, oignon, pomme de terre…) est proposé à la création d'une boutique ; le propriétaire l'adapte (prix, contenances).

**Événements de stock**

| Événement | Effet |
|---|---|
| **Réception** | Crée un lot : produit, nombre de conditionnements, prix d'achat unitaire, fournisseur facultatif. Les conditionnements sont **fermés** |
| **Ouverture** | Un conditionnement fermé (le plus ancien lot d'abord, FIFO) passe **entamé**. On peut avoir au plus un conditionnement entamé par produit par défaut ; autoriser plusieurs si un boutiquier le demande |
| **Fin** | Le conditionnement entamé est **terminé** → déclenche le bilan de sac |
| **Vente de conditionnement entier** | Un conditionnement fermé sort directement, au prix du conditionnement. Au comptant ou sur le compte d'un client (crée alors une prise) |
| **Ajustement d'inventaire** | Écart entre stock compté et stock théorique, avec auteur et motif |
| **Annulation** | Un mouvement saisi par erreur s'annule par un mouvement d'annulation, avec les mêmes règles que le journal client : le gérant annule son propre mouvement dans le délai libre, sinon il demande au propriétaire ; le propriétaire annule directement |
| **Transfert sortant / entrant** | Voir RG5 |

**Stock affiché par produit** : nombre de conditionnements fermés + conditionnement entamé avec reste estimé (plein, ¾, ½, ¼, presque vide) si connu.

**Bilan de sac** (calculé à la fin d'un conditionnement)

- **Chiffre attendu** = Σ sur chaque tranche de prix (contenance vendue pendant la tranche × prix de détail de la tranche). Sans changement de prix : contenance × prix.
- **Prises à compte** = Σ des lignes de prise détaillées rattachées à ce conditionnement.
- **Ventes au comptant estimées** = chiffre attendu − prises à compte.
- **Coût** = prix d'achat du conditionnement (celui de son lot).
- **Marge brute** = chiffre attendu − coût.
- **Durée d'écoulement** = fin − ouverture. Sert à estimer la date de rupture (stock restant × durée moyenne).

Exemple de test :
> Sac de riz 50 kg, acheté 14 400 F, prix de détail 315 F/kg, aucun changement de prix.
> Chiffre attendu = 50 × 315 = 15 750 F. Marge = 15 750 − 14 400 = 1 350 F.
> Prises détaillées rattachées : 2 × 1 kg à 315 F + 5 kg à 315 F = 2 205 F. Comptant estimé = 15 750 − 2 205 = 13 545 F.

Les prises en mode rapide ne sont pas rattachées à un produit : elles ne réduisent pas le « comptant estimé » d'un sac. Le bilan l'indique comme une approximation.

### RG3 — Prix figés et historique

- Chaque produit garde un **historique des prix** (détail et conditionnement) avec date d'effet et auteur.
- Chaque ligne de prise ou de vente **copie** le prix unitaire appliqué. Rien n'est recalculé a posteriori.
- Hors ligne, l'appareil utilise le dernier prix connu ; il se met à jour à chaque synchronisation.

**Arrondi des montants** (voir `docs/decisions/0006-montants-quantites-arrondi.md`)

- Chaque **format de vente favori** (½ kg, 1 kg, ½ L, 1 L…) a **son propre prix**, fixé par le boutiquier (ex. riz ½ kg = 160 F, et non 157,5 F). C'est ce prix qui est figé sur la ligne.
- Pour une **quantité libre** : montant de ligne = quantité × prix unitaire, **arrondi par ligne** au **pas d'arrondi de la boutique** (réglage : 1, 5 ou 25 F ; **5 F par défaut**), au plus proche, la moitié vers le haut.
  Exemple de test : 0,25 kg × 315 F/kg = 78,75 F → **80 F** au pas de 5 F (79 F au pas de 1 F, 75 F au pas de 25 F).
- Le **total d'une prise** = somme des lignes déjà arrondies.
- Le **bilan de sac** (RG2) reste calculé sur le prix de détail au kilo / litre, **sans arrondi intermédiaire**, et arrondi à l'entier à la fin.

### RG4 — Politique de changement de prix (configurable)

Chaque boutique a deux réglages par défaut :

| Réglage | Valeurs |
|---|---|
| Hausse de prix | `immédiate` ou `après écoulement de l'ancien stock` |
| Baisse de prix | `immédiate` ou `après écoulement de l'ancien stock` |

- À chaque changement de prix, le réglage par défaut est **proposé**, et le propriétaire peut le changer pour ce changement-là.
- Réglage du premier client : hausse **après écoulement**, baisse **immédiate**.

**Après écoulement**
- Le nouveau prix est enregistré **en attente**.
- Les lots reçus **avant** le changement gardent l'ancien prix, conditionnements entamés **et** fermés compris.
- Le nouveau prix s'applique à partir de l'**ouverture du premier conditionnement d'un lot reçu après le changement**, donc quand tout l'ancien stock est écoulé.
- L'interface affiche « hausse en attente : X F au prochain arrivage » et notifie quand le prix bascule.

**Immédiat**
- Le nouveau prix s'applique dès maintenant, y compris au conditionnement entamé.
- L'application demande d'**estimer le reste** du conditionnement entamé (plein, ¾, ½, ¼, presque vide) pour découper son chiffre attendu en deux tranches. Valeurs : plein = 100 %, ¾ = 75 %, ½ = 50 %, ¼ = 25 %, **presque vide = 10 %**.

**Grille de prix** : un changement de prix porte sur toute la grille du produit (prix de détail, prix du conditionnement entier et **prix des formats favoris**). L'écran propose des prix de formats recalculés, que le propriétaire ajuste ; toute la grille suit la même politique (immédiate ou après écoulement).

Exemple de test (baisse immédiate) :
> Sac de riz 50 kg à 330 F/kg. Baisse à 315 F/kg alors qu'il reste ≈ ½ sac.
> Tranche 1 : 25 kg × 330 = 8 250 F. Tranche 2 : 25 kg × 315 = 7 875 F. Chiffre attendu = 16 125 F.

### RG5 — Boutiques indépendantes et transferts

- Stocks, prix, réglages, clients, clôtures et rapports sont **propres à chaque boutique**.
- **Transfert** de conditionnements fermés entre deux boutiques du même propriétaire :
  1. La boutique d'origine crée le transfert (produit, nombre). Les conditionnements sortent de son stock : état **en transit**.
  2. La boutique d'arrivée **confirme la réception** (quantité reçue). Ils entrent dans son stock avec le **prix d'achat d'origine** ; le **prix de vente** est celui de la boutique d'arrivée.
  3. Un **écart** (envoyé ≠ reçu) est enregistré et visible, jamais corrigé en silence.
- Un transfert en transit peut être annulé par l'origine tant qu'il n'est pas reçu.

### RG6 — Inventaire simplifié

- Par produit : on **compte les conditionnements fermés** et on **estime le reste** de l'entamé.
- L'application compare au stock théorique et propose un **ajustement** pour chaque écart, avec auteur et motif facultatif.
- L'inventaire peut être partiel (quelques produits).

### RG7 — Ventes quotidiennes et clôture de journée

- **Clôture facultative**, 30 secondes, en fin de journée : pour chaque moyen de la boutique (espèces, Wave, Orange Money…), **tout l'argent reçu dans la journée**, hors fond de caisse.
- L'application en déduit les **ventes au comptant au détail** = total reçu − versements des clients à compte du jour − ventes de conditionnements entiers au comptant du jour (opérations annulées exclues). Le résultat est affiché avant d'enregistrer ; un résultat négatif est signalé (erreur de saisie probable), jamais corrigé en silence.
- **Ventes du jour** = prises à compte du jour + ventes de conditionnements entiers au comptant du jour + ventes au comptant au détail de la clôture. (Une vente de sac entier sur le compte d'un client est une prise : elle n'est comptée qu'une fois.)
- Sans clôture, afficher une **estimation** basée sur les bilans de sac, clairement marquée comme estimation.
- **Contrôle** : au MVP, le chiffre attendu des sacs et les ventes au comptant des clôtures sont **affichés côte à côte**, sans signalement automatique d'écart. Le contrôle automatique est reporté après le pilote.
- Une clôture enregistrée peut être corrigée par une nouvelle clôture du même jour (la dernière fait foi, l'historique reste).

### RG8 — Bénéfice

- **Bénéfice brut** = Σ marges des bilans de sac + Σ marges des ventes de conditionnements entiers, par période, produit et boutique.
- **Dépenses** (V2) : loyer, électricité, transport, salaire… saisies par boutique.
- **Bénéfice net** (V2) = bénéfice brut − dépenses.
- Le tableau de bord montre côte à côte le **bénéfice** et l'**argent encaissé**, avec une explication courte : une vente à crédit crée du bénéfice avant que l'argent ne rentre.

### RG9 — Reçus, relevés et relances

**Reçu de prise ou de versement** (image ou PDF, format téléphone)
- En-tête boutique (nom, quartier, téléphone), date et heure, client.
- Détail des lignes (produit, quantité × prix) ou note en mode rapide, total.
- Ancien solde, nouveau solde (« vous devez » / « avance restante »), échéance pour un client mensuel.
- Auteur (prénom du gérant), numéro d'opération.

**Relevé de compte** (PDF A4, aussi lisible sur téléphone)
- Boutique, client, type, période, échéance.
- Résumé : solde reporté, total pris, total versé, reste à payer.
- Tableau chronologique : date, détail (quantité × prix du jour), pris, versé, **solde après chaque ligne**. Les annulations restent visibles, barrées.
- Totaux de la période et date d'édition.

**Nom des fichiers** : explicite, sans espace ni accent, par exemple
`Recu_Awa-Ndiaye_2026-10-23_14h32.pdf` et `Releve_Awa-Ndiaye_2026-10-01_au_2026-10-23.pdf`.

**Envoi** : sur mobile, partage direct du fichier (API de partage du navigateur) quand c'est disponible ; sinon téléchargement, puis envoi manuel dans WhatsApp. Un lien `wa.me` avec texte prérempli sert aux **relances** (texte seul).

**Relance** : toujours **manuelle**. L'application liste les clients « À relancer » et prépare un message prérempli, poli, avec le montant dû et la boutique, modifiable avant envoi ; le boutiquier l'envoie lui-même.

**Client mensuel à relancer** : quand une prise faite **jusqu'à la dernière échéance passée** reste impayée (prises jusqu'à l'échéance − tous les versements > 0). Les prises faites depuis l'échéance ne déclenchent pas de relance. Le message propose le total dû, modifiable.

---

## 6. Fonctionnalités

Légende : **MVP** = première version utilisable par le premier client ; **V2**, **V3** = évolutions.

### 6.1 Accès et comptes
| Fonctionnalité | Version |
|---|---|
| Page de connexion unique (téléphone + mot de passe) | MVP |
| Espace administrateur : créer, suspendre, réinitialiser les propriétaires ; créer leurs boutiques | MVP |
| Propriétaire : créer, désactiver ses gérants et comptables, les rattacher à des boutiques, réinitialiser leur mot de passe | MVP |
| Changement de mot de passe ; invitation à le changer à la première connexion | MVP |
| Sélecteur de boutique (pour qui en a plusieurs) | MVP |
| Journal d'activité consultable par le propriétaire (qui a fait quoi) | V2 |

### 6.2 Clients
| Fonctionnalité | Version |
|---|---|
| Liste avec recherche instantanée (nom, téléphone), tri par solde, filtres par type | MVP |
| Fiche client : solde, type, plafond, échéance, historique groupé par jour, auteur de chaque opération | MVP |
| Nouvelle prise : modes rapide et détaillé, nouveau solde affiché en direct, alerte de plafond | MVP |
| Versement avec moyen de paiement | MVP |
| Annulation libre dans le délai, demande d'annulation au-delà, validation par le propriétaire | MVP |
| Reçu (image/PDF) et relevé (PDF) par période, partage ou téléchargement | MVP |
| Liste « À relancer » : échéance atteinte, plafond dépassé, avance sous le seuil, crédit libre sans versement depuis N jours | MVP |
| Relance WhatsApp préremplie | MVP |
| Archivage d'un client | MVP |
| Relevés de fin de mois préparés en lot pour les clients mensuels | V2 |

### 6.3 Produits et prix
| Fonctionnalité | Version |
|---|---|
| Catalogue : conditionnement, contenance, prix de détail, prix du conditionnement, formats favoris | MVP |
| Catalogue de départ prérempli à adapter | MVP |
| Changement de prix avec politique hausse/baisse (RG4), historique, prix en attente visible | MVP |
| Copie du catalogue d'une boutique vers une autre | V2 |

### 6.4 Stock
| Fonctionnalité | Version |
|---|---|
| Réception de marchandise (lot) | MVP |
| Ouvrir un sac, sac terminé, avec estimation du reste si besoin | MVP |
| Vente de conditionnement entier (comptant ou sur compte client) | MVP |
| Vue stock : fermés + entamé par produit, durée d'écoulement, date de rupture estimée, filtres « entamés » et « à racheter » | MVP |
| Bilan de sac consultable | MVP |
| Inventaire par comptage et ajustements | MVP |
| Transferts entre boutiques avec confirmation de réception | V2 |
| Fournisseurs : fiche, achats, dettes envers les fournisseurs | V2 |
| Suggestion de réapprovisionnement | V3 |

### 6.5 Caisse, bénéfice et rapports
| Fonctionnalité | Version |
|---|---|
| Clôture de journée et ventes quotidiennes | MVP |
| Tableau de bord : dû par les clients, avances détenues, ventes du jour, bénéfice brut du mois, alertes de stock, dernières opérations | MVP |
| Écran Bénéfices : bénéfice brut par période et par produit, bénéfice vs argent encaissé | MVP |
| Dépenses et bénéfice net | V2 |
| Vue consolidée de toutes les boutiques du propriétaire | V2 |
| Rapports par période et exports (tableur, PDF) pour le comptable | V2 |
| Historique exportable pour un dossier de financement | V3 |

### 6.6 Transversal
| Fonctionnalité | Version |
|---|---|
| Fonctionnement hors ligne et synchronisation automatique, indicateur d'état (synchronisé / en attente / hors ligne) | MVP |
| PWA installable (icône sur l'écran d'accueil) | MVP |
| Responsive téléphone, tablette, ordinateur | MVP |
| Interface en wolof | V3 |
| Consignes audio pour les personnes qui lisent peu | V3 |
| Abonnements et facturation des propriétaires | À définir (modèle économique reporté) |

---

## 7. Architecture

Objectif : **évolutive et modulaire**. On doit pouvoir ajouter un module (fournisseurs, dépenses, wolof, abonnements…) sans toucher au cœur, et faire évoluer une règle métier sans casser l'interface.

### 7.1 Principes

1. **Découpage par domaine métier**, pas par type technique. Modules attendus (indicatifs) :
   `auth-accounts` · `shops` · `customers` · `ledger` (journal client : prises, versements, annulations) · `catalog` (produits, prix) · `stock` (lots, mouvements, bilans, inventaire) · `transfers` · `cash` (clôture) · `reporting` (tableau de bord, bénéfice) · `documents` (reçus, relevés, relances) · `sync` (hors ligne) · `i18n` · `platform-admin`.
   Chaque module expose une interface publique claire ; les autres modules n'importent pas ses détails internes.
2. **Domaine pur au centre.** Les règles métier (soldes, bilans de sac, tranches de prix, politique de prix, droits d'annulation…) sont du code sans dépendance à React, Next.js ou Supabase. Elles se testent seules et peuvent tourner **côté appareil (hors ligne) et côté serveur** si besoin.
3. **Adaptateurs en périphérie** : accès Supabase, stockage local, génération de documents, partage. Remplaçables sans toucher au domaine.
4. **Opérations = événements.** Le journal client et les mouvements de stock sont des listes d'événements typés et versionnés. Les états (solde, stock, bilan) en sont des **projections**. Ajouter un type d'événement ne casse pas les anciens.
5. **La base protège les invariants** : contraintes, RLS, interdiction de `update`/`delete` sur les tables de journal (droits ou triggers), fonctions SQL pour les écritures qui doivent être atomiques.
6. **Réglages plutôt que code** : délais, seuils, politique de prix, moyens de paiement, catalogue de départ sont des **paramètres** (boutique ou plateforme), pas des constantes.
7. **Extensible pour le multi-pays** sans le construire maintenant : devise, indicatif téléphonique, langue et fuseau horaire ne sont pas codés en dur dans la logique (XOF, +221, fr, Africa/Dakar par défaut).

### 7.2 Modèle de données conceptuel

Noms et structure exacte : à toi. Les entités et relations ci-dessous sont celles du domaine.

```
Propriétaire (tenant) 1─n Boutique
Propriétaire 1─n Utilisateur (rôle : propriétaire | gérant | comptable)
Utilisateur n─n Boutique (rattachement)
Administrateur plateforme (rôle à part)

Boutique 1─n Client
Boutique 1─n Produit 1─n HistoriquePrix
Boutique 1─1 RéglagesBoutique (politique de prix, délai d'annulation, seuils, moyens de paiement, échéance par défaut, pas d'arrondi)

Client 1─n OpérationClient   (journal immuable : PRISE | VERSEMENT | ANNULATION)
OpérationClient(PRISE) 1─n LignePrise (produit facultatif, quantité, unité, prix unitaire figé, conditionnement rattaché)
OpérationClient(ANNULATION) → référence l'opération annulée
DemandeAnnulation (opération, demandeur, motif, statut, décideur)

Produit 1─n Lot (nb conditionnements, prix d'achat, date, fournisseur?)
Lot 1─n Conditionnement (état : fermé | entamé | terminé | vendu entier | en transit | transféré)
MouvementStock (journal immuable : RÉCEPTION | OUVERTURE | FIN | VENTE_ENTIER | AJUSTEMENT | TRANSFERT_SORTIE | TRANSFERT_ENTRÉE | ANNULATION)
BilanSac (projection à la FIN d'un conditionnement)
Transfert (origine, destination, produit, quantités envoyée / reçue, statut)

ClôtureJournée (boutique, date, montants par moyen de paiement, auteur)
Dépense (V2)
```

Chaque enregistrement du journal porte : identifiant généré **sur l'appareil** (UUID), boutique, auteur, horodatage appareil, horodatage serveur, version de schéma de l'événement.

### 7.3 Hors ligne et synchronisation

- L'appareil écrit d'abord **localement**, l'interface réagit immédiatement.
- Une **file d'envoi** transmet les opérations dès que le réseau revient (et au démarrage). Chaque opération a un identifiant unique généré sur l'appareil : un renvoi ne crée **jamais** de doublon (écriture idempotente côté base).
- Comme le journal ne fait qu'ajouter, il n'y a pas de conflit d'écriture. Deux gérants hors ligne qui saisissent pour le même client produisent deux opérations valides ; le solde est juste après synchronisation.
- Les cas qui demandent une décision serveur (ex. ouvrir un sac alors qu'un autre appareil vient de le faire, annulation hors délai) : définis un comportement explicite et visible (rejet expliqué, ou acceptation avec signalement), jamais une perte silencieuse.
- L'appareil télécharge les données de **ses boutiques** utiles au travail hors ligne : clients et soldes, catalogue et prix, stock courant, réglages. L'historique ancien peut rester en ligne.
- Indicateur visible : synchronisé / N opérations en attente / hors ligne, avec heure de dernière synchronisation.
- Choix de l'outillage (stockage local, moteur de synchro maison ou bibliothèque type PowerSync / ElectricSQL / autre) : **à toi**, avec une note de décision.

### 7.4 Sécurité

- RLS activée sur **toutes** les tables exposées, avec des tests qui prouvent qu'un utilisateur d'un propriétaire A ne lit ni n'écrit rien du propriétaire B, et qu'un gérant ne sort pas de ses boutiques.
- Les droits de la matrice 4.2 sont vérifiés **côté base** (RLS, fonctions SQL avec contrôle de rôle), pas seulement en cachant des boutons.
- Les opérations d'administration (création de comptes, réinitialisation) passent par du code serveur qui vérifie le rôle de l'appelant.
- Données personnelles (noms, téléphones des clients) : collecte minimale, pas de partage hors de la boutique. À terme, déclaration auprès de la CDP (Commission de protection des données personnelles du Sénégal).

### 7.5 Environnements et déploiement

- Variables d'environnement : voir `.env.example`. Les variables publiques (exposées au navigateur) ne contiennent que l'URL Supabase et la clé publishable.
- Front déployé sur Vercel. Les offres gratuites (Vercel Hobby, Supabase Free) suffisent au développement ; avant de facturer des boutiquiers, passer aux offres payantes (usage commercial, pas de mise en pause, sauvegardes).
- Prévoir une sauvegarde régulière de la base tant que l'offre gratuite est utilisée.

---

## 8. Design

Les maquettes validées sont sur le canevas « Bitig — maquettes MVP » (demande le lien à l'utilisateur si besoin). Elles fixent la **direction visuelle** ; adapte librement les détails à l'implémentation et à l'accessibilité.

### 8.1 Personnalité
Claire, chaleureuse, rassurante, « l'argent est en sécurité ». Pas de gadgets : de **gros chiffres**, de **gros boutons**, peu de texte, des icônes au trait.

### 8.2 Jetons de design

| Jeton | Valeur | Usage |
|---|---|---|
| `vert-principal` | `#0E5A3A` | Marque, en-têtes, boutons principaux, navigation active |
| `vert-fonce` | `#0A4129` | Survol, texte de lien appuyé |
| `vert-doux` | `#E3F1E9` | Pastilles, fonds d'actions secondaires |
| `vert-positif` | `#0E6B44` | Montants positifs (versements, avances, bénéfice) |
| `safran` | `#F5B83D` | Action n° 1 (« Nouvelle prise »), logo |
| `safran-doux` | `#FFF4DD` | Alertes de stock |
| `brique` | `#9A3412` | Dettes, montants négatifs, plafond dépassé |
| `brique-doux` | `#FBEBE3` | Fonds d'alerte de dette, avatars débiteurs |
| `encre` | `#10231B` | Texte principal |
| `gris-texte` | `#5B6B63` | Texte secondaire (contraste ≥ 4,5:1 sur fond clair) |
| `fond` | `#F4F6F3` | Fond de page |
| `surface` | `#FFFFFF` | Cartes |
| `bordure` | `#E3E8E4` / `#D5DED8` | Bordures de cartes / de champs |

- Police : **Figtree** (Google Fonts), graisses 400 à 800. Les montants en **chiffres tabulaires**.
- Rayons : 14 à 22 px pour les cartes, 12 à 16 px pour les boutons, pastilles arrondies.
- Dette et avance ne se distinguent **jamais par la couleur seule** : signe (− / +) et libellé (« doit » / « avance ») toujours présents.
- Mode sombre : pas au MVP, mais les couleurs passent par des jetons pour l'ajouter facilement.

### 8.3 Règles d'ergonomie
- Zones tactiles ≥ 44 px ; action principale en bas de l'écran sur téléphone (zone du pouce).
- Saisie d'une prise rapide en **moins de 10 secondes** : client → montant → enregistrer.
- Recherche client dès la première lettre ; clients récents en tête.
- Clavier numérique pour les montants ; séparateur de milliers par espace (`13 680 F`).
- Confirmation et possibilité d'annuler juste après une saisie (« Annuler » pendant quelques secondes).
- Fonctionne sur un Android d'entrée de gamme : pages légères, peu d'animations, pas d'image lourde.
- Accessibilité : vrais boutons et liens, libellés sur les boutons-icônes, contrastes suffisants, navigation clavier sur ordinateur.

### 8.4 Écrans et adaptation

| Écran | Téléphone | Tablette / ordinateur |
|---|---|---|
| Connexion | Bandeau vert, formulaire | Centré |
| Accueil | Carte « Vos clients vous doivent », 2 gros boutons, « À relancer », alerte stock, navigation en bas | Menu latéral (boutique, navigation, utilisateur), 4 indicateurs, tableau « À relancer », stock à surveiller, dernières opérations |
| Nouvelle prise | Plein écran, grille de produits favoris, total et nouveau solde en pied d'écran | Panneau latéral ou modale, raccourcis clavier |
| Fiche client | Solde, barre de plafond, 4 actions, historique par jour | Deux colonnes : fiche + historique en tableau |
| Stock | Cartes produit avec pictos de sacs (pleins / entamé), boutons « Ouvrir » et « Terminé » | Grille ou tableau |
| Bénéfices, clôture, inventaire, réglages, administration | À concevoir dans le même style | Idem |
| Reçu / relevé | Formats décrits en RG9 | — |

Navigation téléphone (barre du bas) : **Accueil · Clients · Stock · Bénéfices** (+ menu pour le reste). L'ordinateur affiche en plus : Transferts, Paramètres, et pour l'admin, Administration.

---

## 9. Internationalisation

- Français par défaut (`fr-SN`), wolof (`wo`) en V3.
- Toutes les chaînes dans des fichiers de traduction ; pluriels et formats de nombres, dates et monnaie gérés par la bibliothèque choisie.
- Montants : `13 680 F` (espace insécable comme séparateur de milliers). Dates : `23 oct. 2026`, heures `14 h 32`.
- Les noms de produits et clients sont des **données**, pas des traductions.

---

## 10. Qualité

- **Tests automatisés obligatoires** pour : soldes (RG1), annulation et délais (RG1), bilan de sac et tranches de prix (RG2, RG4), politique de prix en attente / immédiate (RG4), transferts et écarts (RG5), ventes du jour et bénéfice (RG7, RG8), idempotence de la synchronisation, isolation RLS entre propriétaires et entre boutiques.
- Utilise les exemples chiffrés de ce document comme cas de test.
- Vérifie le comportement hors ligne (saisie sans réseau, reprise, renvoi sans doublon).
- Vérifie l'affichage sur une largeur de téléphone (360–390 px), de tablette et d'ordinateur.
- Pas de secret dans le dépôt : vérifie-le avant chaque commit.

**Définition de « terminé » pour une fonctionnalité** : la règle métier est testée, la RLS couvre les nouvelles tables, l'écran fonctionne sur téléphone et ordinateur, les textes sont traduisibles, le hors ligne est géré si la fonctionnalité est une saisie du quotidien.

---

## 11. Données de démonstration

Prévois un jeu de données de démonstration activable (jamais en production réelle sans le vouloir) :
- Propriétaire « Fatou Diallo », boutique « Boutique Keur Fatou » (Médina, Dakar), gérant « Moussa ».
- Produits : riz brisé (sac 50 kg, achat 14 400 F, détail 315 F/kg), huile (bidon 20 L, détail 1 100 F/L), sucre (sac 50 kg, détail 600 F/kg), lait en sachet (carton, 250 F la pièce).
- Clients : Awa Ndiaye (mensuel, plafond 25 000 F), Ibrahima Fall (libre, plafond dépassé), Mariama Sow (avance presque épuisée), Cheikh Diop (libre).

---

## 12. Jalons proposés

L'ordre est indicatif : adapte-le si un autre enchaînement est plus efficace.

1. **Fondations** : projet Next.js + Tailwind, PWA, i18n, jetons de design, connexion Supabase, schéma de base (propriétaires, boutiques, utilisateurs, rattachements) avec RLS et tests d'isolation, connexion par téléphone, création du premier administrateur.
2. **Comptes** : espace administrateur, gestion des employés par le propriétaire, changement de mot de passe, sélecteur de boutique.
3. **Clients et journal** : clients, prises (rapide et détaillée sans stock), versements, soldes, annulations et demandes, liste « À relancer ».
4. **Hors ligne** : stockage local, file d'envoi idempotente, indicateur de synchronisation, appliqués aux saisies du jalon 3.
5. **Catalogue et stock** : produits, prix et politique RG4, réception, ouverture, fin, vente de conditionnement entier, bilan de sac, vue stock, inventaire.
6. **Documents** : reçus, relevés PDF, partage WhatsApp, relances.
7. **Caisse et tableau de bord** : clôture, ventes du jour, bénéfice brut, tableau de bord téléphone et ordinateur.
8. **Pilote** avec le premier boutiquier, corrections.
9. **V2** : multi-boutiques consolidé, transferts, fournisseurs, dépenses et bénéfice net, exports.
10. **V3** : wolof, audio, prévisions, export financement.

---

## 13. Points ouverts

- **Modèle économique** (abonnement, gratuit puis payant, installation + abonnement) : reporté. Ne pas construire la facturation avant décision.
- Plusieurs conditionnements entamés en même temps pour un même produit : non au MVP, à rouvrir si un boutiquier le demande.
- Seuils par défaut (alerte d'avance, jours sans versement pour le crédit libre, écart de contrôle de caisse, une fois le contrôle automatique ajouté après le pilote) : proposer des valeurs raisonnables, réglables, et les faire valider pendant le pilote.
