/** Prices and quantities are integer pence; the checkout never sees a float. */
export interface LineItem {
  sku: string;
  price: number;
  quantity: number;
}

export type Basket = readonly LineItem[];

export function addItem(basket: Basket, sku: string, price: number): Basket {
  const existing = basket.find((line) => line.sku === sku);
  if (!existing) return [...basket, { sku, price, quantity: 1 }];
  return basket.map((line) => (line.sku === sku ? { ...line, quantity: line.quantity + 1 } : line));
}

export function removeItem(basket: Basket, sku: string): Basket {
  return basket.flatMap((line) => {
    if (line.sku !== sku) return [line];
    if (line.quantity === 1) return [];
    return [{ ...line, quantity: line.quantity - 1 }];
  });
}
