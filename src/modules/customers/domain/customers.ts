// Clients à compte (RG1) : types, alertes, liste « À relancer », recherche, historique par jour.
import { daysBetween, lastDueDate, localDate, normalizePhone, type Amount } from "@/shared/domain";

export const CUSTOMER_TYPES = ["advance", "monthly", "free"] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export interface CustomerFacts {
  type: CustomerType;
  creditLimit: Amount | null;
  alertThreshold: Amount | null;
  monthlyDueDay: number | null;
}

export interface ReminderSettings {
  advanceAlertThreshold: Amount;
  freeCreditReminderDays: number;
  monthlyDueDay: number | null;
  timeZone: string;
}

export interface CustomerStats {
  balance: Amount;
  /** Prises (non annulées) faites jusqu'à la dernière échéance incluse — utile aux clients mensuels. */
  takenUntilLastDue?: Amount;
  totalPaid: Amount;
  lastPaymentAt: string | null;
  firstTakeAt: string | null;
}

export type ReminderReason =
  | { kind: "overdue"; dueDate: string; overdue: Amount }
  | { kind: "overLimit"; limit: Amount; excess: Amount }
  | { kind: "lowAdvance"; threshold: Amount }
  | { kind: "noRecentPayment"; days: number };

/** Montant dû (positif) : la dette du client, 0 s'il a une avance. */
export function amountOwed(balance: Amount): Amount {
  return balance < 0 ? -balance : 0;
}

/** Plafond : simple alerte, jamais bloquant. Part du plafond utilisée (0 à 1+), null sans plafond. */
export function limitUsage(balance: Amount, creditLimit: Amount | null): number | null {
  if (!creditLimit) return null;
  return amountOwed(balance) / creditLimit;
}

export function isOverLimit(balance: Amount, creditLimit: Amount | null): boolean {
  return !!creditLimit && amountOwed(balance) > creditLimit;
}

export function effectiveDueDay(customer: Pick<CustomerFacts, "monthlyDueDay">, settings: Pick<ReminderSettings, "monthlyDueDay">): number | null {
  return customer.monthlyDueDay ?? settings.monthlyDueDay;
}

/**
 * Raisons de relancer un client (liste « À relancer », relance toujours manuelle).
 * - mensuel : une prise faite jusqu'à la dernière échéance reste impayée ;
 * - plafond dépassé ;
 * - avance : solde sous le seuil (client, sinon boutique) ;
 * - crédit libre : il doit, et aucun versement depuis N jours (ou depuis sa première prise).
 */
export function reminderReasons(customer: CustomerFacts, stats: CustomerStats, settings: ReminderSettings, today: string): ReminderReason[] {
  const reasons: ReminderReason[] = [];
  if (customer.type === "monthly" && stats.takenUntilLastDue !== undefined) {
    const overdue = stats.takenUntilLastDue - stats.totalPaid;
    if (overdue > 0 && stats.balance < 0) {
      reasons.push({ kind: "overdue", dueDate: lastDueDate(today, effectiveDueDay(customer, settings)), overdue });
    }
  }
  if (isOverLimit(stats.balance, customer.creditLimit)) {
    reasons.push({ kind: "overLimit", limit: customer.creditLimit!, excess: amountOwed(stats.balance) - customer.creditLimit! });
  }
  if (customer.type === "advance") {
    const threshold = customer.alertThreshold ?? settings.advanceAlertThreshold;
    if (stats.balance < threshold) reasons.push({ kind: "lowAdvance", threshold });
  }
  if (customer.type === "free" && stats.balance < 0) {
    const since = stats.lastPaymentAt ?? stats.firstTakeAt;
    if (since) {
      const days = daysBetween(localDate(since, settings.timeZone), today);
      if (days >= settings.freeCreditReminderDays) reasons.push({ kind: "noRecentPayment", days });
    }
  }
  return reasons;
}

// ---------------------------------------------------------------------------
// Recherche instantanée (nom, téléphone), dès la première lettre
// ---------------------------------------------------------------------------

