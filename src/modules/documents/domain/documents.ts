// Reçus, relevés et noms de fichiers (RG9) : règles pures, testées sans navigateur.
import { daysInMonth, localDate, type Amount } from "@/shared/domain";

export interface DocLine {
  label: string;
  quantityMilli: number;
  unit: string;
  unitPrice: Amount;
  lineAmount: Amount;
  formatLabel?: string | null;
  formatCount?: number | null;
}

export interface DocOperation {
  id: string;
  kind: "take" | "payment" | "cancellation";
  amount: Amount | null;
  deviceCreatedAt: string;
  cancelsOperationId: string | null;
  note: string | null;
  lines: DocLine[];
  authorName: string;
  paymentMethodLabel: string | null;
}

/** Numéro d'opération lisible (8 premiers caractères de l'identifiant, en majuscules). */
export function operationNumber(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

/** Prénom de l'auteur (premier mot du nom), comme demandé sur le reçu. */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? "";
}

const signed = (op: DocOperation) => (op.kind === "take" ? -(op.amount ?? 0) : op.kind === "payment" ? (op.amount ?? 0) : 0);

/** Identifiants des opérations annulées (par une annulation présente dans la liste). */
export function cancelledIds(operations: readonly DocOperation[]): Set<string> {
  return new Set(operations.filter((o) => o.kind === "cancellation" && o.cancelsOperationId).map((o) => o.cancelsOperationId!));
}

// ---------------------------------------------------------------------------
// Reçu
// ---------------------------------------------------------------------------

export interface ReceiptData {
  operationNumber: string;
  kind: "take" | "payment";
  at: string;
  lines: DocLine[];
  note: string | null;
  total: Amount;
  balanceBefore: Amount;
  balanceAfter: Amount;
  authorFirstName: string;
  paymentMethodLabel: string | null;
}

/**
 * Reçu d'une prise ou d'un versement : ancien et nouveau solde au moment de l'opération.
 * Une opération compte si elle est antérieure et n'a pas été annulée avant ce moment.
 */
export function receiptData(operation: DocOperation, all: readonly DocOperation[]): ReceiptData {
  if (operation.kind === "cancellation") throw new Error("Pas de reçu pour une annulation");
  const at = operation.deviceCreatedAt;
  const earlier = all.filter((o) => o.id !== operation.id && o.deviceCreatedAt <= at);
  const cancelledBefore = cancelledIds(earlier);
  const balanceBefore = earlier.filter((o) => o.kind !== "cancellation" && !cancelledBefore.has(o.id)).reduce((s, o) => s + signed(o), 0);
  return {
    operationNumber: operationNumber(operation.id),
    kind: operation.kind,
    at,
    lines: operation.lines,
    note: operation.note,
    total: operation.amount ?? 0,
    balanceBefore,
    balanceAfter: balanceBefore + signed(operation),
    authorFirstName: firstName(operation.authorName),
    paymentMethodLabel: operation.paymentMethodLabel,
  };
}

