// Interface publique du module cash (clôture de journée, ventes du jour).
export {
  counterCashSales,
  dayFlows,
  daySales,
  estimatedDailyCounterCash,
  latestClosings,
  type ClosingRecord,
  type DayFlows,
  type DaySales,
  type FlowOperation,
  type ReviewForEstimate,
  type WholeSale,
} from "./domain/cash";
export { CashApp, type CashAppProps } from "./ui/CashApp";
export { DaySalesCard } from "./ui/DaySalesCard";
