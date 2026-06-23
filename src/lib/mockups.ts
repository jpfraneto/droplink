import type { Brand, Relic } from "./types";

function escapeXml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function hueFrom(input: string): number {
  let hash = 0;
  for (const char of input) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

export function relicMockupSvg(brand: Brand, relic: Relic): string {
  const hue = hueFrom(`${brand.name}:${relic.name}`);
  const accent = `hsl(${hue} 88% 62%)`;
  const gold = `hsl(${(hue + 58) % 360} 86% 74%)`;
  const deep = `hsl(${(hue + 226) % 360} 70% 8%)`;
  const name = escapeXml(relic.name);
  const family = escapeXml(relic.productFamily.toUpperCase());
  const brandName = escapeXml(brand.name);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900">
  <defs>
    <radialGradient id="glow" cx="50%" cy="34%" r="68%">
      <stop offset="0" stop-color="${accent}" stop-opacity=".48"/>
      <stop offset=".52" stop-color="${deep}" stop-opacity=".96"/>
      <stop offset="1" stop-color="#020207"/>
    </radialGradient>
    <linearGradient id="object" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#232339"/>
      <stop offset="1" stop-color="#06060d"/>
    </linearGradient>
  </defs>
  <rect width="900" height="900" fill="url(#glow)"/>
  <circle cx="450" cy="318" r="188" fill="none" stroke="${gold}" stroke-width="7" opacity=".9"/>
  <circle cx="450" cy="318" r="148" fill="none" stroke="${accent}" stroke-width="2" opacity=".65"/>
  <rect x="260" y="278" width="380" height="330" rx="34" fill="url(#object)" stroke="rgba(255,255,255,.52)" stroke-width="5"/>
  <circle cx="450" cy="424" r="68" fill="none" stroke="${gold}" stroke-width="5"/>
  <circle cx="450" cy="424" r="34" fill="${accent}"/>
  <text x="450" y="656" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="36" fill="#fff2d5">${name}</text>
  <text x="450" y="712" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="800" fill="${gold}">${brandName} / ${family}</text>
  <text x="450" y="792" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" fill="rgba(255,242,213,.58)">1 of 8 units · DropLink product</text>
</svg>`;
}
