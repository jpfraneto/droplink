"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { DropProductCard } from "@/components/DropProductCard";
import type { SystemEvent } from "@/lib/types";

export type DroplinkProduct = {
  id: string;
  relicId: string | null;
  kindLabel: "Wear" | "Display" | "Use";
  title: string;
  description: string;
  imageUrl: string;
  price: string;
  remaining: number;
  total: number;
};

export type DroplinkState = "empty" | "processing" | "scouted" | "claimed" | "live" | "sold_out";

export type DroplinkViewModel = {
  slug: string;
  submittedUrl: string;
  domain: string;
  favicon: string | null;
  title: string;
  description: string;
  state: DroplinkState;
  dropId: string | null;
  jobId: string | null;
  traceId: string | null;
  scoutLabel: string | null;
  ownerReceivesAll: boolean;
  potentialEarnings: {
    claimer: string;
    domainOwner: string;
    claimerPercent: string;
    domainOwnerPercent: string;
  } | null;
  products: DroplinkProduct[];
};

type JobPayload = {
  job?: {
    id: string;
    status: string;
    currentStep: string;
    error?: string | null;
  };
  events?: SystemEvent[];
  error?: string;
};

const stepCopy: Record<string, string> = {
  INTAKE_CREATED: "Hermes opened the link.",
  CRAWLING: "Hermes is reading the public site.",
  CRAWLED: "The site has been indexed.",
  DISCOVERING_BRAND: "Agents are finding brand signals.",
  BRAND_DISCOVERED: "Brand signals are assembled.",
  BUILDING_DOSSIER: "Hermes is building the dossier.",
  DOSSIER_READY: "The dossier is ready.",
  DISTILLING: "The brand is being distilled.",
  DISTILLED: "The essence has been distilled.",
  PLANNING_RELICS: "The three relics are being planned.",
  RELICS_PLANNED: "The relic plan is ready.",
  MATCHING_PRINTFUL: "Physical products are being matched.",
  PRINTFUL_MATCHED: "The product base is selected.",
  GENERATING_PRINT_FILES: "Artwork is being prepared.",
  PRINT_FILES_READY: "Print files are ready.",
  VALIDATING_PRINT_FILES: "Artwork is being checked.",
  PRINT_FILES_VALID: "Artwork passed validation.",
  GENERATING_LIFESTYLE_IMAGES: "Product imagery is being composed.",
  LIFESTYLE_IMAGES_READY: "Product imagery is ready.",
  GENERATING_MOCKUPS: "Mockups are being prepared.",
  MOCKUPS_READY: "Mockups are ready.",
  GENERATING_OG: "The share image is being composed.",
  OG_READY: "The share image is ready.",
  AWAITING_MANUAL_IMAGES: "Waiting for final image review.",
  READY_FOR_REVIEW: "The droplink is ready.",
  PUBLISHED: "The droplink is active.",
  FAILED: "Generation failed."
};

function shortEvent(event: SystemEvent) {
  return event.message || stepCopy[event.eventType] || event.eventType.replace(/_/g, " ");
}

