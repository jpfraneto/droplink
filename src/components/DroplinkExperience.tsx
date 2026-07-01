"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  printfulProductId?: string | null;
  printfulVariantId?: string | null;
  printfulSku?: string | null;
  printfulProductName?: string | null;
  printfulVariantName?: string | null;
  placement?: string | null;
  technique?: string | null;
  printFileUrl?: string | null;
  printImageUrls?: string[];
  mockupUrls?: string[];
  selectionReason?: string | null;
};

export type DroplinkState = "empty" | "processing" | "scouted" | "claimed" | "live" | "sold_out";

export type DroplinkUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

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
  scoutUser: DroplinkUser | null;
  claimedLabel?: string | null;
  currentUser: DroplinkUser | null;
  x402: {
    amountUsdc: string;
    network: string;
    asset: string;
    recipientAddress: string;
  };
  ownerReceivesAll: boolean;
  publicMode?: "scouted_unclaimed" | "claimed_official";
  potentialEarnings: {
    claimer: string;
    domainOwner: string;
    claimerPercent: string;
    domainOwnerPercent: string;
    gross?: string;
    estimatedCosts?: string;
    netMargin?: string;
    basis?: "estimated_net" | "gross";
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

type ClaimSheet = {
  id: string;
  domain: string;
  txtName: string;
  txtValue: string;
};

const stepCopy: Record<string, string> = {
  INTAKE_CREATED: "signal received",
  CRAWLING: "entering the public surface",
  CRAWLED: "first layer mapped",
  DISCOVERING_BRAND: "following the brand trail",
  BRAND_DISCOVERED: "neighborhood assembled",
  BUILDING_DOSSIER: "building the evidence altar",
  DOSSIER_READY: "evidence is warm",
  DISTILLING: "asking what this link is trying to become",
  DISTILLED: "soul signature found",
  PLANNING_RELICS: "splitting the signal into wear / display / use",
  RELICS_PLANNED: "three objects have appeared",
  MATCHING_PRINTFUL: "binding the objects to real matter",
  PRINTFUL_MATCHED: "physical vessels selected",
  GENERATING_PRINT_FILES: "drawing the print spells",
  PRINT_FILES_READY: "artwork files emerged",
  VALIDATING_PRINT_FILES: "checking the artifact edges",
  PRINT_FILES_VALID: "artwork survived inspection",
  GENERATING_LIFESTYLE_IMAGES: "imagining the objects in human hands",
  LIFESTYLE_IMAGES_READY: "in-world images are ready",
  GENERATING_MOCKUPS: "summoning product bodies",
  MOCKUPS_READY: "mockups are ready",
  GENERATING_OG: "composing the share signal",
  OG_READY: "share image sealed",
  AWAITING_MANUAL_IMAGES: "waiting for human image review",
  READY_FOR_REVIEW: "the DropLink is ready for the gatekeeper",
  PUBLISHED: "the DropLink is live",
  FAILED: "the trail broke"
};

type EventMeta = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstStrings(value: unknown, max = 3) {
  return list(value).map((entry) => text(entry)).filter(Boolean).slice(0, max);
}

function itemName(entry: unknown, key: string) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return "";
  return text((entry as EventMeta)[key]);
}

function compactJoin(parts: string[]) {
  return parts.filter(Boolean).join(" ");
}

