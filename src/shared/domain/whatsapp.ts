// Liens wa.me : ouvrent WhatsApp avec un message prérempli, sans API payante.

/** https://wa.me/221776148991?text=… (numéro sans « + », texte encodé). Sans numéro : choix du contact dans WhatsApp. */
export function whatsAppLink(text: string, phoneE164?: string | null): string {
  const digits = phoneE164 ? phoneE164.replace(/\D/g, "") : "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
