"use client";

import { useEffect, useMemo, useState } from "react";
import type { Asset, GenerationJob, StorefrontBundle, SystemEvent } from "@/lib/types";

type ReferenceImage = {
  url: string;
  title: string;
  shortDescription: string;
};

type LivePayload = {
  now: string;
  job: GenerationJob | null;
  traceId: string | null;
  bundle: StorefrontBundle | null;
  readiness: { ready: boolean; blockers: string[]; checklist: Record<string, boolean> } | null;
  events: SystemEvent[];
  error?: string;
};

const pipelineSteps = [
  { key: "crawl", label: "Read the brand", done: (payload: LivePayload) => Boolean(payload.bundle?.brandStudy || stepAtLeast(payload, "DISTILLED")) },
  { key: "plan", label: "Plan the 3 products", done: (payload: LivePayload) => Boolean(payload.bundle?.relicPlan || stepAtLeast(payload, "RELICS_PLANNED")) },
  {
    key: "printful",
    label: "Choose Printful products",
    done: (payload: LivePayload) =>
      Boolean(payload.bundle?.relics.length && payload.bundle.relics.every((relic) => relic.printfulProductId && relic.printfulVariantId))
  },
  { key: "images", label: "Create/upload images", done: (payload: LivePayload) => productImagesReady(payload.bundle) && ogReady(payload.bundle) },
  { key: "review", label: "Review and publish", done: (payload: LivePayload) => Boolean(payload.bundle?.storefront.status === "published") }
];

const stepOrder = [
  "INTAKE_CREATED",
  "CRAWLING",
  "CRAWLED",
  "DISTILLING",
  "DISTILLED",
  "PLANNING_RELICS",
  "RELICS_PLANNED",
  "MATCHING_PRINTFUL",
  "PRINTFUL_MATCHED",
  "GENERATING_PRINT_FILES",
  "PRINT_FILES_READY",
  "AWAITING_MANUAL_IMAGES",
  "PRINT_FILES_VALID",
  "MOCKUPS_READY",
  "GENERATING_OG",
  "OG_READY",
  "READY_FOR_REVIEW",
  "PUBLISHED"
];

function stepAtLeast(payload: LivePayload, step: string) {
  const current = payload.job?.currentStep || payload.bundle?.storefront.generationStatus || "INTAKE_CREATED";
  return stepOrder.indexOf(current) >= stepOrder.indexOf(step);
}

