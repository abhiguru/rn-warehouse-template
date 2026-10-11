import { parseWholeNumberInput } from '@/features/grn/schemas/grnValidation';

/**
 * What the bags-to-dispatch field holds.
 *
 * `parseInt` reads "12.5" as 12 and "12 bags" as 12 and says nothing. A
 * dispatched quantity must be exactly the digits the operator typed, so
 * anything that is not a whole number is reported and counts as no quantity.
 */
export function readDispatchQuantityInput(text: string): { quantity: number; isWholeNumber: boolean } {
  if (text.trim() === '') return { quantity: 0, isWholeNumber: true };
  const quantity = parseWholeNumberInput(text);
  return quantity === null ? { quantity: 0, isWholeNumber: false } : { quantity, isWholeNumber: true };
}
