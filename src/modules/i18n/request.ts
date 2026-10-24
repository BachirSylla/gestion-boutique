// Configuration next-intl par requête (sans préfixe de langue dans l'URL, voir docs/decisions/0007).
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, DEFAULT_TIME_ZONE } from "./config";

export default getRequestConfig(async () => {
  // La préférence de langue de l'utilisateur sera lue ici quand le wolof sera disponible.
  const locale = DEFAULT_LOCALE;
  return {
    locale,
    timeZone: DEFAULT_TIME_ZONE,
    messages: (await import(`../../../messages/${locale}.json`)).default,
    formats: {
      dateTime: {
        short: { day: "numeric", month: "short", year: "numeric" },
      },
    },
  };
});
