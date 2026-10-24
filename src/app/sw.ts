/// <reference lib="webworker" />
// Service worker : précache des ressources statiques, cache des pages visitées, page de secours hors ligne.
// Les DONNÉES hors ligne passent par IndexedDB (jalon 4), pas par ce cache.
import { defaultCache } from "@serwist/turbopack/worker";
import { Serwist, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [{ url: "/~offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();
