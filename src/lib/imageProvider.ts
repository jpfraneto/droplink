export function openAIImageGenerationBody(prompt: string) {
  return {
    model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
    prompt,
    size: process.env.OPENAI_IMAGE_SIZE || "1024x1024",
    ...(process.env.OPENAI_IMAGE_QUALITY ? { quality: process.env.OPENAI_IMAGE_QUALITY } : {})
  };
}

export function imageProviderMode() {
  return process.env.IMAGE_PROVIDER || (process.env.OPENAI_API_KEY ? "openai" : "mock");
}

export function manualImageMode() {
  return ["manual", "chatgpt", "chatgpt_manual"].includes(imageProviderMode());
}

export async function generateOpenAIProductImage(prompt: string): Promise<Buffer | null> {
  const provider = imageProviderMode();
  if (provider !== "openai" || !process.env.OPENAI_API_KEY) {
    return null;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify(openAIImageGenerationBody(prompt))
    });

    if (!response.ok) {
      throw new Error(`OpenAI image generation returned ${response.status}: ${await response.text()}`);
    }

    const json = (await response.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
    const item = json.data?.[0];
    if (item?.b64_json) return Buffer.from(item.b64_json, "base64");
    if (item?.url) {
      const image = await fetch(item.url);
      if (image.ok) return Buffer.from(await image.arrayBuffer());
    }
  } catch (error) {
    if (process.env.NODE_ENV === "production") throw error;
  }

  return null;
}
