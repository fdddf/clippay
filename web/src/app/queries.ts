// React Query hooks over the API. Chain data refreshes every 15 s while visible.
import { QueryClient, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 10_000, refetchInterval: 15_000, refetchOnWindowFocus: true, retry: 1 },
  },
});

export const keys = {
  stats: ["stats"] as const,
  campaigns: ["campaigns"] as const,
  campaign: (id: number) => ["campaign", id] as const,
  account: (address: string) => ["account", address] as const,
};

export const useStats = () => useQuery({ queryKey: keys.stats, queryFn: api.stats });
export const useCampaigns = () => useQuery({ queryKey: keys.campaigns, queryFn: api.campaigns });
export const useCampaign = (id: number) => useQuery({ queryKey: keys.campaign(id), queryFn: () => api.campaign(id) });
/**
 * Start the data request for the page being opened, so it runs alongside the
 * download of the page's code instead of after it (the pages are lazy).
 */
export function prefetchFor(path: string) {
  const c = path.match(/^\/c\/(\d+)\/?$/);
  if (c) void queryClient.prefetchQuery({ queryKey: keys.campaign(Number(c[1])), queryFn: () => api.campaign(Number(c[1])) });
  else if (/^\/campaigns\/?$/.test(path)) void queryClient.prefetchQuery({ queryKey: keys.campaigns, queryFn: api.campaigns });
}

export const useAccount = (address: string | null | undefined) =>
  useQuery({ queryKey: keys.account(address ?? ""), queryFn: () => api.account(address!), enabled: !!address });

/** A wallet's balance of the payout token, read over RPC (loads the Stellar SDK on first use). */
export const useBalance = (address: string | null | undefined) =>
  useQuery({
    queryKey: ["balance", address ?? ""],
    queryFn: async () => (await import("@/lib/stellar")).tokenBalance(address!),
    enabled: !!address,
  });
