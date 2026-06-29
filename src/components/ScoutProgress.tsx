"use client";

import { useEffect, useMemo, useState } from "react";
import type { BrandStudy, Collection, GenerationJob, Relic, RelicPlan, Storefront, SystemEvent } from "@/lib/types";

type ScoutBundle = {
  brand: { name: string; hostname: string; slug: string };
  storefront: Storefront;
  drop: {
    id: string;
    canonicalUrl: string;
    canonicalRootDomain?: string | null;
    status: string;
    domainClaimStatus?: string | null;
    publishStatus?: string | null;
  } | null;
  activeCollection: Collection | null;
  brandStudy: BrandStudy | null;
  relicPlan: RelicPlan | null;
  relics: Relic[];
  ogImage: { imageUrl: string; title: string; subtitle: string; status: string } | null;
};

type ScoutPayload = {
  now: string;
  job: GenerationJob;
  storefront: Storefront | null;
  bundle: ScoutBundle | null;
  events: SystemEvent[];
  error?: string;
};

const stepLabels: Record<string, string> = {
  INTAKE_CREATED: "Intake created",
  CRAWLING: "Reading source",
  CRAWLED: "Source read",
  DISCOVERING_BRAND: "Finding brand signals",
  BRAND_DISCOVERED: "Signals found",
  BUILDING_DOSSIER: "Building dossier",
  DOSSIER_READY: "Dossier ready",
  DISTILLING: "Distilling brand",
  DISTILLED: "Brand distilled",
  PLANNING_RELICS: "Planning products",
  RELICS_PLANNED: "Products planned",
  MATCHING_PRINTFUL: "Matching products",
  PRINTFUL_MATCHED: "Products matched",
  GENERATING_PRINT_FILES: "Preparing artwork",
  PRINT_FILES_READY: "Artwork ready",
  GENERATING_LIFESTYLE_IMAGES: "Preparing in-use images",
  LIFESTYLE_IMAGES_READY: "In-use images ready",
  AWAITING_MANUAL_IMAGES: "Waiting for images",
  GENERATING_OG: "Composing share image",
  OG_READY: "Share image ready",
  READY_FOR_REVIEW: "Ready for review",
  FAILED: "Failed"
};

