// /how-it-works: the campaign lifecycle for both sides, what the verifier
// checks, and how a payout is calculated.
import { CircleAlert, Flag } from "lucide-react";
import { formatUnits } from "@/lib/format";
import { config } from "@/lib/network";
import { Callout, DataTable, PageIntro, Prose, Section, WithToc } from "../Content";
import { CtaBand, FaqList } from "./Home";

const sym = config.tokenSymbol;
const feePct = config.feeBps / 100;
const grace = `${Math.round(config.settleGrace / 60)} minutes`;

// The worked example: 1.20 per 1k views, a 30 cap, 20,000 then 40,000 views.
const SCALE = 10n ** BigInt(config.tokenDecimals);
const rate = (12n * SCALE) / 10n;
const cap = 30n * SCALE;
const gross = (views: bigint) => {
  const g = (views * rate) / 1000n;
  return g > cap ? cap : g;
};
const fee = (g: bigint) => (g * BigInt(config.feeBps)) / 10_000n;
const amt = (u: bigint) => `${formatUnits(u, config.tokenDecimals, 2)} ${sym}`;

const TOC = [
  { id: "lifecycle", label: "Campaign lifecycle" },
  { id: "brands", label: "For brands" },
  { id: "creators", label: "For creators" },
  { id: "checks", label: "What gets checked" },
  { id: "payouts", label: "How payouts add up" },
  { id: "faq", label: "FAQ" },
];

function Phase({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="relative pb-8 pl-12 last:pb-0">
      <span
        aria-hidden="true"
        className="absolute top-9 bottom-0 left-[15px] w-px bg-border [li:last-child>&]:hidden"
      />
      <span className="absolute top-0 left-0 flex size-8 items-center justify-center rounded-full border bg-card text-sm font-semibold tabular">
        {n}
      </span>
      <h3 className="pt-1 font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-muted-foreground">{children}</p>
    </li>
  );
}

