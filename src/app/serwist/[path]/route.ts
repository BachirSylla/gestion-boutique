// Sert le service worker (/serwist/sw.js) compilé par Serwist pour Turbopack. Voir docs/decisions/0003.
import { createSerwistRoute } from "@serwist/turbopack";

const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "src/app/sw.ts",
  useNativeEsbuild: true,
  additionalPrecacheEntries: [{ url: "/~offline", revision }],
});
