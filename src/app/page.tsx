import type { Metadata } from "next";
import { LandingFlow } from "@/components/LandingFlow";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const title = "Create a DropLink";
const description = "Turn a public URL into a finite merch drop preview and invite the domain owner to claim it.";
const ogImage = {
  url: "/OG_IMAGE.png",
  width: 1731,
  height: 909,
  alt: "Create a DropLink"
};

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "DropLink",
    title,
    description,
    url: "/",
    images: [ogImage]
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [ogImage.url]
  }
};

export default async function HomePage() {
  const user = await currentUser();
  return (
    <LandingFlow
      user={
        user
          ? {
              username: user.username,
              avatarUrl: user.avatarUrl || null
            }
          : null
      }
    />
  );
}
