// Règles de mot de passe : longueur minimale, confirmation, mot de passe provisoire lisible.

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72; // limite bcrypt de Supabase Auth

export type PasswordErrorCode = "passwordTooShort" | "passwordTooLong" | "passwordMismatch" | "passwordUnchanged";

export function validateNewPassword(
  password: string,
  confirmation: string,
  options: { current?: string } = {},
): PasswordErrorCode | null {
  if (password.length < PASSWORD_MIN_LENGTH) return "passwordTooShort";
  if (password.length > PASSWORD_MAX_LENGTH) return "passwordTooLong";
  if (password !== confirmation) return "passwordMismatch";
  if (options.current !== undefined && options.current === password) return "passwordUnchanged";
  return null;
}

// Sans caractères ambigus à l'oral ou à l'écrit : ni 0/O, ni 1/l/I.
const LETTERS = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";

/**
 * Mot de passe provisoire facile à dicter au téléphone : « kmrt-4827-pzaw ».
 * 8 lettres + 4 chiffres tirés au hasard (~49 bits), changé à la première connexion.
 * `randomInt(max)` doit renvoyer un entier uniforme dans [0, max) (crypto côté serveur).
 */
export function generateTemporaryPassword(randomInt: (max: number) => number): string {
  const pick = (alphabet: string, count: number) =>
    Array.from({ length: count }, () => alphabet.charAt(randomInt(alphabet.length))).join("");
  return `${pick(LETTERS, 4)}-${pick(DIGITS, 4)}-${pick(LETTERS, 4)}`;
}