function time(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function DroplinkExperience({ initial }: { initial: DroplinkViewModel }) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [busy, setBusy] = useState(initial.state === "processing");
  const [drawerOpen, setDrawerOpen] = useState(initial.state === "processing");
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [currentStep, setCurrentStep] = useState("INTAKE_CREATED");
  const [error, setError] = useState<string | null>(null);
  const [notifyProduct, setNotifyProduct] = useState<DroplinkProduct | null>(null);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifyStatus, setNotifyStatus] = useState<string | null>(null);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const eventFeedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setView(initial);
    setBusy(initial.state === "processing");
    if (initial.state === "processing") setDrawerOpen(true);
  }, [initial]);

  useEffect(() => {
    if (!view.jobId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      let keepPolling = true;
      try {
        const response = await fetch(`/api/jobs/${view.jobId}`, { cache: "no-store" });
        const data = (await response.json()) as JobPayload;
        if (!response.ok) throw new Error(data.error || "Could not load generation status.");
        if (cancelled) return;
        setCurrentStep(data.job?.currentStep || "INTAKE_CREATED");
        setEvents(data.events || []);
        setBusy(data.job?.status !== "completed" && data.job?.status !== "failed");
        if (data.job?.status === "completed") {
          keepPolling = false;
          setDrawerOpen(false);
          router.refresh();
          return;
        }
        if (data.job?.status === "failed") {
          keepPolling = false;
          setError(data.job.error || "Generation failed.");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load generation status.");
      } finally {
        if (!cancelled && keepPolling) timer = setTimeout(poll, 1800);
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [router, view.jobId]);

  useEffect(() => {
    if (!drawerOpen || !eventFeedRef.current) return;
    eventFeedRef.current.scrollTop = eventFeedRef.current.scrollHeight;
  }, [drawerOpen, events, currentStep]);

  async function summon() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/droplinks/summon", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ submittedUrl: view.submittedUrl })
      });
      const data = (await response.json()) as { existing?: boolean; jobId?: string; slug?: string; traceId?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "Could not scout this DropLink.");
      if (data.existing && data.slug) {
        router.replace(`/${data.slug}`);
        return;
      }
      if (!data.jobId) throw new Error(data.error || "Could not scout this DropLink.");
      setCurrentStep("INTAKE_CREATED");
      setEvents([]);
      setDrawerOpen(true);
      setView((current) => ({ ...current, state: "processing", jobId: data.jobId || null, traceId: data.traceId || current.traceId }));
      if (data.slug && data.slug !== view.slug) router.replace(`/${data.slug}`);
    } catch (err) {
      setBusy(false);
      setView((current) => ({ ...current, state: "empty" }));
      setError(err instanceof Error ? err.message : "Could not scout this DropLink.");
    }
  }

  async function scoutWithStripe() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/droplinks/scout/stripe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ submittedUrl: view.submittedUrl })
      });
      const data = (await response.json()) as { existing?: boolean; free?: boolean; jobId?: string; traceId?: string; slug?: string; url?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "Could not start Stripe scouting checkout.");
      if (data.existing && data.slug) {
        router.replace(`/${data.slug}`);
        return;
      }
      if (data.free && data.jobId) {
        setCurrentStep("INTAKE_CREATED");
        setEvents([]);
        setDrawerOpen(true);
        setView((current) => ({ ...current, state: "processing", jobId: data.jobId || null, traceId: data.traceId || current.traceId }));
        if (data.slug && data.slug !== view.slug) router.replace(`/${data.slug}`);
        return;
      }
      if (!data.url) throw new Error("Stripe did not return a checkout URL.");
      window.location.href = data.url;
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Could not start Stripe scouting checkout.");
    }
  }

  async function startClaim() {
    if (!view.dropId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/droplinks/${view.dropId}/claim/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      });
      const data = (await response.json()) as { claim?: { id: string }; error?: string };
      if (!response.ok || !data.claim?.id) throw new Error(data.error || "Could not start claim.");
      window.location.href = `/claim/${data.claim.id}`;
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Could not start claim.");
    }
  }

  async function shareDrop() {
    const shareUrl = window.location.href;
    const text = `${view.domain} has a DropLink preview.`;
    if (navigator.share) {
      await navigator.share({ title: `DropLink for ${view.domain}`, text, url: shareUrl }).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(`${text} ${shareUrl}`).catch(() => undefined);
  }

  async function saveNotification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!notifyProduct || !view.dropId || notifyBusy) return;
    setNotifyBusy(true);
    setNotifyStatus(null);
    try {
      const response = await fetch(`/api/droplinks/${view.dropId}/notifications`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ relicId: notifyProduct.relicId, email: notifyEmail })
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not save notification.");
      setNotifyStatus("Saved. We will email you when this DropLink goes live.");
      setNotifyEmail("");
    } catch (err) {
      setNotifyStatus(err instanceof Error ? err.message : "Could not save notification.");
    } finally {
      setNotifyBusy(false);
    }
  }

  const showSkeleton = view.state === "processing";
  const showProducts = view.state !== "empty" && !showSkeleton;
  const canBuy = view.state === "live";
  const showHeroDomain = view.state === "empty" || showSkeleton;
  const showPotentialEarnings = Boolean(view.potentialEarnings && view.state !== "empty" && !showSkeleton);

  return (
    <main className="brand-drop-page">
      <div className="brand-drop-shell app-drop-shell">
        <header className={`brand-drop-appbar app-dropbar${showPotentialEarnings ? " has-earnings" : ""}`}>
          <a className="brand-drop-back" href="/" aria-label="Back to DropLink">
            ←
          </a>
          <span>DropLink</span>
          <a className="appbar-domain" href={view.submittedUrl} target="_blank" rel="noreferrer">
            {view.favicon ? <img src={view.favicon} alt="" /> : <span className="fallback-logo" aria-hidden="true" />}
            <span>{view.domain}</span>
          </a>
          <div className="appbar-actions">
            {busy || view.state === "processing" ? (
              <button className={`drop-spinner${busy ? " is-spinning" : ""}`} type="button" onClick={() => setDrawerOpen(true)} aria-label="Open distillation log" />
            ) : null}
            {view.state !== "empty" && view.state !== "processing" ? (
              <>
                <button className="icon-action" type="button" onClick={shareDrop} aria-label="Share this DropLink">
                  ↗
                </button>
                <a className="icon-action" href={`/${view.slug}/admin`} aria-label="Open admin page">
                  ⚙
                </a>
              </>
            ) : null}
            {showPotentialEarnings && view.potentialEarnings ? (
              <aside className="appbar-earnings" aria-label="Potential earnings">
                <span className="appbar-earnings-label">Potential</span>
                <span>
                  <em>Claimer {view.potentialEarnings.claimerPercent}</em>
                  <strong>{view.potentialEarnings.claimer}</strong>
                </span>
                <span>
                  <em>Owner {view.potentialEarnings.domainOwnerPercent}</em>
                  <strong>{view.potentialEarnings.domainOwner}</strong>
                </span>
              </aside>
            ) : null}
          </div>
        </header>

        <section className="brand-drop-hero app-drop-hero" aria-label={`${view.domain} droplink`}>
          {showHeroDomain ? (
            <div className="domain-row">
              {view.favicon ? <img className="brand-drop-logo" src={view.favicon} alt="" /> : <span className="brand-drop-logo fallback-logo" aria-hidden="true" />}
              <a className="brand-drop-domain" href={view.submittedUrl} target="_blank" rel="noreferrer">
                {view.domain}
              </a>
            </div>
          ) : null}
          {showSkeleton ? (
            <div className="copy-skeleton">
              <span />
              <span />
              <span />
            </div>
          ) : (
            <>
              <h1 className={view.state === "empty" ? "pending-copy" : undefined}>{view.title}</h1>
              <p className={view.state === "empty" ? "pending-copy pending-copy-small" : undefined}>{view.description}</p>
              {view.state === "scouted" ? (
                <div className="drop-status-copy">
                  <strong>Scouted by {view.scoutLabel || "anonymous scout"}</strong>
                  <span>
                    Owner of this domain?{" "}
                    <button type="button" onClick={startClaim} disabled={!view.dropId || busy}>
                      Claim this DropLink
                    </button>
                  </span>
                </div>
              ) : null}
              {view.state === "claimed" ? (
                <div className="drop-status-copy">
                  <strong>Claimed</strong>
                  <span>
                    Products go live after owner activation is complete. {view.ownerReceivesAll ? "Owner receives 100% because the owner scouted this DropLink." : "When live, owner receives 92% and scout receives 8%."}
                  </span>
                </div>
              ) : null}
            </>
          )}
        </section>

        {view.state === "empty" ? (
          <section className="claim-creation-panel">
            <p>Scout this DropLink</p>
            <span>Create the preview for {view.domain}. If the owner claims it later via DNS records, you get 8% of the revenue from the sale of the 24 pieces. They get 92% of it.</span>
            <button type="button" onClick={summon} disabled={busy}>
              Scout this drop - 8 USDC via x402
            </button>
            <button className="stripe-scout-link" type="button" onClick={scoutWithStripe} disabled={busy}>
              or pay via Stripe
            </button>
            {error ? <small>{error}</small> : null}
          </section>
        ) : null}

        {showSkeleton ? (
          <section className="simple-products" aria-label="Products loading">
            {[0, 1, 2].map((index) => (
              <article className="simple-product product-loading" key={index}>
                <div className="simple-product-copy">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="simple-product-image" />
              </article>
            ))}
          </section>
        ) : null}

        {showProducts ? (
          <section className="simple-products" aria-label="Products">
            {view.products.map((product) => (
              <DropProductCard
                key={product.id}
                dropId={view.dropId}
                relicId={product.relicId}
                imageUrl={product.imageUrl}
                kindLabel={product.kindLabel}
                title={product.title}
                description={product.description}
                price={product.price}
                remaining={product.remaining}
                total={product.total}
                commerceEnabled={canBuy}
                onPreviewClick={() => {
                  setNotifyProduct(product);
                  setNotifyStatus(null);
                }}
              />
            ))}
          </section>
        ) : null}

        {error && view.state !== "empty" ? <p className="drop-error">{error}</p> : null}
        {view.state !== "processing" ? (
          <footer className="app-drop-footer">
            <a href="/terms">terms and conditions</a>
            <a href="/about">about</a>
            <a href="https://x.com/jpfraneto" target="_blank" rel="noreferrer">contact</a>
          </footer>
        ) : null}
      </div>

      {drawerOpen ? (
        <div className="distill-overlay" role="dialog" aria-modal="true" aria-label="Distillation log">
          <button className="distill-scrim" type="button" onClick={() => setDrawerOpen(false)} aria-label="Close distillation log" />
          <section className="distill-drawer">
            <header>
              <div>
                <strong>{stepCopy[currentStep] || currentStep}</strong>
                <span>{view.domain}</span>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)}>Close</button>
            </header>
            <div className="distill-events" ref={eventFeedRef}>
              {events.length ? (
                events.slice().reverse().map((event) => (
                  <article key={event.id}>
                    <time>{time(event.createdAt)}</time>
                    <p>{shortEvent(event)}</p>
                  </article>
                ))
              ) : (
                <>
                  <article>
                    <time>now</time>
                    <p>Hermes agents are preparing the first distillation step.</p>
                  </article>
                  <article className="live-agent-row">
                    <time />
                    <p>Watching the queue for crawler, brand, product, and image responses.</p>
                  </article>
                </>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {notifyProduct ? (
        <div className="distill-overlay notify-overlay" role="dialog" aria-modal="true" aria-label="Product availability notification">
          <button className="distill-scrim" type="button" onClick={() => setNotifyProduct(null)} aria-label="Close notification modal" />
          <section className="notify-modal">
            <header>
              <h2>{notifyProduct.title}</h2>
              <button type="button" onClick={() => setNotifyProduct(null)} aria-label="Close notification modal">Close</button>
            </header>
            <p>You will be able to buy this item once the owner claims it. Add your email here to get a notification when it goes live.</p>
            <form onSubmit={saveNotification}>
              <input
                value={notifyEmail}
                onChange={(event) => setNotifyEmail(event.target.value)}
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
              <button type="submit" disabled={notifyBusy}>
                {notifyBusy ? "Saving" : "Notify me"}
              </button>
            </form>
            <a href="https://x.com/jpfraneto" target="_blank" rel="noreferrer">Follow @jpfraneto on X for DropLink updates</a>
            {notifyStatus ? <small>{notifyStatus}</small> : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}
