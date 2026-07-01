import { NextResponse } from "next/server";
import { profileOgPng } from "@/lib/og";
import { getScoutProfileByUsername } from "@/lib/store";

export async function GET(_request: Request, { params }: { params: { username: string } }) {
  const username = decodeURIComponent(params.username.replace(/\.png$/, ""));
  const profile = await getScoutProfileByUsername(username);
  if (!profile) return NextResponse.json({ error: "Profile OG image not found." }, { status: 404 });
  const png = await profileOgPng(profile);

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=3600"
    }
  });
}
