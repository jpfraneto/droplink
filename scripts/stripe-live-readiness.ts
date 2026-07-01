import { existsSync, readFileSync } from "fs";
import Stripe from "stripe";

const serviceName = process.env.DROPLINK_SERVICE_NAME || "droplink-web.service";
const requiredWebhookEvents = [
  "checkout.session.completed",
  "checkout.session.expired",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "payment_intent.canceled",
  "charge.refunded",
  "charge.dispute.created",
  "refund.created",
  "refund.updated"
];
const recommendedWebhookEvents = ["payment_intent.succeeded", "payment_intent.payment_failed"];
const optionalConnectEvents = ["account.updated"];
const webhookUrl = "https://droplink.lat/api/stripe/webhook";

type Check = {
  name: string;
  ok: boolean;
  status: "pass" | "fail" | "warn";
  detail: string;
};

function check(name: string, ok: boolean, detail: string, warn = false): Check {
  return { name, ok, status: ok ? "pass" : warn ? "warn" : "fail", detail };
}

function modeFor(value?: string | null, livePrefix = "", testPrefix = "") {
  if (!value) return "missing";
  if (livePrefix && value.startsWith(livePrefix)) return "live";
  if (testPrefix && value.startsWith(testPrefix)) return "test";
  return "unknown";
}

function parseEnvText(text: string) {
  const env: Record<string, string> = {};
  for (const raw of text.split(/\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[key] = value;
  }
  return env;
}

function systemctl(args: string[]) {
  const result = Bun.spawnSync(["systemctl", "--user", ...args], { stdout: "pipe", stderr: "pipe" });
  return {
    ok: result.exitCode === 0,
    stdout: new TextDecoder().decode(result.stdout).trim(),
    stderr: new TextDecoder().decode(result.stderr).trim()
  };
}

function serviceMainPid() {
  const result = systemctl(["show", serviceName, "-p", "MainPID", "--value"]);
  return result.ok ? result.stdout.trim() : "";
}

function serviceEnvironment() {
  const pid = serviceMainPid();
  if (!pid || pid === "0") return { pid, env: {} as Record<string, string> };
  const path = `/proc/${pid}/environ`;
  if (!existsSync(path)) return { pid, env: {} as Record<string, string> };
  const env = Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\0")
      .filter(Boolean)
      .map((entry) => {
        const index = entry.indexOf("=");
        return [entry.slice(0, index), entry.slice(index + 1)];
      })
  ) as Record<string, string>;
  return { pid, env };
}

