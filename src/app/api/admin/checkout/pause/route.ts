import { NextResponse } from "next/server";
import { hasGenerationAccess } from "@/lib/adminAuth";
import { checkoutPauseState, setAppSetting } from "@/lib/store";

export async function GET(request: Request) {
  if (!hasGenerationAccess(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return NextResponse.json(await checkoutPauseState());
}

export async function POST(request: Request) {
  if (!hasGenerationAccess(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { paused?: boolean; reason?: string };
  const setting = await setAppSetting("checkout_pause", {
    paused: Boolean(body.paused),
    reason: body.reason || null,
    updatedBy: "admin"
  });
  return NextResponse.json({ paused: Boolean(setting.valueJson.paused), reason: setting.valueJson.reason || null });
}
