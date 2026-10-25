// Interface publique du module stock.
export {
  ESTIMATE_CHOICES,
  estimateKey,
  expectedRevenue,
  inventoryDelta,
  needsReorder,
  packageReview,
  projectStock,
  ruptureEstimate,
  type PackageReview,
  type PriceSegment,
  type StockCommand,
  type StockView,
} from "./domain/stock";
export { StockApp, type StockAppProps } from "./ui/StockApp";
