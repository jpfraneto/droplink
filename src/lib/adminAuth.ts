import { timingSafeEqual } from "crypto";

export function generationRequiresKey(): boolean {
  return process.env.DROPLINK_REQUIRE_GENERATION_KEY === "true";
}

export function adminKeyMatches(candidate: string | null | undefined): boolean {
  const expected = process.env.DROPLINK_API_KEY;
  if (!expected || !candidate) return false;
  const expectedBuffer = Buffer.from(expected);
  const candidateBuffer = Buffer.from(candidate);
  return expectedBuffer.length === candidateBuffer.length && timingSafeEqual(expectedBuffer, candidateBuffer);
}

export function hasGenerationAccess(request: Request): boolean {
  if (!generationRequiresKey()) return true;

  const auth = request.headers.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const headerKey = request.headers.get("x-droplink-key") || "";
  const cookieKey = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("droplink_admin="))
    ?.split("=")[1];
  return adminKeyMatches(bearer) || adminKeyMatches(headerKey) || adminKeyMatches(cookieKey ? decodeURIComponent(cookieKey) : "");
}
