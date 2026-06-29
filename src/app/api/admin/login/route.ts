import { z } from "zod";
import { adminKeyMatches } from "@/lib/adminAuth";
import { rateLimit, requestIp } from "@/lib/rateLimit";
import { redirectTo } from "@/lib/redirects";

const schema = z.object({ key: z.string().min(1) });

export async function POST(request: Request) {
  if (!rateLimit(`admin-login:${requestIp(request)}`, 8, 60_000)) {
    return redirectTo(request, "/admin?auth=rate_limited");
  }
  const form = await request.formData();
  const parsed = schema.safeParse({ key: String(form.get("key") || "") });
  if (!parsed.success || !adminKeyMatches(parsed.data.key)) {
    return redirectTo(request, "/admin?auth=failed");
  }
  const response = redirectTo(request, "/admin");
  response.cookies.set("droplink_admin", parsed.data.key, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
  return response;
}
