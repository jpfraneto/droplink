import sharp from "sharp";
import type { Drop, Product } from "./types";
import { formatMoney } from "./productCatalog";
import { themeFromDrop } from "./brandTheme";

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

export function ogSvg(drop: Drop, products: Product[]): string {
  const theme = themeFromDrop(drop);
  const cards = products
    .map((product, index) => {
      const x = 82 + index * 350;
      return `<g>
        <rect x="${x}" y="332" width="320" height="210" rx="20" fill="rgba(255,255,255,.07)" stroke="rgba(255,242,213,.26)" stroke-width="2"/>
        <circle cx="${x + 160}" cy="394" r="44" fill="none" stroke="${theme.secondary}" stroke-width="5"/>
        <circle cx="${x + 160}" cy="394" r="20" fill="${theme.primary}"/>
        <text x="${x + 160}" y="472" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="30" fill="#fff2d5">${escapeXml(fit(product.name, 24))}</text>
        <text x="${x + 160}" y="514" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="800" fill="${theme.secondary}">${formatMoney(product.priceCents, product.currency)}</text>
      </g>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="bg" cx="50%" cy="22%" r="76%">
      <stop offset="0" stop-color="${theme.primary}" stop-opacity=".42"/>
      <stop offset=".56" stop-color="${theme.deep}" stop-opacity=".98"/>
      <stop offset="1" stop-color="#020207"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="600" cy="172" r="132" fill="none" stroke="${theme.secondary}" stroke-width="7" opacity=".88"/>
  <circle cx="600" cy="172" r="96" fill="none" stroke="${theme.primary}" stroke-width="2" opacity=".7"/>
  <circle cx="600" cy="172" r="18" fill="${theme.secondary}"/>
  <text x="48" y="66" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="900" fill="#fff2d5">DropLink</text>
  <text x="600" y="224" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="68" fill="#fff2d5">${escapeXml(fit(drop.collectionName, 32))}</text>
  <text x="600" y="278" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="25" fill="rgba(255,242,213,.72)">3 products from this link.</text>
  ${cards}
  <text x="600" y="586" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="rgba(255,242,213,.62)">generated from ${escapeXml(drop.sourceDomain)} by DropLink</text>
</svg>`;
}

export async function ogPng(drop: Drop, products: Product[]): Promise<Buffer> {
  return sharp(Buffer.from(ogSvg(drop, products))).png().toBuffer();
}
