import type { Drop } from "./types";

function hash(input: string): number {
  let value = 0;
  for (const char of input) value = (value * 33 + char.charCodeAt(0)) % 360;
  return value;
}

export function themeFromDrop(drop: Drop) {
  const hue = hash(`${drop.sourceDomain}:${drop.brandName}`);
  return {
    primary: `hsl(${hue} 82% 62%)`,
    secondary: `hsl(${(hue + 42) % 360} 90% 68%)`,
    accent: `hsl(${(hue + 292) % 360} 88% 62%)`,
    deep: `hsl(${(hue + 226) % 360} 68% 8%)`
  };
}
