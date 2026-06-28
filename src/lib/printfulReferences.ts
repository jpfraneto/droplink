type JsonRecord = Record<string, unknown>;

const directImageKeys = [
  "image",
  "image_url",
  "imageUrl",
  "thumbnail",
  "thumbnail_url",
  "thumbnailUrl",
  "preview",
  "preview_url",
  "previewUrl",
  "mockup_url",
  "mockupUrl",
  "catalog_image",
  "catalogImage",
  "product_image",
  "productImage"
];

const imageContainerKeys = ["images", "photos", "pictures", "thumbnails", "previews", "mockups", "files"];

function isRecord(input: unknown): input is JsonRecord {
  return Boolean(input && typeof input === "object" && !Array.isArray(input));
}

function imageUrl(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  return /^https?:\/\//i.test(value) ? value : null;
}

function searchImage(input: unknown, depth = 0): string | null {
  if (depth > 4) return null;
  const direct = imageUrl(input);
  if (direct) return direct;
  if (Array.isArray(input)) {
    for (const entry of input) {
      const found = searchImage(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(input)) return null;
  for (const key of directImageKeys) {
    const found = searchImage(input[key], depth + 1);
    if (found) return found;
  }
  for (const key of imageContainerKeys) {
    const found = searchImage(input[key], depth + 1);
    if (found) return found;
  }
  return null;
}

export function printfulCatalogImageUrl(snapshot: unknown): string | null {
  if (!isRecord(snapshot)) return null;
  return searchImage(snapshot.product) || searchImage(snapshot.variant) || searchImage(snapshot);
}
