import { NextResponse } from "next/server";
import { authBaseUrl, authSessionForUser, clearOAuthCookie, finishXOAuth, sessionCookie } from "@/lib/auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const baseUrl = authBaseUrl(request);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  try {
    if (!code || !state) throw new Error("X login callback is missing code or state.");
    const result = await finishXOAuth(request, code, state);
    const response = NextResponse.redirect(new URL(result.returnTo, baseUrl));
    response.headers.append("set-cookie", sessionCookie(authSessionForUser(result.user)));
    response.headers.append("set-cookie", clearOAuthCookie());
    return response;
  } catch (error) {
    const response = NextResponse.redirect(new URL(`/?auth_error=${encodeURIComponent(error instanceof Error ? error.message : "X login failed.")}`, baseUrl));
    response.headers.append("set-cookie", clearOAuthCookie());
    return response;
  }
}
