// Interface publique du module reporting (tableau de bord, bénéfices).
export {
  grossProfit,
  inPeriod,
  periodCash,
  periodDays,
  resolvePeriod,
  type GrossProfit,
  type Period,
  type PeriodCash,
  type PeriodChoice,
  type ProductProfit,
  type ReviewForProfit,
  type WholeSaleForProfit,
} from "./domain/reporting";
export { RecentActivity } from "./ui/RecentActivity";
