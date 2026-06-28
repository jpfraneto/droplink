"use client";

import { useEffect, useMemo, useState } from "react";
import { printfulCatalogImageUrl } from "@/lib/printfulReferences";
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
  { key: "crawl", label: "Discover the brand", done: (payload: LivePayload) => Boolean(payload.bundle?.brandStudy || stepAtLeast(payload, "DISTILLED")) },
  { key: "plan", label: "Plan the 3 products", done: (payload: LivePayload) => Boolean(payload.bundle?.relicPlan || stepAtLeast(payload, "RELICS_PLANNED")) },
  {
    key: "printful",
    label: "Choose Printful products",
    done: (payload: LivePayload) =>
      Boolean(payload.bundle?.relics.length && payload.bundle.relics.every((relic) => relic.printfulProductId && relic.printfulVariantId))
  },
  { key: "images", label: "Create/upload images", done: (payload: LivePayload) => productImagesReady(payload.bundle) && lifestyleImagesReady(payload.bundle) && ogReady(payload.bundle) },
  { key: "review", label: "Review and publish", done: (payload: LivePayload) => Boolean(payload.bundle?.storefront.status === "published") }
];

const stepOrder = [
  "INTAKE_CREATED",
  "CRAWLING",
  "CRAWLED",
  "DISCOVERING_BRAND",
  "BRAND_DISCOVERED",
  "BUILDING_DOSSIER",
  "DOSSIER_READY",
  "DISTILLING",
  "DISTILLED",
  "PLANNING_RELICS",
  "RELICS_PLANNED",
  "MATCHING_PRINTFUL",
  "PRINTFUL_MATCHED",
  "GENERATING_PRINT_FILES",
  "PRINT_FILES_READY",
  "GENERATING_LIFESTYLE_IMAGES",
  "LIFESTYLE_IMAGES_READY",
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
  const dossier = metadata.discoveryDossier as { visualEvidence?: Array<{ url?: unknown; kind?: unknown; reason?: unknown }> } | undefined;
  for (const entry of dossier?.visualEvidence || []) {
    const url = imageUrl(entry.url);
    if (!url) continue;
    refs.push({
      url,
      title: typeof entry.kind === "string" ? entry.kind.replaceAll("_", " ") : "Brand visual evidence",
      shortDescription: typeof entry.reason === "string" ? entry.reason : "Discovered during the brand rabbit-hole pass."
    });
    if (refs.length >= 6) break;
  }
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
      const preview = assetFor(bundle, relic.id, "lifestyle") || assetFor(bundle, relic.id, "preview");
      if (!preview || preview.validationStatus !== "valid") return null;
      return {
        url: preview.url,
        title: `${relic.relicIndex}. ${relic.name}`,
        shortDescription: relic.description
      };
    })
    .filter((entry): entry is ReferenceImage => Boolean(entry));
}

function uniqueReferences(references: ReferenceImage[]) {
  const seen = new Set<string>();
  return references.filter((reference) => {
    if (seen.has(reference.url)) return false;
    seen.add(reference.url);
    return true;
  });
}

function printfulProductReference(relic: StorefrontBundle["relics"][number]): ReferenceImage | null {
  const url =
    imageUrl(relic.fulfillmentSpecJson?.rawPrintfulCatalogSnapshotJson && printfulCatalogImageUrl(relic.fulfillmentSpecJson.rawPrintfulCatalogSnapshotJson)) ||
    null;
  if (!url) return null;
  return {
    url,
    title: "Selected Printful item",
    shortDescription: `${relic.fulfillmentSpecJson?.productName || relic.productFamily} ${relic.fulfillmentSpecJson?.variantName || ""}`.trim()
  };
}

function lifestyleReferenceImages(bundle: StorefrontBundle, relic: StorefrontBundle["relics"][number], printAsset: Asset | null) {
  const previewAsset = assetFor(bundle, relic.id, "preview");
  const references: ReferenceImage[] = [];
  const uploadedArtwork = assetValid(printAsset) ? printAsset : assetValid(previewAsset) ? previewAsset : null;
  if (uploadedArtwork) {
    references.push({
      url: uploadedArtwork.url,
      title: "Uploaded print artwork",
      shortDescription: "Use this exact design on the selected Printful product."
    });
  }
  const productReference = printfulProductReference(relic);
  if (productReference) references.push(productReference);
  return uniqueReferences([...references, ...productReferenceImages(printAsset)]);
}

