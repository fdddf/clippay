import { useEffect, useState, type FormEvent } from "react";
import { afterFee, describeError, feePercent, fromUnits, toUnits, unwrap } from "@clippay/pool-client";
import { config, pool, tokenBalance } from "../stellar.ts";
import { sendAs } from "../wallet.ts";
import type { PageProps } from "../App.tsx";

export function CreateCampaign({ wallet, connect, notify, go }: PageProps) {
  const [form, setForm] = useState({
    title: "",
    brief_url: "",
    budget: "100",
    rate: "0.5",
    cap: "20",
    hours: "24",
  });
  const [busy, setBusy] = useState(false);
  const [terms, setTerms] = useState<{ feeBps: number; decimals: number } | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);

  useEffect(() => {
    pool()
      .then(async (c) => {
        const [fee, decimals] = await Promise.all([c.fee_bps(), c.token_decimals({ token: config.tokenId })]);
        setTerms({ feeBps: fee.result, decimals: decimals.result ?? 7 });
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    setBalance(null);
    if (wallet) tokenBalance(wallet.address).then(setBalance).catch(() => {});
  }, [wallet?.address]);

  const decimals = terms?.decimals ?? 7;
  const budgetUnits = (() => {
    try {
      return toUnits(form.budget || "0", decimals);
    } catch {
      return 0n;
    }
  })();
  const short = balance !== null && budgetUnits > balance;
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const maxViews =
    Number(form.rate) > 0 ? Math.floor((Number(form.budget) / Number(form.rate)) * 1000) : 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const w = wallet ?? (await connect());
    if (!w) return;
    // Check funds before asking for a signature that would only fail on-chain.
    const have = await tokenBalance(w.address).catch(() => null);
    if (have !== null && budgetUnits > have) {
      notify({
        kind: "error",
        text: `This wallet holds ${fromUnits(have, 2, decimals)} ${config.tokenSymbol} — lower the budget or top up first`,
      });
      return;
    }
    setBusy(true);
    try {
      const deadline = BigInt(Math.floor(Date.now() / 1000 + Number(form.hours) * 3600));
      const { hash, result } = await sendAs(w, (client) => client.create_campaign({
        brand: w.address,
        token: config.tokenId,
        title: form.title.trim(),
        brief_url: form.brief_url.trim(),
        budget: toUnits(form.budget, decimals),
        rate_per_1k: toUnits(form.rate, decimals),
        cap_per_creator: toUnits(form.cap, decimals),
        deadline,
      }));
      // Passkey submissions don't return the result; the new campaign is the latest one.
      const id = result
        ? unwrap(result)
        : (await (await pool()).campaign_count()).result - 1;
      notify({ kind: "ok", text: `Campaign #${id} is live`, hash });
      go(`/c/${id}`);
    } catch (err) {
      notify({ kind: "error", text: describeError(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="narrow">
      <h1>Launch a campaign</h1>
      <p className="muted">
        Your budget is locked in the CampaignPool contract and only leaves it as payouts for
        verified views. Whatever isn't earned comes back to you when the campaign ends.
      </p>
      <form className="card form" onSubmit={onSubmit}>
        <label>
          Campaign title
          <input required maxLength={80} value={form.title} onChange={set("title")}
            placeholder="Clip our launch keynote" />
        </label>
        <label>
          Creative brief URL
          <input required type="url" value={form.brief_url} onChange={set("brief_url")}
            placeholder="https://notion.so/your-brief" />
        </label>
        <div className="row">
          <label>
            Total budget ({config.tokenSymbol})
            <input required type="number" min="0.0000001" step="any" value={form.budget}
              onChange={set("budget")} />
          </label>
          <label>
            Pay per 1k views
            <input required type="number" min="0.0000001" step="any" value={form.rate}
              onChange={set("rate")} />
          </label>
        </div>
        <div className="row">
          <label>
            Max per creator
            <input required type="number" min="0.0000001" step="any" value={form.cap}
              onChange={set("cap")} />
          </label>
          <label>
            Open for (hours)
            <input required type="number" min="0.1" step="any" value={form.hours}
              onChange={set("hours")} />
          </label>
        </div>
        <p className="hint">
          This budget buys up to <b>{maxViews.toLocaleString("en-US")}</b> verified views.
          {terms && terms.feeBps > 0 && (
            <>
              {" "}Creators receive{" "}
              <b>
                {fromUnits(afterFee({ fee_bps: terms.feeBps }, toUnits(form.rate || "0", decimals)), 2, decimals)}{" "}
                {config.tokenSymbol}
              </b>{" "}
              per 1k views; ClipPay's {feePercent(terms.feeBps)} fee is taken only from payouts, so
              you never pay for views that aren't delivered.
            </>
          )}
        </p>
        {short && (
          <p className="error small" role="alert">
            Your wallet holds {fromUnits(balance!, 2, decimals)} {config.tokenSymbol} — not enough for
            this budget.
          </p>
        )}
        <button className="btn" disabled={busy || short}>
          {busy ? (wallet?.kind === "passkey" ? "Confirm with your passkey…" : "Confirm in Freighter…") : wallet ? "Lock budget & launch" : "Sign in & launch"}
        </button>
      </form>
    </div>
  );
}
