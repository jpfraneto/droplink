export function publicProductCopy(input: string): string {
  return input
    .replace(/\brelics\b/gi, "products")
    .replace(/\brelic\b/gi, "product");
}
