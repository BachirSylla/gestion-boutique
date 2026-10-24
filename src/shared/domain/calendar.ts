// Dates « du calendrier » (AAAA-MM-JJ) dans le fuseau de la boutique, sans dépendance externe.

/** Date locale AAAA-MM-JJ d'un instant, dans un fuseau horaire (ex. « Africa/Dakar »). */
export function localDate(instant: Date | string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(instant));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function parse(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split("-").map(Number);
  return { y: y!, m: m!, d: d! };
}

function format(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Nombre de jours entre deux dates calendaires (b − a). */
export function daysBetween(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

/**
 * Dernière échéance mensuelle atteinte (≤ aujourd'hui).
 * dueDay null = fin de mois ; sinon jour 1 à 28.
 */
export function lastDueDate(today: string, dueDay: number | null): string {
  const { y, m, d } = parse(today);
  const previous = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  if (dueDay === null) {
    const end = daysInMonth(y, m);
    return d === end ? today : format(previous.y, previous.m, daysInMonth(previous.y, previous.m));
  }
  return d >= dueDay ? format(y, m, dueDay) : format(previous.y, previous.m, dueDay);
}
