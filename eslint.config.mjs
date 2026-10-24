import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      // Invariant 8 : aucun texte d'interface en dur, tout passe par next-intl.
      "react/jsx-no-literals": ["error", { noStrings: true, ignoreProps: true, allowedStrings: ["·", "—", "+", "−", "/", "←", "→"] }],
      // Un module n'expose que index.ts (utilisable partout) et server.ts (serveur uniquement).
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^@/modules/[^/]+/(?!server$).+",
              message: "Importer l'interface publique du module (@/modules/<module> ou @/modules/<module>/server), pas ses fichiers internes.",
            },
          ],
        },
      ],
    },
  },
  {
    // Le domaine est pur : ni React, ni Next.js, ni Supabase, ni accès réseau.
    files: ["src/**/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["react", "react-*", "next", "next/*", "next-intl", "next-intl/*", "@supabase/*", "dexie"], message: "Le domaine doit rester pur." },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "src/shared/supabase/database.types.ts", "playwright-report/**", "test-results/**"]),
]);

export default eslintConfig;
