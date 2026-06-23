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

function hueFrom(input: string): number {
  let hash = 0;
  for (const char of input) hash = (hash * 29 + char.charCodeAt(0)) % 360;
  return hash;
}

export function ogSvg(brand: Brand, collection: Collection, relics: Relic[]): string {
  const hue = hueFrom(`${brand.hostname}:${collection.title}`);
  const primary = `hsl(${hue} 88% 62%)`;
  const secondary = `hsl(${(hue + 52) % 360} 86% 74%)`;
  const deep = `hsl(${(hue + 216) % 360} 72% 8%)`;
  const visible = relics.slice(0, 3);
  const cards = visible
    .map((relic, index) => {
      const x = 82 + index * 350;
      return `<g>
        <rect x="${x}" y="330" width="320" height="214" rx="18" fill="rgba(255,255,255,.07)" stroke="rgba(255,242,213,.26)" stroke-width="2"/>
        <circle cx="${x + 160}" cy="392" r="44" fill="none" stroke="${secondary}" stroke-width="5"/>
        <circle cx="${x + 160}" cy="392" r="20" fill="${primary}"/>
        <text x="${x + 160}" y="470" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="29" fill="#fff2d5">${escapeXml(fit(relic.name, 23))}</text>
        <text x="${x + 160}" y="512" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="23" font-weight="800" fill="${secondary}">${formatMoney(relic.priceCents, relic.currency)}</text>
      </g>`;
    })
    .join("");
  const scarcity = collection.type === "weekly" ? "8 products · 8 units each" : "3 unique products · 8 units each";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="bg" cx="50%" cy="22%" r="76%">
      <stop offset="0" stop-color="${primary}" stop-opacity=".42"/>
      <stop offset=".56" stop-color="${deep}" stop-opacity=".98"/>
      <stop offset="1" stop-color="#020207"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <text x="48" y="66" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="900" fill="#fff2d5">DropLink</text>
  <text x="1152" y="66" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="800" fill="${secondary}">${escapeXml(scarcity)}</text>
  <circle cx="600" cy="168" r="128" fill="none" stroke="${secondary}" stroke-width="7" opacity=".88"/>
  <circle cx="600" cy="168" r="92" fill="none" stroke="${primary}" stroke-width="2" opacity=".7"/>
  <circle cx="600" cy="168" r="18" fill="${secondary}"/>
  <text x="600" y="220" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="66" fill="#fff2d5">${escapeXml(fit(collection.title, 34))}</text>
  <text x="600" y="276" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="25" fill="rgba(255,242,213,.72)">${escapeXml(fit(collection.subtitle, 64))}</text>
  ${cards}
  <text x="600" y="586" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="rgba(255,242,213,.62)">generated from ${escapeXml(brand.hostname)} by DropLink</text>
</svg>`;
}

export async function ogPng(brand: Brand, collection: Collection, relics: Relic[]): Promise<Buffer> {
  return sharp(Buffer.from(ogSvg(brand, collection, relics))).png().toBuffer();
}
