// Chargement de .env pour les scripts d'outillage (hors Next.js).
// Ne jamais afficher les valeurs : seuls les noms des variables manquantes sont signalés.
import { config } from "dotenv";

config({ path: ".env", quiet: true });

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${name} (voir .env.example)`);
  }
  return value;
}

const DEFAULT_POOLER_HOST = "aws-0-eu-west-2.pooler.supabase.com";

/** URL Postgres via le pooler en mode session (IPv4), construite à partir de .env. */
export function databaseUrl(): string {
  const ref = requireEnv("SUPABASE_PROJECT_REF");
  const password = encodeURIComponent(requireEnv("SUPABASE_DB_PASSWORD"));
  const host = process.env.SUPABASE_POOLER_HOST || DEFAULT_POOLER_HOST;
  return `postgresql://postgres.${ref}:${password}@${host}:5432/postgres`;
}