function time(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function assetFor(bundle: StorefrontBundle | null, relicId: string, type: Asset["type"]) {
  return bundle?.assets.find((asset) => asset.relicId === relicId && asset.type === type) || null;
}

function imageUrl(value: unknown) {
  return typeof value === "string" && /^https?:\/\//i.test(value) ? value : null;
}

function productReferenceImages(asset: Asset | null): ReferenceImage[] {
  const metadata = asset?.metadataJson || {};
  const refs: ReferenceImage[] = [];
  const sourceOgImage = imageUrl(metadata.sourceOgImage);
  const sourceFavicon = imageUrl(metadata.sourceFavicon);
  if (sourceOgImage) {
    refs.push({
      url: sourceOgImage,
      title: "Brand source image",
      shortDescription: "The source page's Open Graph image. Use it as loose brand context, not as something to copy exactly."
    });
  }
  if (sourceFavicon) {
    refs.push({
      url: sourceFavicon,
      title: "Favicon",
      shortDescription: "A tiny identity signal from the source site. Useful for palette and shape hints only."
    });
  }
  return refs;
}

function ogReferenceImages(bundle: StorefrontBundle): ReferenceImage[] {
  return bundle.relics
    .map((relic) => {
      const preview = assetFor(bundle, relic.id, "preview");
      if (!preview || preview.validationStatus !== "valid") return null;
      return {
        url: preview.url,
        title: `${relic.relicIndex}. ${relic.name}`,
        shortDescription: relic.description
      };
    })
    .filter((entry): entry is ReferenceImage => Boolean(entry));
}

function productImagesReady(bundle: StorefrontBundle | null) {
  return Boolean(
    bundle?.relics.length &&
      bundle.relics.every((relic) =>
        bundle.assets.some((asset) => asset.relicId === relic.id && asset.type === "print_file" && asset.validationStatus === "valid")
      )
  );
}

function ogReady(bundle: StorefrontBundle | null) {
  return Boolean(bundle?.ogImage?.status === "ready");
}

function nextAction(payload: LivePayload | null) {
  if (!payload) return { title: "Loading pipeline", body: "Fetching the current generation state." };
  if (payload.error) return { title: "Admin state failed", body: payload.error };
  if (payload.job?.status === "failed") return { title: "Generation failed", body: payload.job.error || "Open the event log below for details." };
  if (!payload.bundle) return { title: "No action needed", body: "The worker is creating the DropLink record. This page will update automatically." };
  if (!payload.bundle.brandStudy) return { title: "No action needed", body: "DropLink is reading the site and distilling the brand." };
  if (!payload.bundle.relicPlan) return { title: "No action needed", body: "DropLink is choosing the 3 product concepts." };
  if (!payload.bundle.relics.length) return { title: "No action needed", body: "DropLink is matching the plan to Printful products." };
  if (!productImagesReady(payload.bundle)) return { title: "Action needed: upload product images", body: "Use the prompts below in ChatGPT, then upload one image for each product." };
  if (!ogReady(payload.bundle)) return { title: "Action needed: upload the OG image", body: "Use the OG prompt and the three product images as references, then upload the final share image." };
  if (!payload.readiness?.ready) {
    return {
      title: "Blocked before publish",
      body: `Images are ready. Resolve these blockers: ${(payload.readiness?.blockers || []).join(", ")}.`
    };
  }
  if (payload.bundle.storefront.status !== "published") return { title: "Ready to publish", body: "Review the storefront. If it looks good, publish it." };
  return { title: "Published", body: "This DropLink is live." };
}

export function AdminDropWorkflow({
  brandSlug,
  storefrontId,
  jobId
}: {
  brandSlug: string;
  storefrontId?: string | null;
  jobId?: string | null;
}) {
  const [payload, setPayload] = useState<LivePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (jobId) params.set("jobId", jobId);
    if (storefrontId) params.set("storefrontId", storefrontId);
    return params.toString();
  }, [jobId, storefrontId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function load() {
      try {
        const response = await fetch(`/api/admin/live${query ? `?${query}` : ""}`, { cache: "no-store" });
        const data = (await response.json()) as LivePayload;
        if (!response.ok) throw new Error(data.error || "Could not load DropLink workflow.");
        if (!cancelled) {
          setPayload(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load DropLink workflow.");
      } finally {
        if (!cancelled) timer = setTimeout(load, 2500);
      }
    }
    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [query]);

  const bundle = payload?.bundle || null;
  const action = nextAction(error ? { ...(payload || emptyPayload()), error } : payload);
  const recentEvents = payload?.events.slice(0, 12) || [];

  return (
    <div className="workflow-page">
      <section className={`workflow-action ${action.title.startsWith("Action needed") ? "needs-action" : ""}`}>
        <span>{bundle?.brand.name || brandSlug}</span>
        <h1>{action.title}</h1>
        <p>{action.body}</p>
        <div className="workflow-actions">
          {bundle ? (
            <a className="btn secondary" href={`/${bundle.storefront.slug}`} target="_blank" rel="noreferrer">
              preview storefront
            </a>
          ) : null}
          {bundle?.drop && payload?.readiness?.ready && bundle.storefront.status !== "published" ? (
            <form action={`/api/admin/droplinks/${bundle.drop.id}/publish`} method="post">
              <button className="btn accent" type="submit">
                publish
              </button>
            </form>
          ) : null}
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-actions">
          <div>
            <h2>Pipeline</h2>
            <p className="muted">{payload?.traceId || "waiting for trace"} {payload?.job ? `· ${payload.job.status}` : ""}</p>
          </div>
          <span className={`live-dot ${payload?.job?.status || "queued"}`}>{payload?.job?.currentStep || bundle?.storefront.generationStatus || "waiting"}</span>
        </div>
        <div className="workflow-steps">
          {pipelineSteps.map((step, index) => {
            const done = payload ? step.done(payload) : false;
            const active = !done && pipelineSteps.slice(0, index).every((entry) => (payload ? entry.done(payload) : false));
            return (
              <div className={`workflow-step ${done ? "done" : active ? "active" : ""}`} key={step.key}>
                <strong>{index + 1}</strong>
                <span>{step.label}</span>
                <small>{done ? "done" : active ? "in progress" : "waiting"}</small>
              </div>
            );
          })}
        </div>
      </section>

      {bundle?.drop ? <ManualImageSection bundle={bundle} /> : null}

      {bundle ? (
        <section className="admin-panel">
          <div className="admin-actions">
            <div>
              <h2>Publish readiness</h2>
              <p className="muted">{payload?.readiness?.ready ? "No blockers remain." : "Only the blockers below matter right now."}</p>
            </div>
          </div>
          <div className="workflow-blockers">
            {(payload?.readiness?.blockers || []).map((blocker) => (
              <span key={blocker}>{humanBlocker(blocker)}</span>
            ))}
            {payload?.readiness?.ready ? <strong>ready</strong> : null}
          </div>
        </section>
      ) : null}

      <section className="admin-panel">
        <h2>Recent story</h2>
        <div className="workflow-events">
          {recentEvents.map((event) => (
            <div className={`workflow-event ${event.level}`} key={event.id}>
              <time>{time(event.createdAt)}</time>
              <strong>{event.message}</strong>
              <span>{event.eventType}</span>
            </div>
          ))}
          {!recentEvents.length ? <p className="muted">Waiting for the first pipeline event.</p> : null}
        </div>
      </section>
    </div>
  );
}

function CopyPromptButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn secondary compact"
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      }}
    >
      {copied ? "copied" : "copy prompt"}
    </button>
  );
}

