export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);

  return slug || "drop";
}

export function uniqueSlug(base: string, existing: Set<string>): string {
  const clean = slugify(base);
  if (!existing.has(clean)) return clean;
  for (let i = 2; i < 999; i += 1) {
    const next = `${clean}-${i}`;
    if (!existing.has(next)) return next;
  }
  return `${clean}-${Date.now()}`;
}

export function brandSlugFromUrl(input: string): string {
  const parsed = new URL(input.trim());
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const slug = hostname.replace(/\./g, "").replace(/[^a-z0-9-]/g, "");
  return slug || "brand";
}
