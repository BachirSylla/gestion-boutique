// Flux de caisse lus sur l'appareil : journal téléchargé + saisies en attente (même vue hors ligne qu'en ligne).
import { mergeOperations, type LocalShopData } from "@/modules/sync";
import type { ClosingRecord, FlowOperation, WholeSale } from "../domain/cash";

/** Opérations client avec le moyen de paiement (saisies refusées exclues). */
export function flowOperations(data: LocalShopData): FlowOperation[] {
  const methodOf = new Map<string, string | null>(data.operations.map((o) => [o.id, o.paymentMethodId]));
  for (const entry of data.outbox) {
    if (entry.command.type === "payment") methodOf.set(entry.id, entry.command.paymentMethodId);
  }
  return mergeOperations(data.operations, data.outbox)
    .filter((op) => !op.rejected)
    .map((op) => ({
      id: op.id,
      kind: op.kind,
      amount: op.amount,
      cancelsOperationId: op.cancelsOperationId,
      deviceCreatedAt: op.deviceCreatedAt,
      paymentMethodId: methodOf.get(op.id) ?? null,
    }));
}

/** Ventes de conditionnements entiers (téléchargées et en attente), annulées marquées. */
export function wholeSales(data: LocalShopData): WholeSale[] {
  const cancelled = new Set(data.movements.filter((m) => m.kind === "cancellation" && m.cancelsMovementId).map((m) => m.cancelsMovementId!));
  for (const entry of data.outbox) {
    if (entry.command.type === "stock.cancel" && entry.status !== "rejected") cancelled.add(entry.command.movementId);
  }
  const sales: WholeSale[] = data.movements
    .filter((m) => m.kind === "whole_sale" && m.amount !== null)
    .map((m) => ({
      id: m.id,
      productId: m.productId,
      amount: m.amount!,
      customerOperationId: m.customerOperationId,
      deviceCreatedAt: m.deviceCreatedAt,
      cancelled: cancelled.has(m.id),
    }));
  const known = new Set(sales.map((s) => s.id));
  for (const entry of data.outbox) {
    const c = entry.command;
    if (c.type !== "stock.sell" || entry.status === "rejected" || known.has(entry.id)) continue;
    sales.push({ id: entry.id, productId: c.productId, amount: c.price, customerOperationId: c.takeId, deviceCreatedAt: entry.deviceCreatedAt, cancelled: cancelled.has(entry.id) });
  }
  return sales;
}

/** Clôtures téléchargées + clôtures en attente d'envoi (celles-ci font foi : plus récentes). */
export function closingRecords(data: LocalShopData): (ClosingRecord & { pending: boolean })[] {
  const known = new Set(data.closings.map((c) => c.id));
  const records: (ClosingRecord & { pending: boolean })[] = data.closings.map((c) => ({ ...c, pending: false }));
  for (const entry of data.outbox) {
    const c = entry.command;
    if (c.type !== "cash.close" || entry.status === "rejected" || known.has(entry.id)) continue;
    records.push({
      id: entry.id,
      businessDate: c.businessDate,
      totalReceived: c.amounts.reduce((s, a) => s + a.amount, 0),
      amounts: c.amounts,
      note: c.note,
      authorId: entry.authorId,
      deviceCreatedAt: entry.deviceCreatedAt,
      serverCreatedAt: null,
      pending: true,
    });
  }
  return records;
}
