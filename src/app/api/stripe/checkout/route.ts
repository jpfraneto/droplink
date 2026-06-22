import { NextResponse } from "next/server";
import { z } from "zod";
import { createCheckoutSession } from "@/lib/stripe";
import { getDropById, getProductById } from "@/lib/store";

const requestSchema = z.object({
  dropId: z.string().min(3),
  productId: z.string().min(3)
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const drop = await getDropById(body.dropId);
    const product = await getProductById(body.productId);

    if (!drop || !product || product.dropId !== drop.id) {
      return NextResponse.json({ error: "Drop or product not found." }, { status: 404 });
    }

    if (!drop.isClaimed && process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_")) {
      return NextResponse.json({ error: "Live checkout requires a claimed drop." }, { status: 403 });
    }

    const { url, order } = await createCheckoutSession(drop, product);
    return NextResponse.json({ url, orderId: order.id, platformFeeCents: order.platformFeeCents });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create checkout.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
