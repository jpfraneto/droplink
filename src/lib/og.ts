import sharp from "sharp";
import { formatMoney } from "./productCatalog";
import type { Brand, Collection, Relic } from "./types";

function escapeXml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fit(input: string, max: number): string {
  return input.length > max ? `${input.slice(0, max - 1)}...` : input;
}

const slots = [
  { left: 64, top: 230, width: 320, height: 250 },
  { left: 440, top: 230, width: 320, height: 250 },
  { left: 816, top: 230, width: 320, height: 250 }
];

export function ogSvg(
  brand: Brand,
  collection: Collection,
  relics: Relic[],
  options: { publicPath?: string } = {}
): string {
  const visible = relics.slice(0, 3);
  const cards = visible
    .map((relic, index) => {
      const slot = slots[index];
      return `<g>
        <rect x="${slot.left}" y="${slot.top}" width="${slot.width}" height="${slot.height}" rx="8" fill="rgba(255,255,255,.42)" stroke="rgba(17,17,17,.24)" stroke-width="2"/>
        <rect x="${slot.left + 20}" y="${slot.top + 18}" width="${slot.width - 40}" height="154" rx="8" fill="rgba(17,17,17,.08)"/>
        <text x="${slot.left + 20}" y="${slot.top + 206}" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="900" fill="#111">${escapeXml(fit(relic.name, 16))}</text>
        <text x="${slot.left + 20}" y="${slot.top + 235}" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="800" fill="#111">${formatMoney(relic.priceCents, relic.currency)}</text>
      </g>`;
    })
    .join("");
  const publicPath = options.publicPath || `droplink.lat/${brand.hostname.replaceAll(".", "")}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#f8f7f1"/>
  <rect width="1200" height="630" fill="rgba(255,255,255,.36)"/>
  <text x="48" y="62" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="900" fill="#111">droplink</text>
  <text x="48" y="134" font-family="Arial, Helvetica, sans-serif" font-size="68" font-weight="900" fill="#111">${escapeXml(fit(collection.title || brand.name, 28))}</text>
  <text x="52" y="178" font-family="Arial, Helvetica, sans-serif" font-size="26" fill="#111">${escapeXml(fit(collection.subtitle || "3 relics. 8 editions each.", 72))}</text>
  ${cards}
  <text x="1152" y="578" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="800" fill="#111">${escapeXml(publicPath)}</text>
</svg>`;
}

async function productComposite(imageUrl: string | null | undefined, index: number) {
  if (!imageUrl) return null;
  const slot = slots[index];
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;
    const input = await sharp(Buffer.from(await response.arrayBuffer()))
      .resize(slot.width - 40, 154, { fit: "cover" })
      .png()
      .toBuffer();
    return { input, left: slot.left + 20, top: slot.top + 18 };
  } catch {
    return null;
  }
}

export async function ogPng(
  brand: Brand,
  collection: Collection,
  relics: Relic[],
  options: { imageUrls?: Array<string | null | undefined>; publicPath?: string } = {}
): Promise<Buffer> {
  const base = await sharp(Buffer.from(ogSvg(brand, collection, relics, options))).png().toBuffer();
  const composites = (
    await Promise.all((options.imageUrls || []).slice(0, 3).map((imageUrl, index) => productComposite(imageUrl, index)))
  ).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  if (!composites.length) return base;
  return sharp(base).composite(composites).png().toBuffer();
}
