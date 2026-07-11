import type { Basket } from "../../basket/src/basket.ts";

export const MAX_LINE_ITEMS = 100;

export interface Totals {
  subtotal: number;
  tax: number;
  total: number;
}

export class TooManyLineItems extends Error {
  constructor(count: number) {
    super(`basket has ${count} line items, the limit is ${MAX_LINE_ITEMS}`);
    this.name = "TooManyLineItems";
  }
}

/** Half-up, not Math.round: the latter rounds -0.5 away from the half we want. */
function roundHalfUp(pence: number): number {
  return Math.floor(pence + 0.5);
}

export function checkout(basket: Basket, taxRate: number): Totals {
  if (basket.length > MAX_LINE_ITEMS) throw new TooManyLineItems(basket.length);

  let subtotal = 0;
  let tax = 0;
  for (const line of basket) {
    const linePence = line.price * line.quantity;
    subtotal += linePence;
    tax += roundHalfUp(linePence * taxRate);
  }
  return { subtotal, tax, total: subtotal + tax };
}
