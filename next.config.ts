import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSerwist } from "@serwist/turbopack";

const withNextIntl = createNextIntlPlugin({
  requestConfig: "./src/modules/i18n/request.ts",
  experimental: { createMessagesDeclaration: "./messages/fr-SN.json" },
});

// cacheComponents est volontairement désactivé : voir docs/decisions/0003-pwa-hors-ligne.md
const nextConfig: NextConfig = {
  experimental: {
    useOffline: true,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  poweredByHeader: false,
};

export default withSerwist(withNextIntl(nextConfig));