function narrateEvent(event: SystemEvent, domain: string) {
  const meta = event.metadataJson || {};
  switch (event.eventType) {
    case "url_intake_created":
      return `i received ${text(meta.canonicalRootDomain) || domain}. the link is no longer just a URL; it is now a trail with a claim waiting at the end.`;
    case "crawl_started":
      return `opening the public door. reading what ${domain} says before anyone tries to sell it anything.`;
    case "crawl_succeeded": {
      const headings = firstStrings(meta.headings, 2);
      const title = text(meta.title);
      if (meta.crawlerFallback) return `the crawler hit a wall, but the domain still leaked enough shape to continue. walls are also evidence.`;
      return compactJoin([`landed on ${text(meta.finalUrl) || domain}.`, title ? `the page calls itself “${title}.”` : "", headings.length ? `first inscriptions: ${headings.map((entry) => `“${entry}”`).join(" / ")}.` : ""]);
    }
    case "brand_discovery_started":
      return `leaving the homepage now. looking for mirrors: socials, icons, screenshots, repeated phrases, visual residue.`;
    case "brand_discovery_succeeded": {
      const links = numberValue(meta.discoveredLinks) ?? 0;
      const visuals = numberValue(meta.visualEvidence) ?? 0;
      const phrases = firstStrings(meta.repeatedPhrases, 3);
      return compactJoin([`found ${links} neighboring paths and ${visuals} visual fragments.`, phrases.length ? `words echoing in the walls: ${phrases.map((entry) => `“${entry}”`).join(", ")}.` : ""]);
    }
    case "brand_dossier_ready": {
      const social = list(meta.socialLinks).length;
      const visual = list(meta.topVisualEvidence).length;
      const signals = meta.textSignals && typeof meta.textSignals === "object" ? (meta.textSignals as EventMeta) : {};
      const headings = firstStrings(signals.headings, 2);
      return compactJoin([`dossier assembled: ${visual} strong visual anchors, ${social} social/neighborhood clues.`, headings.length ? `the loudest headings point toward ${headings.map((entry) => `“${entry}”`).join(" and ")}.` : ""]);
    }
    case "droplink_skill_loaded":
      return `the Droplink skill is loaded now. this is no longer a generic generator; it is looking for hidden world, buyer role, WEAR / USE / DISPLAY, and a clean object trail.`;
    case "hermes_brand_study_requested":
      return `sending the evidence into Anky/Hermes. not asking “what merch?” yet — asking what posture, wound, promise, hidden world, and buyer role this brand carries.`;
    case "brand_study_succeeded":
      return compactJoin([
        `signal named: ${text(meta.brandName) || domain}.`,
        text(meta.archetype) ? `archetype: ${text(meta.archetype)}.` : "",
        text(meta.hiddenWorld) ? `hidden world: ${text(meta.hiddenWorld)}` : "",
        text(meta.buyerRole) ? `buyer role: ${text(meta.buyerRole)}` : "",
        text(meta.essence) ? `essence: ${text(meta.essence)}` : ""
      ]);
    case "scout_core_collapsed":
    case "scout_matter_split":
      return event.message;
    case "printful_catalog_loaded":
      return `opened the material catalog. ${numberValue(meta.optionCount) ?? "enough"} possible vessels are on the table; only three should survive.`;
    case "relic_plan_drafted": {
      const relics = list(meta.relics).map((entry) => itemName(entry, "name")).filter(Boolean).slice(0, 3);
      return compactJoin([`first triptych drafted: ${text(meta.collectionTitle) || "untitled collection"}.`, relics.length ? `objects appearing: ${relics.join(" / ")}.` : ""]);
    }
    case "relic_plan_succeeded": {
      const relics = list(meta.relics).map((entry) => itemName(entry, "name")).filter(Boolean).slice(0, 3);
      return compactJoin([`creative director pass complete.`, text(meta.dropConcept) ? `the collection thesis: ${text(meta.dropConcept)}` : "", relics.length ? `final three: ${relics.join(" / ")}.` : ""]);
    }
    case "printful_matched": {
      const selections = list(meta.selections).map((entry) => itemName(entry, "productName")).filter(Boolean).slice(0, 3);
      return selections.length ? `the ghosts have bodies now: ${selections.join(" / ")}. no generic hoodie pile. three vessels, three functions.` : "physical vessels selected. the idea can now touch shipping labels.";
    }
    case "relic_print_prompt_ready":
      return compactJoin([`prepared artwork instructions for ${text(meta.relicName) || "one artifact"}.`, text(meta.artDirection) ? `direction: ${text(meta.artDirection)}` : ""]);
    case "relic_fulfillment_spec_ready":
      return compactJoin([`${text(meta.relicName) || "artifact"} bound to ${text(meta.productName) || "a product"}.`, text(meta.selectionReason) ? `why this vessel: ${text(meta.selectionReason)}` : ""]);
    case "lifestyle_prompt_ready":
      return `now testing ${text(meta.relicName) || "the artifact"} against reality: can a human wear it, display it, or use it without the magic collapsing?`;
    case "lifestyle_image_generated":
      return `${text(meta.validationStatus) === "pending" ? "draft" : "image"} returned for ${text(meta.relicName) || "one artifact"}. the object has entered a scene.`;
    case "relic_assets_generated":
      return `${text(meta.relicName) || "artifact"} has print file, preview, and mockup trail. one third of the drop is no longer theoretical.`;
    case "price_book_generated":
      return `economics mapped: owner upside, scout bounty, print cost, and protocol survival all placed on the same table.`;
    case "og_image_ready":
    case "og_ready":
      return `the share image is sealed. this DropLink can now travel through feeds as a single compressed omen.`;
    case "generation_ready_for_review":
      return `the scout pass is complete. ${domain} has three finite objects waiting behind DNS ownership verification.`;
    default:
      return event.message || stepCopy[event.eventType] || event.eventType.replace(/_/g, " ");
  }
}

