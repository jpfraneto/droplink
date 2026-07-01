import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { upsertAppUser, getAppUserById } from "./store";
import type { AppUser } from "./types";

export type AuthSession = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
};

type OAuthState = {
  state: string;
  codeVerifier: string;
  returnTo: string;
  expiresAt: number;
};

type SignedPayload<T> = {
  data: T;
  exp: number;
};

const sessionCookieName = "droplink_session";
const oauthCookieName = "droplink_x_oauth";
const sessionMaxAge = 60 * 60 * 24 * 30;
const oauthMaxAge = 60 * 10;

function base64Url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function authSecret() {
  const secret = process.env.AUTH_SECRET || process.env.DROPLINK_AUTH_SECRET || process.env.X_AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is required for X login sessions.");
  return "dev-only-droplink-auth-secret";
}

function sign(value: string) {
  return createHmac("sha256", authSecret()).update(value).digest("base64url");
}

function encodeSigned<T>(data: T, maxAgeSeconds: number) {
  const payload = base64Url(JSON.stringify({ data, exp: Date.now() + maxAgeSeconds * 1000 } satisfies SignedPayload<T>));
  return `${payload}.${sign(payload)}`;
}

function decodeSigned<T>(value?: string | null): T | null {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SignedPayload<T>;
    if (!parsed || typeof parsed.exp !== "number" || parsed.exp < Date.now()) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function cookieOptions(maxAge: number) {
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export function sessionCookie(session: AuthSession) {
  return `${sessionCookieName}=${encodeSigned(session, sessionMaxAge)}; ${cookieOptions(sessionMaxAge)}`;
}

export function clearSessionCookie() {
  return `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export function oauthCookie(state: OAuthState) {
  return `${oauthCookieName}=${encodeSigned(state, oauthMaxAge)}; ${cookieOptions(oauthMaxAge)}`;
}

export function clearOAuthCookie() {
  return `${oauthCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

function parseCookieHeader(header: string | null) {
  const values = new Map<string, string>();
  for (const part of (header || "").split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    values.set(part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim()));
  }
  return values;
}

export function sessionFromRequest(request: Request): AuthSession | null {
  return decodeSigned<AuthSession>(parseCookieHeader(request.headers.get("cookie")).get(sessionCookieName));
}

export function oauthStateFromRequest(request: Request): OAuthState | null {
  return decodeSigned<OAuthState>(parseCookieHeader(request.headers.get("cookie")).get(oauthCookieName));
}

export async function currentUserFromRequest(request: Request): Promise<AppUser | null> {
  const session = sessionFromRequest(request);
  return session ? getAppUserById(session.userId) : null;
}

export async function currentUser(): Promise<AppUser | null> {
  const session = decodeSigned<AuthSession>(cookies().get(sessionCookieName)?.value);
  return session ? getAppUserById(session.userId) : null;
}

export function authSessionForUser(user: AppUser): AuthSession {
  return {
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl || null
  };
}

export function authBaseUrl(request: Request) {
  const configured = process.env.DROPLINK_PUBLIC_BASE_URL || process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost) return `${forwardedProto || "https"}://${forwardedHost}`;
  return new URL(request.url).origin;
}

export function xRedirectUri(request: Request) {
  return process.env.X_REDIRECT_URI || `${authBaseUrl(request)}/api/auth/x/callback`;
}

export function createXOAuthStart(request: Request, returnTo: string) {
  const clientId = process.env.X_CLIENT_ID;
  if (!clientId) throw new Error("X_CLIENT_ID is required for X login.");
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest();
  const challenge = Buffer.from(codeChallenge).toString("base64url");
  const state = randomBytes(24).toString("base64url");
  const scopes = process.env.X_OAUTH_SCOPES || "users.read tweet.read";
  const authorizationUrl = new URL("https://twitter.com/i/oauth2/authorize");
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("redirect_uri", xRedirectUri(request));
  authorizationUrl.searchParams.set("scope", scopes);
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("code_challenge", challenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");
  return {
    authorizationUrl,
    cookie: oauthCookie({
      state,
      codeVerifier,
      returnTo: safeReturnTo(returnTo),
      expiresAt: Date.now() + oauthMaxAge * 1000
    })
  };
}

function safeReturnTo(value: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

type XUserResponse = {
  data?: {
    id?: string;
    username?: string;
    name?: string;
    profile_image_url?: string;
  };
};

export async function finishXOAuth(request: Request, code: string, state: string): Promise<{ user: AppUser; returnTo: string }> {
  const stored = oauthStateFromRequest(request);
  if (!stored || stored.expiresAt < Date.now() || stored.state !== state) throw new Error("X login state expired. Try logging in again.");
  const clientId = process.env.X_CLIENT_ID;
  if (!clientId) throw new Error("X_CLIENT_ID is required for X login.");
  const clientSecret = process.env.X_CLIENT_SECRET;
  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: xRedirectUri(request),
    code_verifier: stored.codeVerifier
  });
  if (!clientSecret) tokenBody.set("client_id", clientId);
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (clientSecret) headers.authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  const tokenResponse = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers,
    body: tokenBody.toString()
  });
  const tokenJson = (await tokenResponse.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
  if (!tokenResponse.ok || !tokenJson.access_token) {
    throw new Error(tokenJson.error_description || tokenJson.error || "X did not return an access token.");
  }
  const userResponse = await fetch("https://api.twitter.com/2/users/me?user.fields=profile_image_url", {
    headers: { authorization: `Bearer ${tokenJson.access_token}` },
    cache: "no-store"
  });
  const userJson = (await userResponse.json().catch(() => ({}))) as XUserResponse;
  const xUser = userJson.data;
  if (!userResponse.ok || !xUser?.id || !xUser.username) throw new Error("X did not return a usable user profile.");
  const user = await upsertAppUser({
    xId: xUser.id,
    username: xUser.username,
    displayName: xUser.name || xUser.username,
    avatarUrl: xUser.profile_image_url || null
  });
  return { user, returnTo: safeReturnTo(stored.returnTo) };
}
