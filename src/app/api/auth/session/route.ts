import { NextResponse } from "next/server";
import { currentUserFromRequest } from "@/lib/auth";

export async function GET(request: Request) {
  const user = await currentUserFromRequest(request);
  return NextResponse.json({
    user: user
      ? {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl || null,
          profileUrl: user.profileUrl
        }
      : null
  });
}
