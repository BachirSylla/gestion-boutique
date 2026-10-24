# 0003 — PWA et hors ligne côté Next.js

**Date** : 24 oct. 2026 · **Statut** : acceptée

## Contexte
L'application doit être installable et s'ouvrir sans réseau. Next.js 16.4 propose :
- `experimental.useOffline` + le hook `useOffline` : une navigation ou une Server Action lancée hors ligne reste en attente et repart au retour du réseau, au lieu d'échouer ;
- `cacheComponents` + `partialPrefetching` : rendu partiel avec « coquille » préchargée.

Ces deux mécanismes ne couvrent pas une **ouverture à froid** hors ligne (recharger la page sans réseau) : il faut un service worker.

## Options
- `next-pwa` : abandonné.
- **Serwist** : successeur maintenu, recommandé par la documentation Next.js, avec une intégration Turbopack (`@serwist/turbopack`).
- Service worker écrit à la main : possible, mais Serwist fournit le précache versionné et des stratégies éprouvées.

## Choix
- **Serwist (`@serwist/turbopack`)** : le service worker (`src/app/sw.ts`) est servi par une route `/serwist/sw.js`. Il précache les ressources statiques et met en cache les pages visitées, avec une page de secours hors ligne.
- **`experimental.useOffline`** activé : indicateur de connexion fiable (plus que `navigator.onLine`) et reprise des Server Actions.
- **`cacheComponents` désactivé** : l'intégration Turbopack de Serwist ne le prend pas en charge, et l'application lit la session Supabase dans les cookies sur presque chaque page, ce qui obligerait à des frontières Suspense partout. `partialPrefetching` reste actif ; on utilise `loading.tsx` comme coquille hors ligne.

Les **données** hors ligne (clients, soldes, catalogue) ne passent pas par le cache HTTP mais par IndexedDB (note 0002) : le service worker ne sert que la coquille de l'application.
