// Langues prises en charge. Le wolof (« wo ») arrivera en V3 : il suffira d'ajouter
// messages/wo.json et la langue ici.
export const LOCALES = ["fr-SN"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr-SN";
export const DEFAULT_TIME_ZONE = "Africa/Dakar";
