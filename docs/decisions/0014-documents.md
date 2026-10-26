# 0014 — Reçus, relevés et relances

**Date** : 26 oct. 2026 · **Statut** : acceptée

## Contexte
RG9 : reçu de prise ou de versement (image ou PDF, format téléphone), relevé de compte (PDF A4, lisible sur téléphone), noms de fichiers explicites, envoi par WhatsApp sans API payante, relance préremplie. Les boutiquiers doivent pouvoir envoyer un reçu juste après la saisie, y compris hors ligne.

## Options
| Option | Pour | Contre |
|---|---|---|
| pdf-lib | Léger, sans dépendance | Plus mis à jour depuis 2022 |
| **jsPDF** | Maintenu (4.2, 2026), texte, tableaux simples | ~350 Ko non compressés |
| pdfmake / react-pdf | Mise en page riche | Lourds (polices embarquées, moteur de rendu) |
| Génération côté serveur | Rien à charger sur l'appareil | Ne marche pas hors ligne |

## Choix
- **Tout est généré sur l'appareil** à partir de la base locale (journal complet, lignes, noms) : reçus et relevés marchent **hors ligne**.
- **Reçu = image PNG** dessinée sur un canvas (aucune dépendance, police Figtree de l'application, tous les caractères) : WhatsApp l'affiche directement dans la conversation, ce qui est plus lisible qu'un PDF sur un petit téléphone. Contenu : boutique (nom, quartier, téléphone), date et heure, client, lignes (quantité × prix) ou note, total, **ancien et nouveau solde** (« vous devez » / « avance restante »), échéance d'un client mensuel, prénom du gérant, numéro d'opération.
- **Relevé = PDF A4** avec **jsPDF, chargé seulement au moment de le générer** (import dynamique : rien n'alourdit l'ouverture de l'application). Polices standard (Helvetica) : le texte est adapté (`pdfText`) — signe moins typographique, espaces fines, tirets — sans perdre les accents, ½, ·, ×. Contenu : boutique, client, type, période, échéance ; résumé (solde reporté, total pris, total versé, reste à payer) ; tableau chronologique avec le **solde après chaque ligne** ; les **opérations annulées restent visibles, barrées**, sans compter dans les totaux ni le solde (comme le solde du client) ; totaux, date d'édition, pagination.
- **Noms de fichiers** sans espace ni accent : `Recu_Awa-Ndiaye_2026-10-23_14h32.png`, `Releve_Awa-Ndiaye_2026-10-01_au_2026-10-23.pdf`.
- **Envoi** : API de partage du navigateur avec le fichier quand elle est disponible (Android : menu de partage → WhatsApp) ; sinon téléchargement, puis envoi manuel dans WhatsApp.
- **Relance** : lien `wa.me` avec un message poli prérempli (montant dû, boutique), modifiable dans WhatsApp, sur la fiche et dans « À relancer ».
- Toute la logique (soldes du reçu, lignes du relevé, échéances, périodes, noms de fichiers, texte PDF) est **pure et testée** ; le rendu ne fait que la mise en page de textes déjà traduits.

## Conséquences
- Le relevé de fin de mois préparé en lot pour tous les clients mensuels reste prévu en V2.
- Le wolof (V3) passera par les mêmes textes traduits ; les caractères hors du jeu des polices PDF standard (ŋ…) demanderont alors d'embarquer une police dans le PDF.
