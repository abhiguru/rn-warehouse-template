import type { ItemStoragePrice, PriceType } from '@/types/item-pricing.types';

export interface CustomerPriceQuery {
  item_id: string;
  customer_id: string;
  /** Weight per unit of the GRN line. */
  weight: number;
  price_type: PriceType;
  /** Today's date as YYYY-MM-DD. */
  today: string;
}

const day = (value: string | null | undefined): string => (value ? value.slice(0, 10) : '');

/**
 * The customer's own price row for an item, as the server would pick it: this
 * item, this customer, this price type, a weight band that holds the weight,
 * in force today; the narrowest band when several fit. Reading only: nothing
 * is created when there is none.
 */
export function findCustomerPrice(prices: ItemStoragePrice[], query: CustomerPriceQuery): ItemStoragePrice | undefined {
  return prices
    .filter(
      (price) =>
        price.item_id === query.item_id &&
        price.customer_id === query.customer_id &&
        price.price_type === query.price_type &&
        Number(price.weight_min) <= query.weight &&
        Number(price.weight_max) >= query.weight &&
        day(price.effective_from) <= query.today &&
        (!price.effective_to || day(price.effective_to) >= query.today)
    )
    .sort((a, b) => Number(a.weight_max) - Number(a.weight_min) - (Number(b.weight_max) - Number(b.weight_min)))[0];
}
