export function generationRequiresKey(): boolean {
  return process.env.DROPLINK_REQUIRE_GENERATION_KEY === "true";
}

export function hasGenerationAccess(request: Request): boolean {
  if (!generationRequiresKey()) return true;
  const expected = process.env.DROPLINK_API_KEY;
  if (!expected) return false;

  const auth = request.headers.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const headerKey = request.headers.get("x-droplink-key") || "";
  return bearer === expected || headerKey === expected;
}
