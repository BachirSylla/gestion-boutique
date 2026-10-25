// Interface publique du module catalog (produits et prix).
export {
  REMAINING_ESTIMATES,
  SALE_UNITS,
  defaultPolicy,
  formatLine,
  formatPriceFromRetail,
  proposeFormatPrices,
  validateGrid,
  type PriceFormat,
  type PriceGrid,
  type PricePolicy,
  type ProductUnit,
  type RemainingEstimate,
} from "./domain/catalog";
export { PriceChangeForm, ProductCreateForm, ProductInfoForm } from "./ui/CatalogForms";
