// Client for the Worker's /api (verifier/src/api.ts). No Stellar SDK here, so
// the landing page can use it too.
import type { Account, Campaign, CampaignDetail, ChainEvent, Profile, Stats } from "./api-types.ts";
import type { Brief } from "./brief.ts";
import { config } from "./network.ts";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${config.verifierUrl}${path}`, init);
  } catch {
    throw new ApiError("Can't reach ClipPay — check your connection", 0);
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new ApiError(body?.error ?? `Request failed (${res.status})`, res.status);
  return body as T;
}

const authed = (token: string, body?: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

/** Absolute URL for an /api/media path or hash. */
export function mediaUrl(pathOrHash: string | null | undefined): string | null {
  if (!pathOrHash) return null;
  const path = pathOrHash.startsWith("/") ? pathOrHash.replace(/^\/api/, "") : `/media/${pathOrHash}`;
  return `${config.verifierUrl}${path}`;
}

export const api = {
  stats: () => call<Stats>("/stats"),
  campaigns: () => call<Campaign[]>("/campaigns"),
  campaign: (id: number, fresh = false) => call<CampaignDetail>(`/campaigns/${id}${fresh ? "?fresh" : ""}`),
  account: (address: string) => call<Account>(`/accounts/${address}`),
  events: (q: { campaign?: number; address?: string; limit?: number }) =>
    call<ChainEvent[]>(`/events?${new URLSearchParams(Object.entries(q).map(([k, v]) => [k, String(v)]))}`),

  uploadImage: (file: Blob) =>
    call<{ hash: string; url: string }>("/media", { method: "POST", headers: { "Content-Type": file.type }, body: file }),
  createBrief: (brief: Brief) =>
    call<{ hash: string; brief: Brief }>("/briefs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(brief),
    }),

  challenge: (address: string) =>
    call<{ id: string; entry: string; expirationLedger: number }>(`/auth/challenge?address=${address}`),
  verify: (id: string, entry: string) =>
    call<{ token: string; address: string; expires: number }>("/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, entry }),
    }),
  me: (token: string) => call<{ address: string; profile: Profile | null }>("/me", authed(token)),
  updateProfile: (token: string, p: { name: string | null; avatar: string | null; bio: string | null }) =>
    call<Profile>("/profile", { method: "PUT", ...authed(token, p) }),
  attachBrief: (token: string, campaign: number, hash: string) =>
    call<{ campaign: number; brief: string }>(`/campaigns/${campaign}/brief`, { method: "PUT", ...authed(token, { hash }) }),

  /** Ask the verifier to check views now (rate-limited per IP). */
  checkViews: (campaign: number) =>
    call<{ id: number; results: { creator: string; paid?: string; skipped?: string; error?: string }[] }>(
      `/settle/${campaign}`,
      { method: "POST" },
    ),
};
