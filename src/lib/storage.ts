import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { logger } from "./logger";

export type StoredObject = {
  key: string;
  url: string;
  storageProvider: "r2" | "dev_local";
  contentType: string;
  byteSize: number;
};

let r2Client: S3Client | null = null;

export function storageProvider() {
  return process.env.STORAGE_PROVIDER || "local";
}

export function r2Configured() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET
  );
}

export function assertStorageReady() {
  if (process.env.NODE_ENV === "production") {
    if (storageProvider() !== "r2") throw new Error("STORAGE_PROVIDER=r2 is required in production.");
    if (!r2Configured()) throw new Error("R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET are required.");
  }
}

function r2Endpoint() {
  if (process.env.R2_ENDPOINT) return process.env.R2_ENDPOINT.replace(/\/$/, "");
  return `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

function publicBaseUrl() {
  return (process.env.R2_PUBLIC_BASE_URL || process.env.STORAGE_PUBLIC_BASE_URL || "").replace(/\/$/, "");
}

function getR2Client() {
  if (!r2Client) {
    r2Client = new S3Client({
      region: "auto",
      endpoint: r2Endpoint(),
      credentials: {
        accessKeyId: String(process.env.R2_ACCESS_KEY_ID),
        secretAccessKey: String(process.env.R2_SECRET_ACCESS_KEY)
      }
    });
  }
  return r2Client;
}

export async function putStoredObject(input: {
  key: string;
  body: Buffer;
  contentType: string;
  cacheControl?: string;
}): Promise<StoredObject> {
  assertStorageReady();
  if (storageProvider() === "r2") {
    if (!publicBaseUrl()) throw new Error("R2_PUBLIC_BASE_URL or STORAGE_PUBLIC_BASE_URL is required for public asset URLs.");
    await getR2Client().send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        CacheControl: input.cacheControl || "public, max-age=31536000, immutable"
      })
    );
    const stored = {
      key: input.key,
      url: `${publicBaseUrl()}/${input.key}`,
      storageProvider: "r2" as const,
      contentType: input.contentType,
      byteSize: input.body.byteLength
    };
    logger.info("storage.object.put", {
      storageProvider: stored.storageProvider,
      key: stored.key,
      contentType: stored.contentType,
      byteSize: stored.byteSize
    });
    return stored;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Only R2 storage is allowed in production.");
  }
  return {
    key: input.key,
    url: `data:${input.contentType};base64,${input.body.toString("base64")}`,
    storageProvider: "dev_local",
    contentType: input.contentType,
    byteSize: input.body.byteLength
  };
}
