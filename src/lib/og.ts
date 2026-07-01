import sharp from "sharp";
import { formatMoney } from "./productCatalog";
import type { ScoutProfile } from "./store";
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
  const publicPath = options.publicPath || brand.hostname;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#f8f7f1"/>
  <rect width="1200" height="630" fill="rgba(255,255,255,.36)"/>
  <text x="48" y="62" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="900" fill="#111">${escapeXml(fit(brand.name, 30))}</text>
  <text x="48" y="134" font-family="Arial, Helvetica, sans-serif" font-size="68" font-weight="900" fill="#111">${escapeXml(fit(collection.title || brand.name, 28))}</text>
  <text x="52" y="178" font-family="Arial, Helvetica, sans-serif" font-size="26" fill="#111">${escapeXml(fit(collection.subtitle || "a finite brand release", 72))}</text>
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

export function profileOgSvg(profile: ScoutProfile): string {
  const displayName = profile.user.displayName || `@${profile.user.username}`;
  const username = `@${profile.user.username}`;
  const earnings = `${formatMoney(profile.allTimeEarningsCents, "usd")} usd`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#fbfaf7"/>
  <rect x="36" y="36" width="1128" height="558" rx="26" fill="#f8f7f1" stroke="rgba(17,17,17,.18)" stroke-width="2"/>
  <rect x="72" y="72" width="1056" height="486" rx="18" fill="rgba(255,255,255,.54)" stroke="rgba(17,17,17,.08)" stroke-width="1"/>
  <circle cx="274" cy="285" r="142" fill="#efece3" stroke="#111" stroke-width="5"/>
  <circle cx="274" cy="252" r="38" fill="#111" opacity=".92"/>
  <path d="M174 396c20-70 72-106 100-106s80 36 100 106" fill="#111" opacity=".92"/>
  <text x="464" y="204" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="900" fill="#6b665e">DropLink scout</text>
  <text x="464" y="284" font-family="Georgia, 'Times New Roman', serif" font-size="86" font-weight="500" fill="#111">${escapeXml(fit(displayName, 22))}</text>
  <text x="468" y="332" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="900" fill="#4f4d49">${escapeXml(fit(username, 32))}</text>
  <rect x="720" y="370" width="408" height="114" rx="16" fill="rgba(17,17,17,.04)" stroke="rgba(17,17,17,.12)" stroke-width="2"/>
  <text x="1100" y="414" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="900" fill="#111">All time earnings: ${escapeXml(earnings)}</text>
  <text x="1100" y="454" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="900" fill="#111">Total Scouted Links: ${profile.totalScouts}</text>
  <text x="1128" y="520" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="900" fill="#111">droplink.lat</text>
</svg>`;
}

async function avatarComposite(imageUrl: string | null | undefined) {
  if (!imageUrl) return null;
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;
    const avatar = await sharp(Buffer.from(await response.arrayBuffer()))
      .resize(270, 270, { fit: "cover" })
      .removeAlpha()
      .png()
      .toBuffer();
    const mask = await sharp({
      create: {
        width: 270,
        height: 270,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite([
        {
          input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="270" height="270"><circle cx="135" cy="135" r="135" fill="white"/></svg>`),
          blend: "over"
        }
      ])
      .png()
      .toBuffer();
    const input = await sharp(avatar).joinChannel(await sharp(mask).extractChannel("alpha").toBuffer()).png().toBuffer();
    return { input, left: 139, top: 150 };
  } catch {
    return null;
  }
}

export async function profileOgPng(profile: ScoutProfile): Promise<Buffer> {
  const base = await sharp(Buffer.from(profileOgSvg(profile))).png().toBuffer();
  const avatar = await avatarComposite(profile.user.avatarUrl);
  if (!avatar) return base;
  return sharp(base).composite([avatar]).png().toBuffer();
}
