const REPLACEMENTS: Array<[RegExp, string]> = [
  [/\brelics\b/gi, "products"],
  [/\brelic\b/gi, "object"],
  [/\btriptych\b/gi, "set"],
  [/\brituals?\b/gi, "routine"],
  [/\bartifacts\b/gi, "pieces"],
  [/\bartifact\b/gi, "piece"],
  [/\bwitness(?:es)?\b/gi, "signal"],
  [/\bthresholds?\b/gi, "moment"],
  [/\binstruments?\b/gi, "tool"],
  [/\bsovereign\b/gi, "independent"],
  [/\bvoid\b/gi, "space"]
];

function trimSentence(input: string, max: number) {
  const clean = input.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const sentence = clean.slice(0, max).replace(/\s+\S*$/, "").replace(/[,:;.-]$/, "");
  return sentence || clean.slice(0, max).trim();
}

export function publicProductCopy(input: string, options: { maxLength?: number } = {}): string {
  let output = input || "";
  for (const [pattern, replacement] of REPLACEMENTS) output = output.replace(pattern, replacement);
  output = output
    .replace(/\bserves as\b/gi, "is")
    .replace(/\bin the age of\b/gi, "For")
    .replace(/\bautonomous agents\b/gi, "AI systems")
    .replace(/\s+/g, " ")
    .trim();
  return trimSentence(output, options.maxLength || 220);
}
