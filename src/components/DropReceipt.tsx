import type { Drop } from "@/lib/types";

export function DropReceipt({ drop }: { drop: Drop }) {
  const receipt = drop.receiptJson;
  return (
    <section className="section">
      <h2 className="section-title">Drop Receipt</h2>
      <div className="receipt">
        <div>
          <h3>Source</h3>
          <p>{receipt.source}</p>
        </div>
        <div>
          <h3>Collection</h3>
          <p>{receipt.collection}</p>
        </div>
        <div>
          <h3>What DropLink saw</h3>
          <p>{receipt.whatDropLinkSaw}</p>
        </div>
        <div>
          <h3>Audience</h3>
          <p>{receipt.audience}</p>
        </div>
        <div>
          <h3>Why these products</h3>
          <p>{receipt.whyTheseProducts}</p>
        </div>
        <div>
          <h3>Platform fee</h3>
          <p>{receipt.platformFee}</p>
        </div>
        <div>
          <h3>Status</h3>
          <p>{receipt.status}. Not affiliated with the source unless claimed by owner.</p>
        </div>
        <div>
          <h3>Receipt hash</h3>
          <p>{drop.receiptHash.slice(0, 24)}</p>
        </div>
      </div>
    </section>
  );
}
