import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatMoney } from "@/lib/productCatalog";
import { getScoutProfileByUsername } from "@/lib/store";

export const dynamic = "force-dynamic";

function appBaseUrl() {
  return (process.env.DROPLINK_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://droplink.lat").replace(/\/$/, "");
}

function absoluteUrl(value: string | null | undefined) {
  if (!value) return undefined;
  try {
    return new URL(value, appBaseUrl()).toString();
  } catch {
    return undefined;
  }
}

export async function generateMetadata({ params }: { params: { username: string } }): Promise<Metadata> {
  const profile = await getScoutProfileByUsername(params.username);
  if (!profile) return {};
  const image = absoluteUrl(`/api/og/profile/${encodeURIComponent(profile.user.username)}.png`);
  const title = `@${profile.user.username} on DropLink`;
  const description = `Total Scouted Links: ${profile.totalScouts}. All time earnings: ${formatMoney(profile.allTimeEarningsCents, "usd")} usd.`;
  const url = `${appBaseUrl()}/u/${encodeURIComponent(profile.user.username)}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "profile",
      title,
      description,
      url,
      siteName: "DropLink",
      images: image ? [{ url: image, width: 1200, height: 630, alt: `${profile.user.displayName || `@${profile.user.username}`} on DropLink` }] : undefined
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined
    }
  };
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export default async function ScoutProfilePage({ params }: { params: { username: string } }) {
  const profile = await getScoutProfileByUsername(params.username);
  if (!profile) notFound();
  return (
    <main className="profile-page">
      <header className="profile-topbar">
        <a href="/" aria-label="Back to DropLink">←</a>
        <a className="profile-logout-link" href="/api/auth/logout">logout</a>
      </header>

      <section className="profile-hero">
        {profile.user.avatarUrl ? <img src={profile.user.avatarUrl} alt="" /> : <span className="profile-avatar-fallback" aria-hidden="true" />}
        <div>
          <h1>@{profile.user.username}</h1>
          <p>{profile.user.displayName}</p>
        </div>
      </section>

      <section className="profile-stats" aria-label="Scout stats">
        <div>
          <span>All-time scout earnings</span>
          <strong>{formatMoney(profile.allTimeEarningsCents, "usd")}</strong>
        </div>
        <div>
          <span>Total scouts</span>
          <strong>{profile.totalScouts}</strong>
        </div>
      </section>

      <section className="profile-scouts" aria-label="Scouted DropLinks">
        <h2>Scouted</h2>
        {profile.scouts.length ? (
          profile.scouts.map((scout) => (
            <a className="profile-scout-row" href={`/${scout.slug}`} key={scout.dropId}>
              <span>
                <strong>{scout.domain}</strong>
                <em>{dateLabel(scout.createdAt)} · {scout.status.replace(/_/g, " ")}</em>
              </span>
              <b>{formatMoney(scout.scoutEarningsCents, "usd")}</b>
            </a>
          ))
        ) : (
          <p>No scouted DropLinks yet.</p>
        )}
      </section>
    </main>
  );
}
