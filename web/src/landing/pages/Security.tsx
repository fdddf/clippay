// /security: the deployed contract, who can move money, the trust model and
// known limits (from docs/THREAT_MODEL.md).
import type { ReactNode } from "react";
import { ArrowUpRight, Check, X } from "lucide-react";
import { deployment } from "@clippay/deployments";
import { GithubMark } from "@/components/GithubMark";
import { buttonVariants } from "@/components/ui/button";
import { config, explorer } from "@/lib/network";
import { Callout, DataTable, PageIntro, Prose, Section, WithToc } from "../Content";

const d = deployment(config.network);
const feePct = `${config.feeBps / 100}%`;

const TOC = [
  { id: "contract", label: "The contract" },
  { id: "money", label: "Where the money is" },
  { id: "roles", label: "Who can do what" },
  { id: "trust", label: "What you're trusting" },
  { id: "testnet", label: "Testnet status" },
  { id: "verify", label: "Check it yourself" },
  { id: "report", label: "Report a vulnerability" },
];

function Mono({ value, href }: { value: string; href?: string }) {
  const text = <span className="font-mono text-xs break-all text-foreground">{value}</span>;
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1 hover:underline">
      {text}
      <ArrowUpRight className="mt-0.5 size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
    </a>
  ) : (
    text
  );
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="max-w-3xl divide-y rounded-xl border bg-card shadow-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
          <dt className="text-sm text-muted-foreground">{k}</dt>
          <dd className="min-w-0 text-sm">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function List({ items, ok }: { items: string[]; ok: boolean }) {
  const Icon = ok ? Check : X;
  return (
    <ul className="space-y-1.5">
      {items.map((t) => (
        <li key={t} className="flex gap-2">
          <Icon className={`mt-0.5 size-4 shrink-0 ${ok ? "text-ok" : "text-muted-foreground"}`} aria-hidden="true" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

export function Security() {
  const source = `${config.repoUrl}/tree/main/contracts/campaign-pool`;
  return (
    <>
      <PageIntro
        eyebrow="Security"
        title="How ClipPay keeps budgets and payouts honest"
        lede="Money never sits in an account ClipPay controls. Budgets are held by an open-source contract that only pays creators on the campaign's terms or refunds the brand. Here's exactly what that contract allows, and what you still have to trust."
      >
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href={explorer.account(config.contractId)}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants()}
          >
            View the contract
            <ArrowUpRight aria-hidden="true" />
          </a>
          <a href={source} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}>
            <GithubMark />
            Read the source
          </a>
        </div>
      </PageIntro>
      <WithToc toc={TOC}>
        <Section id="contract" title="The contract">
          <Facts
            rows={[
              ["Network", <span className="text-foreground">Stellar {config.network}</span>],
              ["Campaign contract", <Mono value={config.contractId} href={explorer.account(config.contractId)} />],
              ["Wasm hash", <Mono value={config.wasmHash} />],
              ["Payout token", <Mono value={`${config.tokenSymbol} · ${config.tokenId}`} href={explorer.account(config.tokenId)} />],
              ["Owner", <Mono value={d.campaignPool.owner} href={explorer.account(d.campaignPool.owner)} />],
              ["Verifier", <Mono value={d.campaignPool.verifier} href={explorer.account(d.campaignPool.verifier)} />],
              ["Fee treasury", <Mono value={d.campaignPool.treasury} href={explorer.account(d.campaignPool.treasury)} />],
              [
                "Platform fee",
                <span className="text-foreground">
                  {feePct} of each payout, fixed per campaign when it's created. The contract rejects anything above
                  20%.
                </span>,
              ],
            ]}
          />
        </Section>

        <Section id="money" title="Where the money is">
          <DataTable
            caption="Where funds are held"
            head={["Funds", "Held by", "Who can move them"]}
            rows={[
              ["Campaign budgets", "The ClipPay contract", "The verifier, only to pay submitted creators on the campaign's terms; the brand, to refund after the campaign settles"],
              ["Creator earnings", "The creator's own wallet", "Only the creator"],
              ["Platform fees", "The fee treasury", "ClipPay"],
              ["Network fees for passkey wallets", "A sponsor account", "The relay, only to pay fees for ClipPay transactions"],
            ]}
          />
        </Section>

        <Section id="roles" title="Who can do what">
          <DataTable
            caption="Roles and permissions"
            head={["Role", "Can", "Cannot"]}
            rows={[
              [
                "Owner (ClipPay)",
                <List ok items={["Pause and unpause", "Upgrade the contract", "Change the verifier, fee (≤ 20%) and treasury", "Allow payout tokens"]} />,
                <List ok={false} items={["Move a campaign's funds", "Change a live campaign's fee or terms"]} />,
              ],
              [
                "Verifier",
                <List ok items={["Report view counts, which pays creators at the campaign's rate"]} />,
                <List ok={false} items={["Pay anyone who didn't submit", "Exceed the rate, the cap or the budget", "Pay after the final-payout window"]} />,
              ],
              [
                "Brand",
                <List ok items={["Create and top up campaigns", "Refund unspent budget after settlement"]} />,
                <List ok={false} items={["Refund early", "Take back payouts already made"]} />,
              ],
              [
                "Creator",
                <List ok items={["Submit one post per campaign", "Spend their own earnings"]} />,
                <List ok={false} items={["Report their own views"]} />,
              ],
            ]}
          />
          <Prose className="mt-6">
            <p>
              Refunds keep working while the contract is paused, so a pause can delay payouts but can't trap a brand's
              budget.
            </p>
          </Prose>
        </Section>

        <Section id="trust" title="What you're trusting">
          <Prose>
            <p>The contract limits what can go wrong, but a few things still rest on people and services:</p>
            <ol>
              <li>
                <strong>The verifier reports honest view counts.</strong> The contract caps what a bad count can cost
                — only submitted creators, only at the rate, only up to each cap — but it can't tell a real view from a
                fake one. Anti-fraud checks hold suspicious posts for review.
              </li>
              <li>
                <strong>The owner key is kept safe.</strong> It can't move campaign funds, but it can upgrade the
                contract. On testnet it's a single key; the plan is a multisig with an upgrade timelock before mainnet.
              </li>
              <li>
                <strong>Platforms report views accurately.</strong> View counts come from each platform's public data.
              </li>
              <li>
                <strong>Anchors honour withdrawals.</strong> When you cash out, the anchor pays you in local currency.
                Your funds only leave your wallet after you confirm its quote.
              </li>
            </ol>
          </Prose>
        </Section>

        <Section id="testnet" title="Testnet status">
          <Callout tone="warn" title="This is a preview on Stellar's test network">
            Testnet XLM is free from a faucet and has no value, and the network is reset from time to time. Don't send
            real assets to any address shown here. Nothing has been audited yet; an audit of the contract and wallet
            code comes before any mainnet launch.
          </Callout>
        </Section>

        <Section id="verify" title="Check it yourself">
          <Prose>
            <ul>
              <li>
                Every payout, fee and refund is a contract event. Open the contract on{" "}
                <a href={explorer.account(config.contractId)} target="_blank" rel="noreferrer">
                  Stellar Expert
                </a>{" "}
                to see them as they happen.
              </li>
              <li>
                The contract, verifier and this site are{" "}
                <a href={config.repoUrl} target="_blank" rel="noreferrer">
                  open source
                </a>
                . Its tests include a property test that runs thousands of random campaigns and checks no funds are
                ever created or lost.
              </li>
              <li>
                Build the contract from source and compare its hash with the Wasm hash above.
              </li>
            </ul>
          </Prose>
        </Section>

        <Section id="report" title="Report a vulnerability">
          <Prose>
            <p>
              Please report security issues privately through{" "}
              <a href={`${config.repoUrl}/security/advisories/new`} target="_blank" rel="noreferrer">
                a GitHub security advisory
              </a>{" "}
              rather than a public issue.
            </p>
          </Prose>
        </Section>
      </WithToc>
    </>
  );
}
