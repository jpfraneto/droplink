import { NextResponse } from "next/server";

export function requestBaseUrl(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  if (forwardedHost && !forwardedHost.startsWith("localhost")) {
    return `${forwardedProto}://${forwardedHost}`.replace(/\/$/, "");
  }

  const host = request.headers.get("host");
  if (host && !host.startsWith("localhost")) {
    return `https://${host}`.replace(/\/$/, "");
  }

  return (process.env.DROPLINK_PUBLIC_BASE_URL || process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function redirectTo(request: Request, path: string, status = 303) {
  return NextResponse.redirect(new URL(path, requestBaseUrl(request)), { status });
}
