// /b/:hash — a brief, addressed by the SHA-256 of its content. Campaigns
// link here from the chain, so the link itself proves which version applies.
import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CircleCheck, Fingerprint } from "lucide-react";
import { brandName } from "@/components/CampaignCard";
import { ErrorState } from "@/components/EmptyState";
import { Identicon } from "@/components/Identicon";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Prose } from "@/landing/Content";
import { ApiError, api, mediaUrl } from "@/lib/api";
import { CATEGORY_LABEL, PLATFORM_LABEL } from "@/lib/brief";
import { Markdown } from "@/lib/markdown";
import { AppLink } from "../AppLink";
import { useCampaigns } from "../queries";
import { useTitle } from "../useTitle";
import { NotFound } from "./NotFound";

export default function BriefPage() {
  const { hash = "" } = useParams();
  const valid = /^[0-9a-f]{64}$/.test(hash);
  const q = useQuery({ queryKey: ["brief", hash], queryFn: () => api.brief(hash), enabled: valid, staleTime: Infinity, refetchInterval: false });
  const campaigns = useCampaigns();
  useTitle(q.data ? `Brief: ${q.data.summary.slice(0, 50)}` : "Brief");
  if (!valid || (q.error instanceof ApiError && q.error.status === 404)) return <NotFound what="brief" />;
  if (q.error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <ErrorState message="Couldn't load this brief." onRetry={() => void q.refetch()} />
      </div>
    );
  }
  const b = q.data;
  const using = campaigns.data?.filter((c) => c.briefHash === hash) ?? [];
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      {!b ? (
        <div className="space-y-4" aria-busy="true" aria-label="Loading brief">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <Identicon seed={b.brand.name} name={b.brand.name} src={mediaUrl(b.brand.logo)} square size="lg" />
            <div>
              <p className="font-medium">{b.brand.name}</p>
              <p className="text-sm text-muted-foreground">
                {PLATFORM_LABEL[b.platform]} · {CATEGORY_LABEL[b.category]}
              </p>
            </div>
          </div>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-balance">{b.summary}</h1>
          <Prose className="mt-8">
            <Markdown source={b.body} className="space-y-4" />
          </Prose>
          {b.rules.length > 0 && (
            <section aria-labelledby="rules" className="mt-8">
              <h2 id="rules" className="font-semibold">
                Every post must
              </h2>
              <ul className="mt-3 space-y-2">
                {b.rules.map((r) => (
                  <li key={r} className="flex gap-2.5">
                    <CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden="true" />
                    {r}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {using.length > 0 && (
            <section aria-labelledby="campaigns" className="mt-10 rounded-xl border bg-card p-5 shadow-sm">
              <h2 id="campaigns" className="font-semibold">
                {using.length === 1 ? "The campaign for this brief" : "Campaigns using this brief"}
              </h2>
              <ul className="mt-3 space-y-2">
                {using.map((c) => (
                  <li key={c.id}>
                    <AppLink href={`/c/${c.id}`} className={buttonVariants({ variant: "outline", className: "w-full justify-between" })}>
                      <span className="truncate">
                        {c.title} · {brandName(c)}
                      </span>
                      <ArrowRight aria-hidden="true" />
                    </AppLink>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="mt-10 flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
            <Fingerprint className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              This page's address is the SHA-256 of the brief's content (<code className="break-all">{hash}</code>), so it
              can't be edited without the link changing.
            </span>
          </p>
        </>
      )}
    </div>
  );
}