function eventPhase(eventType: string) {
  if (/crawl|discovery|dossier|url_intake/.test(eventType)) return "evidence";
  if (/study|distill|hermes|core_collapsed/.test(eventType)) return "interpretation";
  if (/relic|plan|printful|fulfillment|matter_split/.test(eventType)) return "object";
  if (/image|mockup|asset|og|print_art|parallel_relic_threads/.test(eventType)) return "image";
  if (/price|ready|review|publish/.test(eventType)) return "gate";
  return "signal";
}

function eventImages(event: SystemEvent) {
  const meta = event.metadataJson || {};
  const direct = [
    { label: "art", url: text(meta.previewUrl) || text(meta.printArtPreviewUrl) },
    { label: "product", url: text(meta.lifestyleImageUrl) || text(meta.mockupImageUrl) },
    { label: "og", url: text(meta.ogImageUrl) || text(meta.ogWebpUrl) }
  ].filter((entry) => entry.url);
  const relics = list(meta.relics)
    .flatMap((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      const record = entry as EventMeta;
      return [
        { label: itemName(entry, "relicName") || "art", url: text(record.previewUrl) },
        { label: itemName(entry, "relicName") || "product", url: text(record.lifestyleImageUrl) }
      ];
    })
    .filter((entry) => entry.url);
  const seen = new Set<string>();
  return [...direct, ...relics].filter((entry) => {
    if (seen.has(entry.url)) return false;
    seen.add(entry.url);
    return true;
  }).slice(0, 6);
}

