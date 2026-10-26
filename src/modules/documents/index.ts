// Interface publique du module documents (reçus, relevés, relances).
export {
  currentMonthPeriod,
  fileSlug,
  nextDueDate,
  operationNumber,
  pdfText,
  previousMonthPeriod,
  receiptData,
  receiptFileName,
  statementData,
  statementFileName,
  type DocLine,
  type DocOperation,
  type ReceiptData,
  type StatementData,
} from "./domain/documents";
export { ReceiptButton, RemindLink, StatementPanel, type DocCustomer, type DocShop } from "./ui/DocumentActions";
