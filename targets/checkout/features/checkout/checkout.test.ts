import { describe, expect, it } from "vitest";
import type { Basket, LineItem } from "../basket/basket.ts";
import { checkout, MAX_LINE_ITEMS, TooManyLineItems } from "./checkout.ts";

const line = (sku: string, price: number, quantity = 1): LineItem => ({ sku, price, quantity });

const lines = (count: number): Basket =>
  Array.from({ length: count }, (_, i) => line(`sku-${i}`, 100));

describe("[CHECKOUT-1] tax rounds half-up to 2dp per line item", () => {
  it("rounds each line's tax before summing: three £1.99 line items at 20% is £1.20", () => {
    const basket = [line("a", 199), line("b", 199), line("c", 199)];
    expect(checkout(basket, 0.2).tax).toBe(120);
  });

  it("does not tax the basket total, which would give £1.19", () => {
    const basket = [line("a", 199), line("b", 199), line("c", 199)];
    const subtotal = checkout(basket, 0.2).subtotal;
    expect(subtotal).toBe(597);
    expect(Math.floor(subtotal * 0.2 + 0.5)).toBe(119);
    expect(checkout(basket, 0.2).tax).not.toBe(119);
  });

  it("rounds a half up, never down", () => {
    expect(checkout([line("a", 5)], 0.5).tax).toBe(3);
  });

  it("taxes a multi-unit line on its line total", () => {
    expect(checkout([line("a", 199, 3)], 0.2).tax).toBe(119);
  });

  it("adds tax to the subtotal to reach the total", () => {
    expect(checkout([line("a", 199), line("b", 199), line("c", 199)], 0.2)).toEqual({
      subtotal: 597,
      tax: 120,
      total: 717,
    });
  });
});

describe("[CHECKOUT-2] an empty basket totals zero", () => {
  it("returns zero subtotal, tax, and total", () => {
    expect(checkout([], 0.2)).toEqual({ subtotal: 0, tax: 0, total: 0 });
  });
});

describe("[CHECKOUT-3] checkout rejects more than 100 line items", () => {
  it("accepts a basket of exactly the limit", () => {
    expect(() => checkout(lines(MAX_LINE_ITEMS), 0.2)).not.toThrow();
  });

  it("rejects one line item over the limit", () => {
    expect(() => checkout(lines(MAX_LINE_ITEMS + 1), 0.2)).toThrow(TooManyLineItems);
  });

  it("counts line items, not units", () => {
    const oneLineManyUnits: Basket = [line("a", 100, 500)];
    expect(() => checkout(oneLineManyUnits, 0.2)).not.toThrow();
  });
});