function time(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function roundedMoney(value: string) {
  const amount = Number(value.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(amount)) return value;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(amount);
}

export function DroplinkExperience({ initial }: { initial: DroplinkViewModel }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [view, setView] = useState(initial);
  const [busy, setBusy] = useState(initial.state === "processing");
  const [drawerOpen, setDrawerOpen] = useState(initial.state === "processing");
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [currentStep, setCurrentStep] = useState("INTAKE_CREATED");
  const [error, setError] = useState<string | null>(null);
  const [notifyProduct, setNotifyProduct] = useState<DroplinkProduct | null>(null);
  const [detailProduct, setDetailProduct] = useState<DroplinkProduct | null>(null);
  const [detailDragStartY, setDetailDragStartY] = useState<number | null>(null);
  const [detailDragY, setDetailDragY] = useState(0);
  const [detailDragging, setDetailDragging] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; label: string } | null>(null);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifyStatus, setNotifyStatus] = useState<string | null>(null);
  const [notifiedEmail, setNotifiedEmail] = useState<string | null>(null);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [faviconFailed, setFaviconFailed] = useState(false);
  const [claimSheet, setClaimSheet] = useState<ClaimSheet | null>(null);
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimCheckBusy, setClaimCheckBusy] = useState(false);
  const [claimStatus, setClaimStatus] = useState<string | null>(null);
  const [copiedClaimField, setCopiedClaimField] = useState<"name" | "value" | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<DroplinkUser | null>(initial.currentUser);
  const [x402Open, setX402Open] = useState(false);
  const [x402Proof, setX402Proof] = useState("");
  const [x402Status, setX402Status] = useState<string | null>(null);
  const eventFeedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setView(initial);
    setBusy(initial.state === "processing");
    setCurrentUser(initial.currentUser);
    if (initial.state === "processing") setDrawerOpen(true);
  }, [initial]);

  useEffect(() => {
    setFaviconFailed(false);
  }, [view.favicon]);

  useEffect(() => {
    const requested = searchParams.get("item") || searchParams.get("product") || searchParams.get("relic");
    if (!requested || detailProduct) return;
    const normalized = requested.toLowerCase().trim();
    const product = view.products.find((entry) => {
      const title = entry.title.toLowerCase();
      const slot = entry.kindLabel.toLowerCase();
      return entry.id === requested || entry.relicId === requested || slot === normalized || title.includes(normalized) || title.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") === normalized;
    });
    if (product) setDetailProduct(product);
  }, [detailProduct, searchParams, view.products]);

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

  async function summon(paymentProof?: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setX402Status(null);
    try {
      const response = await fetch("/api/droplinks/summon", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ submittedUrl: view.submittedUrl, x402PaymentProof: paymentProof || undefined })
      });
      const data = (await response.json()) as { existing?: boolean; jobId?: string; slug?: string; traceId?: string; error?: string };
      if (response.status === 401) {
        setAuthOpen(true);
        throw new Error(data.error || "Login with X to scout.");
      }
      if (!response.ok) throw new Error(data.error || "Could not scout this DropLink.");
      if (data.existing && data.slug) {
        router.replace(`/${data.slug}`);
        return;
      }
      if (!data.jobId) throw new Error(data.error || "Could not scout this DropLink.");
      setCurrentStep("INTAKE_CREATED");
      setEvents([]);
      setX402Open(false);
      setDrawerOpen(true);
      setView((current) => ({ ...current, state: "processing", jobId: data.jobId || null, traceId: data.traceId || current.traceId }));
      if (data.slug && data.slug !== view.slug) router.replace(`/${data.slug}`);
    } catch (err) {
      setBusy(false);
      setView((current) => ({ ...current, state: "empty" }));
      setError(err instanceof Error ? err.message : "Could not scout this DropLink.");
      setX402Status(err instanceof Error ? err.message : "Could not verify x402 payment.");
    }
  }

  async function submitX402Payment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const proof = x402Proof.trim();
    if (!proof || busy) return;
    await summon(proof);
  }

  async function copyX402Recipient() {
    await navigator.clipboard?.writeText(view.x402.recipientAddress).catch(() => undefined);
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
      if (response.status === 401) {
        setAuthOpen(true);
        throw new Error(data.error || "Login with X to scout.");
      }
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
    if (!view.dropId || claimBusy) return;
    setClaimBusy(true);
    setError(null);
    setClaimStatus(null);
    try {
      const response = await fetch(`/api/droplinks/${view.dropId}/claim/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      });
      const data = (await response.json()) as {
        canonicalRootDomain?: string;
        txtName?: string;
        txtValue?: string;
        claim?: { id: string; hostname?: string; txtName?: string; txtValue?: string };
        error?: string;
      };
      if (response.status === 401) {
        setAuthOpen(true);
        throw new Error(data.error || "Login with X to claim this DropLink.");
      }
      if (!response.ok || !data.claim?.id) throw new Error(data.error || "Could not start claim.");
      setClaimSheet({
        id: data.claim.id,
        domain: data.canonicalRootDomain || data.claim.hostname || view.domain,
        txtName: data.txtName || data.claim.txtName || "",
        txtValue: data.txtValue || data.claim.txtValue || ""
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start claim.");
    } finally {
      setClaimBusy(false);
    }
  }

  async function copyClaimText(kind: "name" | "value", value: string) {
    await navigator.clipboard?.writeText(value).catch(() => undefined);
    setCopiedClaimField(kind);
    window.setTimeout(() => setCopiedClaimField(null), 1200);
  }

  async function checkClaimDns() {
    if (!claimSheet || claimCheckBusy) return;
    setClaimCheckBusy(true);
    setClaimStatus(null);
    try {
      const response = await fetch(`/api/claims/${claimSheet.id}/check`, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({})
      });
      const data = (await response.json()) as { verified?: boolean; error?: string };
      if (data.verified) {
        setClaimStatus("DNS verified. This DropLink is now claimed.");
        setView((current) => ({ ...current, state: "claimed" }));
        router.refresh();
        return;
      }
      if (response.status === 429) throw new Error(data.error || "Too many DNS checks. Wait a minute and try again.");
      setClaimStatus(data.error || "DNS record not found yet. Add the TXT record, wait a few minutes, and check again.");
    } catch (err) {
      setClaimStatus(err instanceof Error ? err.message : "Could not check DNS right now.");
    } finally {
      setClaimCheckBusy(false);
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

  function loginWithX() {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.href = `/api/auth/x/login?returnTo=${encodeURIComponent(returnTo)}`;
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setCurrentUser(null);
    setAuthOpen(false);
    router.refresh();
  }

  function closeDetailModal() {
    setDetailProduct(null);
    setDetailDragStartY(null);
    setDetailDragY(0);
    setDetailDragging(false);
  }

  function startDetailDrag(clientY: number) {
    setDetailDragStartY(clientY);
    setDetailDragY(0);
    setDetailDragging(true);
  }

  function moveDetailDrag(clientY: number) {
    if (detailDragStartY === null) return;
    setDetailDragY(Math.max(0, clientY - detailDragStartY));
  }

  function endDetailDrag() {
    if (detailDragY > 92) {
      closeDetailModal();
      return;
    }
    setDetailDragStartY(null);
    setDetailDragY(0);
    setDetailDragging(false);
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
      setNotifiedEmail(notifyEmail);
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
  const showPotentialEarnings = Boolean(view.potentialEarnings && view.state !== "empty" && !showSkeleton);
  const showFavicon = Boolean(view.favicon && !faviconFailed);
  const canScout = Boolean(currentUser);
  const scoutAttribution = view.scoutUser ? (
    <a href={`/u/${view.scoutUser.username}`}>@{view.scoutUser.username}</a>
  ) : (
    view.scoutLabel || "anonymous scout"
  );
  const claimedAttribution = view.claimedLabel || null;

  return (
    <main className="brand-drop-page">
      <div className="brand-drop-shell app-drop-shell">
        <header className="brand-drop-appbar app-dropbar">
          <a className="brand-drop-back" href="/" aria-label="Back to DropLink">
            ←
          </a>
          <a className="appbar-domain" href={view.submittedUrl} target="_blank" rel="noreferrer">
            {showFavicon ? <img src={view.favicon || ""} alt="" onError={() => setFaviconFailed(true)} /> : null}
            <span>{view.domain}</span>
          </a>
          <div className="appbar-actions">
            {busy || view.state === "processing" ? (
              <button className={`drop-spinner${busy ? " is-spinning" : ""}`} type="button" onClick={() => setDrawerOpen(true)} aria-label="Open distillation log" />
            ) : null}
            {view.state !== "empty" && view.state !== "processing" ? (
              <>
                <button className="icon-action" type="button" onClick={shareDrop} aria-label="Share this DropLink">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <path d="M8.7 10.7 15.3 6.3M8.7 13.3l6.6 4.4" />
                  </svg>
                </button>
              </>
            ) : null}
            {currentUser ? (
              <a className="avatar-action" href={`/u/${currentUser.username}`} aria-label={`Open @${currentUser.username} profile`}>
                {currentUser.avatarUrl ? <img src={currentUser.avatarUrl} alt="" /> : <span aria-hidden="true" />}
              </a>
            ) : (
              <button className="avatar-action" type="button" onClick={loginWithX} aria-label="Login with X">
                <span aria-hidden="true" />
              </button>
            )}
          </div>
        </header>

        <section className="brand-drop-hero app-drop-hero" aria-label={`${view.domain} droplink`}>
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
                  <strong>Scouted by {scoutAttribution}</strong>
                  <span>
                    Owner of this domain?{" "}
                    {currentUser ? (
                      <button type="button" onClick={startClaim} disabled={!view.dropId || claimBusy}>
                        {claimBusy ? "Preparing claim..." : "Claim this DropLink"}
                      </button>
                    ) : (
                      <button type="button" onClick={loginWithX}>Login with X to claim</button>
                    )}
                  </span>
                </div>
              ) : null}
              {view.publicMode === "scouted_unclaimed" && view.state !== "empty" ? (
                <p className="scout-mode-note">Unofficial scout proposal. The owner has not claimed or approved this DropLink yet.</p>
              ) : null}
              {view.state === "claimed" || view.state === "live" || view.state === "sold_out" ? (
                <div className="drop-status-copy">
                  <strong>
                    Scouted by {scoutAttribution}
                    {claimedAttribution ? <> · Claimed by {claimedAttribution}</> : null}
                  </strong>
                  <span>
                    {view.state === "claimed"
                      ? `Products go live after owner activation is complete. ${view.ownerReceivesAll ? "Owner receives 100% of net proceeds because the owner scouted this DropLink." : "When live, owner receives 92% and scout receives 8% of net proceeds after production/payment costs."}`
                      : view.ownerReceivesAll
                        ? "Live. Owner receives 100% of net proceeds because the owner also scouted this DropLink."
                        : "Live. Owner receives 92% and scout receives 8% of net proceeds after production/payment costs."}
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
            {canScout ? (
              <>
                <button type="button" onClick={() => setX402Open(true)} disabled={busy}>
                  Scout this drop - {view.x402.amountUsdc} {view.x402.asset} via x402
                </button>
                <button className="stripe-scout-link" type="button" onClick={scoutWithStripe} disabled={busy}>
                  or pay via Stripe
                </button>
              </>
            ) : (
              <button type="button" onClick={loginWithX}>
                Login with X to scout
              </button>
            )}
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
                  setNotifiedEmail(null);
                }}
                onDetailsClick={() => setDetailProduct(product)}
              />
            ))}
          </section>
        ) : null}

        {error && view.state !== "empty" ? <p className="drop-error">{error}</p> : null}

        {showPotentialEarnings && view.potentialEarnings ? (
          <aside className="hero-earnings" aria-label="Estimated net proceeds">
            Estimated net proceeds: owner ({view.potentialEarnings.domainOwnerPercent}) {roundedMoney(view.potentialEarnings.domainOwner)} · scout ({view.potentialEarnings.claimerPercent}) {roundedMoney(view.potentialEarnings.claimer)}
            {view.potentialEarnings.gross && view.potentialEarnings.estimatedCosts && view.potentialEarnings.netMargin ? (
              <small>Based on {roundedMoney(view.potentialEarnings.gross)} gross minus estimated Printful, Stripe, and reserve costs ({roundedMoney(view.potentialEarnings.estimatedCosts)}), leaving about {roundedMoney(view.potentialEarnings.netMargin)} net margin before final settlement.</small>
            ) : null}
          </aside>
        ) : null}

      </div>

      {drawerOpen ? (
        <div className="distill-overlay" role="dialog" aria-modal="true" aria-label="Distillation log">
          <button className="distill-scrim" type="button" onClick={() => setDrawerOpen(false)} aria-label="Close distillation log" />
          <section className="distill-drawer">
            <header>
              <div>
                <small>transmission from live hermes agent</small>
                <strong>{stepCopy[currentStep] || currentStep}</strong>
                <span>{view.domain} → 3 finite artifacts</span>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)}>Close</button>
            </header>
            <div className="distill-events" ref={eventFeedRef}>
              {events.length ? (
                events.slice().reverse().map((event) => {
                  const images = eventImages(event);
                  return (
                    <article className={`distill-event phase-${eventPhase(event.eventType)}`} key={event.id}>
                      <time>{time(event.createdAt)}</time>
                      <div>
                        <b>{eventPhase(event.eventType)}</b>
                        <p>{narrateEvent(event, view.domain)}</p>
                        {images.length ? (
                          <div className="distill-image-strip">
                            {images.map((image) => (
                              <figure key={image.url}>
                                <img src={image.url} alt="" loading="lazy" />
                                <figcaption>{image.label}</figcaption>
                              </figure>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })
              ) : (
                <>
                  <article className="distill-event phase-signal">
                    <time>now</time>
                    <div>
                      <b>signal</b>
                      <p>i am holding the link at the threshold. first i verify the trail exists; then i decide what kind of object wants to come through.</p>
                    </div>
                  </article>
                  <article className="distill-event phase-evidence live-agent-row">
                    <time />
                    <div>
                      <b>queue</b>
                      <p>waiting for crawler, brand study, product planning, and image generation workers</p>
                    </div>
                  </article>
                </>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {x402Open ? (
        <div className="distill-overlay x402-overlay" role="dialog" aria-modal="true" aria-label="Scout with x402">
          <button className="distill-scrim" type="button" onClick={() => setX402Open(false)} aria-label="Close x402 modal" />
          <section className="x402-modal">
            <header>
              <h2>Scout with x402</h2>
              <button type="button" onClick={() => setX402Open(false)} aria-label="Close x402 modal">Close</button>
            </header>
            <div className="x402-instructions">
              <p>Send {view.x402.amountUsdc} {view.x402.asset} on {view.x402.network} to this wallet.</p>
              <div className="x402-wallet">
                <code>{view.x402.recipientAddress}</code>
                <button type="button" onClick={copyX402Recipient}>copy</button>
              </div>
              <p>Your x402 wallet or agent should give you an X-Payment proof after payment. Paste that proof here, then verify.</p>
            </div>
            <form onSubmit={submitX402Payment}>
              <textarea
                value={x402Proof}
                onChange={(event) => setX402Proof(event.target.value)}
                placeholder="Paste X-Payment proof or payment header"
                rows={4}
                required
              />
              <button type="submit" disabled={busy || !x402Proof.trim()}>
                {busy ? "Verifying" : "Verify payment and scout"}
              </button>
            </form>
            {x402Status ? <small>{x402Status}</small> : null}
          </section>
        </div>
      ) : null}

      {detailProduct ? (
        <div className="distill-overlay product-detail-overlay" role="dialog" aria-modal="true" aria-label={`${detailProduct.title} product details`}>
          <button className="distill-scrim" type="button" onClick={closeDetailModal} aria-label="Close product details" />
          <section
            className={`product-detail-modal${detailDragging ? " is-dragging" : ""}`}
            style={{ transform: detailDragY ? `translateY(${detailDragY}px)` : undefined }}
          >
            <button
              className="product-detail-drag-handle"
              type="button"
              aria-label="Drag down to close product details"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                startDetailDrag(event.clientY);
              }}
              onPointerMove={(event) => moveDetailDrag(event.clientY)}
              onPointerUp={(event) => {
                event.currentTarget.releasePointerCapture(event.pointerId);
                endDetailDrag();
              }}
              onPointerCancel={endDetailDrag}
            />
            <header>
              <div>
                <small>{detailProduct.kindLabel} object</small>
                <h2>{detailProduct.title}</h2>
              </div>
              <button type="button" onClick={closeDetailModal} aria-label="Close product details">Close</button>
            </header>
            {detailProduct.imageUrl ? <img className="product-detail-hero" src={detailProduct.imageUrl} alt={`${detailProduct.title} product image`} /> : null}
            <p>{detailProduct.description}</p>
            <dl className="product-detail-specs">
              <div><dt>price</dt><dd>{detailProduct.price}</dd></div>
              <div><dt>supply</dt><dd>{detailProduct.remaining}/{detailProduct.total} left</dd></div>
              <div><dt>printful product</dt><dd>{detailProduct.printfulProductName || "pending"}{detailProduct.printfulProductId ? ` #${detailProduct.printfulProductId}` : ""}</dd></div>
              <div><dt>printful variant</dt><dd>{detailProduct.printfulVariantName || "pending"}{detailProduct.printfulVariantId ? ` #${detailProduct.printfulVariantId}` : ""}</dd></div>
              <div><dt>printful sku</dt><dd>{detailProduct.printfulSku || detailProduct.printfulVariantId || "pending"}</dd></div>
              <div><dt>placement</dt><dd>{detailProduct.placement || "pending"}</dd></div>
              <div><dt>technique</dt><dd>{detailProduct.technique || "pending"}</dd></div>
            </dl>
            {detailProduct.selectionReason ? <p className="product-detail-note">{detailProduct.selectionReason}</p> : null}
            {detailProduct.printFileUrl ? (
              <a className="product-detail-link" href={detailProduct.printFileUrl} target="_blank" rel="noreferrer">open print file</a>
            ) : null}
            {[...(detailProduct.printImageUrls || []), ...(detailProduct.mockupUrls || [])].length ? (
              <div className="product-detail-images" aria-label="Print and mockup images">
                {[...(detailProduct.printImageUrls || []), ...(detailProduct.mockupUrls || [])].filter((url, index, arr) => url && arr.indexOf(url) === index).slice(0, 8).map((url, index) => {
                  const label = index < (detailProduct.printImageUrls || []).length ? "print" : "mockup";
                  return (
                    <button type="button" onClick={() => setLightboxImage({ url, label: `${detailProduct.title} ${label}` })} key={url}>
                      <img src={url} alt={`${detailProduct.title} asset ${index + 1}`} />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {lightboxImage ? (
        <div className="image-lightbox-overlay" role="dialog" aria-modal="true" aria-label={lightboxImage.label}>
          <button className="image-lightbox-scrim" type="button" onClick={() => setLightboxImage(null)} aria-label="Close image preview" />
          <figure className="image-lightbox-card">
            <img src={lightboxImage.url} alt={lightboxImage.label} />
            <figcaption>
              <span>{lightboxImage.label}</span>
              <button type="button" onClick={() => setLightboxImage(null)}>Close</button>
            </figcaption>
          </figure>
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
            {notifiedEmail ? (
              <div className="saved-email">
                <span>{notifiedEmail}</span>
              </div>
            ) : (
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
            )}
            <a href="https://x.com/jpfraneto" target="_blank" rel="noreferrer">Follow @jpfraneto on X for DropLink updates</a>
            {notifyStatus ? <small>{notifyStatus}</small> : null}
          </section>
        </div>
      ) : null}

      {claimSheet ? (
        <div className="distill-overlay claim-overlay" role="dialog" aria-modal="true" aria-label={`Claim ${claimSheet.domain} on DropLink`}>
          <button className="distill-scrim" type="button" onClick={() => setClaimSheet(null)} aria-label="Close claim modal" />
          <section className="claim-modal">
            <header>
              <h2>Claim {claimSheet.domain} on DropLink</h2>
              <button type="button" onClick={() => setClaimSheet(null)} aria-label="Close claim modal">Close</button>
            </header>
            <p>Add this DNS TXT record with your DNS provider, then check DNS after it propagates.</p>
            {view.potentialEarnings ? (
              <div className="claim-potential">
                <span>Estimated owner net if the collection sells out</span>
                <strong>{view.potentialEarnings.domainOwner}</strong>
                {view.potentialEarnings.estimatedCosts ? <small>After estimated Printful, Stripe, and reserve costs.</small> : null}
              </div>
            ) : null}
            <div className="dns-records">
              <div className="dns-record-row">
                <span>
                  <em>TXT name</em>
                  <code>{claimSheet.txtName}</code>
                </span>
                <button type="button" onClick={() => copyClaimText("name", claimSheet.txtName)}>
                  {copiedClaimField === "name" ? "copied" : "copy"}
                </button>
              </div>
              <div className="dns-record-row">
                <span>
                  <em>TXT value</em>
                  <code>{claimSheet.txtValue}</code>
                </span>
                <button type="button" onClick={() => copyClaimText("value", claimSheet.txtValue)}>
                  {copiedClaimField === "value" ? "copied" : "copy"}
                </button>
              </div>
            </div>
            <button className="claim-check-button" type="button" onClick={checkClaimDns} disabled={claimCheckBusy}>
              {claimCheckBusy ? <span className="inline-spinner" aria-hidden="true" /> : "check DNS"}
            </button>
            {claimStatus ? <small>{claimStatus}</small> : null}
          </section>
        </div>
      ) : null}

      {authOpen ? (
        <div className="distill-overlay auth-overlay" role="dialog" aria-modal="true" aria-label={currentUser ? "Profile menu" : "Login with X"}>
          <button className="distill-scrim" type="button" onClick={() => setAuthOpen(false)} aria-label="Close login modal" />
          <section className="auth-modal">
            <header>
              <h2>{currentUser ? `@${currentUser.username}` : "Login with X"}</h2>
              <button type="button" onClick={() => setAuthOpen(false)} aria-label="Close login modal">Close</button>
            </header>
            {currentUser ? (
              <>
                <div className="auth-user-row">
                  {currentUser.avatarUrl ? <img src={currentUser.avatarUrl} alt="" /> : <span aria-hidden="true" />}
                  <div>
                    <strong>{currentUser.displayName}</strong>
                    <span>@{currentUser.username}</span>
                  </div>
                </div>
                <a className="auth-primary" href={`/u/${currentUser.username}`}>View profile</a>
                <button className="auth-secondary" type="button" onClick={logout}>Logout</button>
              </>
            ) : (
              <button className="auth-primary" type="button" onClick={loginWithX}>
                Login with X
              </button>
            )}
          </section>
        </div>
      ) : null}
    </main>
  );
}
