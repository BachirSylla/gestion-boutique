import type messages from "../messages/fr-SN.json";
import type { Locale } from "@/modules/i18n";

// Clés de traduction vérifiées à la compilation.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
