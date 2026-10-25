// Adresses de l'écran des clients (navigation par ancre, utilisable hors ligne).
export const customerHref = (id: string, sub?: "take" | "payment") => `/customers#/c/${id}${sub ? `/${sub}` : ""}`;
