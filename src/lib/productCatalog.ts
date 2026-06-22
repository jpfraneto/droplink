export const productCatalog = {
  "t-shirt": 4400,
  hoodie: 6800,
  poster: 2800,
  cap: 3200,
  tote: 2600,
  "sticker pack": 1200,
  mug: 2200
} as const;

export const defaultProductMix = ["t-shirt", "hoodie", "poster"] as const;

export function formatMoney(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase()
  }).format(cents / 100);
}
