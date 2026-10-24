// Interface publique du module customers.
export {
  CUSTOMER_TYPES,
  amountOwed,
  groupByDay,
  isOverLimit,
  limitUsage,
  matchesCustomer,
  parseCustomerInput,
  reminderReasons,
  shopTotals,
  type CustomerType,
  type ReminderReason,
} from "./domain/customers";
export { CustomerList, type CustomerListItem } from "./ui/CustomerList";
export { CustomerForm, type CustomerFormValues } from "./ui/CustomerForm";
