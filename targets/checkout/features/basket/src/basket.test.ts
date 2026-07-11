import { describe, expect, it } from "vitest";
import { addItem, removeItem, type Basket } from "./basket.ts";

describe("[BASKET-1] adding an item increments its quantity", () => {
  it("adds a new SKU at quantity 1", () => {
    expect(addItem([], "apple", 199)).toEqual([{ sku: "apple", price: 199, quantity: 1 }]);
  });

  it("increments an existing SKU by exactly 1", () => {
    const basket = addItem(addItem([], "apple", 199), "apple", 199);
    expect(basket).toEqual([{ sku: "apple", price: 199, quantity: 2 }]);
  });

  it("never creates a second line for a SKU already in the basket", () => {
    const basket = Array.from({ length: 5 }).reduce<Basket>(
      (acc) => addItem(acc, "apple", 199),
      [],
    );
    expect(basket).toHaveLength(1);
    expect(basket[0]?.quantity).toBe(5);
  });

  it("keeps other SKUs untouched", () => {
    const basket = addItem(addItem([], "apple", 199), "pear", 250);
    expect(addItem(basket, "apple", 199)).toEqual([
      { sku: "apple", price: 199, quantity: 2 },
      { sku: "pear", price: 250, quantity: 1 },
    ]);
  });
});

describe("[BASKET-2] removing the last item empties the basket", () => {
  it("leaves the basket empty when the only line's only unit is removed", () => {
    expect(removeItem(addItem([], "apple", 199), "apple")).toEqual([]);
  });

  it("decrements rather than dropping the line when units remain", () => {
    const basket = addItem(addItem([], "apple", 199), "apple", 199);
    expect(removeItem(basket, "apple")).toEqual([{ sku: "apple", price: 199, quantity: 1 }]);
  });

  it("drops only the named SKU's line", () => {
    const basket = addItem(addItem([], "apple", 199), "pear", 250);
    expect(removeItem(basket, "apple")).toEqual([{ sku: "pear", price: 250, quantity: 1 }]);
  });
});
