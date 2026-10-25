"use client";

import { useLiveQuery } from "dexie-react-hooks";
import type { LocalCustomer, LocalLine, LocalOperation, LocalProfile, LocalRequest, LocalShop } from "../data/local-db";
import type { OutboxEntry } from "../domain/sync";
import { useOptionalSync } from "./SyncProvider";

export interface LocalShopData {
  customers: LocalCustomer[];
  operations: LocalOperation[];
  outbox: OutboxEntry[];
  shop: LocalShop | undefined;
  profiles: Map<string, string>;
  requests: LocalRequest[];
  /** Le premier téléchargement n'a jamais eu lieu sur cet appareil. */
  neverSynced: boolean;
}

/** Données d'une boutique sur l'appareil, mises à jour en direct (saisie locale, synchronisation). */
export function useLocalShop(shopId: string): LocalShopData | undefined {
  // Rendu serveur : pas de base locale, l'écran affiche « chargement » (identique au premier rendu client).
  const db = useOptionalSync()?.engine.db;
  return useLiveQuery(async () => {
    if (!db) return undefined;
    const [customers, operations, outbox, shop, profiles, requests, cursor] = await Promise.all([
      db.customers.where("shopId").equals(shopId).toArray(),
      db.operations.where("shopId").equals(shopId).toArray(),
      db.outbox.orderBy("seq").toArray(),
      db.shops.get(shopId),
      db.profiles.toArray(),
      db.requests.where("shopId").equals(shopId).toArray(),
      db.meta.get(`cursor:${shopId}:customers`),
    ]);
    return {
      customers,
      operations,
      outbox: outbox.filter((e) => (e.command.type === "customer.create" ? e.command.customer.shopId : e.command.shopId) === shopId),
      shop,
      profiles: new Map(profiles.map((p: LocalProfile) => [p.userId, p.fullName])),
      requests,
      neverSynced: !shop && !cursor,
    };
  }, [db, shopId]);
}

/** Lignes des prises détaillées d'un client. */
export function useLocalLines(operationIds: string[]): LocalLine[] {
  const engine = useOptionalSync()?.engine;
  return (
    useLiveQuery(() => (engine && operationIds.length ? engine.db.lines.where("operationId").anyOf(operationIds).sortBy("position") : Promise.resolve([] as LocalLine[])), [engine, operationIds.join(",")]) ??
    []
  );
}

/** Saisies refusées par le serveur, toutes boutiques (page Synchronisation). */
export function useRejectedEntries(): OutboxEntry[] {
  const engine = useOptionalSync()?.engine;
  return useLiveQuery(() => (engine ? engine.db.outbox.where("status").equals("rejected").toArray() : Promise.resolve([] as OutboxEntry[])), [engine]) ?? [];
}
