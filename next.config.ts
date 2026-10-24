import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSerwist } from "@serwist/turbopack";

const withNextIntl = createNextIntlPlugin("./src/modules/i18n/request.ts");

// cacheComponents est volontairement désactivé : voir docs/decisions/0003-pwa-hors-ligne.md
const nextConfig: NextConfig = {
  partialPrefetching: true,
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
