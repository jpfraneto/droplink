import { NextResponse } from "next/server";
import { createXOAuthStart } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const start = createXOAuthStart(request, url.searchParams.get("returnTo") || "/");
    const response = NextResponse.redirect(start.authorizationUrl);
    response.headers.append("set-cookie", start.cookie);
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start X login." }, { status: 400 });
  }
}
