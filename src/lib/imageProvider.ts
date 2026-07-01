import { randomInt, randomUUID } from "crypto";

type ImageProvider = "openrouter" | "openai" | "comfyui" | "flux" | "manual" | "chatgpt" | "chatgpt_manual" | "mock";

type GeneratedImage = {
  buffer: Buffer;
  provider: string;
};

export function openAIImageGenerationBody(prompt: string) {
  return {
    model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
    prompt,
    size: process.env.OPENAI_IMAGE_SIZE || "1024x1024",
    ...(process.env.OPENAI_IMAGE_QUALITY ? { quality: process.env.OPENAI_IMAGE_QUALITY } : {})
  };
}

function safeDefaultImageProvider(): ImageProvider {
  // Production DropLink must be fully agentic: prompt -> OpenRouter image model -> R2 -> product.
  // Do not silently fall back to Flux/ComfyUI or manual placeholder assets.
  return "openrouter";
}

export function imageProviderMode() {
  const configured = (process.env.DROPLINK_IMAGE_PROVIDER || process.env.IMAGE_PROVIDER || "").trim().toLowerCase();
  if (["comfyui", "flux"].includes(configured) && process.env.DROPLINK_ALLOW_FLUX_IMAGE_PROVIDER !== "true") {
    return safeDefaultImageProvider();
  }
  if (["manual", "chatgpt", "chatgpt_manual", "mock"].includes(configured) && process.env.DROPLINK_ALLOW_MANUAL_IMAGE_PROVIDER !== "true") {
    return safeDefaultImageProvider();
  }
  if (configured) return configured as ImageProvider;
  return safeDefaultImageProvider();
}

export function manualImageMode() {
  return ["manual", "chatgpt", "chatgpt_manual"].includes(imageProviderMode());
}

async function bufferFromImageReference(reference: unknown): Promise<Buffer | null> {
  if (!reference || typeof reference !== "string") return null;
  if (reference.startsWith("data:image/")) {
    const base64 = reference.split(",", 2)[1];
    return base64 ? Buffer.from(base64, "base64") : null;
  }
  if (/^https?:\/\//i.test(reference)) {
    const image = await fetch(reference, { signal: AbortSignal.timeout(120_000) });
    if (!image.ok) throw new Error(`Image URL fetch returned ${image.status}: ${await image.text()}`);
    return Buffer.from(await image.arrayBuffer());
  }
  return Buffer.from(reference, "base64");
}

async function imageBufferFromOpenRouterJson(json: any): Promise<Buffer | null> {
  const candidates: unknown[] = [];
  for (const item of json?.data || []) {
    if (item?.b64_json) candidates.push(item.b64_json);
    if (item?.url) candidates.push(item.url);
  }
  const message = json?.choices?.[0]?.message;
  if (message?.images) {
    for (const image of message.images) {
      candidates.push(image?.image_url?.url || image?.url || image?.b64_json);
    }
  }
  if (Array.isArray(message?.content)) {
    for (const part of message.content) {
      candidates.push(part?.image_url?.url || part?.url || part?.b64_json);
    }
  }
  for (const candidate of candidates) {
    const buffer = await bufferFromImageReference(candidate);
    if (buffer?.length) return buffer;
  }
  return null;
}

export async function generateOpenRouterProductImage(prompt: string): Promise<Buffer | null> {
  if (imageProviderMode() !== "openrouter") return null;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is required because DropLink image generation is locked to OpenRouter.");
  }
  const model = process.env.OPENROUTER_IMAGE_MODEL || process.env.OPENAI_IMAGE_MODEL || "openai/gpt-image-2";
  const endpoint = (process.env.OPENROUTER_IMAGE_ENDPOINT || "https://openrouter.ai/api/v1/chat/completions").replace(/\/$/, "");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.DROPLINK_PUBLIC_BASE_URL || process.env.APP_URL || "https://droplink.lat",
      "X-Title": "DropLink"
    },
    body: JSON.stringify({
      model,
      modalities: ["image", "text"],
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    }),
    signal: AbortSignal.timeout(Number(process.env.OPENROUTER_IMAGE_TIMEOUT_MS || 420_000))
  });
  if (!response.ok) {
    throw new Error(`OpenRouter image generation returned ${response.status}: ${await response.text()}`);
  }
  const json = await response.json();
  const buffer = await imageBufferFromOpenRouterJson(json);
  if (!buffer) throw new Error(`OpenRouter image generation returned no image for model ${model}.`);
  return buffer;
}

export async function generateOpenAIProductImage(prompt: string): Promise<Buffer | null> {
  const provider = imageProviderMode();
  if (provider !== "openai") {
    return null;
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required because DROPLINK_IMAGE_PROVIDER=openai.");
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
    return imageBufferFromOpenRouterJson(json);
  } catch (error) {
    if (process.env.NODE_ENV === "production") throw error;
  }

  return null;
}

function comfyUrl() {
  return (process.env.COMFYUI_URL || "http://127.0.0.1:8188").replace(/\/$/, "");
}

function comfyFile(name: string, fallback: string) {
  return process.env[name] || fallback;
}

function comfySteps() {
  return Number(process.env.COMFYUI_STEPS || 20);
}

function comfyGuidance() {
  return Number(process.env.COMFYUI_GUIDANCE || 3.5);
}