export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function matchesCustomer(customer: { fullName: string; phone: string | null }, query: string): boolean {
  const q = normalizeText(query);
  if (!q) return true;
  if (normalizeText(customer.fullName).includes(q)) return true;
  const digits = q.replace(/\D/g, "");
  return digits.length >= 2 && !!customer.phone && customer.phone.replace(/\D/g, "").includes(digits);
}

// ---------------------------------------------------------------------------
// Saisie de la fiche client
// ---------------------------------------------------------------------------

export type CustomerFieldError = "nameRequired" | "invalidPhone" | "typeRequired" | "invalidAmount" | "invalidDueDay";

export interface CustomerInput {
  fullName: string;
  phone: string | null;
  type: CustomerType;
  creditLimit: Amount | null;
  alertThreshold: Amount | null;
  monthlyDueDay: number | null;
  note: string | null;
}

/** Montant saisi (« 25 000 », « 25000 ») en entier, null si vide, undefined si invalide. */
export function parseAmountInput(raw: string): Amount | null | undefined {
  const compact = raw.replace(/[\s  .]/g, "");
  if (!compact) return null;
  if (!/^\d{1,12}$/.test(compact)) return undefined;
  return Number(compact);
}

export function parseCustomerInput(raw: Record<string, string>): { ok: true; value: CustomerInput } | { ok: false; fields: Partial<Record<keyof CustomerInput, CustomerFieldError>> } {
  const fields: Partial<Record<keyof CustomerInput, CustomerFieldError>> = {};
  const fullName = (raw.fullName ?? "").trim().slice(0, 120);
  if (!fullName) fields.fullName = "nameRequired";
  const phoneRaw = (raw.phone ?? "").trim();
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (phoneRaw && !phone) fields.phone = "invalidPhone";
  const type = raw.type as CustomerType;
  if (!CUSTOMER_TYPES.includes(type)) fields.type = "typeRequired";
  const creditLimit = parseAmountInput(raw.creditLimit ?? "");
  if (creditLimit === undefined || creditLimit === 0) fields.creditLimit = "invalidAmount";
  const alertThreshold = parseAmountInput(raw.alertThreshold ?? "");
  if (alertThreshold === undefined) fields.alertThreshold = "invalidAmount";
  const dueRaw = (raw.monthlyDueDay ?? "").trim();
  const monthlyDueDay = dueRaw ? Number(dueRaw) : null;
  if (monthlyDueDay !== null && !(Number.isInteger(monthlyDueDay) && monthlyDueDay >= 1 && monthlyDueDay <= 28)) fields.monthlyDueDay = "invalidDueDay";
  if (Object.keys(fields).length) return { ok: false, fields };
  return {
    ok: true,
    value: {
      fullName,
      phone,
      type,
      creditLimit: creditLimit ?? null,
      alertThreshold: type === "advance" ? (alertThreshold ?? null) : null,
      monthlyDueDay: type === "monthly" ? monthlyDueDay : null,
      note: (raw.note ?? "").trim().slice(0, 500) || null,
    },
  };
}

/** Regroupe des éléments datés par jour local (le plus récent d'abord). */
export function groupByDay<T extends { deviceCreatedAt: string }>(items: readonly T[], timeZone: string): { date: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const item of [...items].sort((a, b) => b.deviceCreatedAt.localeCompare(a.deviceCreatedAt))) {
    const date = localDate(item.deviceCreatedAt, timeZone);
    groups.set(date, [...(groups.get(date) ?? []), item]);
  }
  return [...groups.entries()].map(([date, groupItems]) => ({ date, items: groupItems }));
}

export interface ShopTotals {
  owedByCustomers: Amount;
  advancesHeld: Amount;
  customersInDebt: number;
}

/** Ce que les clients doivent et les avances détenues (tableau de bord). */
export function shopTotals(customers: readonly { balance: Amount }[]): ShopTotals {
  return customers.reduce(
    (totals, c) => ({
      owedByCustomers: totals.owedByCustomers + amountOwed(c.balance),
      advancesHeld: totals.advancesHeld + (c.balance > 0 ? c.balance : 0),
      customersInDebt: totals.customersInDebt + (c.balance < 0 ? 1 : 0),
    }),
    { owedByCustomers: 0, advancesHeld: 0, customersInDebt: 0 },
  );
}
