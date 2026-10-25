import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  afterFee,
  allSubmissions,
  describeError,
  feePercent,
  fromUnits,
  unwrap,
  type Campaign,
  type Submission,
} from "@clippay/pool-client";
import { config, explorer, pool, short, tokenBalance } from "../stellar.ts";
import { sendAs } from "../wallet.ts";
import type { PageProps } from "../App.tsx";
import { costPer1k, nowSecs, status, timeLeft } from "../format.ts";

interface Data {
  campaign: Campaign;
  submissions: Submission[];
  grace: bigint;
}

/** The verifier's view of a post (GET /status/:id); see verifier/src/core.ts. */
interface PostStatus {
  fixable: string[];
  review: string[];
  decision?: "approved" | "rejected";
}

function holdOf(p?: PostStatus): string[] {
  if (!p) return [];
  if (p.decision === "rejected") return ["Rejected in review"];
  const review = p.decision === "approved" ? [] : p.review.map((r) => `Under review: ${r}`);
  return [...p.fixable, ...review];
}

export function CampaignDetail({ id, wallet, connect, notify }: PageProps & { id: number }) {
  const address = wallet?.address ?? null;
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [copied, setCopied] = useState(false);
  const [posts, setPosts] = useState<Record<string, PostStatus>>({});

  const load = useCallback(async () => {
    try {
      const client = await pool();
      const [c, g] = await Promise.all([client.get_campaign({ id }), client.settle_grace()]);
      const campaign = unwrap(c.result);
      const submissions = await allSubmissions(client, campaign);
      setData({ campaign, submissions, grace: g.result });
      fetch(`${config.verifierUrl}/status/${id}`)
        .then((r) => r.json())
        .then((b: { posts?: Record<string, PostStatus> }) => setPosts(b.posts ?? {}))
        .catch(() => {});
      if (address) setBalance(await tokenBalance(address).catch(() => null));
    } catch (e) {
      setError(describeError(e));
    }
  }, [id, address]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading campaign…</p>;

  const { campaign: c, submissions, grace } = data;
  const s = status(c);
  const sym = config.tokenSymbol;
  const amt = (units: bigint) => fromUnits(units, 2, c.decimals);
  const spent = c.budget - c.remaining;
  const keep = feePercent(10_000 - c.fee_bps);
  const pct = c.budget > 0n ? Number((spent * 100n) / c.budget) : 0;
  const totalViews = submissions.reduce((n, x) => n + x.views, 0n);
  const isBrand = address === c.brand;
  const open = !c.refunded && nowSecs() <= c.deadline;
  const refundAt = c.deadline + grace;
  const canRefund = isBrand && !c.refunded && nowSecs() > refundAt;
  const mine = address ? submissions.find((x) => x.creator === address) : undefined;
  const myHold = mine ? holdOf(posts[mine.creator]) : [];

  const copyLink = async () => {
    const link = `${location.origin}/c/${id}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify({ kind: "error", text: link });
    }
  };

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      notify({ kind: "error", text: describeError(e) });
    } finally {
      setBusy(null);
      load();
      // RPC reads can trail the ledger that just included our transaction.
      setTimeout(load, 4000);
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    run("submit", async () => {
      const w = wallet ?? (await connect());
      if (!w) return;
      const { hash, result } = await sendAs(w, (client) =>
        client.submit({ id, creator: w.address, url: url.trim() }),
      );
      if (result) unwrap(result);
      setUrl("");
      notify({
        kind: "ok",
        text: w.kind === "passkey" ? "You're in — no fees paid. Views are checked automatically." : "You're in! Views are checked automatically.",
        hash,
      });
    });
  };

  const onVerify = () =>
    run("verify", async () => {
      const res = await fetch(`${config.verifierUrl}/settle/${id}`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Verifier error ${res.status}`);
      const results = body.results as { paid?: string; skipped?: string; error?: string }[];
      const paid = results.reduce((n, r) => n + BigInt(r.paid ?? "0"), 0n);
      const failed = results.filter((r) => r.error).length;
      const held = results.filter((r) => r.skipped?.match(/hold|review|rejected/)).length;
      notify({
        kind: failed ? "error" : "ok",
        text:
          `Paid ${amt(paid)} ${sym} to creators` +
          (held ? ` · ${held} post(s) on hold` : "") +
          (failed ? ` · ${failed} post(s) couldn't be checked` : ""),
      });
    });

  const onRefund = () =>
    run("refund", async () => {
      const before = c.remaining;
      const { hash } = await sendAs(wallet!, (client) => client.refund({ id }));
      notify({ kind: "ok", text: `Refunded ${amt(before)} ${sym}`, hash });
    });

  return (
    <>
      <a className="back" href="/">
        ← All campaigns
      </a>
      <div className="detail-head">
        <div>
          <span className={`pill ${s.tone}`}>{s.label}</span>
          <h1>{c.title}</h1>
          <p className="muted">
            by{" "}
            <a href={explorer.account(c.brand)} target="_blank" rel="noreferrer">
              {isBrand ? "you" : short(c.brand)}
            </a>{" "}
            ·{" "}
            <a href={c.brief_url} target="_blank" rel="noreferrer">
              Read the brief ↗
            </a>
          </p>
        </div>
        <div className="detail-actions">
          <button className="btn ghost" onClick={onVerify} disabled={!!busy || c.refunded}>
            {busy === "verify" ? "Checking views…" : "Verify views now"}
          </button>
          {isBrand && !c.refunded && (
            <button className="btn ghost" onClick={onRefund} disabled={!canRefund || !!busy}>
              {busy === "refund" ? "Refunding…" : "Refund remaining"}
            </button>
          )}
          {isBrand && !c.refunded && !canRefund && (
            <p className="muted small action-note">
              Refund opens after submissions close and the final settlement window ends
              ({timeLeft(refundAt).replace(" left", "")} from now).
            </p>
          )}
        </div>
      </div>

      <div className="stats">
        <Stat label="Pays" value={`${amt(c.rate_per_1k)} ${sym}`}
          sub={c.fee_bps ? `per 1k views · creators keep ${keep}` : "per 1k views"} />
        <Stat label="Max per creator" value={`${amt(c.cap_per_creator)} ${sym}`}
          sub={c.fee_bps ? `${amt(afterFee(c, c.cap_per_creator))} ${sym} after fee` : undefined} />
        <Stat label="Spent" value={`${amt(spent)} ${sym}`}
          sub={`${totalViews.toLocaleString("en-US")} views${totalViews > 0n ? ` · ${costPer1k(spent, totalViews, c.decimals)} ${sym}/1k` : ""}`} />
        <Stat label="Submissions" value={open ? timeLeft(c.deadline) : "closed"}
          sub={new Date(Number(c.deadline) * 1000).toLocaleString()} />
      </div>

      <div className="card budget">
        <div className="budget-row">
          <span>Budget</span>
          <span>
            <b>{amt(c.remaining)}</b> of {amt(c.budget)} {sym} left
          </span>
        </div>
        <div className="bar big" role="progressbar" aria-label="Budget spent" aria-valuenow={pct}
          aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${pct}%` }} />
        </div>
        {c.fee_bps > 0 && (
          <p className="muted small">
            {amt(spent - c.fees)} {sym} paid to creators · {amt(c.fees)} {sym} platform fee (
            {feePercent(c.fee_bps)}, taken from each payout)
          </p>
        )}
      </div>

      <div className="columns">
        <section className="card">
          <h2>Creators</h2>
          {submissions.length === 0 ? (
            <p className="muted">No submissions yet — be the first.</p>
          ) : (
            <table className="creators">
              <thead>
                <tr>
                  <th>Creator</th>
                  <th>Post</th>
                  <th className="num">Views</th>
                  <th className="num">Paid to creator</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((x) => {
                  const capped = x.paid + x.fee >= c.cap_per_creator;
                  const hold = holdOf(posts[x.creator]);
                  return (
                    <tr key={x.creator} className={x.creator === address ? "me" : ""}>
                      <td>
                        <a href={explorer.account(x.creator)} target="_blank" rel="noreferrer">
                          {x.creator === address ? "you" : short(x.creator)}
                        </a>
                      </td>
                      <td className="ellipsis">
                        <a href={x.url} target="_blank" rel="noreferrer">
                          {x.url.replace(/^https?:\/\//, "")}
                        </a>
                        {hold.length > 0 && (
                          <span className="pill warn tiny hold" title={hold.join("\n")}>
                            on hold
                          </span>
                        )}
                      </td>
                      <td className="num">{x.views.toLocaleString("en-US")}</td>
                      <td className="num">
                        {amt(x.paid)} {sym}
                        {capped && <span className="pill tiny">cap</span>}
                        <Progress value={x.paid + x.fee} max={c.cap_per_creator} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <aside className="card">
          <h2>{isBrand ? "Your campaign" : mine ? "Your submission" : "Join this campaign"}</h2>
          {isBrand ? (
            <>
              <p className="muted small">
                Share this page with creators. Each post is checked automatically and paid from the
                budget you locked; whatever isn't earned comes back to you.
              </p>
              <button className="btn ghost wide" type="button" onClick={copyLink}>
                {copied ? "Link copied ✓" : "Copy campaign link"}
              </button>
            </>
          ) : mine ? (
            <>
              <p>
                You've earned <b>{amt(mine.paid)} {sym}</b> from{" "}
                {mine.views.toLocaleString("en-US")} views.
              </p>
              {myHold.length > 0 && (
                <div className="notice warn" role="status">
                  <b>Payouts are on hold</b>
                  <ul className="hold-list small">
                    {myHold.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="muted small">
                {mine.paid + mine.fee >= c.cap_per_creator
                  ? "You've hit this campaign's cap — nice work."
                  : `${amt(afterFee(c, c.cap_per_creator - mine.paid - mine.fee))} ${sym} left to earn here`}
              </div>
              <Progress value={mine.paid + mine.fee} max={c.cap_per_creator} />
              {balance !== null && (
                <p className="muted small">
                  Wallet balance: <b>{fromUnits(balance)} {sym}</b>
                </p>
              )}
              <p className="muted small">
                Payouts go straight to your wallet each time views are verified
                {wallet?.kind === "passkey" ? " — withdraw any time from the wallet menu." : "."}
              </p>
            </>
          ) : open ? (
            <form className="form" onSubmit={onSubmit}>
              <ol className="steps">
                <li>Make a post that follows the brief.</li>
                <li>
                  Add <code>clippay:{(address ?? "GXXXXX").slice(0, 6)}</code> and <code>#ad</code> to
                  its description, so we know it's yours and viewers know it's sponsored.
                </li>
                <li>
                  Paste the link — you're paid per verified view
                  {c.fee_bps ? ` (you keep ${keep}; ${feePercent(c.fee_bps)} platform fee)` : ""}.
                </li>
              </ol>
              <input required type="url" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Post URL"
                placeholder="https://youtube.com/shorts/…" />
              <button className="btn" disabled={!!busy}>
                {busy === "submit" ? (wallet?.kind === "passkey" ? "Confirm with your passkey…" : "Confirm in Freighter…") : wallet ? (wallet.kind === "passkey" ? "Submit post — no fees" : "Submit post") : "Sign in & submit"}
              </button>
            </form>
          ) : (
            <p className="muted">Submissions are closed.</p>
          )}
        </aside>
      </div>
    </>
  );
}

function Progress({ value, max }: { value: bigint; max: bigint }) {
  const pct = max > 0n ? Math.min(100, Number((value * 100n) / max)) : 0;
  return (
    <div className="mini-bar" role="progressbar" aria-label="Share of the per-creator cap earned"
      aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card stat">
      <div className="muted small">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="muted small">{sub}</div>}
    </div>
  );
}