function comfyWorkflow(prompt: string, options: { width: number; height: number }) {
  const clientId = randomUUID();
  const nodes: Record<string, unknown> = {
    "1": {
      class_type: "UNETLoader",
      inputs: {
        unet_name: comfyFile("COMFYUI_FLUX_UNET", "flux1-dev.safetensors"),
        weight_dtype: process.env.COMFYUI_WEIGHT_DTYPE || "fp8_e4m3fn"
      }
    },
    "2": {
      class_type: "VAELoader",
      inputs: { vae_name: comfyFile("COMFYUI_FLUX_VAE", "ae.safetensors") }
    },
    "3": {
      class_type: "DualCLIPLoader",
      inputs: {
        clip_name1: comfyFile("COMFYUI_FLUX_CLIP_L", "clip_l.safetensors"),
        clip_name2: comfyFile("COMFYUI_FLUX_T5", "t5xxl_fp8_e4m3fn.safetensors"),
        type: "flux"
      }
    }
  };

  let modelRef: [string, number] = ["1", 0];
  let clipRef: [string, number] = ["3", 0];
  const loraName = process.env.COMFYUI_LORA_MODEL;
  if (loraName) {
    nodes["4"] = {
      class_type: "LoraLoader",
      inputs: {
        model: modelRef,
        clip: clipRef,
        lora_name: loraName,
        strength_model: Number(process.env.COMFYUI_LORA_STRENGTH || 0.75),
        strength_clip: Number(process.env.COMFYUI_LORA_CLIP_STRENGTH || process.env.COMFYUI_LORA_STRENGTH || 0.75)
      }
    };
    modelRef = ["4", 0];
    clipRef = ["4", 1];
  }

  nodes["5"] = { class_type: "CLIPTextEncode", inputs: { clip: clipRef, text: prompt } };
  nodes["6"] = {
    class_type: "CLIPTextEncode",
    inputs: {
      clip: clipRef,
      text:
        process.env.COMFYUI_NEGATIVE_PROMPT ||
        "blurry, distorted, illegible, fake ecommerce UI, malformed product, watermark, signature, low resolution, extra limbs, copied logo"
    }
  };
  nodes["7"] = { class_type: "EmptyLatentImage", inputs: { width: options.width, height: options.height, batch_size: 1 } };
  nodes["8"] = {
    class_type: "KSampler",
    inputs: {
      model: modelRef,
      positive: ["5", 0],
      negative: ["6", 0],
      latent_image: ["7", 0],
      seed: randomInt(1, 2_147_483_647),
      steps: comfySteps(),
      cfg: comfyGuidance(),
      sampler_name: process.env.COMFYUI_SAMPLER || "euler",
      scheduler: process.env.COMFYUI_SCHEDULER || "simple",
      denoise: 1
    }
  };
  nodes["9"] = { class_type: "VAEDecode", inputs: { samples: ["8", 0], vae: ["2", 0] } };
  nodes["10"] = { class_type: "SaveImage", inputs: { images: ["9", 0], filename_prefix: process.env.COMFYUI_FILENAME_PREFIX || "droplink" } };

  return { client_id: clientId, prompt: nodes };
}

async function generateComfyImage(prompt: string, options: { width: number; height: number }): Promise<GeneratedImage | null> {
  if (!["comfyui", "flux"].includes(imageProviderMode())) return null;
  const baseUrl = comfyUrl();
  const workflow = comfyWorkflow(prompt, options);
  const timeoutMs = Number(process.env.COMFYUI_TIMEOUT_MS || 420_000);

  try {
    const queued = await fetch(`${baseUrl}/prompt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(workflow),
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!queued.ok) throw new Error(`ComfyUI queue returned ${queued.status}: ${await queued.text()}`);
    const queuedJson = (await queued.json()) as { prompt_id?: string };
    if (!queuedJson.prompt_id) throw new Error("ComfyUI did not return a prompt_id.");

    const polls = Math.ceil(timeoutMs / 2000);
    for (let index = 0; index < polls; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const historyResponse = await fetch(`${baseUrl}/history/${queuedJson.prompt_id}`, { signal: AbortSignal.timeout(10_000) });
      if (!historyResponse.ok) continue;
      const history = (await historyResponse.json()) as Record<string, any>;
      const entry = history[queuedJson.prompt_id];
      if (!entry) continue;

      for (const message of entry.status?.messages || []) {
        if (Array.isArray(message) && message[0] === "execution_error") {
          throw new Error(`ComfyUI execution error: ${message[1]?.exception_message || "unknown error"}`);
        }
      }

      for (const output of Object.values(entry.outputs || {}) as any[]) {
        const image = output?.images?.[0];
        if (!image?.filename) continue;
        const params = new URLSearchParams({
          filename: image.filename,
          subfolder: image.subfolder || "",
          type: image.type || "output"
        });
        const imageResponse = await fetch(`${baseUrl}/view?${params.toString()}`, { signal: AbortSignal.timeout(60_000) });
        if (imageResponse.ok) {
          return { buffer: Buffer.from(await imageResponse.arrayBuffer()), provider: "comfyui_flux" };
        }
      }
    }
    throw new Error("ComfyUI generation timed out.");
  } catch (error) {
    if (process.env.NODE_ENV === "production") throw error;
  }

  return null;
}

export async function generateImage(prompt: string, options: { width?: number; height?: number } = {}): Promise<GeneratedImage | null> {
  const provider = imageProviderMode();
  const width = options.width || Number(process.env.COMFYUI_WIDTH || 1024);
  const height = options.height || Number(process.env.COMFYUI_HEIGHT || 1024);
  if (provider === "openrouter") {
    const buffer = await generateOpenRouterProductImage(prompt);
    return buffer ? { buffer, provider: "openrouter" } : null;
  }
  if (provider === "openai") {
    const buffer = await generateOpenAIProductImage(prompt);
    return buffer ? { buffer, provider: "openai" } : null;
  }
  return generateComfyImage(prompt, { width, height });
}
