import type { SiteplanTransactionType } from "@/constants/app";

interface PurchaseAmountFields {
  transaction_type: string;
  price: number | null;
  booking_fee: number | null;
  dp_amount: number | null;
}

/**
 * The amount actually paid so far, not the unit's full price. `price` on loonars_unit_purchases
 * is always the unit's total selling price regardless of transaction_type (see
 * siteplanPurchaseSchema) -- a booking or DP row still carries the full price there, so showing
 * it alone reads as "money received" when it isn't. Only an `akad` (paid-in-full) row has
 * price === amount actually received.
 */
export function getSiteplanReceivedAmount(purchase: PurchaseAmountFields): number {
  switch (purchase.transaction_type as SiteplanTransactionType) {
    case "booking":
      return purchase.booking_fee ?? 0;
    case "dp":
      return purchase.dp_amount ?? 0;
    case "akad":
      return purchase.price ?? 0;
    default:
      return 0;
  }
}
