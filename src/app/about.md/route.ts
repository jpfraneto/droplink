const body = `# DropLink

DropLink turns a root domain into one finite merch market.

Core invariant:

- one registrable/root domain
- three relics
- eight editions per relic
- twenty-four physical products total
- sold out means sold out forever

Flow:

1. Anyone submits a URL.
2. DropLink canonicalizes it to the root domain.
3. If that root domain already has a DropLink, the existing drop is returned and no new payment is required.
4. If it is new, the summoner pays 8 USDC to process it.
5. The system generates three products, one price book, projected economics, product images, Printful fulfillment specs, and an OG image.
6. The domain owner claims the drop by adding a DNS TXT record at _droplink.<rootDomain>.
7. Payout setup happens after claim through Tempo USDC or Stripe Connect.
8. Only verified and published drops can sell.
9. Stripe records payment, Printful receives a real draft order, and DropLink records settled economics.

Economics:

- The summoner earns 8% of net revenue if the domain owner claims and the drop sells.
- The verified domain owner earns the remaining claimable margin after costs and configured fees.
- Projected economics are estimates from the generated price book.
- Settled economics are calculated after each paid order.

Rules:

- DNS is ownership.
- Payout is a setting.
- Subdomains are doorways, not separate beings.
- Unclaimed drops do not sell.
- Mock public commerce is not allowed.
`;

export function GET() {
  return new Response(body, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=300"
    }
  });
}
