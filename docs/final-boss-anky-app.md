# anky.app final boss runbook

This runbook is for the first live commerce-path purchase after the `nousresearch.com` Stripe test dry run passes.

## Preconditions

- Live `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, and `STRIPE_WEBHOOK_SECRET` are set on `droplink-web.service`.
- Stripe webhook endpoint points at the live DropLink URL and includes these events: `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`, `refund.created`, `refund.updated`, `account.updated`, `transfer.created`, `transfer.reversed`, `transfer.updated`, and `payout.failed`.
- Stripe Connect Express is enabled. The anky.app owner has completed hosted onboarding, or proceeds are intentionally held.
- If payout is expected on this run, `stripe_connect_payouts_enabled` is true for the anky.app drop.
- Live `PRINTFUL_API_KEY`, `PRINTFUL_API_BASE`, and `PRINTFUL_STORE_ID` are set.
- Printful billing is configured.
- Printful webhook is configured to `POST /api/printful/webhook`; set `PRINTFUL_WEBHOOK_SECRET` if using signatures.
- `PRINTFUL_CONFIRM_ORDERS=false` and `PRINTFUL_AUTO_CONFIRM_ORDERS=false` for launch/manual safety.
- `DROPLINK_CHECKOUT_PAUSED=false`, and the anky.app drop is not checkout-paused.
- anky.app is DNS claimed/verified, reviewed, published, and in `platform_checkout`.
- Shipping/tax posture is explicit:
  - Default launch mode is `DROPLINK_SHIPPING_MODE=included`.
  - Default allowed countries are `DROPLINK_CHECKOUT_ALLOWED_COUNTRIES=US`.
  - Stripe Tax is only real if `DROPLINK_STRIPE_TAX_ENABLED=true` and Stripe Tax is configured in Stripe.
- Admin controls are available for order detail, Printful retry/confirm, refund, payout block/release, checkout pause, and Stripe event reprocess.

## Buyer test

1. Run `bun run commerce:readiness anky.app` with the production env loaded and confirm no blockers.
2. Choose one cheap/safe anky.app product.
3. Buy through live Stripe Checkout with a real payment method.
4. Confirm the Stripe webhook created exactly one DropLink order.
5. Open `GET /api/admin/orders/:orderId` and verify:
   - buyer email and shipping address
   - Stripe session, PaymentIntent, and charge IDs
   - one ledger payment entry and one Stripe fee entry
   - no Stripe transfer yet
6. Confirm exactly one Printful draft exists.
7. Review product, address, Printful cost, shipping/tax economics, and ledger.
8. Explicitly confirm fulfillment with `POST /api/admin/orders/:orderId/printful/confirm`.
9. Wait for Printful status webhooks; verify tracking lands on the order.
10. After shipped/delivered, release payout manually with `POST /api/admin/orders/:orderId/payout/release`.
11. Confirm one Stripe transfer is stored and repeated release does not duplicate it.
12. Reconcile ledger: buyer gross, Stripe fee, Printful cost, refund reserve, owner proceeds, scout held/pending if not implemented.

## Abort switches

- Pause all checkout: `POST /api/admin/checkout/pause` with `{ "paused": true, "reason": "..." }`.
- Pause only anky.app: `POST /api/admin/droplinks/:dropId/checkout-pause` with `{ "paused": true, "reason": "..." }`.
- Retry failed Stripe event: `POST /api/admin/stripe-events/:eventId/reprocess`.
- Retry Printful draft: `POST /api/admin/orders/:orderId/printful/retry`.
- Do not confirm Printful if address/product/economics look wrong.
- Refund buyer: `POST /api/admin/orders/:orderId/refund`.
- Block payout: `POST /api/admin/orders/:orderId/payout/block`.
- Cancel/ignore a Printful draft from the Printful dashboard if refunded before fulfillment confirmation.

## Success criteria

- Buyer paid.
- DropLink order was created exactly once.
- Printful draft was created exactly once.
- Printful confirmation happened only through explicit admin action.
- Product ships.
- Tracking is recorded on fulfillment and parent order.
- Ledger reconciles with actual Stripe fee when available.
- Payout transfer is created exactly once.
- Refund/dispute path is known and blocks payout.
