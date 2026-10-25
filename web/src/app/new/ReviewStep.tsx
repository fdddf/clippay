// Step 3: everything that's about to be locked, in plain words.
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Amount } from "@/components/Amount";
import { Identicon } from "@/components/Identicon";
import { mediaUrl } from "@/lib/api";
import { CATEGORY_LABEL, PLATFORM_LABEL } from "@/lib/brief";
import { config } from "@/lib/network";
import type { Wallet } from "../wallet";
import type { Amounts, Draft } from "./draft";

/** Freighter pays its own network fee: simulate the call to show roughly how much. */
function useFeeEstimate(wallet: Wallet | null, d: Draft, a: Amounts) {
  return useQuery({
    queryKey: ["create-fee", wallet?.address, a.budget.toString(), a.rate.toString(), a.cap.toString(), d.title],
    enabled: wallet?.kind === "freighter",
    staleTime: 60_000,
    refetchInterval: false,
    retry: false,
    queryFn: async () => {
      const { pool } = await import("@/lib/stellar");
      const client = await pool({ address: wallet!.address, signTransaction: async () => ({ signedTxXdr: "" }) });
      const tx = await client.create_campaign({
        brand: wallet!.address,
        token: config.tokenId,
        title: d.title.trim(),
        brief_url: `${config.siteUrl}/b/${"0".repeat(64)}`,
        budget: a.budget,
        rate_per_1k: a.rate,
        cap_per_creator: a.cap,
        deadline: BigInt(a.deadline),
      });
      return BigInt(tx.built?.fee ?? "0");
    },
  });
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

export function ReviewStep({ d, a, wallet }: { d: Draft; a: Amounts; wallet: Wallet | null }) {
  const fee = useFeeEstimate(wallet, d, a);
  const keep = (u: bigint) => u - (u * BigInt(config.feeBps)) / 10_000n;
  const ends = new Date(a.deadline * 1000);
  const refunds = new Date((a.deadline + config.settleGrace) * 1000);
  return (
    <div className="space-y-8">
      <section aria-labelledby="review-campaign">
        <h2 id="review-campaign" className="text-lg font-semibold">
          Campaign
        </h2>
        <dl className="mt-2 divide-y">
          <Row label="Title">{d.title.trim()}</Row>
          <Row label="Brand">
            <span className="inline-flex items-center gap-2">
              <Identicon seed={wallet?.address ?? d.brandName} name={d.brandName} src={mediaUrl(d.logo)} square size="sm" />
              {d.brandName.trim()}
            </span>
          </Row>
          <Row label="Where">
            {PLATFORM_LABEL[d.platform]} · {CATEGORY_LABEL[d.category]}
          </Row>
          <Row label="Summary">{d.summary.trim()}</Row>
        </dl>
      </section>

      <section aria-labelledby="review-money">
        <h2 id="review-money" className="text-lg font-semibold">
          Money
        </h2>
        <dl className="mt-2 divide-y">
          <Row label="Locked now">
            <Amount units={a.budget} className="font-semibold" />
          </Row>
          <Row label="Pay per 1,000 views">
            <Amount units={a.rate} /> · creators receive <Amount units={keep(a.rate)} />
          </Row>
          <Row label="Max per creator">
            <Amount units={a.cap} />
          </Row>
          <Row label="ClipPay fee">{config.feeBps / 100}% of each payout — nothing on the budget you get back</Row>
          <Row label="Network fee">
            {wallet?.kind === "passkey" ? (
              "Covered by ClipPay"
            ) : wallet?.kind === "freighter" ? (
              fee.isPending ? (
                "Estimating…"
              ) : fee.data !== undefined ? (
                <>
                  About <Amount units={fee.data} maxFrac={2} />, paid by your wallet
                </>
              ) : (
                "Shown in Freighter before you sign"
              )
            ) : (
              "Covered by ClipPay for passkey wallets; Freighter shows it before you sign"
            )}
          </Row>
        </dl>
      </section>

      <section aria-labelledby="review-time">
        <h2 id="review-time" className="text-lg font-semibold">
          Timing
        </h2>
        <dl className="mt-2 divide-y">
          <Row label="Submissions close">{format(ends, "EEE, MMM d 'at' h:mm a")}</Row>
          <Row label="Refund opens">
            {format(refunds, "EEE, MMM d 'at' h:mm a")}, after the last views are paid
          </Row>
        </dl>
      </section>

      <section aria-labelledby="review-terms" className="rounded-xl border bg-muted/40 p-5">
        <h2 id="review-terms" className="font-semibold">
          What you're agreeing to
        </h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>The budget moves into the ClipPay contract and can only go to creators or back to you.</li>
          <li>The brief, rate, cap and end date can't be changed after launch. You can add budget.</li>
          <li>Payouts for verified views are final. The unspent budget is yours to refund once the campaign settles.</li>
          <li>
            This is Stellar's test network: {config.tokenSymbol} here has no real value.{" "}
            <a href="/terms" className="font-medium text-primary hover:underline">
              Terms
            </a>
          </li>
        </ul>
      </section>
    </div>
  );
}
