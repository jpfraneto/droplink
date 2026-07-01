import { listStorefrontBundles, reviewReadiness } from "../src/lib/store";

const domain = (process.argv[2] || "nousresearch.com").toLowerCase();
const bundles = await listStorefrontBundles();
const matches = bundles.filter((bundle) => {
  const values = [
    bundle.drop?.canonicalDomain,
    bundle.drop?.canonicalRootDomain,
    bundle.drop?.registrableDomain,
    bundle.brand.hostname,
    bundle.storefront.slug
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  return values.some((value) => value === domain || value.includes(domain.replace(/^https?:\/\//, "")));
});

if (!matches.length) {
  console.log(JSON.stringify({ domain, found: false }, null, 2));
  process.exit(1);
}

const reports = matches.map((bundle) => {
  const readiness = reviewReadiness(bundle);
  return {
    found: true,
    dropId: bundle.drop?.id || null,
    canonicalDomain: bundle.drop?.canonicalDomain || null,
    canonicalRootDomain: bundle.drop?.canonicalRootDomain || null,
    slug: bundle.storefront.slug,
    dropStatus: bundle.drop?.status || null,
    domainClaimStatus: bundle.drop?.domainClaimStatus || null,
    publishStatus: bundle.drop?.publishStatus || null,
    commerceMode: bundle.storefront.commerceMode,
    checkoutPaused: Boolean(bundle.drop?.checkoutPaused),
    payoutStatus: bundle.drop?.payoutStatus || null,
    stripeConnectStatus: bundle.drop?.stripeConnectStatus || null,
    relicCount: bundle.relics.length,
    editionCount: bundle.editions.length,
    orderCount: bundle.orders.length,
    readiness: {
      ready: readiness.ready,
      blockers: readiness.blockers,
      checkoutAllowedCountries: process.env.DROPLINK_CHECKOUT_ALLOWED_COUNTRIES || "US",
      shippingMode: process.env.DROPLINK_SHIPPING_MODE || "included",
      stripeTaxEnabled: process.env.DROPLINK_STRIPE_TAX_ENABLED === "true"
    },
    relics: bundle.relics.map((relic) => ({
      id: relic.id,
      name: relic.name,
      description: relic.description,
      priceCents: relic.priceCents,
      currency: relic.currency,
      status: relic.status,
      totalSupply: relic.totalSupply,
      soldCount: relic.soldCount,
      reservedCount: relic.reservedCount,
      availableEditions: bundle.editions.filter((edition) => edition.relicId === relic.id && edition.status === "available").length,
      printfulProductId: relic.printfulProductId,
      printfulVariantId: relic.printfulVariantId,
      fulfillmentSpecReady: Boolean(relic.fulfillmentSpecJson?.catalogVariantId && relic.fulfillmentSpecJson?.printFileUrl),
      printFiles: bundle.assets
        .filter((asset) => asset.relicId === relic.id && asset.type === "print_file")
        .map((asset) => ({ url: asset.url, storageProvider: asset.storageProvider, validationStatus: asset.validationStatus })),
      mockups: bundle.mockups.filter((mockup) => mockup.relicId === relic.id).map((mockup) => ({ imageUrl: mockup.imageUrl, status: mockup.status }))
    }))
  };
});

console.log(JSON.stringify(reports, null, 2));
process.exit(0);