async function reachable(url: string, init: RequestInit = {}) {
  try {
    const response = await fetch(url, { method: "HEAD", redirect: "manual", ...init });
    return { ok: response.status < 500, status: response.status };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

async function stripeChecks(env: Record<string, string>) {
  const checks: Check[] = [];
  const secret = env.STRIPE_SECRET_KEY;
  const mode = modeFor(secret, "sk_live_", "sk_test_");
  if (mode !== "live") {
    checks.push(check("stripe_api_live_access", false, "Skipped Stripe API validation because the running service is not using a live secret key."));
    return { checks, webhookEndpoint: null as null | Record<string, unknown> };
  }
  const stripe = new Stripe(secret, { apiVersion: "2025-02-24.acacia" });
  try {
    const account = await stripe.accounts.retrieve();
    checks.push(check("stripe_api_live_access", true, `Stripe account retrieved safely; charges_enabled=${Boolean(account.charges_enabled)}, payouts_enabled=${Boolean(account.payouts_enabled)}.`));
  } catch (error) {
    checks.push(check("stripe_api_live_access", false, error instanceof Error ? error.message : "Could not retrieve Stripe account."));
  }

  try {
    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
    const endpoint = endpoints.data.find((entry) => entry.url === webhookUrl) || null;
    if (!endpoint) {
      checks.push(check("stripe_live_webhook_endpoint", false, `${webhookUrl} was not found in the live Stripe webhook endpoint list.`));
      return { checks, webhookEndpoint: null };
    }
    const enabled = new Set(endpoint.enabled_events);
    const missing = [...requiredWebhookEvents, ...recommendedWebhookEvents, ...optionalConnectEvents].filter((event) => !enabled.has("*") && !enabled.has(event));
    const requiredMissing = requiredWebhookEvents.filter((event) => !enabled.has("*") && !enabled.has(event));
    const recommendedMissing = recommendedWebhookEvents.filter((event) => !enabled.has("*") && !enabled.has(event));
    checks.push(check("stripe_live_webhook_endpoint", true, `Live webhook endpoint exists: ${webhookUrl}.`));
    checks.push(
      check(
        "stripe_live_webhook_events",
        requiredMissing.length === 0,
        requiredMissing.length ? `Missing required events: ${requiredMissing.join(", ")}.` : "All required demo webhook events are enabled."
      )
    );
    if (recommendedMissing.length) {
      checks.push(check("stripe_recommended_webhook_events", false, `Recommended but not blocking for scout demo: ${recommendedMissing.join(", ")}.`, true));
    }
    if (missing.some((event) => optionalConnectEvents.includes(event))) {
      checks.push(check("stripe_connect_webhook_events", false, "account.updated is missing on this endpoint. For connected-account updates, Stripe requires a Connected accounts event destination with its own signing secret.", true));
    }
    return {
      checks,
      webhookEndpoint: {
        id: endpoint.id,
        status: endpoint.status,
        enabledEvents: endpoint.enabled_events
      }
    };
  } catch (error) {
    checks.push(check("stripe_live_webhook_endpoint", false, error instanceof Error ? error.message : "Could not list Stripe webhook endpoints."));
    return { checks, webhookEndpoint: null };
  }
}

async function databaseChecks(env: Record<string, string>) {
  Object.assign(process.env, env);
  const checks: Check[] = [];
  const { sql, usePostgres } = await import("../src/lib/db");
  if (!usePostgres()) {
    checks.push(check("database_for_readiness", false, "DATABASE_URL is not configured for this readiness process."));
    return { checks, failedStripeEvents: [] as unknown[] };
  }
  const failedStripeEvents = await sql()`
    select id, type, livemode, status, error, updated_at
    from stripe_events
    where status <> 'processed'
    order by updated_at desc
    limit 20
  `;
  checks.push(check("stale_failed_stripe_events", failedStripeEvents.length === 0, failedStripeEvents.length ? `${failedStripeEvents.length} unprocessed Stripe event(s) found.` : "No unprocessed Stripe events found."));
  const { checkoutPauseState, getDropBundleByCanonicalHash } = await import("../src/lib/store");
  const { canonicalizeDropUrl } = await import("../src/lib/dropCanonicalization");
  const pause = await checkoutPauseState();
  checks.push(check("global_checkout_not_paused", !pause.paused, pause.paused ? `Checkout paused by ${pause.source}: ${pause.reason || "no reason"}.` : "Global checkout is not paused."));
  const anky = canonicalizeDropUrl("anky.app");
  const ankyBundle = await getDropBundleByCanonicalHash(anky.rootDomainHash);
  checks.push(check("anky_app_not_created", !ankyBundle?.drop, ankyBundle?.drop ? "`anky.app` already exists in the database." : "`anky.app` is not created."));
  return {
    checks,
    failedStripeEvents: failedStripeEvents.map((event) => ({
      id: event.id,
      type: event.type,
      livemode: event.livemode,
      status: event.status,
      error: event.error,
      updatedAt: event.updated_at
    }))
  };
}

const envFile = process.env.DROPLINK_PRODUCTION_ENV_FILE || "/home/kithkui/.config/droplink/production.env";
const fileEnv = existsSync(envFile) ? parseEnvText(readFileSync(envFile, "utf8")) : {};
const service = serviceEnvironment();
const env = { ...fileEnv, ...service.env };
const secretMode = modeFor(env.STRIPE_SECRET_KEY, "sk_live_", "sk_test_");
const publishableMode = modeFor(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, "pk_live_", "pk_test_");
const checks: Check[] = [
  check("running_service_env_loaded", Boolean(service.pid && Object.keys(service.env).length), service.pid ? `Inspected ${serviceName} PID ${service.pid}.` : `Could not inspect ${serviceName}.`),
  check("stripe_secret_key_live", secretMode === "live", `STRIPE_SECRET_KEY mode is ${secretMode}.`),
  check("stripe_publishable_key_live", publishableMode === "live", `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY mode is ${publishableMode}.`),
  check("stripe_key_modes_not_mixed", secretMode === publishableMode && secretMode !== "unknown" && secretMode !== "missing", `Secret=${secretMode}, publishable=${publishableMode}.`),
  check("stripe_webhook_secret_present", Boolean(env.STRIPE_WEBHOOK_SECRET), env.STRIPE_WEBHOOK_SECRET ? "STRIPE_WEBHOOK_SECRET is present." : "STRIPE_WEBHOOK_SECRET is missing."),
  check("base_url_droplink_lat", env.DROPLINK_PUBLIC_BASE_URL === "https://droplink.lat" && env.APP_URL === "https://droplink.lat" && env.NEXT_PUBLIC_APP_URL === "https://droplink.lat", `DROPLINK_PUBLIC_BASE_URL=${env.DROPLINK_PUBLIC_BASE_URL || "missing"}, APP_URL=${env.APP_URL || "missing"}, NEXT_PUBLIC_APP_URL=${env.NEXT_PUBLIC_APP_URL || "missing"}.`),
  check("summon_price_8_usd", Number(env.DROPLINK_SUMMON_PRICE_USDC) === 8, `DROPLINK_SUMMON_PRICE_USDC=${env.DROPLINK_SUMMON_PRICE_USDC || "missing"}.`),
  check("allow_mocks_false", env.ALLOW_MOCKS === "false", `ALLOW_MOCKS=${env.ALLOW_MOCKS || "missing"}.`),
  check("printful_auto_confirm_disabled", env.PRINTFUL_CONFIRM_ORDERS !== "true" && env.PRINTFUL_AUTO_CONFIRM_ORDERS !== "true", `PRINTFUL_CONFIRM_ORDERS=${env.PRINTFUL_CONFIRM_ORDERS || "missing"}, PRINTFUL_AUTO_CONFIRM_ORDERS=${env.PRINTFUL_AUTO_CONFIRM_ORDERS || "missing"}.`),
  check("automatic_payout_release_disabled", env.DROPLINK_AUTO_RELEASE_PAYOUTS !== "true", `DROPLINK_AUTO_RELEASE_PAYOUTS=${env.DROPLINK_AUTO_RELEASE_PAYOUTS || "missing"}.`),
  check("retry_tooling_exists", existsSync("src/app/api/admin/stripe-events/[id]/reprocess/route.ts") && existsSync("scripts/stripe-events-readiness.ts"), "Stripe event inspect/reprocess tooling exists."),
  check("refund_tooling_exists", existsSync("src/app/api/admin/orders/[id]/refund/route.ts"), "Admin refund endpoint exists.")
];

const rootReachability = await reachable("https://droplink.lat");
checks.push(check("public_root_reachable", rootReachability.ok, `https://droplink.lat returned HTTP ${rootReachability.status}.`));
const webhookReachability = await reachable(webhookUrl);
checks.push(check("public_stripe_webhook_reachable", webhookReachability.ok, `${webhookUrl} returned HTTP ${webhookReachability.status}.`));

const stripe = await stripeChecks(env);
checks.push(...stripe.checks);
const database = await databaseChecks(env);
checks.push(...database.checks);

const failed = checks.filter((entry) => entry.status === "fail");
const warnings = checks.filter((entry) => entry.status === "warn");
console.log(
  JSON.stringify(
    {
      ready: failed.length === 0,
      service: { name: serviceName, pid: service.pid || null },
      envFile,
      webhookUrl,
      keyModes: {
        STRIPE_SECRET_KEY: secretMode,
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: publishableMode,
        STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET ? "present" : "missing"
      },
      checks,
      warnings: warnings.map((entry) => entry.name),
      failures: failed.map((entry) => entry.name),
      stripeWebhookEndpoint: stripe.webhookEndpoint,
      failedStripeEvents: database.failedStripeEvents
    },
    null,
    2
  )
);

process.exit(failed.length === 0 ? 0 : 1);