function time(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readableJson(value: unknown) {
  if (!value || (typeof value === "object" && !Object.keys(value as Record<string, unknown>).length)) return "";
  return JSON.stringify(value, null, 2);
}

function eventByType(events: SystemEvent[], type: string) {
  return events.find((event) => event.eventType === type) || null;
}

function ScoutThinking({ payload }: { payload: ScoutPayload }) {
  const study = payload.bundle?.brandStudy?.studyJson || null;
  const plan = payload.bundle?.relicPlan?.planJson || null;
  const dossier = eventByType(payload.events, "brand_dossier_ready")?.metadataJson || null;
  const topVisualEvidence = asArray(dossier?.topVisualEvidence).slice(0, 6) as Array<{ url?: string; kind?: string; reason?: string; score?: number }>;
  const socialLinks = asArray(dossier?.socialLinks).slice(0, 6) as Array<{ url?: string; kind?: string; label?: string }>;

  return (
    <section className="admin-panel scout-thinking">
      <div className="admin-actions">
        <div>
          <h2>Scout reading</h2>
          <p className="muted">The live interpretation being built from the submitted URL.</p>
        </div>
      </div>

      {study ? (
        <div className="scout-reading-grid">
          <div className="scout-reading-card wide">
            <span>archetype</span>
            <strong>{study.archetype}</strong>
            <p>{study.essence}</p>
          </div>
          <div className="scout-reading-card wide">
            <span>worldview</span>
            <p>{study.worldview}</p>
          </div>
          <div className="scout-reading-card">
            <span>emotional posture</span>
            <strong>{study.emotional_posture}</strong>
          </div>
          <div className="scout-reading-card">
            <span>language style</span>
            <strong>{study.language_style}</strong>
          </div>
          <div className="scout-reading-card">
            <span>palette</span>
            <div className="scout-tags">{study.color_palette.map((entry) => <em key={entry}>{entry}</em>)}</div>
          </div>
          <div className="scout-reading-card">
            <span>motifs</span>
            <div className="scout-tags">{study.aesthetic_motifs.map((entry) => <em key={entry}>{entry}</em>)}</div>
          </div>
          <div className="scout-reading-card wide">
            <span>invocation</span>
            <p>{study.invocation}</p>
          </div>
          <div className="scout-reading-card wide">
            <span>what they care about</span>
            <div className="scout-tags">{study.what_they_care_about.map((entry) => <em key={entry}>{entry}</em>)}</div>
          </div>
        </div>
      ) : (
        <p className="muted">Waiting for Hermes to finish the brand study.</p>
      )}

      {plan ? (
        <div className="scout-plan">
          <h3>{plan.collection_title}</h3>
          <p>{plan.collection_subtitle}</p>
          <blockquote>{plan.drop_concept}</blockquote>
          <div className="scout-relics">
            {plan.relics.map((relic) => (
              <div className="scout-reading-card" key={relic.name}>
                <span>{relic.product_family}</span>
                <strong>{relic.name}</strong>
                <p>{relic.why_this_exists}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {topVisualEvidence.length || socialLinks.length ? (
        <div className="scout-evidence">
          {topVisualEvidence.length ? (
            <div>
              <h3>Visual evidence</h3>
              <div className="scout-link-list">
                {topVisualEvidence.map((entry, index) => (
                  <a href={entry.url} target="_blank" rel="noreferrer" key={`${entry.url}-${index}`}>
                    <strong>{entry.kind || "visual"} {entry.score ? `· ${entry.score}` : ""}</strong>
                    <span>{entry.reason || entry.url}</span>
                  </a>
                ))}
              </div>
            </div>
          ) : null}
          {socialLinks.length ? (
            <div>
              <h3>Neighborhood</h3>
              <div className="scout-link-list">
                {socialLinks.map((entry, index) => (
                  <a href={entry.url} target="_blank" rel="noreferrer" key={`${entry.url}-${index}`}>
                    <strong>{entry.kind || "link"}</strong>
                    <span>{entry.label || entry.url}</span>
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ScoutTrail({ events }: { events: SystemEvent[] }) {
  const chronological = useMemo(() => events.slice().reverse(), [events]);
  return (
    <section className="admin-panel">
      <div className="admin-actions">
        <div>
          <h2>Scout trail</h2>
          <p className="muted">Every backend step persisted for this run.</p>
        </div>
      </div>
      <div className="live-event-stream scout-event-stream">
        {chronological.map((event) => {
          const json = readableJson(event.metadataJson || {});
          return (
            <details className={`live-event ${event.level}`} key={event.id} open={event.level === "error"}>
              <summary>
                <span>{time(event.createdAt)}</span>
                <strong>{event.eventType}</strong>
                <em>{event.message}</em>
              </summary>
              {json ? <pre>{json}</pre> : <pre>{event.message}</pre>}
            </details>
          );
        })}
        {!chronological.length ? <p className="muted">Waiting for the first scout event.</p> : null}
      </div>
    </section>
  );
}

export function ScoutProgress({ jobId }: { jobId: string }) {
  const [payload, setPayload] = useState<ScoutPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      try {
        const response = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        const data = (await response.json()) as ScoutPayload;
        if (!response.ok) throw new Error(data.error || "Could not load scout flow.");
        if (!cancelled) {
          setPayload(data);
          setError(null);
          setLastRefresh(new Date().toISOString());
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load scout flow.");
      } finally {
        if (!cancelled) timer = setTimeout(load, 2500);
      }
    }

    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);

  const job = payload?.job || null;
  const bundle = payload?.bundle || null;
  const currentStep = job?.currentStep || "INTAKE_CREATED";
  const title = stepLabels[currentStep] || currentStep;

  return (
    <div className="workflow-page scout-page">
      <section className={`workflow-action ${job?.status === "failed" ? "needs-action" : ""}`}>
        <span>{bundle?.brand.hostname || job?.inputJson?.url?.toString() || "scout flow"}</span>
        <h1>{title}</h1>
        <p>
          {job?.status === "completed"
            ? "The scout pass is complete. Review the distilled brand, product thesis, and event trail below."
            : job?.status === "failed"
              ? job.error || "The scout pass failed."
              : "DropLink is studying the brand, recording its evidence, and turning the source into a finite product thesis."}
        </p>
        <div className="workflow-actions">
          {bundle ? (
            <a className="btn secondary" href={`/${bundle.storefront.slug}`} target="_blank" rel="noreferrer">
              preview storefront
            </a>
          ) : null}
          {bundle ? (
            <a className="btn secondary" href={`/admin/${bundle.storefront.slug}?job=${jobId}`}>
              admin review
            </a>
          ) : null}
          <span className={`live-dot ${job?.status || "queued"}`}>{job?.status || "loading"}</span>
        </div>
      </section>

      {error ? <p className="error">{error}</p> : null}

      <section className="admin-panel">
        <div className="live-status-grid">
          <div>
            <span>step</span>
            <strong>{currentStep}</strong>
          </div>
          <div>
            <span>brand</span>
            <strong>{bundle?.brand.name || "not distilled yet"}</strong>
          </div>
          <div>
            <span>root domain</span>
            <strong>{bundle?.drop?.canonicalRootDomain || bundle?.brand.hostname || "resolving"}</strong>
          </div>
          <div>
            <span>refreshed</span>
            <strong>{lastRefresh ? time(lastRefresh) : "loading"}</strong>
          </div>
        </div>
      </section>

      {payload ? <ScoutThinking payload={payload} /> : null}
      {payload ? <ScoutTrail events={payload.events} /> : null}
    </div>
  );
}
