// Human-readable errors. Contract and wallet errors are translated by
// @clippay/pool-client, which is only loaded once a transaction is involved.
import { ApiError } from "@/lib/api";

export async function errorMessage(e: unknown): Promise<string> {
  if (e instanceof ApiError) return e.message;
  try {
    const { describeError } = await import("@clippay/pool-client");
    return describeError(e);
  } catch {
    return e instanceof Error ? e.message : String(e);
  }
}
