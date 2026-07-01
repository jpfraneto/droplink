# Hackathon Demo: anky.app

## Pre-recording checklist

- `droplink.lat` opens.
- `/admin` is ready in a logged-in/admin-key browser session.
- X login is ready if using the public scout flow.
- `nousresearch.com` is the only existing drop.
- `anky.app` does not exist yet.
- Checkout countries are US-only.
- Printful auto-confirm is off.
- Global checkout is not paused.
- Do not show env files, API keys, Stripe secret pages, Printful API keys, or raw webhook secrets.

## Tabs to have open

- `https://droplink.lat/`
- `https://droplink.lat/admin`
- DNS provider for `anky.app`
- Stripe Dashboard test/live payments view
- Printful orders dashboard
- Optional: terminal ready for `bun run commerce:readiness anky.app`

## Recording sequence

1. Show the clean DropLink homepage.
2. Submit `https://anky.app` through the normal scout/generation flow.
3. Show the job/progress page while Hermes generates the drop.
4. Open the generated anky.app storefront/admin page.
5. Briefly show the 3 products, 24-edition structure, mockups, and blocked commerce state.
6. Start DNS claim.
7. Copy the TXT name/value into the DNS provider.
8. Run claim verification from the UI after propagation.
9. Show publish/readiness after claim verification.
10. Publish the drop.
11. Buy one product using a US shipping address.
12. Open admin order detail and show:
    - one paid DropLink order
    - Stripe session/payment/charge IDs
    - buyer email and US shipping address
    - ledger/economics
    - no payout transfer
13. Show one Printful draft order.
14. Manually confirm Printful only after reviewing product/address.
15. State that payout release remains manual and is not triggered by checkout.

## What to say briefly

- "DropLink turns a claimed root domain into a finite merch drop."
- "The domain owner must prove DNS control before commerce unlocks."
- "Payment is automatic, but fulfillment confirmation and payouts stay manual for launch safety."
- "The system creates exactly one order and exactly one Printful draft from Stripe webhooks."

## Abort switches

- Global checkout pause: `POST /api/admin/checkout/pause`
- Drop checkout pause: `POST /api/admin/droplinks/:dropId/checkout-pause`
- Refund: `POST /api/admin/orders/:orderId/refund`
- Block payout: `POST /api/admin/orders/:orderId/payout/block`
- Retry Stripe event: `POST /api/admin/stripe-events/:eventId/reprocess`
- Retry Printful draft: `POST /api/admin/orders/:orderId/printful/retry`

## Expected success state

- anky.app is generated once.
- DNS claim is verified through the real TXT record.
- Drop is published only after readiness passes.
- One Stripe checkout creates one paid order.
- One Printful draft exists.
- Printful confirmation is manual.
- No payout is released automatically.
- Payout release can be run manually later, exactly once.
