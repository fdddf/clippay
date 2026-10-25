// The right-hand card for creators who haven't joined: what they'll earn,
// three steps, and the link form. Signs in first if needed.
import { useState, type FormEvent } from "react";
import { Check, Copy, ExternalLink, Lock } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Amount } from "@/components/Amount";
import { TxProgress, useTxProgress } from "@/components/TxProgress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import type { CampaignDetail } from "@/lib/api-types";
import { PLATFORM_LABEL, ownershipTag } from "@/lib/brief";
import { config, explorer } from "@/lib/network";
import { cn } from "@/lib/utils";
import { errorMessage } from "../errors";
import { keys } from "../queries";
import { loadWallet, useWallet } from "../wallet";
import { net } from "./shared";

const PLATFORM_HOSTS: Record<string, RegExp> = {
  youtube: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/,
  tiktok: /(^|\.)tiktok\.com$/,
  instagram: /(^|\.)instagram\.com$/,
};

function Step({ n, done, children }: { n: number; done?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-full border text-xs font-semibold tabular",
          done && "border-transparent bg-ok text-white dark:text-background",
        )}
        aria-hidden="true"
      >
        {done ? <Check className="size-3.5" /> : n}
      </span>
      <div className="min-w-0 flex-1 pt-0.5 text-sm">{children}</div>
    </li>
  );
}

export function JoinCard({ c }: { c: CampaignDetail }) {
  const { wallet, connect } = useWallet();
  const queryClient = useQueryClient();
  const tx = useTxProgress();
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const keep = `${100 - c.feeBps / 100}%`;
  const tag = wallet ? ownershipTag(wallet.address) : "clippay:XXXXXX";
  const platform = c.brief?.platform;
  let host = "";
  try {
    host = new URL(url).host;
  } catch {}
  const wrongPlatform = !!(platform && platform !== "any" && host && !PLATFORM_HOSTS[platform]?.test(host));
  const busy = !!tx.state && !tx.state.done && !tx.state.error;

  const copyTag = async () => {
    await navigator.clipboard.writeText(`${tag} #ad`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const w = wallet ?? (await connect());
    if (!w) return;
    const ok = await tx.run(async (step) => {
      const m = await loadWallet();
      step("sign");
      try {
        const { hash, result } = await m.sendAs(w, (client) => client.submit({ id: c.id, creator: w.address, url: url.trim() }));
        if (result) (await import("@clippay/pool-client")).unwrap(result);
        return { hash, value: true };
      } catch (err) {
        throw new Error(await errorMessage(err));
      }
    });
    if (!ok) return;
    toast.success("You're in", {
      description: w.kind === "passkey" ? "No fees paid. Views are checked automatically." : "Views are checked automatically.",
    });
    setUrl("");
    // The API caches chain reads briefly; ask for a fresh read so the post shows up.
    queryClient.setQueryData(keys.campaign(c.id), await api.campaign(c.id, true).catch(() => undefined));
    void queryClient.invalidateQueries({ queryKey: keys.campaign(c.id) });
  }

  return (
    <section aria-labelledby="join-title" id="join" className="scroll-mt-24 rounded-2xl border bg-card p-5 shadow-sm">
      <h2 id="join-title" className="font-semibold">
        Join this campaign
      </h2>
      <div className="mt-4 rounded-xl bg-money-soft/60 p-4">
        <p className="text-sm text-muted-foreground">Earn up to</p>
        <p className="mt-0.5 text-3xl font-semibold tracking-tight text-money">
          <Amount units={net(c, BigInt(c.capPerCreator))} decimals={c.decimals} className="text-money" />
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          <Amount units={BigInt(c.ratePer1k)} decimals={c.decimals} className="font-medium text-foreground" /> per 1,000
          views · you keep {keep}
        </p>
      </div>

      <form onSubmit={onSubmit} className="mt-5">
        <ol className="space-y-4">
          <Step n={1} done={!!wallet}>
            {wallet ? (
              <p>You're signed in.</p>
            ) : (
              <p>
                <span className="font-medium">Sign in</span> with Face ID or a fingerprint — it takes a few seconds and
                costs nothing.
              </p>
            )}
          </Step>
          <Step n={2}>
            <p>
              <span className="font-medium">Post your clip</span>
              {platform && platform !== "any" ? ` on ${PLATFORM_LABEL[platform]}` : ""} with this in the description:
            </p>
            <div className="mt-2 flex items-center gap-2 rounded-lg border bg-background py-1.5 pr-1.5 pl-3">
              <code className="min-w-0 flex-1 truncate font-mono text-sm">{tag} #ad</code>
              <Button type="button" variant="ghost" size="icon-sm" onClick={copyTag} aria-label="Copy tag">
                {copied ? <Check /> : <Copy />}
              </Button>
            </div>
            {!wallet && <p className="mt-1 text-xs text-muted-foreground">Your personal tag appears once you sign in.</p>}
          </Step>
          <Step n={3}>
            <Label htmlFor="post-url" className="font-medium">
              Paste the link to your post
            </Label>
            <Input
              id="post-url"
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={platform === "tiktok" ? "https://www.tiktok.com/@you/video/…" : "https://youtube.com/shorts/…"}
              className="mt-2"
              disabled={busy}
              aria-describedby={wrongPlatform ? "post-url-hint" : undefined}
            />
            {wrongPlatform && (
              <p id="post-url-hint" className="mt-1 text-xs text-warn">
                This campaign is for {PLATFORM_LABEL[platform!]} — check the link.
              </p>
            )}
          </Step>
        </ol>
        <Button type="submit" size="lg" className="mt-5 w-full" disabled={busy}>
          {!wallet ? "Sign in & join" : wallet.kind === "passkey" ? "Submit post — no fees" : "Submit post"}
        </Button>
      </form>

      {tx.state && (
        <TxProgress
          state={tx.state}
          signLabel={wallet?.kind === "passkey" ? "Confirm with your passkey" : "Confirm in Freighter"}
          className="mt-4 rounded-xl border p-4"
        />
      )}

      <a
        href={explorer.account(config.contractId)}
        target="_blank"
        rel="noreferrer"
        className="mt-5 flex items-center gap-2 border-t pt-4 text-xs text-muted-foreground hover:text-foreground"
      >
        <Lock className="size-3.5" aria-hidden="true" />
        Budget locked in the ClipPay contract
        <ExternalLink className="ml-auto size-3" aria-hidden="true" />
      </a>
    </section>
  );
}
