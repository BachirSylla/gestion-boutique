# 0002 — Stockage local et synchronisation

**Date** : 24 oct. 2026 · **Statut** : acceptée (mise en œuvre au jalon 4)

## Contexte
Invariant 5 : les saisies du quotidien fonctionnent sans réseau et se synchronisent sans doublon ni perte. Les appareils sont des Android d'entrée de gamme, la donnée mobile est chère.

## Options
| Option | Pour | Contre |
|---|---|---|
| PowerSync | Synchro bidirectionnelle mûre, SQLite local | Service supplémentaire (payant ou à héberger), SDK lourd (SQLite WASM) |
| ElectricSQL | Lecture en flux depuis Postgres | Service à héberger, écritures à gérer soi-même de toute façon |
| **Dexie (IndexedDB) + moteur maison** | Léger (~30 Ko), aucun service en plus | Code de synchro à écrire et tester |

## Choix
**Dexie + moteur de synchronisation maison.**

Le journal est en ajout seul : il n'y a jamais de conflit d'écriture à fusionner. La synchro se réduit à :
1. **File d'envoi** locale : chaque opération porte un UUID généré sur l'appareil.
2. **Écriture idempotente** côté base : fonction SQL `insert … on conflict (id) do nothing`, qui renvoie l'état connu. Un renvoi ne crée jamais de doublon.
3. **Téléchargement** par curseur sur l'heure serveur, limité aux boutiques de l'utilisateur et aux données utiles hors ligne.
4. Les cas qui demandent une décision serveur (sac déjà ouvert par un autre appareil, annulation hors délai) reçoivent un **statut explicite** renvoyé à l'appareil et affiché, jamais une perte silencieuse.

On reconsidérera PowerSync si la synchro descendante devient complexe (volumes, nombreuses tables).