function productImagesReady(bundle: StorefrontBundle | null) {
  return Boolean(
    bundle?.relics.length &&
      bundle.relics.every((relic) =>
        bundle.assets.some((asset) => asset.relicId === relic.id && asset.type === "print_file" && asset.validationStatus === "valid")
      )
  );
}

function assetValid(asset: Asset | null) {
  return Boolean(asset?.validationStatus === "valid" && asset.url);
}

function lifestyleImagesReady(bundle: StorefrontBundle | null) {
  return Boolean(
    bundle?.relics.length &&
      bundle.relics.every((relic) =>
        bundle.assets.some((asset) => asset.relicId === relic.id && asset.type === "lifestyle" && asset.validationStatus === "valid")
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
  if (!lifestyleImagesReady(payload.bundle)) return { title: "Action needed: upload product-in-use images", body: "Use the uploaded artwork and Printful item references below, then upload one catchy image for each product." };
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
          {references.map((reference, index) => (
            <a className="reference-card" href={reference.url} target="_blank" rel="noreferrer" key={`${reference.url}-${index}`}>
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
  const pendingLifestyle = productImagesReady(bundle) && !lifestyleImagesReady(bundle);
  const pendingOg = productImagesReady(bundle) && lifestyleImagesReady(bundle) && !ogReady(bundle);
  if (!pendingProducts && !pendingLifestyle && !pendingOg) {
    return <CompletedImagesSection bundle={bundle} />;
  }

  return (
    <section className="admin-panel">
      <div className="admin-actions">
        <div>
          <h2>{pendingProducts ? "Upload product artwork" : pendingLifestyle ? "Upload product-in-use images" : "Upload OG image"}</h2>
          <p className="muted">
            {pendingProducts
              ? "Copy each print prompt into ChatGPT, generate one print artwork image, then upload it here."
              : pendingLifestyle
              ? "Copy each product-in-use prompt into ChatGPT after the product artwork is ready, then upload the catchy image."
              : "Use the three uploaded product images as references for the final share image."}
          </p>
        </div>
      </div>
      <div className="manual-image-grid">
        {bundle.relics.map((relic) => {
          const printAsset = assetFor(bundle, relic.id, "print_file");
          const lifestyleAsset = assetFor(bundle, relic.id, "lifestyle");
          const activeAsset = pendingLifestyle ? lifestyleAsset : printAsset;
          const previewAsset = assetFor(bundle, relic.id, "preview");
          const visibleImage = pendingLifestyle ? (assetValid(lifestyleAsset) ? lifestyleAsset : previewAsset) : previewAsset;
          const prompt = activeAsset?.prompt || relic.artDirection || "";
          const references = pendingLifestyle ? lifestyleReferenceImages(bundle, relic, printAsset) : productReferenceImages(activeAsset || printAsset);
          const uploadKind = pendingLifestyle ? "lifestyle" : "relic";
          const uploadLabel = pendingLifestyle ? "upload product-in-use image" : assetValid(printAsset) ? "replace product image" : "upload this product image";
          return (
            <div className="manual-image-card" key={relic.id}>
              <div className="admin-actions">
                <strong>{relic.relicIndex}. {relic.name}</strong>
                <span className={`asset-status ${activeAsset?.validationStatus || "pending"}`}>{activeAsset?.validationStatus || "pending"}</span>
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
              {assetValid(visibleImage) ? (
                <img src={visibleImage!.url} alt={`${relic.name} uploaded image`} />
              ) : null}
              <label>
                <span className="prompt-label">
                  Prompt for ChatGPT
                  <CopyPromptButton text={prompt} />
                </span>
                <textarea readOnly value={prompt} />
              </label>
              <ReferenceImages references={references} />
              {(pendingProducts || pendingLifestyle) ? (
                <form action={`/api/admin/droplinks/${bundle.drop!.id}/manual-assets`} method="post" encType="multipart/form-data">
                  <input type="hidden" name="kind" value={uploadKind} />
                  <input type="hidden" name="relicId" value={relic.id} />
                  <input name="file" type="file" accept="image/*" required />
                  <button className="btn accent" type="submit">{uploadLabel}</button>
                </form>
              ) : null}
              {assetValid(activeAsset) ? (
                <form action={`/api/admin/droplinks/${bundle.drop!.id}/manual-assets`} method="post" className="inline-form">
                  <input type="hidden" name="action" value="delete" />
                  <input type="hidden" name="kind" value={uploadKind} />
                  <input type="hidden" name="relicId" value={relic.id} />
                  <button className="btn secondary" type="submit">delete image</button>
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
            {bundle.ogImage?.imageUrl ? <img src={bundle.ogImage.imageUrl} alt={bundle.ogImage.title} /> : null}
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
              <button className="btn accent" type="submit">{bundle.ogImage?.status === "ready" ? "replace OG image" : "upload OG image"}</button>
            </form>
            {bundle.ogImage?.status === "ready" ? (
              <form action={`/api/admin/droplinks/${bundle.drop!.id}/manual-assets`} method="post" className="inline-form">
                <input type="hidden" name="action" value="delete" />
                <input type="hidden" name="kind" value="og" />
                <button className="btn secondary" type="submit">delete OG image</button>
              </form>
            ) : null}
                </>
              );
            })()}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function CompletedImagesSection({ bundle }: { bundle: StorefrontBundle }) {
  return (
    <section className="admin-panel">
      <div className="admin-actions">
        <div>
          <h2>Images</h2>
          <p className="success-note">Product images, product-in-use images, and OG image are uploaded.</p>
        </div>
      </div>
      <div className="manual-image-grid">
        {bundle.relics.map((relic) => {
          const preview = assetFor(bundle, relic.id, "preview");
          const lifestyle = assetFor(bundle, relic.id, "lifestyle");
          return (
            <div className="manual-image-card" key={relic.id}>
              <strong>{relic.relicIndex}. {relic.name}</strong>
              <div className="uploaded-image-pair">
                {assetValid(preview) ? (
                  <div>
                    <span>Product artwork</span>
                    <img src={preview!.url} alt={`${relic.name} product artwork`} />
                    <ReplaceDeleteForms bundle={bundle} relicId={relic.id} kind="relic" replaceLabel="replace artwork" />
                  </div>
                ) : null}
                {assetValid(lifestyle) ? (
                  <div>
                    <span>Product-in-use</span>
                    <img src={lifestyle!.url} alt={`${relic.name} product in use`} />
                    <ReplaceDeleteForms bundle={bundle} relicId={relic.id} kind="lifestyle" replaceLabel="replace in-use image" />
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
        <div className="manual-image-card og">
          <strong>OG image</strong>
          {bundle.ogImage?.imageUrl ? <img src={bundle.ogImage.imageUrl} alt={bundle.ogImage.title} /> : null}
          <ReplaceDeleteForms bundle={bundle} kind="og" replaceLabel="replace OG image" />
        </div>
      </div>
    </section>
  );
}

function ReplaceDeleteForms({
  bundle,
  relicId,
  kind,
  replaceLabel
}: {
  bundle: StorefrontBundle;
  relicId?: string;
  kind: "relic" | "lifestyle" | "og";
  replaceLabel: string;
}) {
  return (
    <div className="asset-actions">
      <form action={`/api/admin/droplinks/${bundle.drop!.id}/manual-assets`} method="post" encType="multipart/form-data">
        <input type="hidden" name="kind" value={kind} />
        {relicId ? <input type="hidden" name="relicId" value={relicId} /> : null}
        <input name="file" type="file" accept="image/*" required />
        <button className="btn accent" type="submit">{replaceLabel}</button>
      </form>
      <form action={`/api/admin/droplinks/${bundle.drop!.id}/manual-assets`} method="post" className="inline-form">
        <input type="hidden" name="action" value="delete" />
        <input type="hidden" name="kind" value={kind} />
        {relicId ? <input type="hidden" name="relicId" value={relicId} /> : null}
        <button className="btn secondary" type="submit">delete</button>
      </form>
    </div>
  );
}

function humanBlocker(blocker: string) {
  const labels: Record<string, string> = {
    domainClaimVerified: "domain has not been DNS-claimed",
    printFilesValid: "product images still need upload",
    lifestyleImagesValid: "product-in-use images still need upload",
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
