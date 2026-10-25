import { useEffect, useState, type ReactNode } from "react";
import { allSubmissions, describeError, fromUnits, unwrap, type Campaign, type Submission } from "@clippay/pool-client";
import { config, pool } from "../stellar.ts";
import type { PageProps } from "../App.tsx";
import { costPer1k, nowSecs, status } from "../format.ts";

interface Row {
  campaign: Campaign;
  submissions: Submission[];
}

export function CampaignList({ wallet, go }: PageProps) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [grace, setGrace] = useState(0n);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const client = await pool();
      const [count, g] = await Promise.all([client.campaign_count(), client.settle_grace()]);
      setGrace(g.result);
      const ids = Array.from({ length: count.result }, (_, i) => count.result - 1 - i);
      setRows(
        await Promise.all(
          ids.map(async (id) => {
            const campaign = unwrap((await client.get_campaign({ id })).result);
            return { campaign, submissions: await allSubmissions(client, campaign) };
          }),
        ),
      );
    })().catch((e) => setError(describeError(e)));
  }, []);

  const sym = config.tokenSymbol;
  const totals = rows?.reduce(
    (t, { campaign: c, submissions }) => ({
      locked: t.locked + c.remaining,
      paid: t.paid + submissions.reduce((n, s) => n + s.paid, 0n),
      views: t.views + submissions.reduce((n, s) => n + s.views, 0n),
      creators: t.creators + submissions.length,
    }),
    { locked: 0n, paid: 0n, views: 0n, creators: 0 },
  );
  const mine = wallet ? rows?.filter((r) => r.campaign.brand === wallet.address) ?? [] : [];

  return (
    <>
      <section className="hero">
        <h1>Get paid for the views you actually earn.</h1>
        <p>
          Brands lock a budget on Stellar. Creators post, views get verified, and payouts land in
          seconds — then cash out to a bank, anywhere in the world.
        </p>
        <div className="hero-actions">
          <button className="btn" onClick={() => go("/new")}>
            Launch a campaign
          </button>
          <a className="btn ghost" href="#campaigns">
            Browse campaigns
          </a>
        </div>
      </section>

      {totals && (
        <div className="stats strip">
          <Figure label="Budget locked" value={`${fromUnits(totals.locked, 0)} ${sym}`} />
          <Figure label="Paid to creators" value={`${fromUnits(totals.paid)} ${sym}`} />
          <Figure label="Verified views" value={totals.views.toLocaleString("en-US")} />
          <Figure label="Creators" value={String(totals.creators)} />
        </div>
      )}

      <section className="how">
        <Step n={1} title="Brands lock a budget">
          Set a rate per 1,000 views and a cap per creator. The budget sits in a Soroban contract,
          not with us — whatever isn't earned goes back to the brand.
        </Step>
        <Step n={2} title="Creators post — no crypto setup">
          Sign in with Face ID or Touch ID. That's a passkey smart wallet: no seed phrase, and every
          fee is sponsored.
        </Step>
        <Step n={3} title="Paid per verified view">
          Views are checked and the contract pays the difference in seconds. Creators cash out to
          their bank through a Stellar anchor.
        </Step>
      </section>

      {mine.length > 0 && (
        <>
          <h2 className="section-title">Your campaigns</h2>
          <div className="card table-card">
            <table>
              <thead>
                <tr>
                  <th className="wide-col">Campaign</th>
                  <th className="num">Spent</th>
                  <th className="num">Views</th>
                  <th className="num">{sym} / 1k views</th>
                  <th className="num">Status</th>
                </tr>
              </thead>
              <tbody>
                {mine.map(({ campaign: c, submissions }) => {
                  const spent = c.budget - c.remaining;
                  const views = submissions.reduce((n, s) => n + s.views, 0n);
                  const refundable = !c.refunded && nowSecs() > c.deadline + grace && c.remaining > 0n;
                  return (
                    <tr key={c.id} className="clickable" onClick={() => go(`/c/${c.id}`)}>
                      <td className="ellipsis wide-col">
                        <a href={`/c/${c.id}`}>{c.title}</a>
                        <div className="muted small">
                          {submissions.length} creator{submissions.length === 1 ? "" : "s"}
                        </div>
                      </td>
                      <td className="num">
                        {fromUnits(spent, 2, c.decimals)}{" "}
                        <span className="muted small">/ {fromUnits(c.budget, 0, c.decimals)}</span>
                      </td>
                      <td className="num">{views.toLocaleString("en-US")}</td>
                      <td className="num">{costPer1k(spent, views, c.decimals)}</td>
                      <td className="num">
                        {refundable ? <span className="pill warn">Refund ready</span> : <span className={`pill ${status(c).tone}`}>{status(c).label}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2 id="campaigns" className="section-title">
        Live campaigns
      </h2>
      {error && <p className="error">{error}</p>}
      {!rows && !error && <p className="muted">Loading campaigns…</p>}
      {rows?.length === 0 && (
        <div className="empty">
          No campaigns yet. <a href="/new">Launch the first one →</a>
        </div>
      )}
      <div className="grid">
        {rows?.map(({ campaign: c, submissions }) => {
          const s = status(c);
          const spent = c.budget - c.remaining;
          const pct = c.budget > 0n ? Number((spent * 100n) / c.budget) : 0;
          return (
            <a key={c.id} className="card campaign-card" href={`/c/${c.id}`}>
              <div className="card-head">
                <span className={`pill ${s.tone}`}>{s.label}</span>
                <span className="muted small">
                  {submissions.length} creator{submissions.length === 1 ? "" : "s"}
                </span>
              </div>
              <h3>{c.title}</h3>
              <div className="rate">
                {fromUnits(c.rate_per_1k, 2, c.decimals)} {sym}
                <span className="muted"> / 1k views</span>
              </div>
              <div className="bar" aria-hidden="true">
                <div style={{ width: `${pct}%` }} />
              </div>
              <div className="card-foot muted small">
                <span>
                  {fromUnits(c.remaining, 2, c.decimals)} of {fromUnits(c.budget, 2, c.decimals)} {sym} left
                </span>
                <span>{s.detail}</span>
              </div>
            </a>
          );
        })}
      </div>
    </>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="card stat">
      <div className="muted small">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="how-step">
      <span className="how-n">{n}</span>
      <h3>{title}</h3>
      <p className="muted small">{children}</p>
    </div>
  );
}