/** Prochaine échéance mensuelle (≥ aujourd'hui) ; dueDay null = fin de mois. */
export function nextDueDate(today: string, dueDay: number | null): string {
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  const day = (year: number, month: number) => (dueDay === null ? daysInMonth(year, month) : dueDay);
  if (d <= day(y, m)) return `${y}-${String(m).padStart(2, "0")}-${String(day(y, m)).padStart(2, "0")}`;
  const [ny, nm] = m === 12 ? [y + 1, 1] : [y, m + 1];
  return `${ny}-${String(nm).padStart(2, "0")}-${String(day(ny, nm)).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Relevé de compte
// ---------------------------------------------------------------------------

export interface StatementRow {
  id: string;
  at: string;
  kind: "take" | "payment";
  operation: DocOperation;
  taken: Amount;
  paid: Amount;
  /** Opération annulée : reste visible, barrée, sans effet sur le solde. */
  cancelled: boolean;
  balanceAfter: Amount;
}

export interface StatementData {
  from: string;
  to: string;
  carriedBalance: Amount;
  rows: StatementRow[];
  totalTaken: Amount;
  totalPaid: Amount;
  closingBalance: Amount;
  /** Reste à payer : la dette à la fin de la période (0 si avance). */
  amountDue: Amount;
}

/**
 * Relevé d'une période (dates locales AAAA-MM-JJ, bornes incluses) : solde reporté, puis chaque
 * prise et versement dans l'ordre avec le solde après la ligne. Une opération annulée (à n'importe
 * quel moment) est exclue des soldes et totaux, comme dans le solde du client, mais reste affichée.
 */
export function statementData(operations: readonly DocOperation[], from: string, to: string, timeZone: string): StatementData {
  const cancelled = cancelledIds(operations);
  const dated = operations
    .filter((o) => o.kind !== "cancellation")
    .map((o) => ({ o, day: localDate(o.deviceCreatedAt, timeZone) }))
    .sort((a, b) => a.o.deviceCreatedAt.localeCompare(b.o.deviceCreatedAt));
  const carriedBalance = dated.filter(({ o, day }) => day < from && !cancelled.has(o.id)).reduce((s, { o }) => s + signed(o), 0);
  let balance = carriedBalance;
  let totalTaken = 0;
  let totalPaid = 0;
  const rows: StatementRow[] = [];
  for (const { o, day } of dated) {
    if (day < from || day > to) continue;
    const isCancelled = cancelled.has(o.id);
    if (!isCancelled) {
      balance += signed(o);
      if (o.kind === "take") totalTaken += o.amount ?? 0;
      else totalPaid += o.amount ?? 0;
    }
    rows.push({
      id: o.id,
      at: o.deviceCreatedAt,
      kind: o.kind as "take" | "payment",
      operation: o,
      taken: o.kind === "take" ? (o.amount ?? 0) : 0,
      paid: o.kind === "payment" ? (o.amount ?? 0) : 0,
      cancelled: isCancelled,
      balanceAfter: balance,
    });
  }
  return { from, to, carriedBalance, rows, totalTaken, totalPaid, closingBalance: balance, amountDue: balance < 0 ? -balance : 0 };
}

/** Période par défaut : du 1er du mois à aujourd'hui. */
export function currentMonthPeriod(today: string): { from: string; to: string } {
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

/** Mois précédent complet. */
export function previousMonthPeriod(today: string): { from: string; to: string } {
  const [y, m] = today.split("-").map(Number) as [number, number];
  const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
  const mm = String(pm).padStart(2, "0");
  return { from: `${py}-${mm}-01`, to: `${py}-${mm}-${String(daysInMonth(py, pm)).padStart(2, "0")}` };
}

// ---------------------------------------------------------------------------
// Noms de fichiers et texte PDF
// ---------------------------------------------------------------------------

/** « Awa Ndiaye » → « Awa-Ndiaye » : sans espace ni accent (RG9). */
export function fileSlug(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "client"
  );
}

/** Recu_Awa-Ndiaye_2026-10-23_14h32.png */
export function receiptFileName(customerName: string, at: string, timeZone: string, extension: "png" | "pdf"): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(at));
  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `Recu_${fileSlug(customerName)}_${localDate(at, timeZone)}_${hh}h${mm}.${extension}`;
}

/** Releve_Awa-Ndiaye_2026-10-01_au_2026-10-23.pdf */
export function statementFileName(customerName: string, from: string, to: string): string {
  return `Releve_${fileSlug(customerName)}_${from}_au_${to}.pdf`;
}

/**
 * Texte compatible avec les polices standard des PDF (WinAnsi) : signe moins typographique,
 * espaces insécables fines et symboles hors jeu remplacés. ½, ¼, ¾, ·, ×, é… sont conservés.
 */
export function pdfText(text: string): string {
  return text
    .replace(/−/g, "-")
    .replace(/[  ]/g, " ")
    .replace(/ /g, " ")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/≈/g, "~")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\u0000-ÿ€]/g, "?");
}