export function HowItWorks() {
  return (
    <>
      <PageIntro
        eyebrow="How it works"
        title="A campaign, from brief to the last payout"
        lede={
          <>
            ClipPay is a smart contract on Stellar plus a verifier that reads view counts. The contract holds the
            budget and enforces the campaign's terms; the verifier tells it how many views each post has.
          </>
        }
      />
      <WithToc toc={TOC}>
        <Section id="lifecycle" title="Campaign lifecycle">
          <ol className="max-w-3xl">
            <Phase n={1} title="Created">
              A brand publishes a brief and locks a budget in the contract, with a rate per 1,000 views, a cap per
              creator and a deadline. The terms can't be changed afterwards, and the budget can only grow.
            </Phase>
            <Phase n={2} title="Live">
              Creators submit links to their posts. About once a minute the verifier reads each post's views and the
              contract pays the creator for the new ones.
            </Phase>
            <Phase n={3} title="Final payouts">
              At the deadline, submissions close. Views are checked for {grace} more so late views on existing posts
              still get paid.
            </Phase>
            <Phase n={4} title="Settled">
              The brand can refund whatever wasn't paid out. Creators keep everything they earned.
            </Phase>
          </ol>
        </Section>

        <Section id="brands" title="For brands">
          <Prose>
            <ol>
              <li>
                <strong>Write the brief.</strong> Pick a platform and category, summarise what you want, and list the
                must-dos. ClipPay stores the brief under its SHA-256 hash and links the campaign to that hash, so it
                can't be edited after creators join.
              </li>
              <li>
                <strong>Set the terms.</strong> The rate is what you pay per 1,000 verified views; the cap is the most
                any one creator can earn, so a single viral post can't take the whole budget.
              </li>
              <li>
                <strong>Fund it.</strong> One transaction moves the budget from your wallet into the contract. You
                can top it up while the campaign runs.
              </li>
              <li>
                <strong>Watch it work.</strong> Your dashboard lists every post, its views and what it has been paid,
                each linked to its transaction.
              </li>
              <li>
                <strong>Refund the rest.</strong> Once the final-payout window closes, refund the unspent budget to
                your wallet. Refunds are free.
              </li>
            </ol>
          </Prose>
        </Section>

        <Section id="creators" title="For creators">
          <Prose>
            <ol>
              <li>
                <strong>Sign in with a passkey.</strong> ClipPay creates a smart wallet secured by Face ID, Touch ID or
                a security key. There's no seed phrase to write down, and ClipPay pays the network fees. You can also
                connect Freighter.
              </li>
              <li>
                <strong>Pick a campaign and make the clip.</strong> Each brief says what to make and what the post
                must include.
              </li>
              <li>
                <strong>Tag and submit.</strong> Put your personal <code>clippay:…</code> tag and <code>#ad</code> in
                the post's description, then submit the link. The tag proves the post is yours.
              </li>
              <li>
                <strong>Get paid as views come in.</strong> Payouts land in your wallet within minutes of each check,
                up to the campaign's cap. You receive {100 - feePct}% of the rate.
              </li>
              <li>
                <strong>Cash out.</strong> Withdraw to a bank account through a Stellar anchor (SEP-24). On testnet
                this uses Stellar's test anchor, so no real money moves.
              </li>
            </ol>
          </Prose>
        </Section>

        <Section id="checks" title="What gets checked">
          <Prose>
            <p>
              Before paying for a post, the verifier checks it. Some problems you can fix yourself; others put the
              post on hold until a reviewer looks at it. Either way, nothing is paid for a post on hold, and nothing
              already paid is taken back.
            </p>
          </Prose>
          <div className="mt-6 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <p className="flex items-center gap-2 font-semibold">
                <CircleAlert className="size-4 text-warn" aria-hidden="true" />
                You can fix
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                <li>Your ownership tag is missing from the description</li>
                <li>The sponsorship isn't disclosed with #ad or #sponsored</li>
              </ul>
            </div>
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <p className="flex items-center gap-2 font-semibold">
                <Flag className="size-4 text-warn" aria-hidden="true" />
                Held for review
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                <li>Views jump far faster than normal</li>
                <li>Unusually few likes for the number of views</li>
                <li>The channel was created only days ago</li>
              </ul>
            </div>
          </div>
          <div className="mt-6">
            <Callout title="Demo campaigns use simulated views">
              On testnet, the demo campaigns read view counts from a simulator instead of YouTube, so you can watch
              payouts arrive without posting real videos.
            </Callout>
          </div>
        </Section>

        <Section id="payouts" title="How payouts add up">
          <Prose>
            <p>
              A post earns <strong>views ÷ 1,000 × rate</strong>, up to the creator's cap and the budget left. Each
              check pays the difference from what the post has already earned. ClipPay's {feePct}% fee comes out of
              each payout; the rest goes to the creator.
            </p>
            <p>
              For a campaign paying {amt(rate)} per 1,000 views with a cap of {amt(cap)}:
            </p>
          </Prose>
          <div className="mt-6 max-w-3xl">
            <DataTable
              caption="Worked payout example"
              head={["Views so far", "Earned", "ClipPay fee", "Creator receives"]}
              rows={[20_000n, 40_000n].map((v) => {
                const g = gross(v);
                return [
                  <span className="tabular">{v.toLocaleString("en-US")}</span>,
                  <span className="tabular">
                    {amt(g)}
                    {g === cap ? " (capped)" : ""}
                  </span>,
                  <span className="tabular">{amt(fee(g))}</span>,
                  <span className="tabular font-medium text-money">{amt(g - fee(g))}</span>,
                ];
              })}
            />
          </div>
        </Section>

        <Section id="faq" title="FAQ">
          <div className="max-w-3xl">
            <FaqList />
          </div>
        </Section>
      </WithToc>
      <CtaBand />
    </>
  );
}