function ReferenceImages({ references }: { references: ReferenceImage[] }) {
  return (
    <div className="reference-block">
      <h4>Reference images</h4>
      {references.length ? (
        <div className="reference-grid">
          {references.map((reference) => (
            <a className="reference-card" href={reference.url} target="_blank" rel="noreferrer" key={reference.url}>
              <img src={reference.url} alt={reference.title} />
              <strong>{reference.title}</strong>
              <span>{reference.shortDescription}</span>
            </a>
          ))}
        </div>
      ) : (
        <p className="muted">No reference images were captured for this prompt. Use only the written brand study and product direction.</p>
      )}
    </div>
  );
}

function ManualImageSection({ bundle }: { bundle: StorefrontBundle }) {
  const pendingProducts = !productImagesReady(bundle);
  const pendingOg = productImagesReady(bundle) && !ogReady(bundle);
  if (!pendingProducts && !pendingOg) {
    return (
      <section className="admin-panel">
        <h2>Images</h2>
        <p className="success-note">Product images and OG image are uploaded.</p>
      </section>
    );
  }

  return (
    <section className="admin-panel">
      <div className="admin-actions">
        <div>
          <h2>{pendingProducts ? "Upload product images" : "Upload OG image"}</h2>
          <p className="muted">
            {pendingProducts
              ? "Copy each prompt into ChatGPT, generate one image, then upload it here."
              : "Use the three uploaded product images as references for the final share image."}
          </p>
        </div>
      </div>
      <div className="manual-image-grid">
        {bundle.relics.map((relic) => {
          const printAsset = assetFor(bundle, relic.id, "print_file");
          const previewAsset = assetFor(bundle, relic.id, "preview");
          const prompt = printAsset?.prompt || relic.artDirection || "";
          const references = productReferenceImages(printAsset);
          return (
            <div className="manual-image-card" key={relic.id}>
              <div className="admin-actions">
                <strong>{relic.relicIndex}. {relic.name}</strong>
                <span className={`asset-status ${printAsset?.validationStatus || "pending"}`}>{printAsset?.validationStatus || "pending"}</span>
              </div>
              <div className="concept-summary">
                <div>
                  <span>Title</span>
                  <strong>{relic.name}</strong>
                </div>
                <div>
                  <span>Short description</span>
                  <p>{relic.description}</p>
                </div>
              </div>
              {previewAsset?.url ? <img src={previewAsset.url} alt={`${relic.name} preview`} /> : null}
              <label>
                <span className="prompt-label">
                  Prompt for ChatGPT
                  <CopyPromptButton text={prompt} />
                </span>
                <textarea readOnly value={prompt} />
              </label>
              <ReferenceImages references={references} />
              {printAsset?.validationStatus !== "valid" ? (
                <form action={`/api/admin/droplinks/${bundle.drop!.id}/manual-assets`} method="post" encType="multipart/form-data">
                  <input type="hidden" name="kind" value="relic" />
                  <input type="hidden" name="relicId" value={relic.id} />
                  <input name="file" type="file" accept="image/*" required />
                  <button className="btn accent" type="submit">upload this product image</button>
                </form>
              ) : null}
            </div>
          );
        })}

        {pendingOg ? (
          <div className="manual-image-card og">
            {(() => {
              const prompt = bundle.ogImage?.prompt || "";
              const references = ogReferenceImages(bundle);
              return (
                <>
            <div className="admin-actions">
              <strong>OG image</strong>
              <span className={`asset-status ${bundle.ogImage?.status === "ready" ? "valid" : "pending"}`}>{bundle.ogImage?.status || "pending"}</span>
            </div>
            {bundle.ogImage ? <img src={bundle.ogImage.imageUrl} alt={bundle.ogImage.title} /> : null}
            <div className="concept-summary">
              <div>
                <span>Title</span>
                <strong>{bundle.activeCollection?.title || bundle.brand.name}</strong>
              </div>
              <div>
                <span>Short description</span>
                <p>{bundle.activeCollection?.subtitle || "Share image for the generated DropLink."}</p>
              </div>
            </div>
            <label>
              <span className="prompt-label">
                Prompt for ChatGPT
                <CopyPromptButton text={prompt} />
              </span>
              <textarea readOnly value={prompt} />
            </label>
            <ReferenceImages references={references} />
            <form action={`/api/admin/droplinks/${bundle.drop!.id}/manual-assets`} method="post" encType="multipart/form-data">
              <input type="hidden" name="kind" value="og" />
              <input name="file" type="file" accept="image/*" required />
              <button className="btn accent" type="submit">upload OG image</button>
            </form>
                </>
              );
            })()}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function humanBlocker(blocker: string) {
  const labels: Record<string, string> = {
    domainClaimVerified: "domain has not been DNS-claimed",
    printFilesValid: "product images still need upload",
    mockupsGenerated: "product previews still need upload",
    ogGenerated: "OG image still needs upload",
    stripeReady: "Stripe is not configured",
    printfulReady: "Printful is not configured",
    assetsStoredOnR2: "assets are not stored on R2",
    noMockAssets: "mock/pending assets remain",
    noMockCopy: "AI/manual provider config is not production-ready",
    priceBookExists: "price book missing"
  };
  return labels[blocker] || blocker;
}

function emptyPayload(): LivePayload {
  return {
    now: new Date().toISOString(),
    job: null,
    traceId: null,
    bundle: null,
    readiness: null,
    events: []
  };
}
