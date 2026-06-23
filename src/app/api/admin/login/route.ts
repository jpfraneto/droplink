import { z } from "zod";
import { redirectTo } from "@/lib/redirects";

const schema = z.object({ key: z.string().min(1) });

export async function POST(request: Request) {
  const form = await request.formData();
  const parsed = schema.safeParse({ key: String(form.get("key") || "") });
  if (!parsed.success || !process.env.DROPLINK_API_KEY || parsed.data.key !== process.env.DROPLINK_API_KEY) {
    return redirectTo(request, "/admin?auth=failed");
  }
  const response = redirectTo(request, "/admin");
  response.cookies.set("droplink_admin", parsed.data.key, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });
  return response;
}
