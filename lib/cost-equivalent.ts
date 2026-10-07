import type { ModelCatalogCost } from "./model-catalog";
import { readModelsConfig as readModelsConfigFile } from "./models-config-store";
import type { RunUsage } from "./agent-ops/run-usage";

export const SUBSCRIPTION_PROVIDERS: ReadonlySet<string> = new Set(["claude-bridge"]);
export type Billing = "api" | "subscription" | "unknown";
/** USD per million tokens, pi's convention. */
export interface ModelPrices { input: number; output: number; cacheRead: number; cacheWrite: number }
type TokenCounts = Pick<ModelPrices, "input" | "output" | "cacheRead" | "cacheWrite">;
interface CatalogPrice { providerId?: string; provider?: string; id: string; cost: ModelCatalogCost }
interface PriceDeps { readModelsConfig?: () => Record<string, unknown>; catalog?: () => CatalogPrice[] }

const UPSTREAM_PROVIDER: Record<string, string> = { "claude-bridge": "anthropic" };
const BRIDGE_PREFIX = "claude-bridge/";

export function billingOf(provider: string | undefined): Billing {
  if (!provider) return "unknown";
  return SUBSCRIPTION_PROVIDERS.has(provider) ? "subscription" : "api";
}

function completePrices(cost: unknown): ModelPrices | undefined {
  if (typeof cost !== "object" || cost === null) return undefined;
  const { input, output, cacheRead, cacheWrite } = cost as Record<string, unknown>;
  if (typeof input !== "number" || typeof output !== "number") return undefined;
  return { input, output, cacheRead: typeof cacheRead === "number" ? cacheRead : 0, cacheWrite: typeof cacheWrite === "number" ? cacheWrite : 0 };
}

// No models.dev copy is cached on disk (the Settings catalog route fetches live): prices come from models.json unless a catalog is injected.
const noCatalog = (): CatalogPrice[] => [];

export function modelPrices(provider: string, modelId: string, deps: PriceDeps = {}): ModelPrices | undefined {
  let config: Record<string, unknown>;
  try { config = (deps.readModelsConfig ?? readModelsConfigFile)(); } catch { config = {}; } // an unreadable models.json must not break a run record or the session read
  const providers = config.providers as Record<string, { models?: Array<{ id?: string; cost?: unknown }> }> | undefined;
  const configured = providers?.[provider]?.models?.find((model) => model.id === modelId);
  const fromConfig = completePrices(configured?.cost);
  if (fromConfig) return fromConfig;

  const upstream = UPSTREAM_PROVIDER[provider] ?? provider;
  const id = provider === "claude-bridge" && modelId.startsWith(BRIDGE_PREFIX) ? modelId.slice(BRIDGE_PREFIX.length) : modelId;
  const entry = (deps.catalog ?? noCatalog)().find((candidate) => (candidate.providerId ?? candidate.provider) === upstream && candidate.id === id);
  return completePrices(entry?.cost);
}

export function equivalentCost(usage: TokenCounts, prices: ModelPrices): number {
  const total = (usage.input * prices.input + usage.output * prices.output + usage.cacheRead * prices.cacheRead + usage.cacheWrite * prices.cacheWrite) / 1e6;
  return Math.round(total * 1e6) / 1e6;
}

/** `billing` and `costEquivalent` of a run record; one place so the runner and the thread tracker cannot drift. */
export function priceRecord(usage: RunUsage): { billing: Billing; costEquivalent?: number } {
  const billing = billingOf(usage.provider);
  if (billing !== "subscription" || !usage.provider || !usage.model) return { billing };
  const prices = modelPrices(usage.provider, usage.model);
  return prices ? { billing, costEquivalent: equivalentCost(usage, prices) } : { billing };
}

/** Per-message resolver for session stats: prices looked up once per provider/model pair. */
export function createEquivalentCostResolver(): (provider: string, model: string, usage: TokenCounts) => number {
  const cache = new Map<string, ModelPrices | undefined>();
  return (provider, model, usage) => {
    if (!SUBSCRIPTION_PROVIDERS.has(provider)) return 0;
    const key = `${provider}\0${model}`;
    if (!cache.has(key)) cache.set(key, modelPrices(provider, model));
    const prices = cache.get(key);
    return prices ? equivalentCost(usage, prices) : 0;
  };
}
