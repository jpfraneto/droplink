export async function generateOpenAIProductImage(prompt: string): Promise<Buffer | null> {
  if (process.env.IMAGE_PROVIDER !== "openai" || !process.env.OPENAI_API_KEY) {
    return null;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
        prompt,
        size: "1024x1024",
        response_format: "b64_json"
      })
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
    console.warn("OpenAI image generation failed; falling back to mock mockup.", error);
  }

  return null;
}
