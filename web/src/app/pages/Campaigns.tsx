// /campaigns: every campaign, filtered and sorted. Filters live in the URL
// so a filtered view can be shared.
import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { Search, SearchX } from "lucide-react";
import { CampaignCard, CampaignCardSkeleton, brandName, budgetLeftPct } from "@/components/CampaignCard";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Campaign } from "@/lib/api-types";
import { CATEGORIES, CATEGORY_LABEL, PLATFORMS, PLATFORM_LABEL } from "@/lib/brief";
import { config } from "@/lib/network";
import { cn } from "@/lib/utils";
import { useCampaigns } from "../queries";
import { useTitle } from "../useTitle";

const SORTS = {
  newest: { label: "Newest", by: (a: Campaign, b: Campaign) => b.id - a.id },
  rate: { label: "Highest rate", by: (a: Campaign, b: Campaign) => Number(BigInt(b.ratePer1k) - BigInt(a.ratePer1k)) },
  ending: { label: "Ending soonest", by: (a: Campaign, b: Campaign) => a.deadline - b.deadline },
  budget: { label: "Most budget left", by: (a: Campaign, b: Campaign) => Number(BigInt(b.remaining) - BigInt(a.remaining)) },
} as const;
type Sort = keyof typeof SORTS;

const MIN_RATES = ["0.5", "1", "2"];
const ENDS = { day: { label: "Within 24 hours", secs: 86_400 }, week: { label: "Within 7 days", secs: 7 * 86_400 } } as const;

const DEFAULTS = { q: "", platform: "any", category: "any", min: "any", ends: "any", sort: "newest", show: "open" };
type Filters = typeof DEFAULTS;

const isOpen = (c: Campaign) => c.status === "live" || c.status === "ending";

function apply(campaigns: Campaign[], f: Filters): Campaign[] {
  const q = f.q.trim().toLowerCase();
  const now = Date.now() / 1000;
  const scale = 10 ** config.tokenDecimals;
  return campaigns
    .filter((c) => f.show === "all" || isOpen(c))
    .filter((c) => !q || c.title.toLowerCase().includes(q) || brandName(c).toLowerCase().includes(q))
    .filter((c) => f.platform === "any" || c.brief?.platform === f.platform || c.brief?.platform === "any")
    .filter((c) => f.category === "any" || c.brief?.category === f.category)
    .filter((c) => f.min === "any" || Number(c.ratePer1k) / scale >= Number(f.min))
    .filter((c) => f.ends === "any" || (c.deadline > now && c.deadline - now <= ENDS[f.ends as keyof typeof ENDS].secs))
    .sort(SORTS[f.sort as Sort]?.by ?? SORTS.newest.by);
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full bg-background">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => (
            <SelectItem key={v} value={v}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function Campaigns() {
  useTitle("Campaigns");
  const { data, error, isPending, refetch } = useCampaigns();
  const [params, setParams] = useSearchParams();
  const f: Filters = { ...DEFAULTS, ...Object.fromEntries(params) };
  const set = (k: keyof Filters, v: string) => {
    const next = new URLSearchParams(params);
    if (v === DEFAULTS[k]) next.delete(k);
    else next.set(k, v);
    setParams(next, { replace: true });
  };
  const filtered = useMemo(() => (data ? apply(data, f) : []), [data, params]); // eslint-disable-line react-hooks/exhaustive-deps
  const openCount = data?.filter(isOpen).length ?? 0;
  const filtering = [...params.keys()].some((k) => k in DEFAULTS && k !== "sort");
  const sym = config.tokenSymbol;

  return (
    <>
      <section className="border-b bg-muted/40">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Campaigns</h1>
          <p className="mt-2 text-muted-foreground">
            Pick a campaign, post a clip that follows the brief, and get paid for every verified view.
          </p>
          <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
            {data ? `${openCount} open to join · ${data.length} in total` : " "}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <form role="search" onSubmit={(e) => e.preventDefault()} className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="f-q" className="text-xs text-muted-foreground">
                Search
              </Label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="f-q"
                  type="search"
                  value={f.q}
                  onChange={(e) => set("q", e.target.value)}
                  placeholder="Campaign or brand"
                  className="bg-background pl-9"
                />
              </div>
            </div>
            <FilterSelect
              id="f-platform"
              label="Platform"
              value={f.platform}
              onChange={(v) => set("platform", v)}
              options={[["any", "All platforms"], ...PLATFORMS.filter((p) => p !== "any").map((p): [string, string] => [p, PLATFORM_LABEL[p]])]}
            />
            <FilterSelect
              id="f-category"
              label="Category"
              value={f.category}
              onChange={(v) => set("category", v)}
              options={[["any", "All categories"], ...CATEGORIES.map((c): [string, string] => [c, CATEGORY_LABEL[c]])]}
            />
            <FilterSelect
              id="f-min"
              label="Pays at least"
              value={f.min}
              onChange={(v) => set("min", v)}
              options={[["any", "Any rate"], ...MIN_RATES.map((r): [string, string] => [r, `${r} ${sym} / 1k views`])]}
            />
            <FilterSelect
              id="f-ends"
              label="Ends"
              value={f.ends}
              onChange={(v) => set("ends", v)}
              options={[["any", "Any time"], ...Object.entries(ENDS).map(([k, e]): [string, string] => [k, e.label])]}
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-4">
            <div role="group" aria-label="Show" className="inline-flex rounded-lg border bg-background p-0.5 text-sm">
              {(
                [
                  ["open", "Open to join"],
                  ["all", "All campaigns"],
                ] as const
              ).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={f.show === v}
                  onClick={() => set("show", v)}
                  className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors aria-pressed:bg-secondary aria-pressed:font-medium aria-pressed:text-foreground"
                >
                  {l}
                </button>
              ))}
            </div>
            {filtering && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                Clear filters
              </Button>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Label htmlFor="f-sort" className="text-sm text-muted-foreground">
                Sort by
              </Label>
              <Select value={f.sort} onValueChange={(v) => set("sort", v)}>
                <SelectTrigger id="f-sort" size="sm" className="w-44 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {Object.entries(SORTS).map(([k, s]) => (
                    <SelectItem key={k} value={k}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </form>

        <div className="mt-8">
          {error ? (
            <ErrorState message="Couldn't load campaigns." onRetry={() => void refetch()} />
          ) : isPending ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <CampaignCardSkeleton key={i} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<SearchX />}
              title={filtering || f.show === "open" ? "No campaigns match" : "No campaigns yet"}
              description={
                filtering
                  ? "Try fewer filters, or include campaigns that have ended."
                  : f.show === "open"
                    ? "Nothing is open right now. New campaigns show up here as soon as brands launch them."
                    : "Be the first brand to launch one."
              }
              action={
                filtering ? (
                  <Button variant="outline" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                    Clear filters
                  </Button>
                ) : f.show === "open" && data.length > 0 ? (
                  <Button variant="outline" onClick={() => set("show", "all")}>
                    Show all campaigns
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <h2 className="sr-only">Results</h2>
              <p className="mb-4 text-sm text-muted-foreground" aria-live="polite">
                {filtered.length} {filtered.length === 1 ? "campaign" : "campaigns"}
              </p>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filtered.map((c) => (
                  <CampaignCard key={c.id} c={c} className={budgetLeftPct(c) === 0 ? "opacity-80" : undefined} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
