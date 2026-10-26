"use client";

import { useMemo } from "react";
import { useLocalShop, type LocalShopData } from "@/modules/sync";
import { localDate } from "@/shared/domain";
import { dayFlows, daySales, estimatedDailyCounterCash, latestClosings, type DayFlows, type DaySales } from "../domain/cash";
import { closingRecords, flowOperations, wholeSales } from "./local-flows";

export interface CashDay {
  data: LocalShopData;
  date: string;
  flows: DayFlows;
  sales: DaySales;
  closing: (ReturnType<typeof closingRecords>[number]) | null;
  /** Nombre de clôtures saisies ce jour-là (plus d'une : corrigée). */
  closingCount: number;
}

/** Ventes d'une journée calculées sur l'appareil (juste hors ligne, saisies en attente comprises). */
export function cashDay(data: LocalShopData, date: string, timeZone: string): Omit<CashDay, "data" | "date"> {
  const records = closingRecords(data);
  const latest = latestClosings(records).get(date) ?? null;
  const closing = latest ? (records.find((r) => r.id === latest.id) ?? null) : null;
  const flows = dayFlows({ operations: flowOperations(data), wholeSales: wholeSales(data), date, timeZone });
  return {
    flows,
    sales: daySales(flows, closing, estimatedDailyCounterCash(data.reviews)),
    closing,
    closingCount: records.filter((r) => r.businessDate === date).length,
  };
}

export function useCashDay(shopId: string, timeZone: string, date?: string): CashDay | undefined {
  const data = useLocalShop(shopId);
  return useMemo(() => {
    if (!data) return undefined;
    const day = date ?? localDate(new Date(), timeZone);
    return { data, date: day, ...cashDay(data, day, timeZone) };
  }, [data, date, timeZone]);
}
