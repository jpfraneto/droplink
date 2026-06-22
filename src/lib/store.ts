import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { Drop, GenerationJob, Order, Product, StoreData } from "./types";

const dataFile = path.join(process.cwd(), "data", "store.json");

const emptyStore: StoreData = {
  drops: [],
  products: [],
  jobs: [],
  orders: []
};

let writeQueue = Promise.resolve();

async function readStore(): Promise<StoreData> {
  try {
    const raw = await readFile(dataFile, "utf8");
    const parsed = JSON.parse(raw) as StoreData;
    return {
      drops: parsed.drops || [],
      products: parsed.products || [],
      jobs: parsed.jobs || [],
      orders: parsed.orders || []
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return emptyStore;
    throw error;
  }
}

async function writeStore(data: StoreData): Promise<void> {
  await mkdir(path.dirname(dataFile), { recursive: true });
  await writeFile(dataFile, JSON.stringify(data, null, 2), "utf8");
}

async function mutateStore<T>(mutator: (data: StoreData) => T | Promise<T>): Promise<T> {
  const run = async () => {
    const data = await readStore();
    const result = await mutator(data);
    await writeStore(data);
    return result;
  };

  const next = writeQueue.then(run, run);
  writeQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

export async function listDrops(): Promise<Drop[]> {
  const data = await readStore();
  return data.drops.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getDropBySlug(slug: string): Promise<Drop | null> {
  const data = await readStore();
  return data.drops.find((drop) => drop.slug === slug) || null;
}

export async function getDropById(id: string): Promise<Drop | null> {
  const data = await readStore();
  return data.drops.find((drop) => drop.id === id) || null;
}

export async function getProductsForDrop(dropId: string): Promise<Product[]> {
  const data = await readStore();
  return data.products
    .filter((product) => product.dropId === dropId)
    .sort((a, b) => a.position - b.position);
}

export async function getProductBySlug(dropId: string, slug: string): Promise<Product | null> {
  const products = await getProductsForDrop(dropId);
  return products.find((product) => product.slug === slug) || null;
}

export async function getProductById(id: string): Promise<Product | null> {
  const data = await readStore();
  return data.products.find((product) => product.id === id) || null;
}

export async function createJob(job: GenerationJob): Promise<GenerationJob> {
  return mutateStore((data) => {
    data.jobs.push(job);
    return job;
  });
}

export async function updateJob(id: string, patch: Partial<GenerationJob>): Promise<GenerationJob | null> {
  return mutateStore((data) => {
    const job = data.jobs.find((entry) => entry.id === id);
    if (!job) return null;
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
    return job;
  });
}

export async function getJob(id: string): Promise<GenerationJob | null> {
  const data = await readStore();
  return data.jobs.find((job) => job.id === id) || null;
}

export async function existingDropSlugs(): Promise<Set<string>> {
  const data = await readStore();
  return new Set(data.drops.map((drop) => drop.slug));
}

export async function saveDropWithProducts(drop: Drop, products: Product[]): Promise<Drop> {
  return mutateStore((data) => {
    data.drops.push(drop);
    data.products.push(...products);
    return drop;
  });
}

export async function saveOrder(order: Order): Promise<Order> {
  return mutateStore((data) => {
    const existing = data.orders.find((entry) => entry.stripeCheckoutSessionId === order.stripeCheckoutSessionId);
    if (existing) {
      Object.assign(existing, order, { updatedAt: new Date().toISOString() });
      return existing;
    }
    data.orders.push(order);
    return order;
  });
}

export async function updateOrderBySession(sessionId: string, patch: Partial<Order>): Promise<Order | null> {
  return mutateStore((data) => {
    const order = data.orders.find((entry) => entry.stripeCheckoutSessionId === sessionId);
    if (!order) return null;
    Object.assign(order, patch, { updatedAt: new Date().toISOString() });
    return order;
  });
}
