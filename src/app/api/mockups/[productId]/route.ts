import { NextResponse } from "next/server";
import { generateOpenAIProductImage } from "@/lib/imageProvider";
import { productMockupSvg } from "@/lib/mockups";
import { getDropById, getProductById } from "@/lib/store";

export async function GET(_request: Request, { params }: { params: { productId: string } }) {
  const product = await getProductById(params.productId);
  if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });
  const drop = await getDropById(product.dropId);
  if (!drop) return NextResponse.json({ error: "Drop not found." }, { status: 404 });

  const image = await generateOpenAIProductImage(product.imagePrompt);
  if (image) {
    return new NextResponse(new Uint8Array(image), {
      headers: {
        "content-type": "image/png",
        "cache-control": "public, max-age=86400"
      }
    });
  }

  return new NextResponse(productMockupSvg(drop, product), {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=31536000, immutable"
    }
  });
}
