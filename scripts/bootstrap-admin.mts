// Crée (ou confirme) le premier administrateur de la plateforme. Idempotent.
//   pnpm admin:bootstrap -- --phone "77 614 89 91" --name "Prénom Nom"
// Le mot de passe est saisi dans le terminal (masqué), jamais passé en argument ni enregistré.
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline";
import { loginEmailFromPhone, normalizePhone } from "../src/shared/domain/phone";
import { requireEnv } from "./lib/env";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Masque la saisie : on n'écrit que la question, pas les caractères tapés.
      const output = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
      output._writeToOutput = (s: string) => {
        if (s.startsWith(question)) output.output.write(question);
        else if (s.includes("\n") || s.includes("\r")) output.output.write("\n");
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

const phone = normalizePhone(arg("phone") ?? (await ask("Numéro de téléphone : ")));
if (!phone) {
  console.error("Numéro invalide.");
  process.exit(1);
}
const fullName = (arg("name") ?? (await ask("Nom complet : "))).trim();
if (!fullName) {
  console.error("Nom obligatoire.");
  process.exit(1);
}
const email = loginEmailFromPhone(phone);

const supabase = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SECRET_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Recherche d'un compte existant pour ce numéro.
let userId: string | null = null;
for (let page = 1; !userId; page += 1) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  userId = data.users.find((user) => user.email === email)?.id ?? null;
  if (data.users.length < 1000) break;
}

if (userId) {
  console.log(`Un compte existe déjà pour ${phone}.`);
} else {
  const password = await ask("Mot de passe (8 caractères minimum) : ", true);
  if (password.length < 8) {
    console.error("Mot de passe trop court.");
    process.exit(1);
  }
  const confirmation = await ask("Confirmer le mot de passe : ", true);
  if (confirmation !== password) {
    console.error("Les deux saisies sont différentes.");
    process.exit(1);
  }
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
  if (error) throw error;
  userId = data.user.id;
  console.log(`Compte créé pour ${phone}.`);
}

const { data: existing, error: readError } = await supabase.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
if (readError) throw readError;
if (existing) {
  console.log("Ce compte est déjà administrateur de la plateforme.");
} else {
  const { error } = await supabase.from("platform_admins").insert({ user_id: userId, full_name: fullName, phone_e164: phone });
  if (error) throw error;
  console.log("Compte promu administrateur de la plateforme.");
}
console.log("Connexion : numéro de téléphone + mot de passe sur la page /login.");
