// Applique les réglages Supabase Auth de Bitig au projet distant (API de gestion, jeton personnel).
//   pnpm auth:config            affiche l'écart avec la configuration voulue
//   pnpm auth:config --apply    applique la configuration
// Seuls les champs listés ici sont modifiés.
import { requireEnv } from "./lib/env";

const DESIRED = {
  // Aucune inscription publique : seuls le serveur et le script de démarrage créent des comptes.
  disable_signup: true,
  // Connexion par identifiant interne dérivé du téléphone (docs/decisions/0005).
  external_email_enabled: true,
  external_phone_enabled: false,
  mailer_autoconfirm: false,
  password_min_length: 8,
  // Session longue pour l'usage hors ligne ; le jeton d'accès reste court.
  jwt_exp: 3600,
  sessions_timebox: 0,
  sessions_inactivity_timeout: 0,
} as const;

const ref = requireEnv("SUPABASE_PROJECT_REF");
const url = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
const headers = { Authorization: `Bearer ${requireEnv("SUPABASE_ACCESS_TOKEN")}`, "Content-Type": "application/json" };

const current = (await (await fetch(url, { headers })).json()) as Record<string, unknown>;
const diff = Object.entries(DESIRED).filter(([key, value]) => current[key] !== value);

if (diff.length === 0) {
  console.log("Configuration Auth déjà à jour.");
  process.exit(0);
}
for (const [key, value] of diff) console.log(`${key} : ${JSON.stringify(current[key])} → ${JSON.stringify(value)}`);

if (!process.argv.includes("--apply")) {
  console.log("\nRelancer avec --apply pour appliquer.");
  process.exit(0);
}
const response = await fetch(url, { method: "PATCH", headers, body: JSON.stringify(Object.fromEntries(diff)) });
if (!response.ok) {
  console.error(`Échec (${response.status}) : ${await response.text()}`);
  process.exit(1);
}
console.log("Configuration Auth appliquée.");
