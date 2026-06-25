"use client";

import { useEffect, useMemo, useState } from "react";
import type { Asset, GenerationJob, Mockup, OgImage, StorefrontBundle, SystemEvent } from "@/lib/types";

type LivePayload = {
  now: string;
  job: GenerationJob | null;
  jobs: GenerationJob[];
  traceId: string | null;
  bundle: StorefrontBundle | null;
  readiness: { ready: boolean; blockers: string[]; checklist: Record<string, boolean> } | null;
  events: SystemEvent[];
  error?: string;
};

function time(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function eventImageRecords(events: SystemEvent[]): Array<{ id: string; label: string; url: string; kind: string }> {
  const rows: Array<{ id: string; label: string; url: string; kind: string }> = [];
  const push = (id: string, label: string, url: unknown, kind: string) => {
    if (typeof url === "string" && /^https?:\/\//i.test(url)) rows.push({ id, label, url, kind });
  };
  for (const event of events) {
    const metadata = event.metadataJson || {};
    const relicName = typeof metadata.relicName === "string" ? metadata.relicName : event.eventType;
    push(`${event.id}-mockup`, `${relicName} mockup`, metadata.mockupImageUrl, "event");
    push(`${event.id}-preview`, `${relicName} preview`, metadata.previewUrl, "event");
    push(`${event.id}-print`, `${relicName} print file`, metadata.printFileUrl, "event");
    push(`${event.id}-og`, "OG image", metadata.ogImageUrl, "event");
  }
  return rows;
}

function imageRecords(
  bundle: StorefrontBundle | null,
  events: SystemEvent[]
): Array<{ id: string; label: string; url: string; kind: string }> {
  const rows: Array<{ id: string; label: string; url: string; kind: string }> = [];
  const seen = new Set<string>();
  const push = (record: { id: string; label: string; url: string; kind: string }) => {
    if (seen.has(record.url)) return;
    seen.add(record.url);
    rows.push(record);
  };
  for (const record of eventImageRecords(events)) push(record);
  if (!bundle) return rows;
  const addAsset = (asset: Asset) => {
    push({
      id: asset.id,
      label: asset.relicId ? `${asset.type} · ${asset.relicId.slice(0, 10)}` : asset.type,
      url: asset.url,
      kind: asset.validationStatus
    });
  };
  const addMockup = (mockup: Mockup) => {
    const relic = bundle.relics.find((entry) => entry.id === mockup.relicId);
    push({
      id: mockup.id,
      label: `${relic?.name || "mockup"} · ${mockup.status}`,
      url: mockup.imageUrl,
      kind: "mockup"
    });
  };
  const addOg = (og: OgImage) => {
    push({ id: og.id, label: "OG image", url: og.imageUrl, kind: og.status });
  };
  if (bundle.ogImage) addOg(bundle.ogImage);
  bundle.mockups.forEach(addMockup);
  bundle.assets.filter((asset) => asset.type === "preview" || asset.type === "print_file" || asset.type === "og").forEach(addAsset);
  return rows;
}

export function AdminLiveConsole({
  storefrontId,
  jobId
}: {
  storefrontId?: string | null;
  jobId?: string | null;
}) {
  const [payload, setPayload] = useState<LivePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
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
        if (!response.ok) throw new Error(data.error || "Could not load live admin state.");
        if (!cancelled) {
          setPayload(data);
          setError(null);
          setLastRefresh(new Date().toISOString());
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load live admin state.");
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
  const job = payload?.job || null;
  const events = payload?.events || [];
  const images = imageRecords(bundle, events);

  return (
    <section className="admin-panel live-console">
      <div className="admin-actions">
        <div>
          <h2>Live system trace</h2>
          <p className="muted">
            {payload?.traceId || "waiting for trace"} {lastRefresh ? `· refreshed ${time(lastRefresh)}` : ""}
          </p>
        </div>
        <span className={`live-dot ${job?.status || "queued"}`}>{job?.status || "idle"}</span>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="live-status-grid">
        <div>
          <span>step</span>
          <strong>{job?.currentStep || bundle?.storefront.generationStatus || "no active job"}</strong>
        </div>
        <div>
          <span>brand</span>
          <strong>{bundle?.brand.name || "not created yet"}</strong>
        </div>
        <div>
          <span>root domain</span>
          <strong>{bundle?.drop?.canonicalRootDomain || bundle?.brand.hostname || "not resolved yet"}</strong>
        </div>
        <div>
          <span>readiness</span>
          <strong>{payload?.readiness?.ready ? "ready" : `${payload?.readiness?.blockers.length || 0} blockers`}</strong>
        </div>
      </div>

      {job?.error ? <p className="error">{job.error}</p> : null}

      <h3>Recent jobs</h3>
      <div className="live-job-strip">
        {(payload?.jobs || []).map((entry) => (
          <a className="live-job-pill" href={`/admin?job=${entry.id}`} key={entry.id}>
            <strong>{entry.currentStep}</strong>
            <span>{entry.status} · {time(entry.updatedAt)}</span>
          </a>
        ))}
      </div>

      <h3>Generated images</h3>
      {images.length ? (
        <div className="live-image-grid">
          {images.map((image) => (
            <a className="live-image-card" href={image.url} target="_blank" rel="noreferrer" key={image.id}>
              <img src={image.url} alt={image.label} />
              <span>{image.label}</span>
              <small>{image.kind}</small>
            </a>
          ))}
        </div>
      ) : (
        <p className="muted">No generated images have landed yet.</p>
      )}

      <h3>Relic machinery</h3>
      <div className="live-relic-grid">
        {(bundle?.relics || []).map((relic) => (
          <div className="admin-row" key={relic.id}>
            <strong>{relic.relicIndex || "?"}. {relic.name}</strong>
            <span>{relic.productFamily} · {relic.totalSupply} units · {relic.unitPriceUsd ? `$${relic.unitPriceUsd}` : "pricing pending"}</span>
            <small>
              Printful {relic.fulfillmentSpecJson?.catalogProductId || relic.printfulProductId || "?"}/
              {relic.fulfillmentSpecJson?.catalogVariantId || relic.printfulVariantId || "?"}
            </small>
            <small>
              {relic.fulfillmentSpecJson?.placement || "placement pending"} · {relic.fulfillmentSpecJson?.technique || "technique pending"}
            </small>
            {relic.fulfillmentSpecJson?.selectionReason ? <small>{relic.fulfillmentSpecJson.selectionReason}</small> : null}
          </div>
        ))}
        {!bundle?.relics.length ? <p className="muted">Relics are not planned yet.</p> : null}
      </div>

      <h3>Edition grid</h3>
      {bundle?.editions.length ? (
        <div className="edition-grid compact">
          {bundle.editions
            .slice()
            .sort((a, b) => (a.globalEditionNumber || a.editionNumber) - (b.globalEditionNumber || b.editionNumber))
            .map((edition) => (
              <div className={`edition-slot ${edition.status}`} key={edition.id}>
                <strong>#{edition.globalEditionNumber || edition.editionNumber}</strong>
                <span>{edition.status}</span>
              </div>
            ))}
        </div>
      ) : (
        <p className="muted">Editions appear when the finite supply is minted.</p>
      )}

      <h3>Readiness blockers</h3>
      <div className="live-blockers">
        {(payload?.readiness?.blockers || []).map((blocker) => (
          <span key={blocker}>{blocker}</span>
        ))}
        {payload?.readiness?.ready ? <strong>ready to publish</strong> : null}
        {!payload?.readiness ? <p className="muted">Readiness will evaluate after the storefront exists.</p> : null}
      </div>

      <h3>Event stream</h3>
      <div className="live-event-stream">
        {events.map((event) => (
          <details className={`live-event ${event.level}`} key={event.id} open={event.level === "error"}>
            <summary>
              <span>{time(event.createdAt)}</span>
              <strong>{event.eventType}</strong>
              <em>{event.message}</em>
            </summary>
            <pre>{JSON.stringify(event.metadataJson || {}, null, 2)}</pre>
          </details>
        ))}
        {!events.length ? <p className="muted">Waiting for the first event.</p> : null}
      </div>
    </section>
  );
}
