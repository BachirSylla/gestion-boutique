"use client";

import { useMemo } from "react";
import type { LocalShopData, OutboxEntry } from "@/modules/sync";
import { projectStock, type StockCommand, type StockView } from "../domain/stock";

export interface ProductStock {
  product: LocalShopData["products"][number];
  view: StockView;
  pending: number;
  durations: number[];
}

/** Stock projeté par produit : état téléchargé + saisies en attente sur l'appareil. */
export function useProductStocks(data: LocalShopData | undefined): ProductStock[] {
  return useMemo(() => {
    if (!data) return [];
    return data.products
      .filter((p) => !p.archived)
      .map((product) => {
        const packages = data.packages.filter((k) => k.productId === product.id);
        const opened = packages.find((k) => k.state === "opened");
        const server: StockView = {
          closed: packages.filter((k) => k.state === "closed").length,
          opened: opened ? { remaining: opened.remainingEstimate, openedAt: opened.openedAt, pending: false } : null,
        };
        const commands = data.outbox.filter((e) => e.status === "pending" && "productId" in e.command && e.command.productId === product.id);
        const view = projectStock(server, commands.map((e) => toStockCommand(e)).filter((c): c is StockCommand => c !== null));
        const durations = data.reviews
          .filter((r) => r.productId === product.id && r.openedAt && r.finishedAt)
          .sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""))
          .map((r) => new Date(r.finishedAt!).getTime() - new Date(r.openedAt!).getTime());
        return { product, view, pending: commands.length, durations };
      });
  }, [data]);
}

function toStockCommand(entry: OutboxEntry): StockCommand | null {
  const c = entry.command;
  switch (c.type) {
    case "stock.receive":
      return { type: "stock.receive", count: c.count };
    case "stock.open":
    case "stock.finish":
    case "stock.sell":
      return { type: c.type };
    case "stock.adjust":
      return { type: "stock.adjust", delta: c.delta };
    case "stock.estimate":
      return { type: "stock.estimate", estimate: c.estimate };
    default:
      return null;
  }
}
