import { createCapsuleFromScrape } from "./ai";
import { validateCapsule } from "./capsule";
import { hashValue, newId } from "./hashes";
import { scrapePublicPage } from "./scrape";
import { existingDropSlugs, saveDropWithProducts } from "./store";
import { slugify, uniqueSlug } from "./slugs";
import type { Drop, DropCapsule, Product } from "./types";
import { domainFromUrl } from "./urls";

function appUrl(): string {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

function buildDropFromCapsule(capsule: DropCapsule): { drop: Drop; products: Product[] } {
  const now = new Date().toISOString();
  const dropId = newId("drop");
  const existing = new Set<string>();
  const brandSlug = slugify(capsule.project.name);
  const sourceUrl = capsule.source.url || `https://${capsule.source.domain || `${brandSlug}.example`}`;
  const domain = capsule.source.domain || domainFromUrl(sourceUrl);
  const platformFeeBps = capsule.commerce.platform_fee_bps || Number(process.env.DROPLINK_PLATFORM_FEE_BPS || 800);
  const receipt = {
    source: sourceUrl,
    collection: capsule.drop.collection_name,
    whatDropLinkSaw: capsule.project.one_liner,
    brandSummary: capsule.project.brand_summary,
    audience: capsule.project.audience,
    whyTheseProducts: `The drop turns the project into exactly three concrete objects: ${capsule.drop.products
      .map((product) => product.type)
      .join(", ")}.`,
    pricingLogic: "Prices use a simple demo catalog with room for production and fulfillment costs.",
    status: capsule.approval.status === "live" ? "Live / Claimed" : "Preview / Unclaimed",
    platformFee: `DropLink platform fee: ${platformFeeBps / 100}%`,
    generatedAt: now
  };
  const receiptHash = hashValue(receipt);
  const capsuleHash = hashValue(capsule);

  const drop: Drop = {
    id: dropId,
    slug: brandSlug,
    sourceUrl,
    sourceDomain: domain,
    sourceTitle: capsule.source.title || capsule.project.name,
    sourceDescription: capsule.project.one_liner,
    brandName: capsule.project.name,
    brandSummary: capsule.project.brand_summary,
    audience: capsule.project.audience,
    collectionName: capsule.drop.collection_name,
    collectionTagline: capsule.drop.collection_tagline,
    status: capsule.approval.status,
    isClaimed: capsule.approval.status !== "preview",
    ownerEmail: capsule.approval.approved_by,
    stripeConnectedAccountId: null,
    platformFeeBps,
    receiptJson: receipt,
    receiptHash,
    capsuleJson: capsule,
    capsuleHash,
    ogImageUrl: `${appUrl()}/api/og/${dropId}.png`,
    createdAt: now,
    updatedAt: now,
    publishedAt: now
  };

  const productSlugs = new Set<string>();
  const products = capsule.drop.products.map((entry, index) => {
    const productId = newId("prod");
    const productSlug = uniqueSlug(entry.name, productSlugs);
    productSlugs.add(productSlug);
    return {
      id: productId,
      dropId,
      slug: productSlug,
      name: entry.name,
      type: entry.type,
      description: entry.description,
      whyThisProduct: entry.why_this_product,
      priceCents: entry.price_cents,
      currency: entry.currency || "usd",
      imagePrompt: entry.image_prompt,
      imageUrl: `${appUrl()}/api/mockups/${productId}`,
      mockupUrl: `${appUrl()}/api/mockups/${productId}`,
      stripeProductId: null,
      stripePriceId: null,
      position: (index + 1) as 1 | 2 | 3,
      createdAt: now,
      updatedAt: now
    } satisfies Product;
  });

  existing.add(drop.slug);
  return { drop, products };
}

export async function generateDropFromUrl(url: string): Promise<{ drop: Drop; products: Product[]; logs: string[] }> {
  const logs = [
    "reading the link...",
    "extracting the brand...",
    "finding the lore...",
    "choosing 3 products...",
    "generating mockups...",
    "building the storefront...",
    "creating the share image..."
  ];
  const page = await scrapePublicPage(url);
  const capsule = validateCapsule(await createCapsuleFromScrape(page));
  const result = await generateDropFromCapsule(capsule);
  return { ...result, logs };
}

export async function generateDropFromCapsule(input: unknown): Promise<{ drop: Drop; products: Product[]; logs: string[] }> {
  const capsule = validateCapsule(input);
  const { drop, products } = buildDropFromCapsule(capsule);
  const slugs = await existingDropSlugs();
  drop.slug = uniqueSlug(drop.slug, slugs);
  drop.ogImageUrl = `${appUrl()}/api/og/${drop.id}.png`;
  await saveDropWithProducts(drop, products);

  return {
    drop,
    products,
    logs: [
      "validated the capsule...",
      "confirmed exactly 3 products...",
      "generated mockups...",
      "composed the OG image...",
      "published the preview storefront..."
    ]
  };
}
