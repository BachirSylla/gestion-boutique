// Outillage base de données sur le projet Supabase distant, sans Docker.
//   pnpm db:push    applique les migrations de supabase/migrations
//   pnpm db:status  liste les migrations appliquées / en attente
//   pnpm db:types   régénère src/shared/supabase/database.types.ts
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { databaseUrl, requireEnv } from "./lib/env";

const command = process.argv[2];

function supabase(args: string[], capture = false) {
  const result = spawnSync("npx", ["supabase", ...args], {
    stdio: capture ? ["inherit", "pipe", "inherit"] : "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: requireEnv("SUPABASE_ACCESS_TOKEN") },
    encoding: "utf8",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout;
}

switch (command) {
  case "push":
    supabase(["db", "push", "--db-url", databaseUrl(), ...process.argv.slice(3)]);
    break;
  case "status":
    supabase(["migration", "list", "--db-url", databaseUrl()]);
    break;
  case "types": {
    const types = supabase(["gen", "types", "typescript", "--project-id", requireEnv("SUPABASE_PROJECT_REF"), "--schema", "public"], true);
    writeFileSync("src/shared/supabase/database.types.ts", types);
    console.log("Types régénérés : src/shared/supabase/database.types.ts");
    break;
  }
  default:
    console.error("Usage : tsx scripts/db.ts <push|status|types>");
    process.exit(1);
}
