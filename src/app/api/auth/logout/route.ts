import { NextResponse } from "next/server";
import { authBaseUrl, clearSessionCookie } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.headers.append("set-cookie", clearSessionCookie());
  return response;
}

export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/", authBaseUrl(request)));
  response.headers.append("set-cookie", clearSessionCookie());
  return response;
}
