# DropLink Master Context

DropLink turns one root domain into one finite physical market.

The product truth:

- A root domain can be summoned by anyone through any submitted URL on that domain.
- A domain can be claimed only by its owner.
- The drop is 24 physical objects.
- The creator earns for discovering it.
- The owner earns for claiming it.
- The buyer receives the object.
- When it sells out, the internet keeps the scar.

## Canonical Mechanism

Statuses:

- `summoned`: summon payment verified, creator recorded, 3 relics and 24 editions generated, commerce blocked.
- `claimed`: DNS TXT proof passed for the root domain, commerce still blocked.
- `published`: domain owner verified, readiness passes, commerce enabled.
- `sold_out`: all 24 editions sold, archive remains, checkout blocked.
- `archived`: intentionally removed from public flow.

Every DropLink has:

- 1 canonical root/registrable domain.
- Submitted subdomains and paths stored as source signals.
- 3 relics.
- 8 editions per relic.
- 24 total physical products.
- Real Printful fulfillment specs and print files.
- No mock assets or mock copy at publish.
- A generated price book and projected economics before publish.

## Money Flow

The summon fee belongs to Anky, Inc.

Sales use net drop margin:

gross sale amount minus taxes, shipping pass-through/cost, Stripe fees, Printful production cost, and configured reserves.

Creator bounty defaults to `DROPLINK_CREATOR_BOUNTY_BPS=800`, calculated from net margin. Domain owner proceeds receive the remaining claimable margin unless `DROPLINK_PROTOCOL_FEE_BPS` is explicitly configured.

Projected economics are generated with the drop from the 24-item price book and estimated costs. Settled economics are calculated after each paid order from actual or conservative payment/fulfillment costs.

If net margin is zero or negative, creator and domain-owner accruals are zero and the order requires admin review.

Ownership is DNS. Payout is a setting. A domain owner can claim without a wallet, then choose Tempo/USDC wallet payout or Stripe Connect/bank payout later. Missing payout setup blocks withdrawals, not internal accrual.

## External Boundaries

- x402/stablecoin payment is required for new summons. Missing x402 config blocks new paid drops.
- DNS TXT verification at `_droplink.<rootDomain>` is required to claim a domain. The summoner cannot bypass DNS.
- Tempo wallet setup requires fresh DNS TXT proof at `_droplink-payout.<rootDomain>`.
- Stripe Checkout is allowed only for published drops, locked price books, and available editions.
- Printful paid orders are real draft orders while `PRINTFUL_CONFIRM_ORDERS=false`.
- Tempo/onchain settlement must not be claimed unless a real transaction path is configured and returns a real transaction hash.

## Public Story

Paste a link.
Summon 24 physical relics.
3 relics, 8 editions each.
Summoned by the internet. Claimed by the owner.
Once sold out, it is complete.
