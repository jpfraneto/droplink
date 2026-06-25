export type ProductFamily =
  | "heavyweight tee"
  | "heavyweight hoodie"
  | "windbreaker"
  | "laptop sleeve"
  | "tote bag"
  | "notebook"
  | "mug"
  | "poster"
  | "framed poster"
  | "canvas"
  | "hat"
  | "sticker"
  | "other";

export function formatMoney(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase()
  }).format(cents / 100);
}
