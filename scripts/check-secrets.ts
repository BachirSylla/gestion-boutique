// Vérifie qu'aucun secret n'est dans les fichiers suivis ou indexés par Git, ni dans le build client.
//   pnpm check:secrets          fichiers du dépôt (suivis + indexés)
//   pnpm check:secrets --build  ajoute les fichiers servis au navigateur (.next/static)
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import "./lib/env";

const SECRET_ENV = ["SUPABASE_SECRET_KEY", "SUPABASE_DB_PASSWORD", "SUPABASE_ACCESS_TOKEN"];
const PATTERNS: [string, RegExp][] = [
  ["clé secrète Supabase", /sb_secret_[A-Za-z0-9_-]{10,}/],
  ["jeton personnel Supabase", /sbp_[A-Za-z0-9]{20,}/],
  ["JWT service_role", /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]*cm9sZSI6InNlcnZpY2Vfcm9sZS[A-Za-z0-9_-]*/],
  ["URL Postgres avec mot de passe", /postgres(?:ql)?:\/\/[^:\s/]+:(?!\$\{|<)[^@\s]{4,}@/],
];

const values = SECRET_ENV.map((name) => [name, process.env[name]] as const).filter(
  (entry): entry is readonly [string, string] => !!entry[1] && entry[1].length >= 8,
);

function repoFiles(): string[] {
  const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" });
  return out.split("\n").filter(Boolean);
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = [...repoFiles(), ...(process.argv.includes("--build") ? walk(".next/static") : [])];
const findings: string[] = [];

for (const file of files) {
  if (!existsSync(file) || statSync(file).size > 5_000_000) continue;
  const content = readFileSync(file, "utf8");
  for (const [label, pattern] of PATTERNS) {
    if (pattern.test(content)) findings.push(`${file} : ${label}`);
  }
  for (const [name, value] of values) {
    if (content.includes(value)) findings.push(`${file} : valeur de ${name}`);
  }
}

if (findings.length) {
  console.error("Secrets détectés :\n" + findings.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
console.log(`Aucun secret détecté (${files.length} fichiers vérifiés).`);
