// Numéros de téléphone : normalisation E.164 et identifiant de connexion interne.
// Le pays n'est pas codé en dur dans la logique : Sénégal par défaut (+221).

export interface PhoneCountry {
  /** Indicatif sans « + », ex. « 221 ». */
  callingCode: string;
  /** Longueur du numéro national, ex. 9. */
  nationalLength: number;
  /** Premiers chiffres autorisés du numéro national. */
  nationalPattern: RegExp;
}

export const SENEGAL: PhoneCountry = {
  callingCode: "221",
  nationalLength: 9,
  // Mobiles 70, 75, 76, 77, 78 ; fixes 33.
  nationalPattern: /^(7[05678]|33)\d{7}$/,
};

/**
 * Normalise une saisie libre en E.164 (« +221771234567 »), ou null si invalide.
 * Accepte : « 77 123 45 67 », « 771234567 », « +221 77 123 45 67 », « 00221771234567 ».
 */
export function normalizePhone(input: string, country: PhoneCountry = SENEGAL): string | null {
  const trimmed = input.trim();
  if (!/^[+\d\s().-]+$/.test(trimmed)) return null;
  let digits = trimmed.replace(/\D/g, "");
  const hasPlus = trimmed.startsWith("+");

  if (hasPlus || digits.startsWith(`00${country.callingCode}`)) {
    if (!hasPlus) digits = digits.slice(2);
    if (!digits.startsWith(country.callingCode)) return null;
    digits = digits.slice(country.callingCode.length);
  } else if (digits.length === country.callingCode.length + country.nationalLength && digits.startsWith(country.callingCode)) {
    digits = digits.slice(country.callingCode.length);
  }

  if (digits.length !== country.nationalLength || !country.nationalPattern.test(digits)) return null;
  return `+${country.callingCode}${digits}`;
}

/** Affichage lisible : « +221 77 123 45 67 ». */
export function formatPhone(e164: string, country: PhoneCountry = SENEGAL): string {
  const prefix = `+${country.callingCode}`;
  if (!e164.startsWith(prefix)) return e164;
  const national = e164.slice(prefix.length);
  const groups = national.match(/^(\d{2})(\d{3})(\d{2})(\d{2})$/);
  return groups ? `${prefix} ${groups.slice(1).join(" ")}` : e164;
}

/**
 * Domaine des identifiants internes. Le TLD réservé « .invalid » (RFC 2606) garantit
 * qu'aucun e-mail n'est jamais envoyé ni routable. Voir docs/decisions/0005.
 */
export const LOGIN_EMAIL_DOMAIN = "phone.bitig.invalid";

/** Identifiant Supabase Auth dérivé du numéro : « 221771234567@phone.bitig.invalid ». */
export function loginEmailFromPhone(e164: string): string {
  if (!/^\+[1-9]\d{6,14}$/.test(e164)) throw new RangeError("Numéro E.164 attendu");
  return `${e164.slice(1)}@${LOGIN_EMAIL_DOMAIN}`;
}
